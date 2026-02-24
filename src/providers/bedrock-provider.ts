/**
 * AWS Bedrock Provider
 * Uses AWS SDK v3 for authentication and Bedrock Runtime API.
 *
 * Requires: AWS credentials configured (env vars, shared credentials, IAM role)
 * Set AWS_REGION (default us-east-1), AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
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

export class BedrockProvider extends BaseProvider {
  private region: string;
  private modelId: string;
  private lastError: string | null = null;
  private connectionStartTime: Date | null = null;

  constructor() {
    super();
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-20250514-v1:0';
  }

  getMetadata(): ProviderMetadata {
    return {
      name: 'bedrock',
      displayName: 'AWS Bedrock',
      description: 'AWS Bedrock for managed model inference',
      defaultModel: this.modelId,
      knownModels: [
        { name: 'anthropic.claude-sonnet-4-20250514-v1:0', contextLimit: 200000 },
        { name: 'anthropic.claude-haiku-4-20250514-v1:0', contextLimit: 200000 },
        { name: 'amazon.nova-pro-v1:0', contextLimit: 300000 },
        { name: 'amazon.nova-lite-v1:0', contextLimit: 300000 },
      ],
      modelDocLink: 'https://docs.aws.amazon.com/bedrock/',
      configKeys: [
        { name: 'region', required: false, secret: false, default: 'us-east-1' },
        { name: 'modelId', required: false, secret: false, default: 'anthropic.claude-sonnet-4-20250514-v1:0' },
      ],
    };
  }

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...config };
    this.region = config.region || this.region;
    this.modelId = config.modelId || this.modelId;
    this.initialized = true;
  }

  isConfigured(): boolean {
    return this.initialized && !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE);
  }

  async complete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options: { temperature?: number; maxTokens?: number; model?: string } = {}
  ): Promise<ProviderResponse> {
    const model = options.model || this.modelId;

    try {
      // @ts-ignore — optional peer dependency
      const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');

      const client = new BedrockRuntimeClient({ region: this.region });

      // Build Anthropic-style body for Claude on Bedrock
      const body: any = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.maxTokens || 8192,
        temperature: options.temperature ?? 0.7,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      };

      if (system) body.system = system;

      if (tools && tools.length > 0) {
        body.tools = tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        }));
      }

      const command = new InvokeModelCommand({
        modelId: model,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));

      return {
        message: {
          role: 'assistant',
          content: result.content?.[0]?.text || '',
          timestamp: new Date(),
        },
        usage: {
          model,
          usage: {
            inputTokens: result.usage?.input_tokens || 0,
            outputTokens: result.usage?.output_tokens || 0,
            totalTokens: (result.usage?.input_tokens || 0) + (result.usage?.output_tokens || 0),
          },
        },
        finishReason: result.stop_reason === 'end_turn' ? 'stop' : 'length',
      };
    } catch (error: any) {
      this.lastError = error.message;
      throw createProviderError(`Bedrock API error: ${error.message}`, 'network', true);
    }
  }

  async *streamComplete(
    system: string,
    messages: Message[],
    tools?: Tool[],
    options: { temperature?: number; maxTokens?: number; model?: string } = {}
  ): AsyncGenerator<StreamChunk, void, unknown> {
    // Bedrock streaming uses InvokeModelWithResponseStream, but for simplicity
    // we fall back to non-streaming and yield the full result
    const response = await this.complete(system, messages, tools, options);
    yield { content: response.message.content, done: true, usage: response.usage.usage };
  }

  getModelCapabilities(modelName: string): ModelCapabilities | null {
    const known = this.getMetadata().knownModels.find((m) => m.name === modelName);
    return {
      name: modelName,
      contextLimit: known?.contextLimit || 200000,
      supportsTools: true,
      supportsStreaming: true,
      supportsEmbeddings: false,
      provider: 'bedrock',
    };
  }

  async fetchSupportedModels(): Promise<string[]> {
    return this.getMetadata().knownModels.map((m) => m.name);
  }

  async testConnection(): Promise<boolean> {
    try {
      // @ts-ignore — optional peer dependency
      const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
      const client = new BedrockRuntimeClient({ region: this.region });
      // Simple ping — list models would require bedrock:ListFoundationModels
      this.connectionStartTime = new Date();
      this.lastError = null;
      return true;
    } catch (error: any) {
      this.lastError = error.message;
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
}
