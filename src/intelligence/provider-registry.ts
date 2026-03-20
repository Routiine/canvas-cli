/**
 * Priority 1: Provider Registry
 * Manages Claude/OpenAI API providers
 */

import type Anthropic from '@anthropic-ai/sdk';
import type OpenAILib from 'openai';
import { getLangfuseTracer } from './langfuse-tracer.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  /** Enable prompt caching for providers that support it (Anthropic, DeepSeek) */
  enableCache?: boolean;
  /** System blocks with cache_control breakpoints (replaces plain system string) */
  systemBlocks?: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
}

export interface Provider {
  name: string;
  complete(messages: Message[], options?: CompletionOptions): Promise<string>;
  completeStream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string>;
  isAvailable(): boolean;
  getDefaultModel(): string;
  estimateCost(inputTokens: number, outputTokens: number, model?: string): number;
}

// Pricing per 1M tokens (USD) as of 2025
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.25, output: 1.25 },
};

const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
};

export class ClaudeProvider implements Provider {
  name = 'claude';
  private apiKey: string;
  private client: Anthropic | null = null;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  isAvailable(): boolean {
    return !!this.apiKey;
  }
  
  getDefaultModel(): string {
    return 'claude-sonnet-4-6';
  }
  
  private async getClient(): Promise<Anthropic> {
    if (this.client) return this.client;
    try {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.apiKey });
      return this.client;
    } catch {
      throw new Error('Install @anthropic-ai/sdk to use Claude provider');
    }
  }
  
  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    const client = await this.getClient();
    const model = options.model || this.getDefaultModel();

    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Use cache_control system blocks if provided (for prompt caching)
    const systemParam: Parameters<typeof client.messages.create>[0]['system'] =
      (options.systemBlocks as Parameters<typeof client.messages.create>[0]['system']) || systemMsg?.content;

    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
      system: systemParam,
      messages: chatMessages,
    });

    return response.content[0].type === 'text' ? response.content[0].text : '';
  }

  async *completeStream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    const client = await this.getClient();
    const model = options.model || this.getDefaultModel();

    const systemMsg = messages.find(m => m.role === 'system');
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = await client.messages.stream({
      model,
      max_tokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
      system: systemMsg?.content,
      messages: chatMessages,
    });
    
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text;
      }
    }
  }
  
  estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
    const m = model || this.getDefaultModel();
    const pricing = CLAUDE_PRICING[m] || CLAUDE_PRICING['claude-sonnet-4-6'];
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }
}

export class OpenAIProvider implements Provider {
  name = 'openai';
  private apiKey: string;
  private client: OpenAILib | null = null;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  isAvailable(): boolean {
    return !!this.apiKey;
  }
  
  getDefaultModel(): string {
    return 'gpt-4o-mini';
  }
  
  private async getClient(): Promise<OpenAILib> {
    if (this.client) return this.client;
    try {
      const { OpenAI } = await import('openai');
      this.client = new OpenAI({ apiKey: this.apiKey });
      return this.client;
    } catch {
      throw new Error('Install openai to use OpenAI provider');
    }
  }
  
  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    const client = await this.getClient();
    const model = options.model || this.getDefaultModel();
    
    const response = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
      messages,
    });
    
    return response.choices[0]?.message?.content || '';
  }
  
  async *completeStream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    const client = await this.getClient();
    const model = options.model || this.getDefaultModel();
    
    const stream = await client.chat.completions.create({
      model,
      max_tokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
      messages,
      stream: true,
    });
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
  
  estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
    const m = model || this.getDefaultModel();
    const pricing = OPENAI_PRICING[m] || OPENAI_PRICING['gpt-4o-mini'];
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }
}

export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();
  
  register(name: string, provider: Provider): void {
    this.providers.set(name, provider);
  }
  
  get(name: string): Provider | undefined {
    return this.providers.get(name);
  }
  
  getAvailable(): Provider[] {
    return Array.from(this.providers.values()).filter(p => p.isAvailable());
  }
  
  getBestAvailable(prefer?: string): Provider | undefined {
    let provider: Provider | undefined;

    if (prefer && this.providers.has(prefer)) {
      const p = this.providers.get(prefer)!;
      if (p.isAvailable()) provider = p;
    }

    provider ??= this.getAvailable()[0];

    // Wrap with Langfuse tracing when env vars are present.
    if (provider && (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)) {
      return new TracedProvider(provider);
    }

    return provider;
  }
}

/**
 * OpenAI-Compatible provider wrapper for the intelligence registry.
 * Wraps any OpenAI-compatible endpoint (Groq, Together, DeepSeek, etc.)
 */
export class OpenAICompatibleIntelligenceProvider implements Provider {
  name: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private client: OpenAILib | null = null;

  constructor(name: string, opts: { apiKey: string; baseUrl: string; defaultModel: string }) {
    this.name = name;
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl;
    this.defaultModel = opts.defaultModel;
  }

  isAvailable(): boolean { return !!this.apiKey && !!this.baseUrl; }
  getDefaultModel(): string { return this.defaultModel; }

  private async getClient(): Promise<OpenAILib> {
    if (this.client) return this.client;
    const { OpenAI } = await import('openai');
    this.client = new OpenAI({ apiKey: this.apiKey, baseURL: this.baseUrl });
    return this.client;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    const client = await this.getClient();
    const response = await client.chat.completions.create({
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
      messages,
    });
    return response.choices[0]?.message?.content || '';
  }

  async *completeStream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    const client = await this.getClient();
    const stream = await client.chat.completions.create({
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens || 8192,
      temperature: options.temperature ?? 0.7,
      messages,
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  estimateCost(inputTokens: number, outputTokens: number): number {
    return (inputTokens * 0.5 + outputTokens * 1.5) / 1_000_000;
  }
}

/**
 * TracedProvider wraps any Provider and records every complete() call as a
 * Langfuse generation. completeStream() is delegated without tracing because
 * token counts are not available mid-stream.
 *
 * When Langfuse is not configured the wrapper is transparent — all calls pass
 * straight through to the underlying provider.
 */
export class TracedProvider implements Provider {
  name: string;

  constructor(private readonly inner: Provider) {
    this.name = inner.name;
  }

  isAvailable(): boolean {
    return this.inner.isAvailable();
  }

  getDefaultModel(): string {
    return this.inner.getDefaultModel();
  }

  estimateCost(inputTokens: number, outputTokens: number, model?: string): number {
    return this.inner.estimateCost(inputTokens, outputTokens, model);
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    const model = options.model ?? this.inner.getDefaultModel();
    const tracer = getLangfuseTracer();

    return tracer.traceCompletion(
      {
        name: `${this.name}/complete`,
        model,
        provider: this.name,
        input: messages.map(m => ({ role: m.role, content: m.content })),
      },
      async () => {
        const text = await this.inner.complete(messages, options);
        return { text };
      }
    );
  }

  async *completeStream(messages: Message[], options: CompletionOptions = {}): AsyncGenerator<string> {
    yield* this.inner.completeStream(messages, options);
  }
}

let registry: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry();

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      registry.register('claude', new ClaudeProvider(anthropicKey));
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      registry.register('openai', new OpenAIProvider(openaiKey));
    }

    // Auto-register additional providers from env vars
    if (process.env.DEEPSEEK_API_KEY) {
      registry.register('deepseek', new OpenAICompatibleIntelligenceProvider('deepseek', {
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
      }));
    }

    if (process.env.OPENROUTER_API_KEY) {
      registry.register('openrouter', new OpenAICompatibleIntelligenceProvider('openrouter', {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseUrl: 'https://openrouter.ai/api/v1',
        defaultModel: 'anthropic/claude-sonnet-4',
      }));
    }

    if (process.env.GROQ_API_KEY) {
      registry.register('groq', new OpenAICompatibleIntelligenceProvider('groq', {
        apiKey: process.env.GROQ_API_KEY,
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
      }));
    }

    if (process.env.TOGETHER_API_KEY) {
      registry.register('together', new OpenAICompatibleIntelligenceProvider('together', {
        apiKey: process.env.TOGETHER_API_KEY,
        baseUrl: 'https://api.together.xyz/v1',
        defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      }));
    }
  }
  return registry;
}
