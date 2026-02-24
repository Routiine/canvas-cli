/**
 * VS Code Extension Bridge
 * WebSocket server that allows a VS Code extension to connect
 * and send editor actions (explain, refactor, test, fix) to Canvas CLI.
 */

import { EventEmitter } from 'events';
import * as http from 'http';

export interface EditorAction {
  type: 'explain' | 'refactor' | 'test' | 'fix' | 'complete' | 'chat';
  filePath: string;
  selection?: { start: number; end: number };
  code?: string;
  instruction?: string;
  language?: string;
}

export interface EditorResponse {
  type: 'result' | 'error' | 'progress';
  action: string;
  content: string;
  filePath?: string;
}

export class VSCodeBridge extends EventEmitter {
  private server: http.Server | null = null;
  private connections: Set<any> = new Set();
  private port: number;

  constructor(port: number = 9742) {
    super();
    this.port = port;
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    this.server = http.createServer();

    // Use raw WebSocket upgrade handling to avoid requiring ws package
    this.server.on('upgrade', (request, socket, head) => {
      // Simple WebSocket handshake
      const key = request.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      const crypto = require('crypto');
      const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC11E5A5')
        .digest('base64');

      socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '',
        '',
      ].join('\r\n'));

      this.connections.add(socket);
      this.emit('connected');

      socket.on('data', (data: Buffer) => {
        try {
          // Decode WebSocket frame (simplified)
          const decoded = this.decodeFrame(data);
          if (decoded) {
            const action: EditorAction = JSON.parse(decoded);
            this.emit('action', action);
          }
        } catch {
          // Skip invalid messages
        }
      });

      socket.on('close', () => {
        this.connections.delete(socket);
        this.emit('disconnected');
      });
    });

    return new Promise((resolve) => {
      this.server!.listen(this.port, () => {
        this.emit('started', this.port);
        resolve();
      });
    });
  }

  /**
   * Send a response to all connected editors
   */
  broadcast(response: EditorResponse): void {
    const payload = JSON.stringify(response);
    for (const socket of this.connections) {
      try {
        const frame = this.encodeFrame(payload);
        socket.write(frame);
      } catch {
        // Remove dead connections
        this.connections.delete(socket);
      }
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Stop the bridge server
   */
  stop(): void {
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.emit('stopped');
  }

  // Simplified WebSocket frame helpers

  private decodeFrame(buffer: Buffer): string | null {
    if (buffer.length < 2) return null;

    const isMasked = (buffer[1] & 0x80) !== 0;
    let payloadLength = buffer[1] & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      return null; // Skip very large messages
    }

    if (isMasked) {
      const mask = buffer.slice(offset, offset + 4);
      offset += 4;
      const payload = buffer.slice(offset, offset + payloadLength);
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }
      return payload.toString('utf8');
    }

    return buffer.slice(offset, offset + payloadLength).toString('utf8');
  }

  private encodeFrame(data: string): Buffer {
    const payload = Buffer.from(data, 'utf8');
    const header = Buffer.alloc(payload.length < 126 ? 2 : 4);

    header[0] = 0x81; // FIN + text opcode
    if (payload.length < 126) {
      header[1] = payload.length;
    } else {
      header[1] = 126;
      header.writeUInt16BE(payload.length, 2);
    }

    return Buffer.concat([header, payload]);
  }
}
