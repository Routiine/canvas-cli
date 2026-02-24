/**
 * OpenAI-Compatible Provider
 * Works with any API that implements the OpenAI chat completions format:
 * Groq, Cerebras, Together, LM Studio, vLLM, etc.
 *
 * Usage: Set OPENAI_COMPATIBLE_BASE_URL + OPENAI_COMPATIBLE_API_KEY env vars,
 * or configure via `canvas config set provider.openai-compatible.baseUrl <url>`
 */

import type {
  Message,
  Tool,
  ProviderResponse,
  ProviderMetadata,
  ProviderConfig,
  StreamChunk,
} from './base-provider.js';
import { BaseProvider, createProviderError } from './base-provider.js';
import type { ModelCapabilities } from '../models/model-manager.js';

export class OpenAICompatibleProvider extends BaseProvider {
  protected baseUrl: string;
  protected apiKey: string;
  protected providerName: string;
  protected providerDisplayName: string;
  protected defaultModelName: string;
  protected lastError: string | null = null;
  protected connectionStartTime: Date | null = null;

  constructor(opts?: {
    name?: string;
    displayName?: string;
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
  }) {
    super();
    this.providerName = opts?.name || 'openai-compatible';
    this.providerDisplayName = opts?.displayName || 'OpenAI-Compatible';
    this.baseUrl = opts?.baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || '';
    this.apiKey = opts?.apiKey || process.env.OPENAI_COMPATIBLE_API_KEY || '';
    this.defaultModelName = opts?.defaultModel || 'default';
  }

  getMetadata(): ProviderMetadata {
    return {
      name: this.providerName,
      displayName: this.providerDisplayName,
      description: `${this.providerDisplayName} via OpenAI-compatible API`,
      defaultModel: this.defaultModelName,
      knownModels: [],
      modelDocLink: '',
      configKeys: [
        { name: 'baseUrl', required: true, secret: false },
        { name: 'apiKey', required: false, secret: true },
        { name: 'defaultModel', required: false, secret: false, default: this.defaultModelName },
      ],
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...config };
    this.baseUrl = config.baseUrl || this.baseUrl;
    this.apiKey = config.apiKey || this.apiKey;
    this.defaultModelName = config.defaultModel || this.defaultModelName;
    this.initialized = true;
  }

  isConfigured(): boolean {
    return this.initialized && !!this.baseUrl;
  }

  async complete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options: { temperature?: number; maxTokens?: number; model?: string } = {}
  ): Promise<ProviderResponse> {
    const axios = (await import('axios')).default;
    const model = options.model || this.defaultModelName;

    const body: any = {
      model,
      messages: this.buildMessages(system, messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 8192,
      stream: false,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    try {
      const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, body, {
        headers: this.getHeaders(),
        timeout: 120000,
      });

      const data = response.data;
      const choice = data.choices?.[0];

      return {
        message: {
          role: 'assistant',
          content: choice?.message?.content || '',
          timestamp: new Date(),
        },
        usage: {
          model: data.model || model,
          usage: {
            inputTokens: data.usage?.prompt_tokens || 0,
            outputTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
          },
        },
        finishReason: choice?.finish_reason === 'stop' ? 'stop' : 'length',
      };
    } catch (error: any) {
      this.lastError = error.message;
      throw createProviderError(
        `${this.providerDisplayName} API error: ${error.message}`,
        'network',
        true
      );
    }
  }

  async *streamComplete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options: { temperature?: number; maxTokens?: number; model?: string } = {}
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const axios = (await import('axios')).default;
    const model = options.model || this.defaultModelName;

    const body: any = {
      model,
      messages: this.buildMessages(system, messages),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens || 8192,
      stream: true,
    };

    try {
      const response = await axios.post(`${this.baseUrl}/v1/chat/completions`, body, {
        headers: this.getHeaders(),
        timeout: 120000,
        responseType: 'stream',
      });

      let buffer = '';
      const stream = response.data;

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            const done = parsed.choices?.[0]?.finish_reason === 'stop';
            yield { content: delta, done };
            if (done) return;
          } catch {
            // skip invalid chunks
          }
        }
      }
    } catch (error: any) {
      this.lastError = error.message;
      throw createProviderError(
        `${this.providerDisplayName} stream error: ${error.message}`,
        'network',
        true
      );
    }
  }

  getModelCapabilities(modelName: string): ModelCapabilities | null {
    return {
      name: modelName,
      contextLimit: 128000,
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
      provider: this.providerName,
    };
  }

  async fetchSupportedModels(): Promise<string[]> {
    try {
      const axios = (await import('axios')).default;
      const response = await axios.get(`${this.baseUrl}/v1/models`, {
        headers: this.getHeaders(),
        timeout: 10000,
      });
      return (response.data?.data || []).map((m: any) => m.id);
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const models = await this.fetchSupportedModels();
      this.connectionStartTime = new Date();
      this.lastError = null;
      return models.length > 0;
    } catch {
      return false;
    }
  }

  getProviderInfo() {
    return {
      status: (this.lastError ? 'error' : this.connectionStartTime ? 'connected' : 'disconnected') as
        | 'connected'
        | 'disconnected'
        | 'error',
      lastError: this.lastError || undefined,
      uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime.getTime() : undefined,
    };
  }

  // Helpers

  protected buildMessages(system: string, messages: Message[]): any[] {
    const out: any[] = [];
    if (system) out.push({ role: 'system', content: system });
    for (const m of messages) {
      out.push({ role: m.role, content: m.content });
    }
    return out;
  }

  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
    return headers;
  }
}
