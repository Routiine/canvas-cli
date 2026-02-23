/**
 * Provider abstraction architecture
 * Based on goose-cli's provider system
 */

import type { ModelCapabilities, ModelUsage } from '../models/model-manager.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: any;
}

export interface ProviderError extends Error {
  type: 'context_length_exceeded' | 'rate_limit' | 'authentication' | 'network' | 'unknown';
  retryable: boolean;
  retryAfter?: number;
}

export interface ProviderUsage {
  model: string;
  usage: ModelUsage;
}

export interface ProviderResponse {
  message: Message;
  usage: ProviderUsage;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
}

export interface ProviderMetadata {
  name: string;
  displayName: string;
  description: string;
  defaultModel: string;
  knownModels: Array<{name: string, contextLimit: number}>;
  modelDocLink: string;
  configKeys: Array<{
    name: string;
    required: boolean;
    secret: boolean;
    default?: string;
  }>;
}

export interface ProviderConfig {
  [key: string]: any;
}

export interface StreamChunk {
  content?: string;
  done: boolean;
  usage?: ModelUsage;
  error?: string;
}

/**
 * Base provider interface
 */
export interface Provider {
  /**
   * Get provider metadata
   */
  getMetadata(): ProviderMetadata;

  /**
   * Initialize the provider with configuration
   */
  initialize(config: ProviderConfig): Promise<void>;

  /**
   * Check if provider is properly configured
   */
  isConfigured(): boolean;

  /**
   * Generate completion
   */
  complete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<ProviderResponse>;

  /**
   * Stream completion
   */
  streamComplete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<StreamChunk, void, unknown>;

  /**
   * Get model capabilities
   */
  getModelCapabilities(modelName: string): ModelCapabilities | null;

  /**
   * Fetch supported models
   */
  fetchSupportedModels(): Promise<string[]>;

  /**
   * Check if embeddings are supported
   */
  supportsEmbeddings(): boolean;

  /**
   * Create embeddings (if supported)
   */
  createEmbeddings?(texts: string[]): Promise<number[][]>;

  /**
   * Test connection
   */
  testConnection(): Promise<boolean>;

  /**
   * Get provider-specific information
   */
  getProviderInfo(): {
    version?: string;
    status: 'connected' | 'disconnected' | 'error';
    lastError?: string;
    uptime?: number;
  };
}

/**
 * Create a provider error
 */
export function createProviderError(
  message: string,
  type: ProviderError['type'] = 'unknown',
  retryable = false,
  retryAfter?: number
): ProviderError {
  const error = new Error(message) as ProviderError;
  error.type = type;
  error.retryable = retryable;
  error.retryAfter = retryAfter;
  return error;
}

/**
 * Check if an error is a provider error
 */
export function isProviderError(error: any): error is ProviderError {
  return error && typeof error === 'object' && 'type' in error && 'retryable' in error;
}

/**
 * Abstract base provider class
 */
export abstract class BaseProvider implements Provider {
  protected config: ProviderConfig = {};
  protected initialized = false;

  abstract getMetadata(): ProviderMetadata;
  
  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...config };
    await this.validateConfig();
    this.initialized = true;
  }

  isConfigured(): boolean {
    return this.initialized && this.hasRequiredConfig();
  }

  abstract complete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options?: any
  ): Promise<ProviderResponse>;

  abstract streamComplete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options?: any
  ): AsyncGenerator<StreamChunk, void, unknown>;

  abstract getModelCapabilities(modelName: string): ModelCapabilities | null;

  abstract fetchSupportedModels(): Promise<string[]>;

  supportsEmbeddings(): boolean {
    return false;
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    throw createProviderError('This provider does not support embeddings');
  }

  abstract testConnection(): Promise<boolean>;

  abstract getProviderInfo(): {
    version?: string;
    status: 'connected' | 'disconnected' | 'error';
    lastError?: string;
    uptime?: number;
  };

  protected async validateConfig(): Promise<void> {
    const metadata = this.getMetadata();
    const requiredKeys = metadata.configKeys.filter(key => key.required);
    
    for (const key of requiredKeys) {
      if (!(key.name in this.config) || this.config[key.name] === undefined || this.config[key.name] === '') {
        throw createProviderError(`Required configuration key missing: ${key.name}`);
      }
    }
  }

  protected hasRequiredConfig(): boolean {
    try {
      const metadata = this.getMetadata();
      const requiredKeys = metadata.configKeys.filter(key => key.required);
      
      for (const key of requiredKeys) {
        if (!(key.name in this.config) || this.config[key.name] === undefined || this.config[key.name] === '') {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  protected getConfigValue(key: string, defaultValue?: any): any {
    return this.config[key] ?? defaultValue;
  }

  protected setConfigValue(key: string, value: any): void {
    this.config[key] = value;
  }
}

/**
 * Lead-Worker provider for complex routing
 */
export interface LeadWorkerProvider extends Provider {
  getLeadModel(): string;
  getWorkerModel(): string;
  setActiveModel(model: 'lead' | 'worker'): void;
  getActiveModel(): 'lead' | 'worker';
}

export abstract class BaseLeadWorkerProvider extends BaseProvider implements LeadWorkerProvider {
  protected activeModel: 'lead' | 'worker' = 'lead';
  protected leadModel: string;
  protected workerModel: string;

  constructor(leadModel: string, workerModel: string) {
    super();
    this.leadModel = leadModel;
    this.workerModel = workerModel;
  }

  getLeadModel(): string {
    return this.leadModel;
  }

  getWorkerModel(): string {
    return this.workerModel;
  }

  setActiveModel(model: 'lead' | 'worker'): void {
    this.activeModel = model;
  }

  getActiveModel(): 'lead' | 'worker' {
    return this.activeModel;
  }

  getCurrentModelName(): string {
    return this.activeModel === 'lead' ? this.leadModel : this.workerModel;
  }
}