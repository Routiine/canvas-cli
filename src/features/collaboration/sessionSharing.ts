import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import http from 'http';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// 3. Session Sharing & Live Collaboration
export interface SharedSession {
  id: string;
  name: string;
  owner: string;
  participants: Map<string, Participant>;
  commands: CommandHistory[];
  blocks: any[];
  startTime: Date;
  isLive: boolean;
  recordingEnabled: boolean;
  allowControl: boolean;
  mobileOptimized: boolean;
}

interface Participant {
  id: string;
  name: string;
  role: 'owner' | 'viewer' | 'controller';
  joinedAt: Date;
  lastActive: Date;
  device: 'desktop' | 'mobile' | 'tablet';
}

interface CommandHistory {
  command: string;
  output: string;
  timestamp: Date;
  executedBy: string;
}

export class SessionSharingSystem extends EventEmitter {
  private sessions: Map<string, SharedSession> = new Map();
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private app: express.Application;
  private port: number = 3456;
  private recordingsDir: string;
  private activeConnections: Map<string, WebSocket> = new Map();
  
  constructor() {
    super();
    this.app = express();
    this.recordingsDir = path.join(os.homedir(), '.canvas-cli', 'recordings');
    fs.ensureDirSync(this.recordingsDir);
    this.setupServer();
  }
  
  private setupServer(): void {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // REST API endpoints
    this.app.get('/api/session/:id', (req, res) => {
      const session = this.sessions.get(req.params.id);
      if (session) {
        res.json(this.sanitizeSession(session));
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });
    
    this.app.post('/api/session/:id/join', (req, res) => {
      const session = this.sessions.get(req.params.id);
      if (session) {
        const participant = this.addParticipant(
          session.id,
          req.body.name || 'Anonymous',
          req.body.device || 'desktop'
        );
        res.json({ participantId: participant.id, sessionId: session.id });
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    });
    
    this.app.get('/api/session/:id/replay', (req, res) => {
      const recordingPath = path.join(this.recordingsDir, `${req.params.id}.json`);
      if (fs.existsSync(recordingPath)) {
        const recording = fs.readJsonSync(recordingPath);
        res.json(recording);
      } else {
        res.status(404).json({ error: 'Recording not found' });
      }
    });
    
    // Serve mobile-friendly viewer
    this.app.get('/mobile/:id', (req, res) => {
      res.send(this.getMobileViewerHTML(req.params.id));
    });
  }
  
  async startSharing(name: string = 'Canvas CLI Session'): Promise<SharedSession> {
    const session: SharedSession = {
      id: uuidv4().slice(0, 8),
      name,
      owner: os.userInfo().username,
      participants: new Map(),
      commands: [],
      blocks: [],
      startTime: new Date(),
      isLive: true,
      recordingEnabled: true,
      allowControl: false,
      mobileOptimized: true
    };
    
    this.sessions.set(session.id, session);
    
    // Start server if not running
    if (!this.server) {
      this.server = http.createServer(this.app);
      this.wss = new WebSocketServer({ server: this.server });
      
      this.wss.on('connection', (ws, req) => {
        const sessionId = this.extractSessionId(req.url || '');
        if (sessionId && this.sessions.has(sessionId)) {
          this.handleWebSocketConnection(ws, sessionId);
        } else {
          ws.close();
        }
      });
      
      await new Promise<void>((resolve) => {
        this.server!.listen(this.port, () => {
          console.log(chalk.green(`🌐 Session sharing server started on port ${this.port}`));
          resolve();
        });
      });
    }
    
    const shareUrl = this.getShareUrl(session.id);
    console.log(chalk.cyan(`\n📺 Session is now live!`));
    console.log(chalk.cyan(`   Share URL: ${shareUrl}`));
    console.log(chalk.cyan(`   Mobile URL: ${shareUrl}/mobile`));
    console.log(chalk.dim(`   Session ID: ${session.id}`));
    
    this.emit('session-started', session);
    return session;
  }
  
  stopSharing(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.isLive = false;
    
    // Save recording if enabled
    if (session.recordingEnabled) {
      this.saveRecording(session);
    }
    
    // Notify all participants
    this.broadcast(sessionId, {
      type: 'session-ended',
      timestamp: new Date()
    });
    
    // Close connections
    for (const [connId, ws] of this.activeConnections) {
      if (connId.startsWith(sessionId)) {
        ws.close();
        this.activeConnections.delete(connId);
      }
    }
    
    this.emit('session-stopped', session);
    console.log(chalk.yellow(`📴 Session ${sessionId} ended`));
  }
  
  broadcastCommand(sessionId: string, command: string, output: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isLive) return;
    
    const entry: CommandHistory = {
      command,
      output,
      timestamp: new Date(),
      executedBy: session.owner
    };
    
    session.commands.push(entry);
    
    this.broadcast(sessionId, {
      type: 'command',
      data: entry
    });
  }
  
  broadcastBlock(sessionId: string, block: any): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isLive) return;
    
    session.blocks.push(block);
    
    this.broadcast(sessionId, {
      type: 'block',
      data: block
    });
  }
  
  allowRemoteControl(sessionId: string, participantId: string, allow: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const participant = session.participants.get(participantId);
    if (!participant) return;
    
    if (allow) {
      participant.role = 'controller';
      session.allowControl = true;
      console.log(chalk.green(`✅ Remote control granted to ${participant.name}`));
    } else {
      participant.role = 'viewer';
      console.log(chalk.yellow(`❌ Remote control revoked from ${participant.name}`));
    }
    
    this.broadcast(sessionId, {
      type: 'control-change',
      participantId,
      hasControl: allow
    });
  }
  
  private handleWebSocketConnection(ws: WebSocket, sessionId: string): void {
    const connId = `${sessionId}-${uuidv4()}`;
    this.activeConnections.set(connId, ws);
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(sessionId, connId, message);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      this.activeConnections.delete(connId);
    });
    
    // Send initial session state
    const session = this.sessions.get(sessionId);
    if (session) {
      ws.send(JSON.stringify({
        type: 'init',
        session: this.sanitizeSession(session)
      }));
    }
  }
  
  private handleWebSocketMessage(sessionId: string, connId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    switch (message.type) {
      case 'command-request':
        if (session.allowControl && message.participantId) {
          const participant = session.participants.get(message.participantId);
          if (participant?.role === 'controller') {
            this.emit('remote-command', {
              sessionId,
              command: message.command,
              participantId: message.participantId
            });
          }
        }
        break;
        
      case 'ping':
        const ws = this.activeConnections.get(connId);
        if (ws) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        break;
    }
  }
  
  private broadcast(sessionId: string, message: any): void {
    const messageStr = JSON.stringify(message);
    
    for (const [connId, ws] of this.activeConnections) {
      if (connId.startsWith(sessionId) && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }
  
  private addParticipant(
    sessionId: string,
    name: string,
    device: 'desktop' | 'mobile' | 'tablet'
  ): Participant {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    const participant: Participant = {
      id: uuidv4(),
      name,
      role: 'viewer',
      joinedAt: new Date(),
      lastActive: new Date(),
      device
    };
    
    session.participants.set(participant.id, participant);
    
    this.broadcast(sessionId, {
      type: 'participant-joined',
      participant
    });
    
    console.log(chalk.green(`👤 ${name} joined session ${sessionId}`));
    return participant;
  }
  
  private saveRecording(session: SharedSession): void {
    const recording = {
      ...session,
      participants: Array.from(session.participants.values())
    };
    
    const recordingPath = path.join(this.recordingsDir, `${session.id}.json`);
    fs.writeJsonSync(recordingPath, recording);
    
    console.log(chalk.dim(`💾 Session recorded: ${recordingPath}`));
  }
  
  private sanitizeSession(session: SharedSession): any {
    return {
      id: session.id,
      name: session.name,
      owner: session.owner,
      participants: Array.from(session.participants.values()),
      commandCount: session.commands.length,
      blockCount: session.blocks.length,
      startTime: session.startTime,
      isLive: session.isLive,
      allowControl: session.allowControl
    };
  }
  
  private getShareUrl(sessionId: string): string {
    // In production, this would be a public URL
    return `http://localhost:${this.port}/session/${sessionId}`;
  }
  
  private extractSessionId(url: string): string | null {
    const match = url.match(/\/session\/([^/]+)/);
    return match ? match[1] : null;
  }
  
  private getMobileViewerHTML(sessionId: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Canvas CLI - Mobile Viewer</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 0;
      background: #1a1a1a;
      color: #e0e0e0;
    }
    .header {
      background: #2a2a2a;
      padding: 15px;
      border-bottom: 1px solid #444;
    }
    .terminal {
      padding: 10px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      overflow-x: auto;
    }
    .command {
      color: #00ff88;
      margin: 10px 0;
    }
    .output {
      color: #999;
      white-space: pre-wrap;
    }
    .status {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #2a2a2a;
      padding: 10px;
      text-align: center;
      border-top: 1px solid #444;
    }
    .live-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #00ff00;
      border-radius: 50%;
      margin-right: 5px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h3>Canvas CLI Session: ${sessionId}</h3>
  </div>
  <div id="terminal" class="terminal"></div>
  <div class="status">
    <span class="live-indicator"></span>
    <span>Live Session</span>
  </div>
  
  <script>
    const ws = new WebSocket('ws://localhost:${this.port}/session/${sessionId}');
    const terminal = document.getElementById('terminal');
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'command') {
        const cmdDiv = document.createElement('div');
        cmdDiv.className = 'command';
        cmdDiv.textContent = '> ' + message.data.command;
        terminal.appendChild(cmdDiv);
        
        const outDiv = document.createElement('div');
        outDiv.className = 'output';
        outDiv.textContent = message.data.output;
        terminal.appendChild(outDiv);
        
        terminal.scrollTop = terminal.scrollHeight;
      }
    };
  </script>
</body>
</html>`;
  }
  
  replaySession(sessionId: string): void {
    const recordingPath = path.join(this.recordingsDir, `${sessionId}.json`);
    if (!fs.existsSync(recordingPath)) {
      console.log(chalk.red(`Recording not found: ${sessionId}`));
      return;
    }
    
    const recording = fs.readJsonSync(recordingPath);
    console.log(chalk.cyan(`\n🎬 Replaying session: ${recording.name}`));
    console.log(chalk.dim(`   Started: ${recording.startTime}`));
    console.log(chalk.dim(`   Commands: ${recording.commands.length}`));
    
    // Replay commands with timing
    let delay = 0;
    for (const cmd of recording.commands) {
      setTimeout(() => {
        console.log(chalk.green(`\n> ${cmd.command}`));
        console.log(chalk.dim(cmd.output));
      }, delay);
      delay += 1000; // 1 second between commands
    }
  }
}

// Singleton instance
let sessionSharingInstance: SessionSharingSystem | null = null;

export function getSessionSharing(): SessionSharingSystem {
  if (!sessionSharingInstance) {
    sessionSharingInstance = new SessionSharingSystem();
  }
  return sessionSharingInstance;
}