import type { Tiktoken } from 'tiktoken';
import { get_encoding, encoding_for_model } from 'tiktoken';

export class TokenCounter {
  private encoder: Tiktoken;
  private modelName: string;

  constructor(model: string = 'gpt-4') {
    this.modelName = model;
    try {
      // Try to get encoding for specific model
      this.encoder = encoding_for_model(model as any);
    } catch {
      // Fallback to cl100k_base (used by GPT-4 and most modern models)
      this.encoder = get_encoding('cl100k_base');
    }
  }

  /**
   * Count tokens in a string
   */
  countTokens(text: string): number {
    if (!text) return 0;
    return this.encoder.encode(text).length;
  }

  /**
   * Count tokens in messages array (for chat completions)
   */
  countMessageTokens(messages: Array<{ role: string; content: string | null; [key: string]: any }>): number {
    let totalTokens = 0;
    
    for (const message of messages) {
      // Every message follows <|start|>{role/name}\n{content}<|end|>\n
      totalTokens += 3; // Base tokens per message
      
      if (message.content && typeof message.content === 'string') {
        totalTokens += this.countTokens(message.content);
      }
      
      if (message.role) {
        totalTokens += this.countTokens(message.role);
      }
      
      // Add extra tokens for tool calls if present
      if (message.tool_calls) {
        totalTokens += this.countTokens(JSON.stringify(message.tool_calls));
      }
      
      // Add extra tokens for function calls if present
      if (message.function_call) {
        totalTokens += this.countTokens(JSON.stringify(message.function_call));
      }
    }
    
    totalTokens += 3; // Every reply is primed with <|start|>assistant<|message|>
    
    return totalTokens;
  }

  /**
   * Estimate tokens for streaming content
   * This is an approximation since we don't have the full response yet
   */
  estimateStreamingTokens(accumulatedContent: string): number {
    return this.countTokens(accumulatedContent);
  }

  /**
   * Get maximum context window for model
   */
  getMaxTokens(): number {
    const modelLimits: Record<string, number> = {
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-4-turbo': 128000,
      'gpt-4o': 128000,
      'gpt-3.5-turbo': 16385,
      'claude-3-opus': 200000,
      'claude-3-sonnet': 200000,
      'claude-3-haiku': 200000,
      'gemini-pro': 32760,
      'gemini-1.5-pro': 1048576,
      'llama3.2:latest': 8192,
      'qwen2.5-coder:32b': 32768,
      'deepseek-coder-v2': 128000,
      'default': 8192
    };

    for (const [pattern, limit] of Object.entries(modelLimits)) {
      if (this.modelName.toLowerCase().includes(pattern.toLowerCase())) {
        return limit;
      }
    }

    return modelLimits.default;
  }

  /**
   * Check if message would exceed token limit
   */
  wouldExceedLimit(messages: Array<{ role: string; content: string | null; [key: string]: any }>, additionalTokens: number = 0): boolean {
    const currentTokens = this.countMessageTokens(messages);
    const maxTokens = this.getMaxTokens();
    return (currentTokens + additionalTokens) > (maxTokens * 0.9); // 90% safety margin
  }

  /**
   * Truncate messages to fit within token limit
   */
  truncateMessages(messages: Array<{ role: string; content: string | null; [key: string]: any }>, maxTokens?: number): Array<{ role: string; content: string | null; [key: string]: any }> {
    const limit = maxTokens || this.getMaxTokens() * 0.9;
    const result = [...messages];
    
    while (this.countMessageTokens(result) > limit && result.length > 1) {
      // Remove oldest non-system messages
      for (let i = 0; i < result.length; i++) {
        if (result[i].role !== 'system') {
          result.splice(i, 1);
          break;
        }
      }
    }
    
    return result;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.encoder.free();
  }
}

/**
 * Format token count for display (e.g., 1.2k for 1200)
 */
export function formatTokenCount(count: number): string {
  if (count <= 999) {
    return count.toString();
  }
  
  if (count < 1_000_000) {
    const k = count / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  
  const m = count / 1_000_000;
  return m % 1 === 0 ? `${m}m` : `${m.toFixed(1)}m`;
}

/**
 * Create a token counter instance.
 * Returns a cached singleton to avoid repeated tiktoken WASM init overhead.
 * If a different model is requested than what's cached, a new counter is created.
 */
let _cachedCounter: TokenCounter | null = null;
let _cachedCounterModel: string | undefined = undefined;
export function createTokenCounter(model?: string): TokenCounter {
  if (!_cachedCounter || model !== _cachedCounterModel) {
    _cachedCounter = new TokenCounter(model);
    _cachedCounterModel = model;
  }
  return _cachedCounter;
}

/**
 * Calculate cost estimate for token usage
 */
export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  model: string = 'gpt-4'
): { inputCost: number; outputCost: number; totalCost: number } {
  // Pricing per 1K tokens in USD
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-32k': { input: 0.06, output: 0.12 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-sonnet': { input: 0.003, output: 0.015 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'default': { input: 0.01, output: 0.03 }
  };

  let modelPricing = pricing.default;
  for (const [pattern, price] of Object.entries(pricing)) {
    if (model.toLowerCase().includes(pattern.toLowerCase())) {
      modelPricing = price;
      break;
    }
  }

  const inputCost = (inputTokens / 1000) * modelPricing.input;
  const outputCost = (outputTokens / 1000) * modelPricing.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost
  };
}

/**
 * Performance metrics tracker
 */
export class TokenMetrics {
  private metrics: Map<string, {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
    totalTime: number;
    errors: number;
  }> = new Map();

  recordRequest(
    model: string,
    inputTokens: number,
    outputTokens: number,
    timeMs: number,
    error: boolean = false
  ): void {
    const current = this.metrics.get(model) || {
      inputTokens: 0,
      outputTokens: 0,
      requestCount: 0,
      totalTime: 0,
      errors: 0
    };

    current.inputTokens += inputTokens;
    current.outputTokens += outputTokens;
    current.requestCount += 1;
    current.totalTime += timeMs;
    if (error) current.errors += 1;

    this.metrics.set(model, current);
  }

  getMetrics(model?: string): any {
    if (model) {
      return this.metrics.get(model);
    }
    return Object.fromEntries(this.metrics);
  }

  getSummary(): {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    estimatedCost: number;
  } {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalRequests = 0;
    let totalTime = 0;
    let totalErrors = 0;

    for (const [model, metrics] of this.metrics) {
      totalInputTokens += metrics.inputTokens;
      totalOutputTokens += metrics.outputTokens;
      totalRequests += metrics.requestCount;
      totalTime += metrics.totalTime;
      totalErrors += metrics.errors;

      // Add cost calculation
      const cost = calculateTokenCost(metrics.inputTokens, metrics.outputTokens, model);
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalRequests,
      averageResponseTime: totalRequests > 0 ? totalTime / totalRequests : 0,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      estimatedCost: 0 // Calculate based on model usage
    };
  }

  reset(): void {
    this.metrics.clear();
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _globalTokenMetrics: TokenMetrics | null = null;
export function getGlobalTokenMetrics(): TokenMetrics {
  if (!_globalTokenMetrics) _globalTokenMetrics = new TokenMetrics();
  return _globalTokenMetrics;
}