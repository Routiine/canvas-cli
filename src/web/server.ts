import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'http';
import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import crypto from 'crypto';
import type { Message} from '../types.js';
import { Tool } from '../types.js';
import { ToolRegistry } from '../tools/registry.js';
import { CheckpointManager } from '../checkpoint.js';
import { ThemeManager } from '../themes.js';

interface WebSession {
  id: string;
  created: Date;
  messages: Message[];
  active: boolean;
}

/**
 * Bearer token authentication middleware.
 * Validates the Authorization header against the CANVAS_API_KEY environment variable.
 * Skips authentication for /health and /api/health endpoints.
 */
function bearerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow health checks without authentication
  if (req.path === '/health' || req.path === '/api/health') {
    next();
    return;
  }

  const apiKey = process.env.CANVAS_API_KEY;

  // If no API key is configured, reject all requests with a setup error
  if (!apiKey) {
    res.status(500).json({
      error: 'Server misconfigured',
      message: 'CANVAS_API_KEY environment variable is not set'
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>'
    });
    return;
  }

  const token = authHeader.slice(7);

  // Constant-time comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(token);
  const apiKeyBuffer = Buffer.from(apiKey);

  if (tokenBuffer.length !== apiKeyBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, apiKeyBuffer)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
    return;
  }

  next();
}

/**
 * QUAL-007: Thin Commander-compatible dispatcher for web socket commands.
 * Replaces the CommandHandler dependency with direct handler delegation.
 */
async function dispatchSlashCommand(input: string): Promise<string | null> {
  const parts = input.trim().split(' ');
  const command = parts[0].startsWith('/') ? parts[0].slice(1) : parts[0];
  const args = parts.slice(1).join(' ');

  switch (command) {
    case 'help':
    case '?':
      return 'Available commands: /help /memory /workflow /skill /theme /model /tools /stats /clear /status';
    case 'memory': {
      const { MemoryHandler } = await import('../handlers/memory-handler.js');
      const theme = new ThemeManager('default');
      const registry = new ToolRegistry();
      const { ContextLoader } = await import('../tools/memory.js');
      const handler = new MemoryHandler(theme, registry, new ContextLoader());
      return handler.handleCommand(args);
    }
    case 'workflow':
    case 'wf': {
      const { WorkflowHandler } = await import('../handlers/workflow-handler.js');
      const { WorkflowEngine } = await import('../tools/workflows.js');
      const theme = new ThemeManager('default');
      const registry = new ToolRegistry();
      const handler = new WorkflowHandler(theme, new WorkflowEngine(registry));
      return handler.handleCommand(args);
    }
    case 'skill':
    case 'skills': {
      const { SkillHandler } = await import('../handlers/skill-handler.js');
      const theme = new ThemeManager('default');
      const handler = new SkillHandler(theme);
      return handler.handleCommand(args);
    }
    case 'clear':
      return 'Screen cleared';
    case 'tools': {
      const registry = new ToolRegistry();
      const tools = registry.list();
      return `Available tools (${tools.length}): ${tools.map((t: { name: string }) => t.name).join(', ')}`;
    }
    default:
      return `Unknown command: /${command}. Type /help for available commands.`;
  }
}

export class WebUIServer {
  private app: express.Application;
  private server: HttpServer;
  private io: SocketIOServer;
  private port: number;
  private sessions: Map<string, WebSession> = new Map();
  private toolRegistry: ToolRegistry;
  private checkpointManager: CheckpointManager;

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

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketAuth();
    this.setupSocketHandlers();
  }

  /**
   * Add authentication middleware for Socket.IO connections.
   * Clients must pass the API key as auth.token in the handshake.
   */
  private setupSocketAuth(): void {
    this.io.use((socket, next) => {
      const apiKey = process.env.CANVAS_API_KEY;
      if (!apiKey) {
        return next(new Error('Server misconfigured: CANVAS_API_KEY not set'));
      }

      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        return next(new Error('Authentication required: pass auth.token in handshake'));
      }

      const tokenBuffer = Buffer.from(token);
      const apiKeyBuffer = Buffer.from(apiKey);

      if (tokenBuffer.length !== apiKeyBuffer.length ||
          !crypto.timingSafeEqual(tokenBuffer, apiKeyBuffer)) {
        return next(new Error('Invalid API key'));
      }

      next();
    });
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(bearerAuthMiddleware);
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
      } catch (error: unknown) {
        res.status(400).json({ success: false, error: error instanceof Error ? error.message : String(error) });
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
        } catch (error: unknown) {
          socket.emit('tool:result', { name, success: false, error: error instanceof Error ? error.message : String(error) });
        }
      });

      // Handle commands
      socket.on('command:execute', async (data) => {
        const { command } = data;
        
        try {
          const result = await dispatchSlashCommand(command as string);
          socket.emit('command:result', { success: true, result });
        } catch (error: unknown) {
          socket.emit('command:result', { success: false, error: error instanceof Error ? error.message : String(error) });
        }
      });

      // Handle file operations
      socket.on('file:read', async (data) => {
        const { path: filePath } = data;
        
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          socket.emit('file:content', { path: filePath, content });
        } catch (error: unknown) {
          socket.emit('file:error', { path: filePath, error: error instanceof Error ? error.message : String(error) });
        }
      });

      socket.on('file:write', async (data) => {
        const { path: filePath, content } = data;
        
        try {
          await fs.writeFile(filePath, content);
          socket.emit('file:saved', { path: filePath });
        } catch (error: unknown) {
          socket.emit('file:error', { path: filePath, error: error instanceof Error ? error.message : String(error) });
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
  broadcast(event: string, data: unknown): void {
    this.io.emit(event, data);
  }

  // Send message to specific session
  sendToSession(sessionId: string, event: string, data: unknown): void {
    this.io.to(sessionId).emit(event, data);
  }

  // Get active sessions count
  getActiveSessions(): number {
    return Array.from(this.sessions.values()).filter(s => s.active).length;
  }
}