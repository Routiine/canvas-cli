/**
 * Enhanced Ollama Backend
 *
 * Provides intelligent model routing, context management, and robust
 * communication with Ollama for the autonomous agent system.
 */

import { EventEmitter } from 'events';
import type {
  OllamaConfig,
  OllamaRequest,
  OllamaResponse,
  OllamaOptions,
  OllamaEmbeddingRequest,
  OllamaEmbeddingResponse,
  OllamaModel,
  ModelCapability,
  ModelRouting} from './types.js';
import {
  TaskType,
  DEFAULT_OLLAMA_CONFIG
} from './types.js';

// ============================================================================
// Types
// ============================================================================

interface ModelInfo {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
  details: {
    format: string;
    family: string;
    parameterSize: string;
    quantizationLevel: string;
  };
}

interface StreamChunk {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

interface HealthStatus {
  available: boolean;
  models: string[];
  version?: string;
  lastChecked: Date;
  responseTime: number;
}

// ============================================================================
// Model Registry
// ============================================================================

const MODEL_REGISTRY: Map<string, OllamaModel> = new Map([
  ['llama3.2:3b', {
    name: 'llama3.2:3b',
    contextLength: 128000,
    capabilities: ['reasoning', 'code_analysis', 'chat', 'instruction_following'],
    speed: 'fast',
    quality: 'good',
    memoryRequirement: 4
  }],
  ['llama3.2:1b', {
    name: 'llama3.2:1b',
    contextLength: 128000,
    capabilities: ['summarization', 'chat'],
    speed: 'fast',
    quality: 'basic',
    memoryRequirement: 2
  }],
  ['llama3.1:70b', {
    name: 'llama3.1:70b',
    contextLength: 128000,
    capabilities: ['reasoning', 'planning', 'code_generation', 'code_analysis'],
    speed: 'slow',
    quality: 'excellent',
    memoryRequirement: 48
  }],
  ['codellama:34b', {
    name: 'codellama:34b',
    contextLength: 16384,
    capabilities: ['code_generation', 'code_analysis'],
    speed: 'medium',
    quality: 'excellent',
    memoryRequirement: 24
  }],
  ['codellama:13b', {
    name: 'codellama:13b',
    contextLength: 16384,
    capabilities: ['code_generation', 'code_analysis'],
    speed: 'medium',
    quality: 'good',
    memoryRequirement: 12
  }],
  ['codellama:7b', {
    name: 'codellama:7b',
    contextLength: 16384,
    capabilities: ['code_generation', 'code_analysis'],
    speed: 'fast',
    quality: 'good',
    memoryRequirement: 6
  }],
  ['deepseek-coder:6.7b', {
    name: 'deepseek-coder:6.7b',
    contextLength: 16384,
    capabilities: ['code_generation', 'code_analysis'],
    speed: 'fast',
    quality: 'good',
    memoryRequirement: 6
  }],
  ['mistral:7b', {
    name: 'mistral:7b',
    contextLength: 32768,
    capabilities: ['reasoning', 'planning', 'summarization', 'chat'],
    speed: 'fast',
    quality: 'good',
    memoryRequirement: 6
  }],
  ['qwen2.5:7b', {
    name: 'qwen2.5:7b',
    contextLength: 32768,
    capabilities: ['reasoning', 'code_generation', 'code_analysis'],
    speed: 'fast',
    quality: 'good',
    memoryRequirement: 6
  }],
  ['nomic-embed-text', {
    name: 'nomic-embed-text',
    contextLength: 8192,
    capabilities: ['embedding'],
    speed: 'fast',
    quality: 'good',
    memoryRequirement: 1
  }],
  ['mxbai-embed-large', {
    name: 'mxbai-embed-large',
    contextLength: 512,
    capabilities: ['embedding'],
    speed: 'fast',
    quality: 'excellent',
    memoryRequirement: 2
  }]
]);

// ============================================================================
// OllamaBackend Class
// ============================================================================

export class OllamaBackend extends EventEmitter {
  private config: OllamaConfig;
  private availableModels: Set<string> = new Set();
  private healthStatus: HealthStatus | null = null;
  private requestQueue: Map<string, AbortController> = new Map();
  private contextCache: Map<string, number[]> = new Map();
  private tokenEstimateCache: Map<string, number> = new Map();

  constructor(config: Partial<OllamaConfig> = {}) {
    super();
    this.config = { ...DEFAULT_OLLAMA_CONFIG, ...config };
  }

  // ==========================================================================
  // Health & Initialization
  // ==========================================================================

  async initialize(): Promise<void> {
    await this.checkHealth();
    await this.discoverModels();
    this.emit('initialized', { models: Array.from(this.availableModels) });
  }

  async checkHealth(): Promise<HealthStatus> {
    const startTime = Date.now();
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/tags`,
        { method: 'GET' },
        5000
      );

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      const models = (data.models || []).map((m: ModelInfo) => m.name);

      this.healthStatus = {
        available: true,
        models,
        lastChecked: new Date(),
        responseTime: Date.now() - startTime
      };

      // Try to get version
      try {
        const versionResponse = await this.fetchWithTimeout(
          `${this.config.baseUrl}/api/version`,
          { method: 'GET' },
          2000
        );
        if (versionResponse.ok) {
          const versionData = await versionResponse.json();
          this.healthStatus.version = versionData.version;
        }
      } catch {
        // Version endpoint optional
      }

      this.emit('health_check', this.healthStatus);
      return this.healthStatus;
    } catch (error) {
      this.healthStatus = {
        available: false,
        models: [],
        lastChecked: new Date(),
        responseTime: Date.now() - startTime
      };
      this.emit('health_check_failed', error);
      throw error;
    }
  }

  async discoverModels(): Promise<string[]> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/tags`,
        { method: 'GET' },
        10000
      );

      if (!response.ok) {
        throw new Error(`Model discovery failed: ${response.status}`);
      }

      const data = await response.json();
      this.availableModels.clear();

      for (const model of data.models || []) {
        this.availableModels.add(model.name);
        // Also add without tag if it has one
        const baseName = model.name.split(':')[0];
        if (baseName !== model.name) {
          this.availableModels.add(baseName);
        }
      }

      this.emit('models_discovered', Array.from(this.availableModels));
      return Array.from(this.availableModels);
    } catch (error) {
      this.emit('model_discovery_failed', error);
      return [];
    }
  }

  isAvailable(): boolean {
    return this.healthStatus?.available ?? false;
  }

  getAvailableModels(): string[] {
    return Array.from(this.availableModels);
  }

  // ==========================================================================
  // Model Selection & Routing
  // ==========================================================================

  selectModel(taskType: TaskType, preferredModel?: string): string {
    // If preferred model is available, use it
    if (preferredModel && this.isModelAvailable(preferredModel)) {
      return preferredModel;
    }

    // Map task type to capability
    const capabilityMap: Record<TaskType, keyof ModelRouting> = {
      [TaskType.CODE_GENERATION]: 'code_generation',
      [TaskType.CODE_ANALYSIS]: 'code_analysis',
      [TaskType.CODE_MODIFICATION]: 'code_generation',
      [TaskType.BUG_FIX]: 'code_analysis',
      [TaskType.REFACTORING]: 'code_generation',
      [TaskType.TESTING]: 'code_generation',
      [TaskType.DOCUMENTATION]: 'summarization',
      [TaskType.FILE_OPERATION]: 'reasoning',
      [TaskType.SHELL_COMMAND]: 'reasoning',
      [TaskType.RESEARCH]: 'reasoning',
      [TaskType.PLANNING]: 'planning'
    };

    const routingKey = capabilityMap[taskType] || 'reasoning';
    const candidates = this.config.routing[routingKey];

    // Find first available model from candidates
    for (const model of candidates) {
      if (this.isModelAvailable(model)) {
        return model;
      }
    }

    // Fall back to default model
    if (this.isModelAvailable(this.config.defaultModel)) {
      return this.config.defaultModel;
    }

    // Last resort: any available model
    const anyModel = this.availableModels.values().next().value;
    if (anyModel) {
      return anyModel;
    }

    throw new Error('No Ollama models available');
  }

  selectModelForCapability(capability: ModelCapability): string {
    // Find models with this capability
    for (const [name, info] of MODEL_REGISTRY) {
      if (info.capabilities.includes(capability) && this.isModelAvailable(name)) {
        return name;
      }
    }

    // Fall back to routing config
    const routingKey = capability as keyof ModelRouting;
    if (this.config.routing[routingKey]) {
      for (const model of this.config.routing[routingKey]) {
        if (this.isModelAvailable(model)) {
          return model;
        }
      }
    }

    return this.config.defaultModel;
  }

  private isModelAvailable(model: string): boolean {
    if (this.availableModels.has(model)) return true;

    // Check without version tag
    const baseName = model.split(':')[0];
    for (const available of this.availableModels) {
      if (available.startsWith(baseName)) {
        return true;
      }
    }

    return false;
  }

  getModelInfo(modelName: string): OllamaModel | undefined {
    return MODEL_REGISTRY.get(modelName);
  }

  // ==========================================================================
  // Generation Methods
  // ==========================================================================

  async generate(request: OllamaRequest): Promise<OllamaResponse> {
    const requestId = this.generateRequestId();
    const controller = new AbortController();
    this.requestQueue.set(requestId, controller);

    try {
      this.emit('generation_started', { requestId, model: request.model });

      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...request,
            stream: false
          }),
          signal: controller.signal
        },
        this.config.timeout
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Generation failed: ${response.status} - ${error}`);
      }

      const result: OllamaResponse = await response.json();

      // Cache context for follow-up requests
      if (result.context) {
        this.contextCache.set(request.model, result.context);
      }

      this.emit('generation_completed', {
        requestId,
        model: request.model,
        duration: result.total_duration,
        tokens: result.eval_count
      });

      return result;
    } catch (error) {
      this.emit('generation_failed', { requestId, error });
      throw error;
    } finally {
      this.requestQueue.delete(requestId);
    }
  }

  async *generateStream(request: OllamaRequest): AsyncGenerator<string, void, unknown> {
    const requestId = this.generateRequestId();
    const controller = new AbortController();
    this.requestQueue.set(requestId, controller);

    try {
      this.emit('stream_started', { requestId, model: request.model });

      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...request,
            stream: true
          }),
          signal: controller.signal
        },
        this.config.timeout
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stream generation failed: ${response.status} - ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk: StreamChunk = JSON.parse(line);
              yield chunk.response;

              if (chunk.done) {
                this.emit('stream_completed', { requestId, model: request.model });
                return;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }

      this.emit('stream_completed', { requestId, model: request.model });
    } catch (error) {
      this.emit('stream_failed', { requestId, error });
      throw error;
    } finally {
      this.requestQueue.delete(requestId);
    }
  }

  async chat(
    model: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: OllamaOptions
  ): Promise<string> {
    const requestId = this.generateRequestId();
    const controller = new AbortController();
    this.requestQueue.set(requestId, controller);

    try {
      this.emit('chat_started', { requestId, model });

      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            options
          }),
          signal: controller.signal
        },
        this.config.timeout
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Chat failed: ${response.status} - ${error}`);
      }

      const result = await response.json();
      this.emit('chat_completed', { requestId, model });

      return result.message?.content || '';
    } catch (error) {
      this.emit('chat_failed', { requestId, error });
      throw error;
    } finally {
      this.requestQueue.delete(requestId);
    }
  }

  // ==========================================================================
  // Embeddings
  // ==========================================================================

  async embed(text: string, model?: string): Promise<number[]> {
    const embeddingModel = model || this.selectModelForCapability('embedding');

    const response = await this.fetchWithTimeout(
      `${this.config.baseUrl}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: embeddingModel,
          prompt: text
        } as OllamaEmbeddingRequest)
      },
      30000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding failed: ${response.status} - ${error}`);
    }

    const result: OllamaEmbeddingResponse = await response.json();
    return result.embedding;
  }

  async embedBatch(texts: string[], model?: string): Promise<number[][]> {
    // Ollama doesn't support batch embeddings natively, so we parallelize
    const embeddingModel = model || this.selectModelForCapability('embedding');
    const results: number[][] = [];

    // Process in batches of 10 to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text, embeddingModel))
      );
      results.push(...batchResults);
    }

    return results;
  }

  // ==========================================================================
  // Specialized Methods
  // ==========================================================================

  async reason(
    task: string,
    context: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{ reasoning: string; conclusion: string; confidence: number }> {
    const model = this.selectModelForCapability('reasoning');

    const systemPrompt = `You are a precise reasoning engine. Analyze the task step by step.

Output your response in the following JSON format:
{
  "reasoning": "Your step-by-step analysis",
  "conclusion": "Your final conclusion or recommendation",
  "confidence": 0.0-1.0
}

Be thorough but concise. Focus on actionable insights.`;

    const userPrompt = `Task: ${task}

Context:
${context}

Analyze this task and provide your reasoning in the specified JSON format.`;

    const response = await this.generate({
      model,
      prompt: userPrompt,
      system: systemPrompt,
      format: 'json',
      options: {
        temperature: options?.temperature ?? 0.3,
        num_predict: options?.maxTokens ?? 2000
      }
    });

    try {
      return JSON.parse(response.response);
    } catch {
      // If JSON parsing fails, extract what we can
      return {
        reasoning: response.response,
        conclusion: 'See reasoning above',
        confidence: 0.5
      };
    }
  }

  async generateCode(
    instruction: string,
    language: string,
    context?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<{ code: string; explanation: string }> {
    const model = this.selectModelForCapability('code_generation');

    const systemPrompt = `You are an expert ${language} programmer. Generate clean, efficient, well-documented code.

Output your response in the following JSON format:
{
  "code": "The generated code",
  "explanation": "Brief explanation of the code"
}

Follow best practices for ${language}. Include appropriate error handling.`;

    const userPrompt = context
      ? `${instruction}\n\nExisting code context:\n${context}`
      : instruction;

    const response = await this.generate({
      model,
      prompt: userPrompt,
      system: systemPrompt,
      format: 'json',
      options: {
        temperature: options?.temperature ?? 0.4,
        num_predict: options?.maxTokens ?? 4000
      }
    });

    try {
      return JSON.parse(response.response);
    } catch {
      // Extract code from response
      const codeMatch = response.response.match(/```[\w]*\n([\s\S]*?)```/);
      return {
        code: codeMatch ? codeMatch[1] : response.response,
        explanation: 'Generated code'
      };
    }
  }

  async analyzeCode(
    code: string,
    analysisType: 'bugs' | 'performance' | 'security' | 'style' | 'general'
  ): Promise<{ issues: Array<{ type: string; line?: number; description: string; severity: string }>; summary: string }> {
    const model = this.selectModelForCapability('code_analysis');

    const analysisPrompts: Record<string, string> = {
      bugs: 'Identify potential bugs, logic errors, and edge cases.',
      performance: 'Identify performance issues and optimization opportunities.',
      security: 'Identify security vulnerabilities and unsafe practices.',
      style: 'Review code style, readability, and maintainability.',
      general: 'Provide a comprehensive code review.'
    };

    const systemPrompt = `You are an expert code analyst. ${analysisPrompts[analysisType]}

Output your response in the following JSON format:
{
  "issues": [
    {"type": "bug|performance|security|style", "line": number or null, "description": "description", "severity": "low|medium|high|critical"}
  ],
  "summary": "Overall assessment"
}

Be specific and actionable in your feedback.`;

    const response = await this.generate({
      model,
      prompt: `Analyze this code:\n\n${code}`,
      system: systemPrompt,
      format: 'json',
      options: {
        temperature: 0.2,
        num_predict: 3000
      }
    });

    try {
      return JSON.parse(response.response);
    } catch {
      return {
        issues: [],
        summary: response.response
      };
    }
  }

  async summarize(
    text: string,
    targetLength: 'brief' | 'moderate' | 'detailed' = 'moderate'
  ): Promise<string> {
    const model = this.selectModelForCapability('summarization');

    const lengthInstructions = {
      brief: 'Provide a 1-2 sentence summary.',
      moderate: 'Provide a concise paragraph summary.',
      detailed: 'Provide a comprehensive summary preserving key details.'
    };

    const response = await this.generate({
      model,
      prompt: `Summarize the following text:\n\n${text}`,
      system: `You are a skilled summarizer. ${lengthInstructions[targetLength]} Preserve important information and maintain accuracy.`,
      options: {
        temperature: 0.3,
        num_predict: targetLength === 'brief' ? 200 : targetLength === 'moderate' ? 500 : 1500
      }
    });

    return response.response;
  }

  async planTask(
    goal: string,
    context: string
  ): Promise<{ steps: Array<{ id: string; description: string; dependencies: string[] }>; reasoning: string }> {
    const model = this.selectModelForCapability('planning');

    const systemPrompt = `You are a task planning expert. Break down complex goals into executable steps.

Output your response in the following JSON format:
{
  "steps": [
    {"id": "step_1", "description": "What to do", "dependencies": ["step_0"]}
  ],
  "reasoning": "Why this plan makes sense"
}

Create steps that are:
- Specific and actionable
- Properly ordered with dependencies
- Neither too granular nor too broad`;

    const response = await this.generate({
      model,
      prompt: `Goal: ${goal}\n\nContext:\n${context}`,
      system: systemPrompt,
      format: 'json',
      options: {
        temperature: 0.4,
        num_predict: 3000
      }
    });

    try {
      return JSON.parse(response.response);
    } catch {
      return {
        steps: [{ id: 'step_1', description: goal, dependencies: [] }],
        reasoning: response.response
      };
    }
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  estimateTokens(text: string): number {
    // Check cache
    const cacheKey = text.substring(0, 100);
    if (this.tokenEstimateCache.has(cacheKey)) {
      const cached = this.tokenEstimateCache.get(cacheKey)!;
      // Scale by actual length ratio
      return Math.ceil(cached * (text.length / 100));
    }

    // Rough estimation: ~4 characters per token for English
    // Adjust for code which tends to have more tokens per character
    const hasCode = /[{}\[\]();=<>]/.test(text);
    const charsPerToken = hasCode ? 3.5 : 4;
    const estimate = Math.ceil(text.length / charsPerToken);

    // Cache the estimate for the prefix
    this.tokenEstimateCache.set(cacheKey, Math.ceil(100 / charsPerToken));

    return estimate;
  }

  getContextLimit(model: string): number {
    const info = MODEL_REGISTRY.get(model);
    if (info) {
      return Math.floor(info.contextLength * this.config.contextWindowPercentage);
    }

    // Default conservative estimate
    return 4096;
  }

  truncateToFit(text: string, model: string, reserveTokens: number = 500): string {
    const limit = this.getContextLimit(model) - reserveTokens;
    const currentTokens = this.estimateTokens(text);

    if (currentTokens <= limit) {
      return text;
    }

    // Truncate from the beginning to preserve recent context
    const ratio = limit / currentTokens;
    const targetLength = Math.floor(text.length * ratio);

    // Find a good break point (newline or space)
    const breakPoint = text.indexOf('\n', text.length - targetLength);
    if (breakPoint > 0 && breakPoint < text.length - targetLength + 200) {
      return text.substring(breakPoint + 1);
    }

    return text.substring(text.length - targetLength);
  }

  // ==========================================================================
  // Request Management
  // ==========================================================================

  cancelRequest(requestId: string): boolean {
    const controller = this.requestQueue.get(requestId);
    if (controller) {
      controller.abort();
      this.requestQueue.delete(requestId);
      this.emit('request_cancelled', { requestId });
      return true;
    }
    return false;
  }

  cancelAllRequests(): void {
    for (const [requestId, controller] of this.requestQueue) {
      controller.abort();
      this.emit('request_cancelled', { requestId });
    }
    this.requestQueue.clear();
  }

  getPendingRequests(): number {
    return this.requestQueue.size;
  }

  // ==========================================================================
  // Model Management
  // ==========================================================================

  async pullModel(modelName: string, onProgress?: (progress: number) => void): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true })
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.total && data.completed && onProgress) {
              onProgress(data.completed / data.total);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    // Refresh available models
    await this.discoverModels();
  }

  async deleteModel(modelName: string): Promise<void> {
    const response = await this.fetchWithTimeout(
      `${this.config.baseUrl}/api/delete`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      },
      30000
    );

    if (!response.ok) {
      throw new Error(`Failed to delete model: ${response.status}`);
    }

    this.availableModels.delete(modelName);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number = this.config.timeout
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  updateConfig(config: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): OllamaConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let ollamaBackendInstance: OllamaBackend | null = null;

export function getOllamaBackend(config?: Partial<OllamaConfig>): OllamaBackend {
  if (!ollamaBackendInstance) {
    ollamaBackendInstance = new OllamaBackend(config);
  } else if (config) {
    ollamaBackendInstance.updateConfig(config);
  }
  return ollamaBackendInstance;
}

export function resetOllamaBackend(): void {
  if (ollamaBackendInstance) {
    ollamaBackendInstance.cancelAllRequests();
    ollamaBackendInstance.removeAllListeners();
  }
  ollamaBackendInstance = null;
}
