import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import WebSocket from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 7. Model Context Protocol (MCP) Support
export interface MCPServer {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;
  url?: string;
  tools: MCPTool[];
  resources: MCPResource[];
  status: 'connected' | 'disconnected' | 'error';
  lastPing?: Date;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  outputSchema?: any;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

export class ModelContextProtocol extends EventEmitter {
  private servers: Map<string, MCPServer> = new Map();
  private connections: Map<string, any> = new Map();
  private configDir: string;
  private messageId: number = 0;
  private pendingRequests: Map<string | number, (result: any) => void> = new Map();
  
  constructor() {
    super();
    this.configDir = path.join(os.homedir(), '.canvas-cli', 'mcp');
    fs.ensureDirSync(this.configDir);
    this.loadServerConfigs();
  }
  
  async discoverServers(): Promise<MCPServer[]> {
    const discovered: MCPServer[] = [];
    
    // Check for MCP servers in known locations
    const mcpPaths = [
      path.join(os.homedir(), '.config', 'mcp', 'servers'),
      path.join(os.homedir(), '.mcp', 'servers'),
      '/usr/local/share/mcp/servers'
    ];
    
    for (const mcpPath of mcpPaths) {
      if (await fs.pathExists(mcpPath)) {
        const files = await fs.readdir(mcpPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const config = await fs.readJson(path.join(mcpPath, file));
              const server: MCPServer = {
                id: uuidv4(),
                name: config.name || path.basename(file, '.json'),
                description: config.description || '',
                transport: config.transport || 'stdio',
                command: config.command,
                url: config.url,
                tools: [],
                resources: [],
                status: 'disconnected'
              };
              discovered.push(server);
            } catch (error) {
              console.log(chalk.yellow(`⚠️ Failed to parse ${file}`));
            }
          }
        }
      }
    }
    
    // Also check for running MCP servers via system
    try {
      if (process.platform !== 'win32') {
        const { stdout } = await execAsync('ps aux | grep -i mcp | grep -v grep');
        const lines = stdout.split('\n').filter(Boolean);
        for (const line of lines) {
          // Parse running MCP processes
          if (line.includes('mcp-server')) {
            const parts = line.split(/\s+/);
            const command = parts.slice(10).join(' ');
            discovered.push({
              id: uuidv4(),
              name: 'Running MCP Server',
              description: command,
              transport: 'stdio',
              command,
              tools: [],
              resources: [],
              status: 'disconnected'
            });
          }
        }
      }
    } catch (error) {
      // Ignore errors in process discovery
    }
    
    console.log(chalk.cyan(`🔍 Discovered ${discovered.length} MCP servers`));
    return discovered;
  }
  
  async connectServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) throw new Error('Server not found');
    
    console.log(chalk.cyan(`🔌 Connecting to ${server.name}...`));
    
    try {
      switch (server.transport) {
        case 'stdio':
          await this.connectStdio(server);
          break;
        case 'websocket':
          await this.connectWebSocket(server);
          break;
        case 'http':
          await this.connectHTTP(server);
          break;
      }
      
      // Initialize connection
      await this.initialize(server);
      
      // List available tools and resources
      await this.listTools(server);
      await this.listResources(server);
      
      server.status = 'connected';
      this.emit('server-connected', server);
      
      console.log(chalk.green(`✅ Connected to ${server.name}`));
      console.log(chalk.dim(`   Tools: ${server.tools.length}`));
      console.log(chalk.dim(`   Resources: ${server.resources.length}`));
    } catch (error: any) {
      server.status = 'error';
      console.log(chalk.red(`❌ Failed to connect: ${error.message}`));
      throw error;
    }
  }
  
  private async connectStdio(server: MCPServer): Promise<void> {
    if (!server.command) throw new Error('No command specified for stdio server');
    
    const { spawn } = require('child_process');
    const child = spawn(server.command, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
    
    child.stdout.on('data', (data: Buffer) => {
      this.handleMessage(server, data.toString());
    });
    
    child.stderr.on('data', (data: Buffer) => {
      console.error(chalk.red(`MCP Error: ${data.toString()}`));
    });
    
    child.on('close', (code: number) => {
      server.status = 'disconnected';
      this.connections.delete(server.id);
      this.emit('server-disconnected', server);
    });
    
    this.connections.set(server.id, child);
  }
  
  private async connectWebSocket(server: MCPServer): Promise<void> {
    if (!server.url) throw new Error('No URL specified for WebSocket server');
    
    const ws = new WebSocket(server.url);
    
    ws.on('open', () => {
      console.log(chalk.green('✅ WebSocket connected'));
    });
    
    ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(server, data.toString());
    });
    
    ws.on('error', (error: Error) => {
      console.error(chalk.red(`WebSocket error: ${error.message}`));
      server.status = 'error';
    });
    
    ws.on('close', () => {
      server.status = 'disconnected';
      this.connections.delete(server.id);
      this.emit('server-disconnected', server);
    });
    
    this.connections.set(server.id, ws);
  }
  
  private async connectHTTP(server: MCPServer): Promise<void> {
    if (!server.url) throw new Error('No URL specified for HTTP server');
    
    // Store HTTP endpoint for request/response
    this.connections.set(server.id, { url: server.url, type: 'http' });
  }
  
  private async initialize(server: MCPServer): Promise<void> {
    const response = await this.sendRequest(server, 'initialize', {
      protocolVersion: '1.0.0',
      clientInfo: {
        name: 'Canvas CLI',
        version: '2.0.0'
      }
    });
    
    if (response.capabilities) {
      // Store server capabilities
      server.tools = response.capabilities.tools || [];
      server.resources = response.capabilities.resources || [];
    }
  }
  
  private async listTools(server: MCPServer): Promise<void> {
    try {
      const response = await this.sendRequest(server, 'tools/list', {});
      if (response.tools) {
        server.tools = response.tools;
      }
    } catch (error) {
      // Server might not support tools/list
    }
  }
  
  private async listResources(server: MCPServer): Promise<void> {
    try {
      const response = await this.sendRequest(server, 'resources/list', {});
      if (response.resources) {
        server.resources = response.resources;
      }
    } catch (error) {
      // Server might not support resources/list
    }
  }
  
  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server) throw new Error('Server not found');
    if (server.status !== 'connected') throw new Error('Server not connected');
    
    const tool = server.tools.find(t => t.name === toolName);
    if (!tool) throw new Error(`Tool '${toolName}' not found`);
    
    console.log(chalk.cyan(`🔧 Calling ${toolName}...`));
    
    const response = await this.sendRequest(server, 'tools/call', {
      name: toolName,
      arguments: args
    });
    
    return response.result;
  }
  
  async readResource(serverId: string, uri: string): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server) throw new Error('Server not found');
    if (server.status !== 'connected') throw new Error('Server not connected');
    
    const resource = server.resources.find(r => r.uri === uri);
    if (!resource) throw new Error(`Resource '${uri}' not found`);
    
    console.log(chalk.cyan(`📄 Reading ${uri}...`));
    
    const response = await this.sendRequest(server, 'resources/read', { uri });
    
    return response.contents;
  }
  
  private async sendRequest(server: MCPServer, method: string, params: any): Promise<any> {
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, resolve);
      
      const connection = this.connections.get(server.id);
      if (!connection) {
        reject(new Error('No connection'));
        return;
      }
      
      const messageStr = JSON.stringify(message) + '\n';
      
      if (server.transport === 'stdio') {
        connection.stdin.write(messageStr);
      } else if (server.transport === 'websocket') {
        connection.send(messageStr);
      } else if (server.transport === 'http') {
        // HTTP request
        this.sendHTTPRequest(connection.url, message).then(resolve).catch(reject);
      }
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }
  
  private async sendHTTPRequest(url: string, message: MCPMessage): Promise<any> {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    return response.json();
  }
  
  private handleMessage(server: MCPServer, data: string): void {
    try {
      // Handle multiple messages in one chunk
      const lines = data.split('\n').filter(Boolean);
      for (const line of lines) {
        const message: MCPMessage = JSON.parse(line);
        
        if (message.id && this.pendingRequests.has(message.id)) {
          const resolve = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            console.error(chalk.red(`MCP Error: ${message.error.message}`));
          } else {
            resolve(message.result);
          }
        } else if (message.method) {
          // Handle server-initiated messages
          this.handleNotification(server, message);
        }
      }
    } catch (error) {
      console.error(chalk.red('Failed to parse MCP message'), error);
    }
  }
  
  private handleNotification(server: MCPServer, message: MCPMessage): void {
    switch (message.method) {
      case 'tools/updated':
        this.listTools(server);
        break;
      case 'resources/updated':
        this.listResources(server);
        break;
      case 'log':
        console.log(chalk.dim(`[${server.name}] ${message.params?.message}`));
        break;
      default:
        this.emit('notification', { server, message });
    }
  }
  
  listServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }
  
  getServerStatus(): string {
    const servers = this.listServers();
    const connected = servers.filter(s => s.status === 'connected').length;
    
    const lines: string[] = [];
    lines.push(chalk.cyan('🌐 MCP Servers:'));
    
    for (const server of servers) {
      const statusIcon = server.status === 'connected' ? '🔴' : '⚪';
      lines.push(`  ${statusIcon} ${server.name} (${server.transport})`);
      
      if (server.status === 'connected') {
        lines.push(chalk.dim(`     Tools: ${server.tools.length}`));
        lines.push(chalk.dim(`     Resources: ${server.resources.length}`));
      }
    }
    
    lines.push(chalk.dim(`\n  Connected: ${connected}/${servers.length}`));
    
    return lines.join('\n');
  }
  
  async addServer(config: {
    name: string;
    description?: string;
    transport: 'stdio' | 'http' | 'websocket';
    command?: string;
    url?: string;
  }): Promise<MCPServer> {
    const server: MCPServer = {
      id: uuidv4(),
      name: config.name,
      description: config.description || '',
      transport: config.transport,
      command: config.command,
      url: config.url,
      tools: [],
      resources: [],
      status: 'disconnected'
    };
    
    this.servers.set(server.id, server);
    
    // Save configuration
    const configPath = path.join(this.configDir, `${server.id}.json`);
    await fs.writeJson(configPath, server, { spaces: 2 });
    
    console.log(chalk.green(`✅ Added MCP server: ${server.name}`));
    
    return server;
  }
  
  private async loadServerConfigs(): Promise<void> {
    try {
      const files = await fs.readdir(this.configDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const config = await fs.readJson(path.join(this.configDir, file));
          this.servers.set(config.id, config);
        }
      }
    } catch (error) {
      // Silent fail on first run
    }
  }
}

// Singleton instance
let mcpInstance: ModelContextProtocol | null = null;

export function getMCP(): ModelContextProtocol {
  if (!mcpInstance) {
    mcpInstance = new ModelContextProtocol();
  }
  return mcpInstance;
}