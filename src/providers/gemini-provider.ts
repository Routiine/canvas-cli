/**
 * Google Gemini Provider
 * Uses the OpenAI-compatible endpoint (generativelanguage.googleapis.com)
 * so we don't need the @google/generative-ai SDK.
 *
 * Set GEMINI_API_KEY or GOOGLE_API_KEY env var.
 */

import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import type { ProviderMetadata, ProviderConfig } from './base-provider.js';
import type { ModelCapabilities } from '../models/model-manager.js';

export class GeminiProvider extends OpenAICompatibleProvider {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    super({
      name: 'gemini',
      displayName: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey,
      defaultModel: 'gemini-2.0-flash',
    });
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'gemini',
      displayName: 'Google Gemini',
      description: 'Google Gemini models via OpenAI-compatible endpoint',
      defaultModel: 'gemini-2.0-flash',
      knownModels: [
        { name: 'gemini-2.0-flash', contextLimit: 1048576 },
        { name: 'gemini-2.0-flash-lite', contextLimit: 1048576 },
        { name: 'gemini-1.5-pro', contextLimit: 2097152 },
        { name: 'gemini-1.5-flash', contextLimit: 1048576 },
      ],
      modelDocLink: 'https://ai.google.dev/models',
      configKeys: [
        { name: 'apiKey', required: true, secret: true },
        { name: 'defaultModel', required: false, secret: false, default: 'gemini-2.0-flash' },
      ],
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey || this.apiKey;
    this.defaultModelName = config.defaultModel || this.defaultModelName;
    this.baseUrl = 'https://generativelanguage.googleapis.com';
    this.initialized = true;
  }

  isConfigured(): boolean {
    return this.initialized && !!this.apiKey;
  }

  getModelCapabilities(modelName: string): ModelCapabilities | null {
    const known = this.getMetadata().knownModels.find((m) => m.name === modelName);
    return {
      name: modelName,
      contextLimit: known?.contextLimit || 1048576,
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
      provider: 'gemini',
    };
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  // Override to use Gemini's OpenAI-compat endpoint path
  protected get completionsUrl(): string {
    return `${this.baseUrl}/v1beta/openai/chat/completions`;
  }
}
