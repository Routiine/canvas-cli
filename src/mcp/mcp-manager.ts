// @ts-ignore
import { Client } from '@modelcontextprotocol/sdk';
// @ts-ignore
import { StdioTransport, StdioClientTransport } from '@modelcontextprotocol/sdk';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { errorHandler } from '../utils/error-handler.js';
import { performanceConfig } from '../config/performance.js';
import type { Tool } from '../tools/tool-executor.js';
import { toolRegistry } from '../tools/tool-executor.js';
import { loadMCPConfigs, saveMCPConfig, type MCPConfigSource } from './mcp-config-loader.js';
import { CanvasMCPServer, startMCPServer, type MCPServerOptions } from './mcp-server.js';

export interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
  description?: string;
  transport?: 'stdio' | 'http' | 'sse';
  url?: string;
}

export interface MCPConfig {
  servers: MCPServer[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  server: string;
}

export class MCPManager extends EventEmitter {
  private static instance: MCPManager;
  private clients: Map<string, Client> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private config: MCPConfig;
  private configSources: MCPConfigSource[] = [];
  private initialized: boolean = false;
  private restartTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private isShuttingDown: boolean = false;
  private mcpServer: CanvasMCPServer | null = null;

  // Subprocess cleanup settings
  private static readonly GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds

  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  constructor() {
    super();
    const { merged, sources } = loadMCPConfigs();
    this.config = merged;
    this.configSources = sources;
    this.setupProcessExitHandler();
  }

  /**
   * Setup handler for main process exit to cleanup subprocesses
   */
  private setupProcessExitHandler(): void {
    const cleanup = () => {
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        this.forceStopAllSync();
      }
    };

    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      cleanup();
      process.exit(1);
    });
  }

  /**
   * Synchronously force stop all processes (for process exit handler)
   */
  private forceStopAllSync(): void {
    // Cancel all pending restart timeouts
    for (const timeout of this.restartTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.restartTimeouts.clear();

    // Force kill all processes
    for (const [serverName, proc] of this.processes) {
      try {
        proc.kill('SIGKILL');
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    this.processes.clear();
    this.clients.clear();
  }

  /**
   * Reload config from all sources (user, project, legacy)
   */
  private reloadConfig(): void {
    const { merged, sources } = loadMCPConfigs();
    this.config = merged;
    this.configSources = sources;
  }

  /**
   * Save MCP configuration to project scope by default
   */
  private saveConfig(scope: 'user' | 'project' = 'project'): void {
    try {
      saveMCPConfig(this.config, scope);
    } catch (error) {
      console.error('Failed to save MCP config:', error);
    }
  }

  /**
   * Get config sources for display
   */
  getConfigSources(): MCPConfigSource[] {
    return this.configSources;
  }

  /**
   * Initialize MCP servers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      for (const server of this.config.servers) {
        if (server.enabled !== false) {
          await this.startServer(server);
        }
      }
      
      this.initialized = true;
      this.emit('initialized');
    } catch (error) {
      errorHandler.handleError('mcp-initialize', error as Error);
      throw error;
    }
  }

  /**
   * Start an MCP server
   */
  private async startServer(server: MCPServer): Promise<void> {
    try {
      console.log(`Starting MCP server: ${server.name}`);
      
      // Spawn the server process
      const serverProcess = spawn(server.command, server.args || [], {
        env: { ...process.env, ...server.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Store process reference
      this.processes.set(server.name, serverProcess);

      // Create transport
      const transport = new StdioClientTransport({
        stdin: serverProcess.stdin,
        stdout: serverProcess.stdout
      });

      // Create client
      const client = new Client({
        name: `canvas-cli-${server.name}`,
        version: '1.0.0',
        transport
      });

      // Connect to server
      await client.connect();
      
      // Store client reference
      this.clients.set(server.name, client);

      // Discover and register tools
      await this.discoverTools(server.name, client);

      // Handle process errors
      serverProcess.on('error', (error) => {
        console.error(`MCP server ${server.name} error:`, error);
        this.handleServerError(server.name, error);
      });

      serverProcess.on('exit', (code) => {
        console.log(`MCP server ${server.name} exited with code ${code}`);
        this.handleServerExit(server.name, code);
      });

      this.emit('server-started', server.name);
    } catch (error) {
      console.error(`Failed to start MCP server ${server.name}:`, error);
      throw error;
    }
  }

  /**
   * Discover tools from MCP server
   */
  private async discoverTools(serverName: string, client: Client): Promise<void> {
    try {
      const tools = await client.listTools();
      
      for (const tool of tools.tools) {
        const mcpTool: MCPTool = {
          name: `${serverName}:${tool.name}`,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
          server: serverName
        };

        this.tools.set(mcpTool.name, mcpTool);
        
        // Register with tool registry
        this.registerToolWithRegistry(mcpTool, client);
      }

      console.log(`Discovered ${tools.tools.length} tools from ${serverName}`);
      this.emit('tools-discovered', { server: serverName, count: tools.tools.length });
    } catch (error) {
      console.error(`Failed to discover tools from ${serverName}:`, error);
    }
  }

  /**
   * Register MCP tool with tool registry
   */
  private registerToolWithRegistry(mcpTool: MCPTool, client: Client): void {
    const tool: Tool = {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema,
      execute: async (params: any) => {
        return this.executeTool(mcpTool.name, params);
      },
      requiresConfirmation: true
    };

    toolRegistry.register(tool, 'mcp');
  }

  /**
   * Execute an MCP tool
   */
  async executeTool(toolName: string, params: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`MCP tool ${toolName} not found`);
    }

    const client = this.clients.get(tool.server);
    if (!client) {
      throw new Error(`MCP server ${tool.server} not connected`);
    }

    try {
      // Extract actual tool name (remove server prefix)
      const actualToolName = toolName.split(':')[1];
      
      // Execute tool through MCP client
      const result = await client.callTool({
        name: actualToolName,
        arguments: params
      });

      return result;
    } catch (error) {
      errorHandler.handleError(`mcp-tool-${toolName}`, error as Error);
      throw error;
    }
  }

  /**
   * Handle server error
   */
  private handleServerError(serverName: string, error: Error): void {
    this.emit('server-error', { server: serverName, error });

    // Don't restart if shutting down
    if (this.isShuttingDown) return;

    // Cancel any existing restart timeout for this server
    const existingTimeout = this.restartTimeouts.get(serverName);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Attempt to restart server
    const server = this.config.servers.find(s => s.name === serverName);
    if (server) {
      const timeout = setTimeout(() => {
        this.restartTimeouts.delete(serverName);
        console.log(`Attempting to restart MCP server: ${serverName}`);
        this.startServer(server).catch(console.error);
      }, 5000);
      this.restartTimeouts.set(serverName, timeout);
    }
  }

  /**
   * Handle server exit
   */
  private handleServerExit(serverName: string, code: number | null): void {
    this.clients.delete(serverName);
    this.processes.delete(serverName);
    
    // Remove tools from this server
    for (const [toolName, tool] of this.tools.entries()) {
      if (tool.server === serverName) {
        this.tools.delete(toolName);
      }
    }
    
    this.emit('server-exited', { server: serverName, code });
  }

  /**
   * Stop an MCP server with graceful shutdown
   */
  async stopServer(serverName: string): Promise<void> {
    // Cancel any pending restart timeout
    const restartTimeout = this.restartTimeouts.get(serverName);
    if (restartTimeout) {
      clearTimeout(restartTimeout);
      this.restartTimeouts.delete(serverName);
    }

    const client = this.clients.get(serverName);
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore close errors
      }
      this.clients.delete(serverName);
    }

    const proc = this.processes.get(serverName);
    if (proc) {
      await this.gracefulKill(proc, serverName);
      this.processes.delete(serverName);
    }

    this.emit('server-stopped', serverName);
  }

  /**
   * Gracefully kill a process (SIGTERM, wait, then SIGKILL)
   */
  private async gracefulKill(proc: ChildProcess, name: string): Promise<void> {
    return new Promise<void>((resolve) => {
      // Already dead
      if (!proc.pid || proc.killed) {
        resolve();
        return;
      }

      let forceKillTimeout: NodeJS.Timeout;

      const onExit = () => {
        clearTimeout(forceKillTimeout);
        resolve();
      };

      proc.once('exit', onExit);

      // Try graceful shutdown first
      proc.kill('SIGTERM');

      // Force kill if not exited after timeout
      forceKillTimeout = setTimeout(() => {
        proc.removeListener('exit', onExit);
        try {
          proc.kill('SIGKILL');
        } catch (e) {
          // Process may already be dead
        }
        resolve();
      }, MCPManager.GRACEFUL_SHUTDOWN_TIMEOUT);
    });
  }

  /**
   * Stop all MCP servers
   */
  async stopAll(): Promise<void> {
    const stopPromises: Promise<void>[] = [];
    
    for (const serverName of this.clients.keys()) {
      stopPromises.push(this.stopServer(serverName));
    }
    
    await Promise.all(stopPromises);
    this.initialized = false;
  }

  /**
   * Add a new MCP server
   */
  addServer(server: MCPServer): void {
    this.config.servers.push(server);
    this.saveConfig();
    this.emit('server-added', server.name);
  }

  /**
   * Remove an MCP server
   */
  async removeServer(serverName: string): Promise<void> {
    await this.stopServer(serverName);
    this.config.servers = this.config.servers.filter(s => s.name !== serverName);
    this.saveConfig();
    this.emit('server-removed', serverName);
  }

  /**
   * Get list of available MCP tools
   */
  getAvailableTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get list of connected servers
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get server status
   */
  getServerStatus(serverName: string): {
    connected: boolean;
    toolCount: number;
    process?: { pid?: number; uptime?: number };
  } {
    const connected = this.clients.has(serverName);
    const toolCount = Array.from(this.tools.values()).filter(t => t.server === serverName).length;
    const process = this.processes.get(serverName);
    
    return {
      connected,
      toolCount,
      process: process ? {
        pid: process.pid,
        uptime: undefined
      } : undefined
    };
  }

  /**
   * Reload configuration
   */
  async reload(): Promise<void> {
    await this.stopAll();
    this.reloadConfig();
    await this.initialize();
  }

  /**
   * Start Canvas CLI as an MCP server
   */
  async startMCPServer(options: MCPServerOptions = {}): Promise<CanvasMCPServer> {
    if (this.mcpServer) {
      throw new Error('MCP server is already running');
    }
    this.mcpServer = await startMCPServer(options);
    return this.mcpServer;
  }

  /**
   * Stop the MCP server
   */
  stopMCPServer(): void {
    if (this.mcpServer) {
      this.mcpServer.stop();
      this.mcpServer = null;
    }
  }

  /**
   * Test MCP server connection
   */
  async testServer(server: MCPServer): Promise<{ success: boolean; error?: string }> {
    try {
      const tempClient = new Client({
        name: 'canvas-cli-test',
        version: '1.0.0',
        transport: new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: server.env
        })
      });

      await tempClient.connect();
      await tempClient.close();
      
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Export configuration
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration
   */
  importConfig(configJson: string): void {
    try {
      const imported = JSON.parse(configJson);
      this.config = imported;
      this.saveConfig();
    } catch (error) {
      throw new Error(`Failed to import MCP config: ${error}`);
    }
  }
}

/**
 * MCP command-line interface
 */
export function createMCPCommand(program: any): void {
  const mcp = program.command('mcp').description('Manage MCP servers');

  mcp.command('list')
    .description('List configured MCP servers')
    .option('--sources', 'Show config file sources')
    .action(async (options: { sources?: boolean }) => {
      const manager = MCPManager.getInstance();
      const servers = manager['config'].servers;

      if (options.sources) {
        const sources = manager.getConfigSources();
        console.log('\nMCP Config Sources:');
        for (const source of sources) {
          console.log(`  [${source.scope}] ${source.path} (${source.config.servers.length} servers)`);
        }
        if (sources.length === 0) {
          console.log('  No config files found');
        }
        console.log('');
      }

      if (servers.length === 0) {
        console.log('No MCP servers configured');
        return;
      }

      console.log('\nConfigured MCP Servers:');
      for (const server of servers) {
        const status = manager.getServerStatus(server.name);
        const statusSymbol = status.connected ? '[on]' : '[off]';
        const transport = server.transport || 'stdio';
        console.log(`${statusSymbol} ${server.name} (${transport}) - ${server.description || 'No description'}`);
        if (status.connected) {
          console.log(`   Tools: ${status.toolCount}, PID: ${status.process?.pid}`);
        }
      }
    });

  mcp.command('add <name> <command>')
    .description('Add a new MCP server')
    .option('-a, --args <args>', 'Command arguments', '')
    .option('-d, --description <desc>', 'Server description')
    .action((name: string, command: string, options: any) => {
      const manager = MCPManager.getInstance();
      manager.addServer({
        name,
        command,
        args: options.args ? options.args.split(' ') : [],
        description: options.description,
        enabled: true
      });
      console.log(`✅ Added MCP server: ${name}`);
    });

  mcp.command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name: string) => {
      const manager = MCPManager.getInstance();
      await manager.removeServer(name);
      console.log(`✅ Removed MCP server: ${name}`);
    });

  mcp.command('start <name>')
    .description('Start an MCP server')
    .action(async (name: string) => {
      const manager = MCPManager.getInstance();
      const server = manager['config'].servers.find(s => s.name === name);
      if (server) {
        await manager['startServer'](server);
        console.log(`✅ Started MCP server: ${name}`);
      } else {
        console.error(`❌ Server ${name} not found`);
      }
    });

  mcp.command('stop <name>')
    .description('Stop an MCP server')
    .action(async (name: string) => {
      const manager = MCPManager.getInstance();
      await manager.stopServer(name);
      console.log(`✅ Stopped MCP server: ${name}`);
    });

  mcp.command('tools')
    .description('List available MCP tools')
    .action(() => {
      const manager = MCPManager.getInstance();
      const tools = manager.getAvailableTools();
      
      if (tools.length === 0) {
        console.log('No MCP tools available');
        return;
      }

      console.log('\nAvailable MCP Tools:');
      for (const tool of tools) {
        console.log(`- ${tool.name}: ${tool.description}`);
      }
    });

  mcp.command('test <name> <command>')
    .description('Test an MCP server connection')
    .option('-a, --args <args>', 'Command arguments', '')
    .action(async (name: string, command: string, options: any) => {
      const manager = MCPManager.getInstance();
      const result = await manager.testServer({
        name,
        command,
        args: options.args ? options.args.split(' ') : []
      });

      if (result.success) {
        console.log(`Successfully connected to ${name}`);
      } else {
        console.log(`Failed to connect: ${result.error}`);
      }
    });

  mcp.command('serve')
    .description('Expose Canvas CLI tools as an MCP server')
    .option('-t, --transport <type>', 'Transport type: stdio', 'stdio')
    .option('-n, --name <name>', 'Server name', 'canvas-cli')
    .option('-v, --version <version>', 'Server version')
    .action(async (options: { transport: string; name: string; version?: string }) => {
      const manager = MCPManager.getInstance();
      console.log(`Starting Canvas MCP server (${options.transport})...`);
      console.log('Press Ctrl+C to stop.\n');
      await manager.startMCPServer({
        transport: options.transport as 'stdio' | 'http',
        name: options.name,
        version: options.version,
      });
    });
}

// Export singleton instance
export const mcpManager = MCPManager.getInstance();