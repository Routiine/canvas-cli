/**
 * Ollama provider implementation
 */

import axios, { AxiosError } from 'axios';
import { 
  BaseProvider, 
  Message, 
  Tool, 
  ProviderResponse, 
  ProviderMetadata, 
  ProviderConfig,
  StreamChunk,
  createProviderError,
  isProviderError
} from './base-provider.js';
import { ModelCapabilities } from '../models/model-manager.js';

interface OllamaGenerateRequest {
  model: string;
  prompt?: string;
  messages?: Array<{role: string, content: string}>;
  stream: boolean;
  tools?: any[];
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_tokens?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  tool_calls?: any[];
  eval_count?: number;
  prompt_eval_count?: number;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
  expires_at?: string;
}

export class OllamaProvider extends BaseProvider {
  private baseUrl: string;
  private timeout: number;
  private connectedModels: string[] = [];
  private lastError: string | null = null;
  private connectionStartTime: Date | null = null;

  constructor() {
    super();
    this.baseUrl = 'http://localhost:11434';
    this.timeout = 30000;
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'ollama',
      displayName: 'Ollama',
      description: 'Local Ollama server for running open-source language models',
      defaultModel: 'llama3.2',
      knownModels: [
        { name: 'llama3.2', contextLimit: 128000 },
        { name: 'llama3.3', contextLimit: 128000 },
        { name: 'llama2', contextLimit: 8192 },
        { name: 'mistral', contextLimit: 32768 },
        { name: 'qwen', contextLimit: 32768 },
        { name: 'codellama', contextLimit: 16384 },
        { name: 'gemma', contextLimit: 8192 },
        { name: 'phi', contextLimit: 4096 },
        { name: 'neural-chat', contextLimit: 4096 },
        { name: 'starling-lm', contextLimit: 8192 }
      ],
      modelDocLink: 'https://ollama.ai/library',
      configKeys: [
        {
          name: 'baseUrl',
          required: false,
          secret: false,
          default: 'http://localhost:11434'
        },
        {
          name: 'timeout',
          required: false,
          secret: false,
          default: '30000'
        }
      ]
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    await super.initialize(config);
    
    this.baseUrl = this.getConfigValue('baseUrl', 'http://localhost:11434');
    this.timeout = parseInt(this.getConfigValue('timeout', '30000'), 10);
    
    // Test connection
    const connected = await this.testConnection();
    if (connected) {
      this.connectionStartTime = new Date();
      // Fetch available models
      try {
        this.connectedModels = await this.fetchSupportedModels();
      } catch (error) {
        console.warn('Failed to fetch Ollama models:', error);
      }
    }
  }

  async complete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
      model?: string;
    } = {}
  ): Promise<ProviderResponse> {
    if (!this.isConfigured()) {
      throw createProviderError('Ollama provider not configured');
    }

    const model = options.model || this.getMetadata().defaultModel;
    
    try {
      // Build messages array
      const ollamaMessages: Array<{role: string, content: string}> = [];
      
      if (system) {
        ollamaMessages.push({ role: 'system', content: system });
      }
      
      messages.forEach(msg => {
        ollamaMessages.push({
          role: msg.role,
          content: msg.content
        });
      });

      const request: OllamaGenerateRequest = {
        model,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: options.temperature,
          max_tokens: options.maxTokens
        }
      };

      if (tools && tools.length > 0) {
        request.tools = tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        }));
      }

      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        request,
        { timeout: this.timeout }
      );

      const data: OllamaGenerateResponse = response.data;
      
      return {
        message: {
          role: 'assistant',
          content: data.response || '',
          timestamp: new Date()
        },
        usage: {
          model: data.model,
          usage: {
            inputTokens: data.prompt_eval_count || 0,
            outputTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
          }
        },
        finishReason: data.done ? 'stop' : 'length'
      };

    } catch (error) {
      this.lastError = this.formatError(error);
      throw this.handleError(error);
    }
  }

  async* streamComplete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    } = {}
  ): AsyncGenerator<StreamChunk, void, unknown> {
    if (!this.isConfigured()) {
      throw createProviderError('Ollama provider not configured');
    }

    const model = options.model || this.getMetadata().defaultModel;
    
    try {
      // Build messages array
      const ollamaMessages: Array<{role: string, content: string}> = [];
      
      if (system) {
        ollamaMessages.push({ role: 'system', content: system });
      }
      
      messages.forEach(msg => {
        ollamaMessages.push({
          role: msg.role,
          content: msg.content
        });
      });

      const request: OllamaGenerateRequest = {
        model,
        messages: ollamaMessages,
        stream: true,
        options: {
          temperature: options.temperature,
          max_tokens: options.maxTokens
        }
      };

      if (tools && tools.length > 0) {
        request.tools = tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        }));
      }

      const response = await axios.post(
        `${this.baseUrl}/api/generate`,
        request,
        { 
          timeout: this.timeout,
          responseType: 'stream'
        }
      );

      const stream = response.data;
      let buffer = '';
      
      const processChunk = (chunk: Buffer): void => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        
        // Keep the last potentially incomplete line in buffer
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const data: OllamaGenerateResponse = JSON.parse(line);
              
              const streamChunk: StreamChunk = {
                content: data.response || '',
                done: data.done || false,
                usage: data.done ? {
                  inputTokens: data.prompt_eval_count || 0,
                  outputTokens: data.eval_count || 0,
                  totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                } : undefined
              };
              
              // Use setImmediate to yield control
              setImmediate(() => {});
            } catch (error) {
              // Skip invalid JSON lines
            }
          }
        }
      };

      // Return a promise-based async generator
      yield* this.createStreamGenerator(stream, processChunk);
      
    } catch (error) {
      this.lastError = this.formatError(error);
      throw this.handleError(error);
    }
  }

  getModelCapabilities(modelName: string): ModelCapabilities | null {
    const metadata = this.getMetadata();
    const knownModel = metadata.knownModels.find(m => m.name === modelName);
    
    if (knownModel) {
      return {
        name: modelName,
        contextLimit: knownModel.contextLimit,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
        provider: 'ollama',
        tokenizerName: this.inferTokenizerName(modelName)
      };
    }
    
    // Return inferred capabilities for unknown models
    return {
      name: modelName,
      contextLimit: 8192, // Conservative default
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
      provider: 'ollama',
      tokenizerName: this.inferTokenizerName(modelName)
    };
  }

  async fetchSupportedModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: this.timeout
      });
      
      const models: OllamaModel[] = response.data.models || [];
      return models.map(model => model.name);
    } catch (error) {
      this.lastError = this.formatError(error);
      throw this.handleError(error);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, {
        timeout: 5000
      });
      this.lastError = null;
      return response.status === 200;
    } catch (error) {
      this.lastError = this.formatError(error);
      return false;
    }
  }

  getProviderInfo(): {
    version?: string;
    status: 'connected' | 'disconnected' | 'error';
    lastError?: string;
    uptime?: number;
  } {
    const status = this.lastError 
      ? 'error' 
      : this.connectedModels.length > 0 
        ? 'connected' 
        : 'disconnected';
    
    const uptime = this.connectionStartTime 
      ? Date.now() - this.connectionStartTime.getTime()
      : undefined;

    return {
      status,
      lastError: this.lastError || undefined,
      uptime
    };
  }

  // Private methods

  private async *createStreamGenerator(
    stream: any,
    processChunk: (chunk: Buffer) => void
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const chunks: StreamChunk[] = [];
    let finished = false;
    let error: Error | null = null;

    // Set up stream handlers
    stream.on('data', (chunk: Buffer) => {
      try {
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data: OllamaGenerateResponse = JSON.parse(line);
            
            const streamChunk: StreamChunk = {
              content: data.response || '',
              done: data.done || false,
              usage: data.done ? {
                inputTokens: data.prompt_eval_count || 0,
                outputTokens: data.eval_count || 0,
                totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
              } : undefined
            };
            
            chunks.push(streamChunk);
          } catch (parseError) {
            // Skip invalid JSON lines
          }
        }
      } catch (err: any) {
        error = err;
      }
    });

    stream.on('end', () => {
      finished = true;
    });

    stream.on('error', (err: Error) => {
      error = err;
      finished = true;
    });

    // Yield chunks as they arrive
    while (!finished) {
      if (error) {
        throw error;
      }
      
      while (chunks.length > 0) {
        const chunk = chunks.shift()!;
        yield chunk;
        
        if (chunk.done) {
          return;
        }
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Yield any remaining chunks
    while (chunks.length > 0) {
      yield chunks.shift()!;
    }
  }

  private inferTokenizerName(modelName: string): string {
    const lowerName = modelName.toLowerCase();
    
    if (lowerName.includes('llama')) {
      return 'Xenova/llama-tokenizer';
    } else if (lowerName.includes('claude')) {
      return 'Xenova/claude-tokenizer';
    } else {
      return 'Xenova/gpt-4o'; // Default
    }
  }

  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.code === 'ECONNREFUSED') {
        return createProviderError(
          `Cannot connect to Ollama at ${this.baseUrl}. Make sure Ollama is running.`,
          'network',
          true
        );
      }
      
      if (axiosError.response?.status === 404) {
        return createProviderError(
          'Model not found. Please check if the model is available in Ollama.',
          'unknown',
          false
        );
      }
      
      if (axiosError.response?.status === 413) {
        return createProviderError(
          'Request too large. Context length may be exceeded.',
          'context_length_exceeded',
          false
        );
      }
      
      if (axiosError.response?.status === 429) {
        return createProviderError(
          'Rate limit exceeded',
          'rate_limit',
          true,
          60000 // Retry after 1 minute
        );
      }
      
      return createProviderError(
        `Ollama API error: ${axiosError.message}`,
        'network',
        true
      );
    }
    
    if (error instanceof Error) {
      return createProviderError(error.message, 'unknown', false);
    }
    
    return createProviderError('Unknown error occurred', 'unknown', false);
  }

  private formatError(error: any): string {
    if (axios.isAxiosError(error)) {
      return `${error.message} (${error.code || 'UNKNOWN'})`;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    return String(error);
  }
}