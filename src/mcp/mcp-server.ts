/**
 * MCP Server Mode
 * Exposes Canvas CLI's tools as an MCP server so other tools/agents
 * can use Canvas capabilities via the Model Context Protocol.
 *
 * Usage: canvas mcp serve [--port <port>]
 */

import { EventEmitter } from 'events';
import { toolRegistry, type Tool } from '../tools/tool-executor.js';
import { errorHandler } from '../utils/error-handler.js';

export interface MCPServerOptions {
  transport?: 'stdio' | 'http';
  port?: number;
  name?: string;
  version?: string;
}

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

/**
 * Canvas MCP Server — exposes registered tools via JSON-RPC over stdio.
 * Implements the MCP server protocol so external MCP clients can
 * discover and call Canvas CLI tools.
 */
export class CanvasMCPServer extends EventEmitter {
  private running = false;
  private serverName: string;
  private serverVersion: string;
  private inputBuffer = '';

  constructor(private options: MCPServerOptions = {}) {
    super();
    this.serverName = options.name || 'canvas-cli';
    this.serverVersion = options.version || '3.1.0';
  }

  /**
   * Start serving over stdio
   */
  async startStdio(): Promise<void> {
    if (this.running) return;
    this.running = true;

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      this.inputBuffer += chunk;
      this.processBuffer();
    });

    process.stdin.on('end', () => {
      this.running = false;
      this.emit('disconnected');
    });

    this.emit('started', { transport: 'stdio' });
  }

  /**
   * Process buffered input — each message is a JSON line
   */
  private processBuffer(): void {
    const lines = this.inputBuffer.split('\n');
    this.inputBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const request: JSONRPCRequest = JSON.parse(trimmed);
        void this.handleRequest(request);
      } catch {
        this.sendError(0, -32700, 'Parse error');
      }
    }
  }

  /**
   * Handle a single JSON-RPC request
   */
  private async handleRequest(request: JSONRPCRequest): Promise<void> {
    try {
      switch (request.method) {
        case 'initialize':
          this.sendResult(request.id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
            serverInfo: {
              name: this.serverName,
              version: this.serverVersion,
            },
          });
          break;

        case 'initialized':
          // Notification — no response needed
          break;

        case 'tools/list':
          this.sendResult(request.id, {
            tools: this.getToolDefinitions(),
          });
          break;

        case 'tools/call':
          await this.handleToolCall(request);
          break;

        case 'resources/list':
          this.sendResult(request.id, { resources: [] });
          break;

        case 'resources/read':
          this.sendError(request.id, -32601, 'Resource not found');
          break;

        case 'ping':
          this.sendResult(request.id, {});
          break;

        default:
          this.sendError(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error: any) {
      this.sendError(request.id, -32603, error.message);
    }
  }

  /**
   * Get tool definitions from the Canvas tool registry
   */
  private getToolDefinitions(): any[] {
    const tools = toolRegistry.getAll();
    return tools.map((tool: Tool) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.parameters || {
        type: 'object',
        properties: {},
      },
    }));
  }

  /**
   * Handle a tools/call request
   */
  private async handleToolCall(request: JSONRPCRequest): Promise<void> {
    const { name, arguments: args } = request.params || {};

    if (!name) {
      this.sendError(request.id, -32602, 'Missing tool name');
      return;
    }

    const tool = toolRegistry.get(name);
    if (!tool) {
      this.sendError(request.id, -32602, `Tool not found: ${name}`);
      return;
    }

    try {
      const result = await tool.execute(args || {});
      this.sendResult(request.id, {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (error: any) {
      errorHandler.handleError(`mcp-server-tool-${name}`, error);
      this.sendResult(request.id, {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      });
    }
  }

  /**
   * Send a JSON-RPC result
   */
  private sendResult(id: number | string, result: any): void {
    const response: JSONRPCResponse = { jsonrpc: '2.0', id, result };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  /**
   * Send a JSON-RPC error
   */
  private sendError(id: number | string, code: number, message: string): void {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message },
    };
    process.stdout.write(JSON.stringify(response) + '\n');
  }

  /**
   * Stop the server
   */
  stop(): void {
    this.running = false;
    this.emit('stopped');
  }
}

/**
 * Start Canvas CLI as an MCP server (called by `canvas mcp serve`)
 */
export async function startMCPServer(options: MCPServerOptions = {}): Promise<CanvasMCPServer> {
  const server = new CanvasMCPServer(options);
  await server.startStdio();
  return server;
}
