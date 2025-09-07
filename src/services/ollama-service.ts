/**
 * Ollama Service for Canvas CLI
 * Handles communication with the Ollama API
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

export interface OllamaConfig {
  baseUrl: string;
  timeout?: number;
  defaultModel?: string;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: {
    num_keep?: number;
    seed?: number;
    num_predict?: number;
    top_k?: number;
    top_p?: number;
    tfs_z?: number;
    typical_p?: number;
    repeat_last_n?: number;
    temperature?: number;
    repeat_penalty?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    mirostat?: number;
    mirostat_tau?: number;
    mirostat_eta?: number;
    penalize_newline?: boolean;
    stop?: string[];
    numa?: boolean;
    num_ctx?: number;
    num_batch?: number;
    num_gqa?: number;
    num_gpu?: number;
    main_gpu?: number;
    low_vram?: boolean;
    f16_kv?: boolean;
    vocab_only?: boolean;
    use_mmap?: boolean;
    use_mlock?: boolean;
    rope_frequency_base?: number;
    rope_frequency_scale?: number;
    num_thread?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
  }>;
  format?: 'json';
  stream?: boolean;
  options?: OllamaGenerateRequest['options'];
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaService extends EventEmitter {
  private api: AxiosInstance;
  private config: OllamaConfig;
  private isConnected: boolean = false;

  constructor(config: OllamaConfig) {
    super();
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:11434',
      timeout: config.timeout || 120000,
      defaultModel: config.defaultModel || 'llama3.2:latest'
    };

    this.api = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Test connection to Ollama
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.api.get('/api/tags');
      this.isConnected = response.status === 200;
      this.emit('connected');
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      this.emit('connection-error', error);
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.api.get('/api/tags');
      return response.data.models || [];
    } catch (error: any) {
      throw new Error(`Failed to list models: ${error.message}`);
    }
  }

  /**
   * Generate text completion
   */
  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse> {
    try {
      const response = await this.api.post('/api/generate', {
        ...request,
        stream: false
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Generation failed: ${error.message}`);
    }
  }

  /**
   * Generate streaming text completion
   */
  async *generateStream(request: OllamaGenerateRequest): AsyncGenerator<OllamaGenerateResponse> {
    try {
      const response = await this.api.post('/api/generate', {
        ...request,
        stream: true
      }, {
        responseType: 'stream'
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              yield JSON.parse(line);
            } catch (e) {
              console.error('Failed to parse stream chunk:', e);
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer);
        } catch (e) {
          console.error('Failed to parse final buffer:', e);
        }
      }
    } catch (error: any) {
      throw new Error(`Stream generation failed: ${error.message}`);
    }
  }

  /**
   * Chat completion
   */
  async chat(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    try {
      const response = await this.api.post('/api/chat', {
        ...request,
        stream: false
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Chat failed: ${error.message}`);
    }
  }

  /**
   * Chat completion with streaming
   */
  async *chatStream(request: OllamaChatRequest): AsyncGenerator<OllamaChatResponse> {
    try {
      const response = await this.api.post('/api/chat', {
        ...request,
        stream: true
      }, {
        responseType: 'stream'
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              yield JSON.parse(line);
            } catch (e) {
              console.error('Failed to parse stream chunk:', e);
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer);
        } catch (e) {
          console.error('Failed to parse final buffer:', e);
        }
      }
    } catch (error: any) {
      throw new Error(`Stream chat failed: ${error.message}`);
    }
  }

  /**
   * Pull a model
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      const response = await this.api.post('/api/pull', {
        name: modelName
      }, {
        responseType: 'stream'
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              this.emit('pull-progress', data);
            } catch (e) {
              console.error('Failed to parse pull progress:', e);
            }
          }
        }
      }
    } catch (error: any) {
      throw new Error(`Failed to pull model: ${error.message}`);
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    try {
      await this.api.delete('/api/delete', {
        data: { name: modelName }
      });
    } catch (error: any) {
      throw new Error(`Failed to delete model: ${error.message}`);
    }
  }

  /**
   * Show model information
   */
  async showModel(modelName: string): Promise<any> {
    try {
      const response = await this.api.post('/api/show', {
        name: modelName
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to show model info: ${error.message}`);
    }
  }

  /**
   * Create embeddings
   */
  async embeddings(model: string, prompt: string): Promise<number[]> {
    try {
      const response = await this.api.post('/api/embeddings', {
        model,
        prompt
      });
      return response.data.embedding;
    } catch (error: any) {
      throw new Error(`Failed to create embeddings: ${error.message}`);
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...config };
    this.api = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

// Export singleton instance
export const ollamaService = new OllamaService({
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  timeout: parseInt(process.env.OLLAMA_TIMEOUT || '120000'),
  defaultModel: process.env.OLLAMA_MODEL || 'llama3.2:latest'
});