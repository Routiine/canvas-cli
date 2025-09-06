import { loadConfig } from '../config.js';
import { EventEmitter } from 'events';
import { TokenCounter, formatTokenCount } from './token-counter.js';

export interface StreamingChunk {
  type: 'content' | 'tool_calls' | 'tool_result' | 'done' | 'token_count' | 'error';
  content?: string;
  toolCalls?: any[];
  toolCall?: any;
  toolResult?: { success: boolean; output?: string; error?: string };
  tokenCount?: number;
  error?: string;
  metadata?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timestamp?: Date;
  };
}

export interface StreamingOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (chunk: StreamingChunk) => void;
  onError?: (error: Error) => void;
  onComplete?: (fullContent: string) => void;
  onTokenCount?: (count: number) => void;
  abortSignal?: AbortSignal;
}

export class StreamingHandler extends EventEmitter {
  private tokenCounter: TokenCounter;
  private accumulatedContent: string = '';
  private currentTokenCount: number = 0;
  private startTime: number = 0;
  private chunks: StreamingChunk[] = [];
  private aborted: boolean = false;

  constructor(model: string = 'gpt-4') {
    super();
    this.tokenCounter = new TokenCounter(model);
  }

  /**
   * Process a streaming response with async generator
   */
  async *processStream(
    stream: AsyncIterable<any>,
    options: StreamingOptions = {}
  ): AsyncGenerator<StreamingChunk, void, unknown> {
    this.startTime = Date.now();
    this.accumulatedContent = '';
    this.currentTokenCount = 0;
    this.chunks = [];
    this.aborted = false;

    // Handle abort signal
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        this.aborted = true;
      });
    }

    try {
      for await (const chunk of stream) {
        if (this.aborted) {
          yield { type: 'error', error: 'Stream aborted by user' };
          break;
        }

        const processedChunk = this.processChunk(chunk);
        
        if (processedChunk) {
          // Update accumulated content
          if (processedChunk.content) {
            this.accumulatedContent += processedChunk.content;
            this.currentTokenCount = this.tokenCounter.estimateStreamingTokens(this.accumulatedContent);
            
            // Emit token count update
            if (this.currentTokenCount % 10 === 0) { // Update every 10 tokens
              const tokenChunk: StreamingChunk = {
                type: 'token_count',
                tokenCount: this.currentTokenCount
              };
              yield tokenChunk;
              options.onTokenCount?.(this.currentTokenCount);
            }
          }

          this.chunks.push(processedChunk);
          yield processedChunk;
          
          // Call option callbacks
          options.onChunk?.(processedChunk);
          
          // Emit events
          this.emit('chunk', processedChunk);
        }
      }

      // Final token count
      const finalTokenCount: StreamingChunk = {
        type: 'token_count',
        tokenCount: this.currentTokenCount
      };
      yield finalTokenCount;

      // Done chunk
      const doneChunk: StreamingChunk = {
        type: 'done',
        content: this.accumulatedContent,
        metadata: {
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timestamp: new Date()
        }
      };
      
      yield doneChunk;
      options.onComplete?.(this.accumulatedContent);
      this.emit('complete', this.accumulatedContent);

    } catch (error: any) {
      const errorChunk: StreamingChunk = {
        type: 'error',
        error: error.message || 'Unknown streaming error'
      };
      
      yield errorChunk;
      options.onError?.(error);
      this.emit('error', error);
    } finally {
      // Clean up
      this.dispose();
    }
  }

  /**
   * Process individual chunk from stream
   */
  private processChunk(chunk: any): StreamingChunk | null {
    try {
      // Handle different chunk formats
      if (chunk.choices && chunk.choices[0]) {
        const delta = chunk.choices[0].delta;
        
        if (delta.content) {
          return {
            type: 'content',
            content: delta.content
          };
        }
        
        if (delta.tool_calls) {
          return {
            type: 'tool_calls',
            toolCalls: delta.tool_calls
          };
        }
      }

      // Handle Ollama format
      if (chunk.message) {
        if (chunk.message.content) {
          return {
            type: 'content',
            content: chunk.message.content
          };
        }
      }

      // Handle raw content
      if (typeof chunk === 'string') {
        return {
          type: 'content',
          content: chunk
        };
      }

      return null;
    } catch (error) {
      console.error('Error processing chunk:', error);
      return null;
    }
  }

  /**
   * Get streaming metrics
   */
  getMetrics(): {
    totalChunks: number;
    totalTokens: number;
    formattedTokens: string;
    duration: number;
    tokensPerSecond: number;
    averageChunkSize: number;
  } {
    const duration = (Date.now() - this.startTime) / 1000;
    
    return {
      totalChunks: this.chunks.length,
      totalTokens: this.currentTokenCount,
      formattedTokens: formatTokenCount(this.currentTokenCount),
      duration,
      tokensPerSecond: duration > 0 ? this.currentTokenCount / duration : 0,
      averageChunkSize: this.chunks.length > 0 ? 
        this.accumulatedContent.length / this.chunks.length : 0
    };
  }

  /**
   * Abort the stream
   */
  abort(): void {
    this.aborted = true;
    this.emit('abort');
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.tokenCounter.dispose();
    this.removeAllListeners();
  }
}

/**
 * Stream buffer for managing backpressure
 */
export class StreamBuffer {
  private buffer: StreamingChunk[] = [];
  private maxSize: number;
  private highWaterMark: number;
  private lowWaterMark: number;
  private paused: boolean = false;

  constructor(maxSize: number = 1000, highWaterMark: number = 800, lowWaterMark: number = 200) {
    this.maxSize = maxSize;
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;
  }

  push(chunk: StreamingChunk): boolean {
    if (this.buffer.length >= this.maxSize) {
      return false;
    }

    this.buffer.push(chunk);

    if (this.buffer.length >= this.highWaterMark) {
      this.paused = true;
    }

    return true;
  }

  shift(): StreamingChunk | undefined {
    const chunk = this.buffer.shift();

    if (this.paused && this.buffer.length <= this.lowWaterMark) {
      this.paused = false;
    }

    return chunk;
  }

  isPaused(): boolean {
    return this.paused;
  }

  size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
    this.paused = false;
  }
}

/**
 * Streaming rate limiter for controlling throughput
 */
export class StreamRateLimiter {
  private tokensPerSecond: number;
  private lastEmitTime: number = 0;
  private tokensSinceLastEmit: number = 0;

  constructor(tokensPerSecond: number = 100) {
    this.tokensPerSecond = tokensPerSecond;
  }

  async shouldEmit(tokenCount: number): Promise<boolean> {
    const now = Date.now();
    const timeSinceLastEmit = now - this.lastEmitTime;
    const targetDelay = (tokenCount / this.tokensPerSecond) * 1000;

    if (timeSinceLastEmit < targetDelay) {
      await this.delay(targetDelay - timeSinceLastEmit);
    }

    this.lastEmitTime = Date.now();
    this.tokensSinceLastEmit = tokenCount;

    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateRate(tokensPerSecond: number): void {
    this.tokensPerSecond = tokensPerSecond;
  }

  reset(): void {
    this.lastEmitTime = 0;
    this.tokensSinceLastEmit = 0;
  }
}

/**
 * Create a streaming handler instance
 */
export function createStreamingHandler(model?: string): StreamingHandler {
  return new StreamingHandler(model);
}

/**
 * Utility to convert stream to string
 */
export async function streamToString(
  stream: AsyncIterable<any>,
  model?: string
): Promise<string> {
  const handler = createStreamingHandler(model);
  let fullContent = '';

  const processedStream = handler.processStream(stream);
  
  for await (const chunk of processedStream) {
    if (chunk.type === 'content' && chunk.content) {
      fullContent += chunk.content;
    }
  }

  return fullContent;
}

/**
 * Stream multiplexer for handling multiple streams
 */
export class StreamMultiplexer extends EventEmitter {
  private streams: Map<string, StreamingHandler> = new Map();

  addStream(id: string, handler: StreamingHandler): void {
    this.streams.set(id, handler);
    
    handler.on('chunk', (chunk) => {
      this.emit('chunk', { id, chunk });
    });
    
    handler.on('complete', (content) => {
      this.emit('complete', { id, content });
      this.streams.delete(id);
    });
    
    handler.on('error', (error) => {
      this.emit('error', { id, error });
      this.streams.delete(id);
    });
  }

  removeStream(id: string): void {
    const handler = this.streams.get(id);
    if (handler) {
      handler.abort();
      handler.dispose();
      this.streams.delete(id);
    }
  }

  abortAll(): void {
    for (const handler of this.streams.values()) {
      handler.abort();
      handler.dispose();
    }
    this.streams.clear();
  }

  getActiveStreams(): string[] {
    return Array.from(this.streams.keys());
  }

  dispose(): void {
    this.abortAll();
    this.removeAllListeners();
  }
}