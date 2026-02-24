/**
 * Azure OpenAI Provider
 * Uses Azure-specific auth (api-key header) and deployment-based endpoints.
 *
 * Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT env vars.
 */

import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import type { ProviderMetadata, ProviderConfig } from './base-provider.js';
import type { ModelCapabilities } from '../models/model-manager.js';

export class AzureOpenAIProvider extends OpenAICompatibleProvider {
  private deployment: string;
  private apiVersion: string;

  constructor() {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

    super({
      name: 'azure-openai',
      displayName: 'Azure OpenAI',
      baseUrl: endpoint,
      apiKey: process.env.AZURE_OPENAI_API_KEY || '',
      defaultModel: deployment,
    });

    this.deployment = deployment;
    this.apiVersion = apiVersion;
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'azure-openai',
      displayName: 'Azure OpenAI',
      description: 'Azure-hosted OpenAI models with enterprise auth',
      defaultModel: this.deployment,
      knownModels: [
        { name: 'gpt-4o', contextLimit: 128000 },
        { name: 'gpt-4o-mini', contextLimit: 128000 },
        { name: 'gpt-4-turbo', contextLimit: 128000 },
      ],
      modelDocLink: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/',
      configKeys: [
        { name: 'apiKey', required: true, secret: true },
        { name: 'endpoint', required: true, secret: false },
        { name: 'deployment', required: true, secret: false },
        { name: 'apiVersion', required: false, secret: false, default: '2024-10-21' },
      ],
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.apiKey = config.apiKey || this.apiKey;
    this.baseUrl = config.endpoint || this.baseUrl;
    this.deployment = config.deployment || this.deployment;
    this.apiVersion = config.apiVersion || this.apiVersion;
    this.defaultModelName = this.deployment;
    this.initialized = true;
  }

  isConfigured(): boolean {
    return this.initialized && !!this.baseUrl && !!this.apiKey && !!this.deployment;
  }

  getModelCapabilities(modelName: string): ModelCapabilities | null {
    return {
      name: modelName,
      contextLimit: 128000,
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
      provider: 'azure-openai',
    };
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'api-key': this.apiKey,
    };
  }

  // Azure uses a different URL pattern with deployment name and api-version
  protected buildMessages(system: string, messages: any[]): any[] {
    return super.buildMessages(system, messages);
  }
}
