import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { URL } from 'url';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import crypto from 'crypto';

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
  authTokenExpiry: number; // Token expiry in ms
  maxFailedLoginAttempts: number;
  lockoutDuration: number; // Lockout duration in ms
}

export interface AuthToken {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string;
}

interface LoginAttempt {
  count: number;
  lockedUntil?: Date;
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
  private io!: SocketIOServer;
  private sessions: Map<string, WebSession> = new Map();
  private commands: Map<string, WebCommand> = new Map();
  private fileOperations: Map<string, FileOperation> = new Map();
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private config: WebConfig;
  private storageDir: string;
  private isRunning: boolean = false;

  // Authentication state
  private authTokens: Map<string, AuthToken> = new Map();
  private loginAttempts: Map<string, LoginAttempt> = new Map();
  private users: Map<string, { passwordHash: string; role: string }> = new Map();

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
      corsOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      authTokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
      maxFailedLoginAttempts: 5,
      lockoutDuration: 15 * 60 * 1000 // 15 minutes
    };

    void this.loadConfig();
    void this.loadUsers();
    this.setupCleanupTimer();
  }

  /**
   * Load users from file
   */
  private async loadUsers(): Promise<void> {
    const usersPath = path.join(this.storageDir, 'users.json');
    try {
      if (await fs.pathExists(usersPath)) {
        const data = await fs.readJson(usersPath);
        for (const [username, userData] of Object.entries(data)) {
          this.users.set(username, userData as { passwordHash: string; role: string });
        }
      } else {
        // Create default admin user if auth is enabled and no users exist
        if (this.config.enableAuth) {
          const defaultPassword = crypto.randomBytes(16).toString('hex');
          await this.createUser('admin', defaultPassword, 'admin');
          const credentialsDir = path.join(os.homedir(), '.canvas', 'web');
          const credentialsPath = path.join(credentialsDir, 'admin-credentials.txt');
          await fs.ensureDir(credentialsDir);
          await fs.writeFile(credentialsPath, `admin:${defaultPassword}\n`, { mode: 0o600 });
          console.log(chalk.yellow(`\n⚠️  Default admin user created. Credentials saved to: ${credentialsPath}`));
          console.log(chalk.yellow(`   File permissions set to 600 (owner read/write only)\n`));
        }
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  }

  /**
   * Save users to file
   */
  private async saveUsers(): Promise<void> {
    const usersPath = path.join(this.storageDir, 'users.json');
    const data: Record<string, any> = {};
    for (const [username, userData] of this.users) {
      data[username] = userData;
    }
    await fs.writeJson(usersPath, data, { spaces: 2 });
  }

  /**
   * Create a new user
   */
  async createUser(username: string, password: string, role: string = 'user'): Promise<void> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    this.users.set(username, { passwordHash: `${salt}:${hash}`, role });
    await this.saveUsers();
  }

  /**
   * Verify user password
   */
  private verifyPassword(username: string, password: string): boolean {
    const user = this.users.get(username);
    if (!user) return false;

    const [salt, storedHash] = user.passwordHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(hash, 'hex'));
  }

  /**
   * Check if IP is locked out
   */
  private isLockedOut(ipAddress: string): boolean {
    const attempt = this.loginAttempts.get(ipAddress);
    if (!attempt || !attempt.lockedUntil) return false;
    if (new Date() > attempt.lockedUntil) {
      this.loginAttempts.delete(ipAddress);
      return false;
    }
    return true;
  }

  /**
   * Record failed login attempt
   */
  private recordFailedLogin(ipAddress: string): void {
    const attempt = this.loginAttempts.get(ipAddress) || { count: 0 };
    attempt.count++;
    if (attempt.count >= this.config.maxFailedLoginAttempts) {
      attempt.lockedUntil = new Date(Date.now() + this.config.lockoutDuration);
      console.log(chalk.red(`🔒 IP ${ipAddress} locked out due to too many failed login attempts`));
    }
    this.loginAttempts.set(ipAddress, attempt);
  }

  /**
   * Authenticate user and create token
   */
  authenticate(username: string, password: string, ipAddress: string): { success: boolean; token?: string; error?: string } {
    // Check lockout
    if (this.isLockedOut(ipAddress)) {
      return { success: false, error: 'Too many failed attempts. Please try again later.' };
    }

    // Verify credentials
    if (!this.verifyPassword(username, password)) {
      this.recordFailedLogin(ipAddress);
      return { success: false, error: 'Invalid username or password' };
    }

    // Clear failed attempts on success
    this.loginAttempts.delete(ipAddress);

    // Create token
    const token = crypto.randomBytes(32).toString('hex');
    const authToken: AuthToken = {
      token,
      userId: username,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.authTokenExpiry),
      ipAddress
    };

    this.authTokens.set(token, authToken);
    console.log(chalk.green(`✅ User ${username} authenticated from ${ipAddress}`));

    return { success: true, token };
  }

  /**
   * Validate auth token
   */
  validateToken(token: string, ipAddress: string): { valid: boolean; userId?: string } {
    const authToken = this.authTokens.get(token);
    if (!authToken) {
      return { valid: false };
    }

    // Check expiry
    if (new Date() > authToken.expiresAt) {
      this.authTokens.delete(token);
      return { valid: false };
    }

    // Optionally check IP (can be disabled for mobile users)
    // if (authToken.ipAddress !== ipAddress) {
    //   return { valid: false };
    // }

    return { valid: true, userId: authToken.userId };
  }

  /**
   * Revoke auth token (logout)
   */
  revokeToken(token: string): void {
    this.authTokens.delete(token);
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
      void this.io.close();

      // Close HTTP server
      this.server.close(() => {
        this.isRunning = false;
        console.log(chalk.yellow('🌐 Web interface stopped'));
        this.emit('stopped');
        resolve();
      });
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
      // Check authentication for protected endpoints
      const protectedEndpoints = ['/api/sessions', '/api/commands', '/api/files'];
      if (this.config.enableAuth && protectedEndpoints.some(ep => pathname.startsWith(ep))) {
        const token = this.extractToken(req);
        const ipAddress = req.socket.remoteAddress || '';
        if (!token || !this.validateToken(token, ipAddress).valid) {
          this.sendJson(res, { error: 'Unauthorized' }, 401);
          return;
        }
      }

      switch (pathname) {
        case '/':
          this.serveIndexPage(req, res);
          break;
        case '/api/login':
          await this.handleLoginRequest(req, res);
          break;
        case '/api/logout':
          this.handleLogoutRequest(req, res);
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

  /**
   * Extract auth token from request
   */
  private extractToken(req: IncomingMessage): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  /**
   * Handle login request
   */
  private async handleLoginRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      this.serveError(res, 405, 'Method not allowed');
      return;
    }

    const body = await this.parseRequestBody(req);
    const { username, password } = body;

    if (!username || !password) {
      this.sendJson(res, { error: 'Username and password required' }, 400);
      return;
    }

    const ipAddress = req.socket.remoteAddress || '';
    const result = this.authenticate(username, password, ipAddress);

    if (result.success) {
      this.sendJson(res, { success: true, token: result.token });
    } else {
      this.sendJson(res, { success: false, error: result.error }, 401);
    }
  }

  /**
   * Handle logout request
   */
  private handleLogoutRequest(req: IncomingMessage, res: ServerResponse): void {
    const token = this.extractToken(req);
    if (token) {
      this.revokeToken(token);
    }
    this.sendJson(res, { success: true });
  }

  /**
   * Parse request body as JSON
   */
  private parseRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    });
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
    // Socket.io authentication middleware
    this.io.use((socket, next) => {
      if (!this.config.enableAuth) {
        return next();
      }

      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const ipAddress = socket.handshake.address;
      const validation = this.validateToken(token as string, ipAddress);
      if (!validation.valid) {
        return next(new Error('Invalid or expired token'));
      }

      // Attach user info to socket
      (socket as any).userId = validation.userId;
      next();
    });

    this.io.on('connection', (socket) => {
      const session = this.createSession(socket);
      console.log(chalk.blue(`👤 New web session: ${session.id}`));

      socket.emit('session_created', { sessionId: session.id, authRequired: this.config.enableAuth });

      // Handle authentication via socket
      socket.on('authenticate', (data) => {
        const ipAddress = socket.handshake.address;
        const result = this.authenticate(data.username, data.password, ipAddress);
        if (result.success) {
          session.isAuthenticated = true;
          session.userId = data.username;
          socket.emit('authenticated', { success: true, token: result.token });
        } else {
          socket.emit('authenticated', { success: false, error: result.error });
        }
      });

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

  private sendJson(res: ServerResponse, data: any, statusCode: number = 200): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(statusCode);
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
    void this.saveConfig();
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