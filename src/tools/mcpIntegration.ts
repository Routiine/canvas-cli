import { BaseTool } from './base.js';
import { EventEmitter } from 'events';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

/**
 * MCP (Model Context Protocol) server configuration
 */
export interface MCPServerConfig {
  /** Command to run the MCP server */
  command: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether the server is trusted */
  trust?: boolean;
  /** Transport type (stdio, sse, http) */
  transport?: 'stdio' | 'sse' | 'http';
  /** Server URL for HTTP/SSE transports */
  url?: string;
  /** Timeout for operations (ms) */
  timeout?: number;
  /** OAuth configuration */
  oauth?: {
    clientId: string;
    clientSecret: string;
    authUrl: string;
    tokenUrl: string;
    scopes: string[];
  };
}

/**
 * MCP server status
 */
export enum MCPServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

/**
 * MCP discovery state
 */
export enum MCPDiscoveryState {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ERROR = 'error'
}

/**
 * MCP tool definition from server
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
}

/**
 * MCP prompt definition from server
 */
export interface MCPPromptDefinition {
  name: string;
  description?: string;
  arguments?: any[];
  serverName: string;
}

/**
 * Individual MCP server client
 */
export class MCPServerClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private status: MCPServerStatus = MCPServerStatus.DISCONNECTED;
  private tools: Map<string, MCPToolDefinition> = new Map();
  private prompts: Map<string, MCPPromptDefinition> = new Map();
  private messageId = 0;
  private pendingRequests: Map<number, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();

  constructor(
    private readonly serverName: string,
    private readonly config: MCPServerConfig,
    private readonly debugMode: boolean = false
  ) {
    super();
  }

  /**
   * Connect to the MCP server
   */
  async connect(): Promise<void> {
    if (this.status === MCPServerStatus.CONNECTED) {
      return;
    }

    this.status = MCPServerStatus.CONNECTING;
    this.emit('status', this.status);

    try {
      if (this.config.transport === 'stdio' || !this.config.transport) {
        await this.connectStdio();
      } else if (this.config.transport === 'http') {
        await this.connectHttp();
      } else if (this.config.transport === 'sse') {
        await this.connectSSE();
      }

      this.status = MCPServerStatus.CONNECTED;
      this.emit('status', this.status);
      this.emit('connected');

    } catch (error) {
      this.status = MCPServerStatus.ERROR;
      this.emit('status', this.status);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Connect using stdio transport
   */
  private async connectStdio(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout for server ${this.serverName}`));
      }, this.config.timeout || 30000);

      this.process = spawn(this.config.command, this.config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.config.env }
      });

      this.process.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.process.on('exit', (code) => {
        if (this.status !== MCPServerStatus.DISCONNECTED) {
          this.emit('disconnected', code);
        }
      });

      // Set up JSON-RPC communication
      let buffer = '';
      this.process.stdout?.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              this.handleMessage(message);
            } catch (error) {
              if (this.debugMode) {
                console.log(chalk.yellow(`Invalid JSON from ${this.serverName}: ${line}`));
              }
            }
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        if (this.debugMode) {
          console.log(chalk.yellow(`${this.serverName} stderr: ${data}`));
        }
      });

      // Send initialization request
      this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'canvas-cli',
          version: '1.0.0'
        }
      }).then(() => {
        clearTimeout(timeout);
        resolve();
      }).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Connect using HTTP transport
   */
  private async connectHttp(): Promise<void> {
    // HTTP transport implementation would go here
    throw new Error('HTTP transport not implemented yet');
  }

  /**
   * Connect using SSE transport
   */
  private async connectSSE(): Promise<void> {
    // SSE transport implementation would go here
    throw new Error('SSE transport not implemented yet');
  }

  /**
   * Discover tools and prompts from the server
   */
  async discover(): Promise<void> {
    try {
      // Discover tools
      const toolsResponse = await this.sendRequest('tools/list', {});
      if (toolsResponse.tools) {
        for (const tool of toolsResponse.tools) {
          const mcpTool: MCPToolDefinition = {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            serverName: this.serverName
          };
          this.tools.set(tool.name, mcpTool);
        }
      }

      // Discover prompts
      const promptsResponse = await this.sendRequest('prompts/list', {});
      if (promptsResponse.prompts) {
        for (const prompt of promptsResponse.prompts) {
          const mcpPrompt: MCPPromptDefinition = {
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments,
            serverName: this.serverName
          };
          this.prompts.set(prompt.name, mcpPrompt);
        }
      }

      this.emit('discovered', {
        tools: Array.from(this.tools.values()),
        prompts: Array.from(this.prompts.values())
      });

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Call a tool on the server
   */
  async callTool(name: string, arguments_: any): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: arguments_
    });
  }

  /**
   * Get a prompt from the server
   */
  async getPrompt(name: string, arguments_: any): Promise<any> {
    return this.sendRequest('prompts/get', {
      name,
      arguments: arguments_
    });
  }

  /**
   * Send a JSON-RPC request
   */
  private async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, this.config.timeout || 30000);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      if (this.process?.stdin) {
        this.process.stdin.write(JSON.stringify(message) + '\n');
      } else {
        reject(new Error('No communication channel available'));
      }
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: any): void {
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message || 'Unknown error'));
      } else {
        pending.resolve(message.result);
      }
    } else if (message.method) {
      // Handle notifications/requests from server
      this.emit('notification', message);
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.status === MCPServerStatus.DISCONNECTED) {
      return;
    }

    this.status = MCPServerStatus.DISCONNECTED;
    this.emit('status', this.status);

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.emit('disconnected');
  }

  getStatus(): MCPServerStatus {
    return this.status;
  }

  getTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getPrompts(): MCPPromptDefinition[] {
    return Array.from(this.prompts.values());
  }
}

/**
 * MCP Client Manager - manages multiple MCP servers
 */
export class MCPClientManager extends EventEmitter {
  private clients: Map<string, MCPServerClient> = new Map();
  private discoveryState: MCPDiscoveryState = MCPDiscoveryState.NOT_STARTED;
  private allTools: Map<string, MCPToolDefinition> = new Map();
  private allPrompts: Map<string, MCPPromptDefinition> = new Map();

  constructor(
    private readonly servers: Record<string, MCPServerConfig>,
    private readonly debugMode: boolean = false
  ) {
    super();
  }

  /**
   * Discover all MCP servers and their tools
   */
  async discoverAll(): Promise<void> {
    this.discoveryState = MCPDiscoveryState.IN_PROGRESS;
    this.emit('discovery-start', { count: Object.keys(this.servers).length });

    const serverEntries = Object.entries(this.servers);
    const results = await Promise.allSettled(
      serverEntries.map(async ([name, config], index) => {
        this.emit('server-connecting', { name, current: index + 1, total: serverEntries.length });

        const client = new MCPServerClient(name, config, this.debugMode);
        this.clients.set(name, client);

        // Set up event listeners
        client.on('connected', () => {
          this.emit('server-connected', { name, current: index + 1, total: serverEntries.length });
        });

        client.on('discovered', (data) => {
          // Register tools and prompts
          for (const tool of data.tools) {
            const prefixedName = `${name}__${tool.name}`;
            this.allTools.set(prefixedName, { ...tool, name: prefixedName });
          }

          for (const prompt of data.prompts) {
            const prefixedName = `${name}__${prompt.name}`;
            this.allPrompts.set(prefixedName, { ...prompt, name: prefixedName });
          }

          this.emit('server-discovered', { name, tools: data.tools.length, prompts: data.prompts.length });
        });

        client.on('error', (error) => {
          this.emit('server-error', { name, error });
        });

        try {
          await client.connect();
          await client.discover();
        } catch (error) {
          this.emit('server-error', { name, error });
          throw error;
        }
      })
    );

    // Count successes and failures
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    this.discoveryState = MCPDiscoveryState.COMPLETED;
    this.emit('discovery-complete', { 
      successes, 
      failures, 
      tools: this.allTools.size, 
      prompts: this.allPrompts.size 
    });
  }

  /**
   * Call a tool on any server
   */
  async callTool(toolName: string, arguments_: any): Promise<any> {
    const tool = this.allTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const client = this.clients.get(tool.serverName);
    if (!client) {
      throw new Error(`Server ${tool.serverName} not connected`);
    }

    // Remove prefix from tool name for server call
    const originalToolName = toolName.replace(`${tool.serverName}__`, '');
    return client.callTool(originalToolName, arguments_);
  }

  /**
   * Get a prompt from any server
   */
  async getPrompt(promptName: string, arguments_: any): Promise<any> {
    const prompt = this.allPrompts.get(promptName);
    if (!prompt) {
      throw new Error(`Prompt ${promptName} not found`);
    }

    const client = this.clients.get(prompt.serverName);
    if (!client) {
      throw new Error(`Server ${prompt.serverName} not connected`);
    }

    // Remove prefix from prompt name for server call
    const originalPromptName = promptName.replace(`${prompt.serverName}__`, '');
    return client.getPrompt(originalPromptName, arguments_);
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.clients.values()).map(client => client.disconnect())
    );
    
    this.clients.clear();
    this.allTools.clear();
    this.allPrompts.clear();
    this.discoveryState = MCPDiscoveryState.NOT_STARTED;
  }

  /**
   * Get server status
   */
  getServerStatus(): Record<string, MCPServerStatus> {
    const status: Record<string, MCPServerStatus> = {};
    for (const [name, client] of this.clients) {
      status[name] = client.getStatus();
    }
    return status;
  }

  /**
   * Get all discovered tools
   */
  getAllTools(): MCPToolDefinition[] {
    return Array.from(this.allTools.values());
  }

  /**
   * Get all discovered prompts
   */
  getAllPrompts(): MCPPromptDefinition[] {
    return Array.from(this.allPrompts.values());
  }

  getDiscoveryState(): MCPDiscoveryState {
    return this.discoveryState;
  }
}

/**
 * MCP Management Tool for Canvas CLI
 */
export class MCPTool extends BaseTool {
  name = 'mcp';
  description = 'Manage MCP (Model Context Protocol) servers and tools';
  parameters = {
    action: {
      type: 'string',
      enum: ['status', 'discover', 'list-tools', 'list-prompts', 'call-tool', 'get-prompt', 'add-server', 'remove-server'],
      description: 'Action to perform'
    },
    serverName: { type: 'string', description: 'Server name (for add/remove operations)' },
    toolName: { type: 'string', description: 'Tool name (for call-tool)' },
    promptName: { type: 'string', description: 'Prompt name (for get-prompt)' },
    arguments: { type: 'object', description: 'Arguments for tool/prompt calls' },
    serverConfig: { 
      type: 'object', 
      description: 'Server configuration (for add-server)',
      properties: {
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        env: { type: 'object' },
        trust: { type: 'boolean' },
        transport: { type: 'string', enum: ['stdio', 'http', 'sse'] },
        url: { type: 'string' },
        timeout: { type: 'number' }
      }
    }
  };

  private manager: MCPClientManager;
  private configPath: string;

  constructor() {
    super();
    this.configPath = path.join(process.cwd(), '.canvas', 'mcp-servers.json');
    
    // Load server configurations
    const servers = this.loadServers();
    this.manager = new MCPClientManager(servers, false);

    // Set up event listeners
    this.manager.on('discovery-start', (data) => {
      console.log(chalk.blue(`🔍 Discovering ${data.count} MCP servers...`));
    });

    this.manager.on('server-connected', (data) => {
      console.log(chalk.green(`✓ Connected to ${data.name} (${data.current}/${data.total})`));
    });

    this.manager.on('server-discovered', (data) => {
      console.log(chalk.blue(`📡 ${data.name}: ${data.tools} tools, ${data.prompts} prompts`));
    });

    this.manager.on('server-error', (data) => {
      console.log(chalk.red(`✗ Error with ${data.name}: ${data.error.message}`));
    });

    this.manager.on('discovery-complete', (data) => {
      console.log(chalk.green(`✅ Discovery complete: ${data.successes}/${data.successes + data.failures} servers, ${data.tools} tools, ${data.prompts} prompts`));
    });
  }

  async execute(params: {
    action: string;
    serverName?: string;
    toolName?: string;
    promptName?: string;
    arguments?: any;
    serverConfig?: MCPServerConfig;
  }): Promise<any> {
    const { action } = params;

    switch (action) {
      case 'status':
        return this.getStatus();
      
      case 'discover':
        await this.manager.discoverAll();
        return { success: true, message: 'Discovery completed' };
      
      case 'list-tools':
        return this.manager.getAllTools();
      
      case 'list-prompts':
        return this.manager.getAllPrompts();
      
      case 'call-tool':
        if (!params.toolName) throw new Error('toolName required for call-tool');
        return this.manager.callTool(params.toolName, params.arguments || {});
      
      case 'get-prompt':
        if (!params.promptName) throw new Error('promptName required for get-prompt');
        return this.manager.getPrompt(params.promptName, params.arguments || {});
      
      case 'add-server':
        if (!params.serverName || !params.serverConfig) {
          throw new Error('serverName and serverConfig required for add-server');
        }
        return this.addServer(params.serverName, params.serverConfig);
      
      case 'remove-server':
        if (!params.serverName) throw new Error('serverName required for remove-server');
        return this.removeServer(params.serverName);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private getStatus() {
    const status = this.manager.getServerStatus();
    const discoveryState = this.manager.getDiscoveryState();
    const tools = this.manager.getAllTools();
    const prompts = this.manager.getAllPrompts();

    return {
      discoveryState,
      servers: status,
      toolCount: tools.length,
      promptCount: prompts.length,
      tools: tools.map(t => ({ name: t.name, server: t.serverName, description: t.description })),
      prompts: prompts.map(p => ({ name: p.name, server: p.serverName, description: p.description }))
    };
  }

  private async addServer(name: string, config: MCPServerConfig): Promise<{ success: boolean; message: string }> {
    const servers = this.loadServers();
    servers[name] = config;
    await this.saveServers(servers);
    return { success: true, message: `Server ${name} added successfully` };
  }

  private async removeServer(name: string): Promise<{ success: boolean; message: string }> {
    const servers = this.loadServers();
    if (!(name in servers)) {
      throw new Error(`Server ${name} not found`);
    }
    delete servers[name];
    await this.saveServers(servers);
    return { success: true, message: `Server ${name} removed successfully` };
  }

  private loadServers(): Record<string, MCPServerConfig> {
    try {
      if (fs.existsSync(this.configPath)) {
        return fs.readJsonSync(this.configPath);
      }
    } catch {
      // Ignore errors
    }
    return {};
  }

  private async saveServers(servers: Record<string, MCPServerConfig>): Promise<void> {
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, servers, { spaces: 2 });
  }
}