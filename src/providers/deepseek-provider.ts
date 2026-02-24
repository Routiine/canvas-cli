/**
 * DeepSeek Provider
 * Extends OpenAI-compatible since DeepSeek uses the same API format.
 *
 * Set DEEPSEEK_API_KEY env var.
 */

import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import type { ProviderMetadata, ProviderConfig } from './base-provider.js';
import type { ModelCapabilities } from '../models/model-manager.js';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: 'deepseek',
      displayName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      defaultModel: 'deepseek-chat',
    });
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'deepseek',
      displayName: 'DeepSeek',
      description: 'DeepSeek AI models (V3, R1, Coder)',
      defaultModel: 'deepseek-chat',
      knownModels: [
        { name: 'deepseek-chat', contextLimit: 64000 },
        { name: 'deepseek-reasoner', contextLimit: 64000 },
      ],
      modelDocLink: 'https://platform.deepseek.com/docs',
      configKeys: [
        { name: 'apiKey', required: true, secret: true },
        { name: 'defaultModel', required: false, secret: false, default: 'deepseek-chat' },
      ],
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey || this.apiKey;
    this.defaultModelName = config.defaultModel || this.defaultModelName;
    this.baseUrl = 'https://api.deepseek.com';
    this.initialized = true;
  }

  isConfigured(): boolean {
    return this.initialized && !!this.apiKey;
  }

  getModelCapabilities(modelName: string): ModelCapabilities | null {
    const known = this.getMetadata().knownModels.find((m) => m.name === modelName);
    return {
      name: modelName,
      contextLimit: known?.contextLimit || 64000,
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
      provider: 'deepseek',
    };
  }
}
