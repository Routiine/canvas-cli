/**
 * OpenRouter Provider
 * Meta-provider that gives access to 100+ models from various providers.
 * Uses OpenAI-compatible API format.
 *
 * Set OPENROUTER_API_KEY env var.
 */

import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import type { ProviderMetadata, ProviderConfig } from './base-provider.js';
import type { ModelCapabilities } from '../models/model-manager.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'openrouter',
      displayName: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      defaultModel: 'anthropic/claude-sonnet-4',
    });
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'openrouter',
      displayName: 'OpenRouter',
      description: 'Access 100+ models from various providers via a single API',
      defaultModel: 'anthropic/claude-sonnet-4',
      knownModels: [
        { name: 'anthropic/claude-sonnet-4', contextLimit: 200000 },
        { name: 'anthropic/claude-haiku-4', contextLimit: 200000 },
        { name: 'openai/gpt-4o', contextLimit: 128000 },
        { name: 'google/gemini-2.0-flash', contextLimit: 1048576 },
        { name: 'deepseek/deepseek-chat', contextLimit: 64000 },
        { name: 'meta-llama/llama-3.3-70b-instruct', contextLimit: 128000 },
      ],
      modelDocLink: 'https://openrouter.ai/docs',
      configKeys: [
        { name: 'apiKey', required: true, secret: true },
        { name: 'defaultModel', required: false, secret: false, default: 'anthropic/claude-sonnet-4' },
      ],
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey || this.apiKey;
    this.defaultModelName = config.defaultModel || this.defaultModelName;
    this.baseUrl = 'https://openrouter.ai/api';
    this.initialized = true;
  }

  isConfigured(): boolean {
    return this.initialized && !!this.apiKey;
  }

  getModelCapabilities(modelName: string): ModelCapabilities | null {
    const known = this.getMetadata().knownModels.find((m) => m.name === modelName);
    return {
      name: modelName,
      contextLimit: known?.contextLimit || 128000,
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
      provider: 'openrouter',
    };
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': 'https://github.com/canvas-cli/canvas-cli',
      'X-Title': 'Canvas CLI',
    };
  }
}
