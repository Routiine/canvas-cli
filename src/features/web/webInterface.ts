import { EventEmitter } from 'events';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { URL } from 'url';
import { spawn, ChildProcess } from 'child_process';

// Web Interface for Canvas CLI
export interface WebSession {
  id: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  connectedAt: Date;
  lastActivity: Date;
  isAuthenticated: boolean;
  permissions: string[];
  socketId?: string;
}

export interface WebCommand {
  id: string;
  sessionId: string;
  command: string;
  arguments: string[];
  workingDirectory: string;
  timestamp: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output?: string;
  error?: string;
  exitCode?: number;
  duration?: number;
}

export interface WebConfig {
  enabled: boolean;
  port: number;
  host: string;
  enableAuth: boolean;
  enableSSL: boolean;
  sslCertPath?: string;
  sslKeyPath?: string;
  sessionTimeout: number;
  maxConcurrentCommands: number;
  allowedCommands: string[];
  blockedCommands: string[];
  enableFileUpload: boolean;
  enableFileDownload: boolean;
  maxFileSize: number;
  corsOrigins: string[];
}

export interface FileOperation {
  id: string;
  sessionId: string;
  type: 'upload' | 'download' | 'view' | 'edit';
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  timestamp: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

export class WebInterface extends EventEmitter {
  private server: any;
  private io: SocketIOServer;
  private sessions: Map<string, WebSession> = new Map();
  private commands: Map<string, WebCommand> = new Map();
  private fileOperations: Map<string, FileOperation> = new Map();
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private config: WebConfig;
  private storageDir: string;
  private isRunning: boolean = false;

  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'web');
    fs.ensureDirSync(this.storageDir);
    
    this.config = {
      enabled: true,
      port: 3000,
      host: 'localhost',
      enableAuth: false,
      enableSSL: false,
      sessionTimeout: 3600000, // 1 hour
      maxConcurrentCommands: 5,
      allowedCommands: [],
      blockedCommands: ['rm', 'del', 'format', 'shutdown', 'reboot'],
      enableFileUpload: true,
      enableFileDownload: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000']
    };
    
    this.loadConfig();
    this.setupCleanupTimer();
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.server = createServer(this.handleHttpRequest.bind(this));
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.config.corsOrigins,
        methods: ['GET', 'POST']
      }
    });

    this.setupSocketHandlers();
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, (error: any) => {
        if (error) {
          reject(error);
          return;
        }

        this.isRunning = true;
        const url = `http${this.config.enableSSL ? 's' : ''}://${this.config.host}:${this.config.port}`;
        console.log(chalk.green(`🌐 Web interface started at ${url}`));
        
        this.emit('started', { url, port: this.config.port, host: this.config.host });
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    if (!this.isRunning) return Promise.resolve();

    return new Promise((resolve) => {
      // Stop all running processes
      for (const [commandId, process] of this.runningProcesses) {
        process.kill();
        this.runningProcesses.delete(commandId);
      }

      // Close socket connections
      this.io.close();

      // Close HTTP server
      this.server.close(() => {
        this.isRunning = false;
        console.log(chalk.yellow('🌐 Web interface stopped'));
        this.emit('stopped');
        resolve();
      });
    });
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      switch (pathname) {
        case '/':
          this.serveIndexPage(req, res);
          break;
        case '/api/status':
          this.handleStatusRequest(req, res);
          break;
        case '/api/sessions':
          this.handleSessionsRequest(req, res);
          break;
        case '/api/commands':
          this.handleCommandsRequest(req, res);
          break;
        case '/api/files':
          this.handleFilesRequest(req, res);
          break;
        default:
          if (pathname.startsWith('/files/')) {
            this.handleFileRequest(req, res);
          } else {
            this.serve404(res);
          }
          break;
      }
    } catch (error) {
      this.serveError(res, 500, `Server Error: ${error}`);
    }
  }

  private serveIndexPage(req: IncomingMessage, res: ServerResponse): void {
    const html = this.generateWebInterface();
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(html);
  }

  private generateWebInterface(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Canvas CLI - Web Interface</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            background: #1a1a1a; 
            color: #e0e0e0;
            height: 100vh;
            overflow: hidden;
        }
        .container { 
            display: flex;
            height: 100vh;
        }
        .sidebar {
            width: 250px;
            background: #2d2d2d;
            border-right: 1px solid #444;
            padding: 20px;
            overflow-y: auto;
        }
        .main {
            flex: 1;
            display: flex;
            flex-direction: column;
        }
        .header {
            background: #333;
            padding: 15px 20px;
            border-bottom: 1px solid #444;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .terminal {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: #1a1a1a;
        }
        .input-area {
            border-top: 1px solid #444;
            padding: 15px 20px;
            background: #2d2d2d;
            display: flex;
            gap: 10px;
        }
        input[type="text"] {
            flex: 1;
            background: #1a1a1a;
            border: 1px solid #555;
            color: #e0e0e0;
            padding: 10px;
            font-family: inherit;
            border-radius: 4px;
        }
        button {
            background: #0066cc;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-family: inherit;
        }
        button:hover { background: #0052a3; }
        button:disabled { 
            background: #666; 
            cursor: not-allowed; 
        }
        .output-line {
            margin-bottom: 5px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .command-line {
            color: #4CAF50;
            margin-bottom: 10px;
        }
        .error-line { color: #f44336; }
        .info-line { color: #2196F3; }
        .warning-line { color: #ff9800; }
        .success-line { color: #4CAF50; }
        .status {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #4CAF50;
        }
        .sidebar h3 {
            margin-bottom: 15px;
            color: #fff;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .session-info {
            background: #3d3d3d;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            font-size: 12px;
        }
        .stats {
            margin-bottom: 20px;
        }
        .stat-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 12px;
        }
        .file-manager {
            margin-top: 20px;
        }
        .file-item {
            padding: 5px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 12px;
        }
        .file-item:hover {
            background: #444;
        }
        .loading {
            opacity: 0.6;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="sidebar">
            <h3>Session Info</h3>
            <div class="session-info">
                <div>Session: <span id="session-id">Connecting...</span></div>
                <div>Status: <span id="session-status">Connecting</span></div>
                <div>Uptime: <span id="session-uptime">--</span></div>
            </div>

            <h3>Statistics</h3>
            <div class="stats">
                <div class="stat-item">
                    <span>Commands Run:</span>
                    <span id="commands-count">0</span>
                </div>
                <div class="stat-item">
                    <span>Active Sessions:</span>
                    <span id="sessions-count">0</span>
                </div>
                <div class="stat-item">
                    <span>Server Load:</span>
                    <span id="server-load">--</span>
                </div>
            </div>

            <h3>Quick Commands</h3>
            <div class="quick-commands">
                <button onclick="runQuickCommand('pwd')" style="width: 100%; margin-bottom: 5px;">pwd</button>
                <button onclick="runQuickCommand('ls -la')" style="width: 100%; margin-bottom: 5px;">ls -la</button>
                <button onclick="runQuickCommand('git status')" style="width: 100%; margin-bottom: 5px;">git status</button>
                <button onclick="runQuickCommand('npm --version')" style="width: 100%; margin-bottom: 5px;">npm --version</button>
            </div>

            <div class="file-manager">
                <h3>File Browser</h3>
                <div id="file-list">
                    <div class="file-item" onclick="listFiles('.')">📁 Current Directory</div>
                </div>
            </div>
        </div>

        <div class="main">
            <div class="header">
                <h1>Canvas CLI Web Interface</h1>
                <div class="status">
                    <div class="status-dot" id="connection-status"></div>
                    <span id="connection-text">Connected</span>
                </div>
            </div>

            <div class="terminal" id="terminal"></div>

            <div class="input-area">
                <input type="text" id="command-input" placeholder="Enter command..." onkeypress="handleKeyPress(event)">
                <button onclick="executeCommand()" id="execute-btn">Execute</button>
                <button onclick="clearTerminal()">Clear</button>
            </div>
        </div>
    </div>

    <script>
        class CanvasCLIWeb {
            constructor() {
                this.socket = io();
                this.sessionId = null;
                this.commandHistory = [];
                this.historyIndex = -1;
                this.setupEventListeners();
                this.connectTime = Date.now();
            }

            setupEventListeners() {
                this.socket.on('connect', () => {
                    this.updateConnectionStatus(true);
                    this.addOutput('Connected to Canvas CLI', 'success-line');
                });

                this.socket.on('disconnect', () => {
                    this.updateConnectionStatus(false);
                    this.addOutput('Disconnected from server', 'error-line');
                });

                this.socket.on('session_created', (data) => {
                    this.sessionId = data.sessionId;
                    document.getElementById('session-id').textContent = data.sessionId.substring(0, 8);
                    this.addOutput(\`Session created: \${data.sessionId}\`, 'info-line');
                });

                this.socket.on('command_output', (data) => {
                    this.addOutput(data.output, 'output-line');
                });

                this.socket.on('command_error', (data) => {
                    this.addOutput(data.error, 'error-line');
                });

                this.socket.on('command_completed', (data) => {
                    this.addOutput(\`Command completed with exit code: \${data.exitCode}\`, 
                        data.exitCode === 0 ? 'success-line' : 'error-line');
                    this.enableInput();
                });

                this.socket.on('stats_update', (data) => {
                    document.getElementById('commands-count').textContent = data.totalCommands || 0;
                    document.getElementById('sessions-count').textContent = data.activeSessions || 0;
                    document.getElementById('server-load').textContent = \`\${data.serverLoad || 0}%\`;
                });

                // Update uptime every second
                setInterval(() => this.updateUptime(), 1000);
            }

            updateConnectionStatus(connected) {
                const dot = document.getElementById('connection-status');
                const text = document.getElementById('connection-text');
                const status = document.getElementById('session-status');
                
                if (connected) {
                    dot.style.background = '#4CAF50';
                    text.textContent = 'Connected';
                    status.textContent = 'Active';
                } else {
                    dot.style.background = '#f44336';
                    text.textContent = 'Disconnected';
                    status.textContent = 'Disconnected';
                }
            }

            updateUptime() {
                const uptime = Math.floor((Date.now() - this.connectTime) / 1000);
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = uptime % 60;
                document.getElementById('session-uptime').textContent = 
                    \`\${hours.toString().padStart(2, '0')}:\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
            }

            executeCommand(command) {
                const input = document.getElementById('command-input');
                const cmd = command || input.value.trim();
                
                if (!cmd) return;

                this.addOutput(\`$ \${cmd}\`, 'command-line');
                this.commandHistory.push(cmd);
                this.historyIndex = this.commandHistory.length;
                input.value = '';
                
                this.disableInput();
                this.socket.emit('execute_command', { command: cmd });
            }

            addOutput(text, className = 'output-line') {
                const terminal = document.getElementById('terminal');
                const line = document.createElement('div');
                line.className = className;
                line.textContent = text;
                terminal.appendChild(line);
                terminal.scrollTop = terminal.scrollHeight;
            }

            disableInput() {
                document.getElementById('command-input').disabled = true;
                document.getElementById('execute-btn').disabled = true;
            }

            enableInput() {
                document.getElementById('command-input').disabled = false;
                document.getElementById('execute-btn').disabled = false;
                document.getElementById('command-input').focus();
            }

            handleKeyPress(event) {
                if (event.key === 'Enter') {
                    this.executeCommand();
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (this.historyIndex > 0) {
                        this.historyIndex--;
                        document.getElementById('command-input').value = this.commandHistory[this.historyIndex];
                    }
                } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (this.historyIndex < this.commandHistory.length - 1) {
                        this.historyIndex++;
                        document.getElementById('command-input').value = this.commandHistory[this.historyIndex];
                    } else {
                        this.historyIndex = this.commandHistory.length;
                        document.getElementById('command-input').value = '';
                    }
                }
            }

            clearTerminal() {
                document.getElementById('terminal').innerHTML = '';
            }
        }

        // Global functions
        let cli;

        function handleKeyPress(event) {
            cli.handleKeyPress(event);
        }

        function executeCommand() {
            cli.executeCommand();
        }

        function clearTerminal() {
            cli.clearTerminal();
        }

        function runQuickCommand(command) {
            cli.executeCommand(command);
        }

        function listFiles(directory) {
            cli.executeCommand(\`ls -la \${directory}\`);
        }

        // Initialize when page loads
        window.addEventListener('load', () => {
            cli = new CanvasCLIWeb();
        });
    </script>
</body>
</html>`;
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      const session = this.createSession(socket);
      console.log(chalk.blue(`👤 New web session: ${session.id}`));

      socket.emit('session_created', { sessionId: session.id });

      socket.on('execute_command', async (data) => {
        await this.handleSocketCommand(session.id, data.command, socket);
      });

      socket.on('disconnect', () => {
        this.endSession(session.id);
        console.log(chalk.yellow(`👤 Session ended: ${session.id}`));
      });

      // Send initial stats
      this.sendStatsUpdate(socket);
    });
  }

  private createSession(socket: any): WebSession {
    const session: WebSession = {
      id: uuidv4(),
      ipAddress: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'] || '',
      connectedAt: new Date(),
      lastActivity: new Date(),
      isAuthenticated: !this.config.enableAuth, // Auto-authenticate if auth is disabled
      permissions: ['execute', 'read', 'write'],
      socketId: socket.id
    };

    this.sessions.set(session.id, session);
    this.emit('session-created', session);
    
    return session;
  }

  private endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      this.emit('session-ended', session);
    }
  }

  private async handleSocketCommand(sessionId: string, commandStr: string, socket: any): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isAuthenticated) {
      socket.emit('command_error', { error: 'Unauthorized' });
      return;
    }

    // Update last activity
    session.lastActivity = new Date();

    const parts = commandStr.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    // Check command restrictions
    if (this.config.blockedCommands.includes(command)) {
      socket.emit('command_error', { error: `Command '${command}' is blocked` });
      return;
    }

    if (this.config.allowedCommands.length > 0 && !this.config.allowedCommands.includes(command)) {
      socket.emit('command_error', { error: `Command '${command}' is not allowed` });
      return;
    }

    // Check concurrent command limit
    const runningCommands = Array.from(this.commands.values())
      .filter(cmd => cmd.sessionId === sessionId && cmd.status === 'running');
    
    if (runningCommands.length >= this.config.maxConcurrentCommands) {
      socket.emit('command_error', { error: 'Too many concurrent commands' });
      return;
    }

    const webCommand: WebCommand = {
      id: uuidv4(),
      sessionId,
      command,
      arguments: args,
      workingDirectory: process.cwd(),
      timestamp: new Date(),
      status: 'pending'
    };

    this.commands.set(webCommand.id, webCommand);
    await this.executeWebCommand(webCommand, socket);
  }

  private async executeWebCommand(webCommand: WebCommand, socket: any): Promise<void> {
    webCommand.status = 'running';
    const startTime = Date.now();

    try {
      const process = spawn(webCommand.command, webCommand.arguments, {
        cwd: webCommand.workingDirectory,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.runningProcesses.set(webCommand.id, process);

      process.stdout?.on('data', (data) => {
        const output = data.toString();
        socket.emit('command_output', { output, commandId: webCommand.id });
        
        if (!webCommand.output) webCommand.output = '';
        webCommand.output += output;
      });

      process.stderr?.on('data', (data) => {
        const error = data.toString();
        socket.emit('command_error', { error, commandId: webCommand.id });
        
        if (!webCommand.error) webCommand.error = '';
        webCommand.error += error;
      });

      process.on('close', (code) => {
        webCommand.status = code === 0 ? 'completed' : 'failed';
        webCommand.exitCode = code || 0;
        webCommand.duration = Date.now() - startTime;
        
        this.runningProcesses.delete(webCommand.id);
        
        socket.emit('command_completed', {
          commandId: webCommand.id,
          exitCode: code,
          duration: webCommand.duration
        });

        this.emit('command-executed', webCommand);
        this.sendStatsUpdate();
      });

      process.on('error', (error) => {
        webCommand.status = 'failed';
        webCommand.error = error.message;
        webCommand.duration = Date.now() - startTime;
        
        this.runningProcesses.delete(webCommand.id);
        
        socket.emit('command_error', { error: error.message, commandId: webCommand.id });
        this.emit('command-failed', webCommand);
      });

    } catch (error: any) {
      webCommand.status = 'failed';
      webCommand.error = error.message;
      webCommand.duration = Date.now() - startTime;
      
      socket.emit('command_error', { error: error.message, commandId: webCommand.id });
      this.emit('command-failed', webCommand);
    }
  }

  private handleStatusRequest(req: IncomingMessage, res: ServerResponse): void {
    const status = {
      status: 'running',
      uptime: process.uptime(),
      sessions: this.sessions.size,
      commands: this.commands.size,
      runningCommands: this.runningProcesses.size,
      version: '2.0.0',
      config: {
        port: this.config.port,
        host: this.config.host,
        authEnabled: this.config.enableAuth
      }
    };

    this.sendJson(res, status);
  }

  private handleSessionsRequest(req: IncomingMessage, res: ServerResponse): void {
    const sessions = Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      ipAddress: session.ipAddress,
      connectedAt: session.connectedAt,
      lastActivity: session.lastActivity,
      isAuthenticated: session.isAuthenticated
    }));

    this.sendJson(res, { sessions });
  }

  private handleCommandsRequest(req: IncomingMessage, res: ServerResponse): void {
    const commands = Array.from(this.commands.values()).map(cmd => ({
      id: cmd.id,
      sessionId: cmd.sessionId,
      command: cmd.command,
      timestamp: cmd.timestamp,
      status: cmd.status,
      duration: cmd.duration,
      exitCode: cmd.exitCode
    }));

    this.sendJson(res, { commands: commands.slice(-50) }); // Last 50 commands
  }

  private handleFilesRequest(req: IncomingMessage, res: ServerResponse): void {
    // File management endpoint - simplified
    this.sendJson(res, { message: 'File operations not implemented in basic version' });
  }

  private handleFileRequest(req: IncomingMessage, res: ServerResponse): void {
    // File serving endpoint - simplified
    this.serve404(res);
  }

  private sendJson(res: ServerResponse, data: any): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify(data));
  }

  private serve404(res: ServerResponse): void {
    res.writeHead(404);
    res.end('Not Found');
  }

  private serveError(res: ServerResponse, code: number, message: string): void {
    res.writeHead(code);
    res.end(message);
  }

  private sendStatsUpdate(socket?: any): void {
    const stats = {
      totalCommands: this.commands.size,
      activeSessions: this.sessions.size,
      runningCommands: this.runningProcesses.size,
      serverLoad: this.calculateServerLoad()
    };

    if (socket) {
      socket.emit('stats_update', stats);
    } else {
      this.io.emit('stats_update', stats);
    }
  }

  private calculateServerLoad(): number {
    // Simplified server load calculation
    return Math.min(100, (this.runningProcesses.size / this.config.maxConcurrentCommands) * 100);
  }

  private setupCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
      this.cleanupOldCommands();
    }, 60000); // Every minute
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.config.sessionTimeout) {
        this.endSession(sessionId);
      }
    }
  }

  private cleanupOldCommands(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    for (const [commandId, command] of this.commands) {
      if (command.timestamp.getTime() < cutoff && command.status !== 'running') {
        this.commands.delete(commandId);
      }
    }
  }

  getActiveSessions(): WebSession[] {
    return Array.from(this.sessions.values());
  }

  getRecentCommands(limit: number = 50): WebCommand[] {
    return Array.from(this.commands.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  killCommand(commandId: string): boolean {
    const process = this.runningProcesses.get(commandId);
    if (process) {
      process.kill();
      this.runningProcesses.delete(commandId);
      
      const command = this.commands.get(commandId);
      if (command) {
        command.status = 'failed';
        command.error = 'Killed by user';
      }
      
      return true;
    }
    return false;
  }

  updateConfig(updates: Partial<WebConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
    console.log(chalk.green('✅ Web interface configuration updated'));
    this.emit('config-updated', this.config);
  }

  private async loadConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'web-config.json');
    if (await fs.pathExists(configPath)) {
      const saved = await fs.readJson(configPath);
      this.config = { ...this.config, ...saved };
    }
  }

  private async saveConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'web-config.json');
    await fs.writeJson(configPath, this.config, { spaces: 2 });
  }
}

// Singleton instance
let webInterfaceInstance: WebInterface | null = null;

export function getWebInterface(): WebInterface {
  if (!webInterfaceInstance) {
    webInterfaceInstance = new WebInterface();
  }
  return webInterfaceInstance;
}