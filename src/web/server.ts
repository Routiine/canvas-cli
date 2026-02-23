import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import type { Message} from '../types.js';
import { Tool } from '../types.js';
import { ToolRegistry } from '../tools/registry.js';
import { CheckpointManager } from '../checkpoint.js';
import { ThemeManager } from '../themes.js';
import { CommandHandler } from '../commands.js';

export class WebUIServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private port: number;
  private sessions: Map<string, any> = new Map();
  private toolRegistry: ToolRegistry;
  private checkpointManager: CheckpointManager;
  private commandHandler: CommandHandler;

  constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    this.toolRegistry = new ToolRegistry();
    this.checkpointManager = new CheckpointManager();
    this.commandHandler = new CommandHandler();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  private setupRoutes(): void {
    // API Routes
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date() });
    });

    this.app.get('/api/sessions', (req, res) => {
      const sessions = Array.from(this.sessions.values()).map(s => ({
        id: s.id,
        created: s.created,
        messages: s.messages.length,
        active: s.active
      }));
      res.json(sessions);
    });

    this.app.get('/api/tools', (req, res) => {
      const tools = this.toolRegistry.list().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }));
      res.json(tools);
    });

    this.app.get('/api/checkpoints', async (req, res) => {
      const checkpoints = await this.checkpointManager.listCheckpoints();
      res.json(checkpoints);
    });

    this.app.post('/api/chat', async (req, res) => {
      const { message, sessionId, model } = req.body;
      
      // Process message and return response
      res.json({
        response: 'Message processed',
        sessionId
      });
    });

    this.app.post('/api/tools/execute', async (req, res) => {
      const { tool, params } = req.body;
      
      try {
        const result = await this.toolRegistry.execute(tool, params);
        res.json({ success: true, result });
      } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    // Serve the web UI
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(chalk.green(`Client connected: ${socket.id}`));
      
      // Create session for this connection
      const session = {
        id: socket.id,
        created: new Date(),
        messages: [] as Message[],
        active: true
      };
      this.sessions.set(socket.id, session);

      // Handle chat messages
      socket.on('chat:message', async (data) => {
        const { message, model } = data;
        session.messages.push({
          role: 'user',
          content: message,
          timestamp: new Date()
        });

        // Emit acknowledgment
        socket.emit('chat:received', { id: Date.now() });

        // Process and send response
        // This would integrate with the Ollama model
        const response: Message = {
          role: 'assistant' as const,
          content: 'Response from Canvas CLI',
          timestamp: new Date()
        };
        
        session.messages.push(response);
        socket.emit('chat:response', response);
      });

      // Handle tool execution
      socket.on('tool:execute', async (data) => {
        const { name, params } = data;
        
        socket.emit('tool:start', { name });
        
        try {
          const result = await this.toolRegistry.execute(name, params);
          socket.emit('tool:result', { name, success: true, result });
        } catch (error: any) {
          socket.emit('tool:result', { name, success: false, error: error.message });
        }
      });

      // Handle commands
      socket.on('command:execute', async (data) => {
        const { command } = data;
        
        try {
          const result = await this.commandHandler.handleCommand(command);
          socket.emit('command:result', { success: true, result });
        } catch (error: any) {
          socket.emit('command:result', { success: false, error: error.message });
        }
      });

      // Handle file operations
      socket.on('file:read', async (data) => {
        const { path: filePath } = data;
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          socket.emit('file:content', { path: filePath, content });
        } catch (error: any) {
          socket.emit('file:error', { path: filePath, error: error.message });
        }
      });

      socket.on('file:write', async (data) => {
        const { path: filePath, content } = data;
        
        try {
          await fs.writeFile(filePath, content);
          socket.emit('file:saved', { path: filePath });
        } catch (error: any) {
          socket.emit('file:error', { path: filePath, error: error.message });
        }
      });

      // Handle session management
      socket.on('session:save', async (data) => {
        const { tag } = data;
        const checkpoint = await this.checkpointManager.saveCheckpoint(session.messages, tag);
        socket.emit('session:saved', { checkpoint });
      });

      socket.on('session:load', async (data) => {
        const { id } = data;
        const checkpoint = await this.checkpointManager.loadCheckpoint(id);
        if (checkpoint) {
          session.messages = checkpoint.messages;
          socket.emit('session:loaded', { checkpoint });
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(chalk.yellow(`Client disconnected: ${socket.id}`));
        const session = this.sessions.get(socket.id);
        if (session) {
          session.active = false;
        }
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(chalk.green(`✓ Web UI server running at http://localhost:${this.port}`));
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      void this.io.close();
      this.server.close(() => {
        console.log(chalk.yellow('Web UI server stopped'));
        resolve();
      });
    });
  }

  // Broadcast message to all connected clients
  broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  // Send message to specific session
  sendToSession(sessionId: string, event: string, data: any): void {
    this.io.to(sessionId).emit(event, data);
  }

  // Get active sessions count
  getActiveSessions(): number {
    return Array.from(this.sessions.values()).filter(s => s.active).length;
  }
}