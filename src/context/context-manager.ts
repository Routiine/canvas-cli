/**
 * Enhanced context limit management system
 * Based on goose-cli's context handling
 */

import { AdvancedTokenizer } from '../tokenization/advanced-tokenizer.js';
import { getModelManager, ModelManagerSingleton, ModelCapabilities } from '../models/model-manager.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  tokens?: number;
}

export interface ContextWindow {
  systemPrompt: string;
  messages: Message[];
  tools: Array<{ name: string; description: string; input_schema: any }>;
  modelName: string;
}

export interface ContextAnalysis {
  totalTokens: number;
  systemTokens: number;
  messageTokens: number;
  toolTokens: number;
  contextLimit: number;
  remainingTokens: number;
  utilizationPercent: number;
  exceedsLimit: boolean;
  recommendedAction?: 'continue' | 'trim' | 'summarize' | 'split';
}

export interface ContextTrimResult {
  trimmedMessages: Message[];
  removedMessages: Message[];
  tokensSaved: number;
  strategy: string;
}

export interface ContextCompressionOptions {
  strategy: 'drop_oldest' | 'drop_middle' | 'summarize' | 'smart_trim';
  targetUtilization: number; // 0.0 to 1.0
  preserveRecent: number; // Number of recent messages to always preserve
  preserveSystem: boolean;
  maxSummaryLength: number;
}

export class ContextManager {
  private tokenizer: AdvancedTokenizer;
  private compressionEnabled: boolean;
  private defaultOptions: ContextCompressionOptions;

  constructor(tokenizerName?: string) {
    this.tokenizer = new AdvancedTokenizer(tokenizerName);
    this.compressionEnabled = true;
    this.defaultOptions = {
      strategy: 'smart_trim',
      targetUtilization: 0.8, // Use 80% of available context
      preserveRecent: 3,
      preserveSystem: true,
      maxSummaryLength: 500
    };
    
    void this.initializeTokenizer();
  }

  private async initializeTokenizer(): Promise<void> {
    try {
      await this.tokenizer.initialize();
    } catch (error) {
      console.warn('Failed to initialize tokenizer for context manager:', error);
    }
  }

  /**
   * Analyze the current context
   */
  analyzeContext(contextWindow: ContextWindow): ContextAnalysis {
    // Get model capabilities
    const capabilities = getModelManager().getCapabilities(contextWindow.modelName);
    const contextLimit = capabilities?.contextLimit || 128000;

    // Count tokens
    const systemTokens = contextWindow.systemPrompt 
      ? this.tokenizer.countTokens(contextWindow.systemPrompt) + 4 // +4 for message formatting
      : 0;

    let messageTokens = 0;
    for (const message of contextWindow.messages) {
      if (!message.tokens) {
        message.tokens = this.tokenizer.countTokens(message.content) + 4; // +4 for message formatting
      }
      messageTokens += message.tokens;
    }

    const toolTokens = this.tokenizer.countTokensForTools(contextWindow.tools);
    
    const totalTokens = systemTokens + messageTokens + toolTokens + 3; // +3 for assistant primer
    const remainingTokens = Math.max(0, contextLimit - totalTokens);
    const utilizationPercent = (totalTokens / contextLimit) * 100;
    const exceedsLimit = totalTokens > contextLimit;

    let recommendedAction: ContextAnalysis['recommendedAction'] = 'continue';
    if (exceedsLimit) {
      recommendedAction = 'trim';
    } else if (utilizationPercent > 95) {
      recommendedAction = 'split';
    } else if (utilizationPercent > 90) {
      recommendedAction = 'summarize';
    }

    return {
      totalTokens,
      systemTokens,
      messageTokens,
      toolTokens,
      contextLimit,
      remainingTokens,
      utilizationPercent,
      exceedsLimit,
      recommendedAction
    };
  }

  /**
   * Automatically manage context to fit within limits
   */
  async manageContext(
    contextWindow: ContextWindow,
    options: Partial<ContextCompressionOptions> = {}
  ): Promise<{
    managedWindow: ContextWindow;
    changes: string[];
    tokensSaved: number;
  }> {
    const analysis = this.analyzeContext(contextWindow);
    const changes: string[] = [];
    let tokensSaved = 0;

    // If within limits and not close to exceeding, return as-is
    if (!analysis.exceedsLimit && analysis.utilizationPercent < 85) {
      return {
        managedWindow: { ...contextWindow },
        changes: [],
        tokensSaved: 0
      };
    }

    const mergedOptions = { ...this.defaultOptions, ...options };
    const managedWindow = { ...contextWindow };

    // Calculate target token count
    const targetTokens = Math.floor(analysis.contextLimit * mergedOptions.targetUtilization);
    
    if (analysis.totalTokens > targetTokens) {
      const trimResult = await this.trimContext(
        contextWindow,
        targetTokens,
        mergedOptions
      );
      
      managedWindow.messages = trimResult.trimmedMessages;
      tokensSaved = trimResult.tokensSaved;
      changes.push(`Applied ${trimResult.strategy}, removed ${trimResult.removedMessages.length} messages`);
    }

    return {
      managedWindow,
      changes,
      tokensSaved
    };
  }

  /**
   * Trim context using specified strategy
   */
  private async trimContext(
    contextWindow: ContextWindow,
    targetTokens: number,
    options: ContextCompressionOptions
  ): Promise<ContextTrimResult> {
    switch (options.strategy) {
      case 'drop_oldest':
        return this.dropOldestMessages(contextWindow, targetTokens, options);
      
      case 'drop_middle':
        return this.dropMiddleMessages(contextWindow, targetTokens, options);
      
      case 'summarize':
        return await this.summarizeMessages(contextWindow, targetTokens, options);
      
      case 'smart_trim':
        return this.smartTrimMessages(contextWindow, targetTokens, options);
      
      default:
        return this.dropOldestMessages(contextWindow, targetTokens, options);
    }
  }

  /**
   * Drop oldest messages until within target
   */
  private dropOldestMessages(
    contextWindow: ContextWindow,
    targetTokens: number,
    options: ContextCompressionOptions
  ): ContextTrimResult {
    const messages = [...contextWindow.messages];
    const removedMessages: Message[] = [];
    let currentTokens = this.analyzeContext(contextWindow).totalTokens;

    // Preserve recent messages
    const preserveCount = Math.min(options.preserveRecent, messages.length);
    const recentMessages = messages.slice(-preserveCount);
    const candidateMessages = messages.slice(0, -preserveCount);

    // Remove from oldest first
    while (currentTokens > targetTokens && candidateMessages.length > 0) {
      const removed = candidateMessages.shift()!;
      removedMessages.push(removed);
      currentTokens -= removed.tokens || this.tokenizer.countTokens(removed.content) + 4;
    }

    const trimmedMessages = [...candidateMessages, ...recentMessages];
    
    return {
      trimmedMessages,
      removedMessages,
      tokensSaved: removedMessages.reduce((sum, msg) => 
        sum + (msg.tokens || this.tokenizer.countTokens(msg.content) + 4), 0),
      strategy: 'drop_oldest'
    };
  }

  /**
   * Drop messages from the middle, preserving start and end
   */
  private dropMiddleMessages(
    contextWindow: ContextWindow,
    targetTokens: number,
    options: ContextCompressionOptions
  ): ContextTrimResult {
    const messages = [...contextWindow.messages];
    const removedMessages: Message[] = [];
    let currentTokens = this.analyzeContext(contextWindow).totalTokens;

    if (messages.length <= options.preserveRecent * 2) {
      // Too few messages to apply middle trimming
      return this.dropOldestMessages(contextWindow, targetTokens, options);
    }

    const preserveStart = Math.floor(options.preserveRecent / 2);
    const preserveEnd = options.preserveRecent - preserveStart;
    
    const startMessages = messages.slice(0, preserveStart);
    const endMessages = messages.slice(-preserveEnd);
    const middleMessages = messages.slice(preserveStart, -preserveEnd);

    // Remove from middle
    while (currentTokens > targetTokens && middleMessages.length > 0) {
      const removed = middleMessages.shift()!;
      removedMessages.push(removed);
      currentTokens -= removed.tokens || this.tokenizer.countTokens(removed.content) + 4;
    }

    const trimmedMessages = [...startMessages, ...middleMessages, ...endMessages];
    
    return {
      trimmedMessages,
      removedMessages,
      tokensSaved: removedMessages.reduce((sum, msg) => 
        sum + (msg.tokens || this.tokenizer.countTokens(msg.content) + 4), 0),
      strategy: 'drop_middle'
    };
  }

  /**
   * Summarize older messages to save space
   */
  private async summarizeMessages(
    contextWindow: ContextWindow,
    targetTokens: number,
    options: ContextCompressionOptions
  ): Promise<ContextTrimResult> {
    const messages = [...contextWindow.messages];
    const preserved = messages.slice(-options.preserveRecent);
    const toSummarize = messages.slice(0, messages.length - options.preserveRecent);

    if (toSummarize.length === 0) {
      return this.dropOldestMessages(contextWindow, targetTokens, options);
    }

    try {
      const { getUnifiedProvider } = await import('../intelligence/unified-provider.js');
      const provider = getUnifiedProvider();
      if (!provider) throw new Error('no provider');

      const transcript = toSummarize
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');

      const summaryText = await provider.complete([
        {
          role: 'user' as const,
          content: `Summarize the following conversation history into a concise paragraph that preserves all important context, decisions, and facts. Be specific about any code, files, or technical details.\n\n${transcript}`
        }
      ], { temperature: 0.2 });

      const summaryMessage: Message = {
        role: 'assistant',
        content: `[Summary of earlier conversation: ${summaryText}]`,
        timestamp: new Date(),
        tokens: this.tokenizer.countTokens(summaryText) + 20
      };

      const tokensSaved = toSummarize.reduce((sum, m) => sum + (m.tokens || this.tokenizer.countTokens(m.content) + 4), 0);

      return {
        trimmedMessages: [summaryMessage, ...preserved],
        removedMessages: toSummarize,
        tokensSaved,
        strategy: 'summarize'
      };
    } catch {
      return this.dropOldestMessages(contextWindow, targetTokens, options);
    }
  }

  /**
   * Smart trimming that considers message importance
   */
  private smartTrimMessages(
    contextWindow: ContextWindow,
    targetTokens: number,
    options: ContextCompressionOptions
  ): ContextTrimResult {
    const messages = [...contextWindow.messages];
    const removedMessages: Message[] = [];
    let currentTokens = this.analyzeContext(contextWindow).totalTokens;

    // Score messages by importance
    const scoredMessages = messages.map((message, index) => ({
      message,
      index,
      tokens: message.tokens || this.tokenizer.countTokens(message.content) + 4,
      score: this.calculateMessageImportance(message, index, messages.length)
    }));

    // Sort by score (lowest first for removal)
    scoredMessages.sort((a, b) => a.score - b.score);

    // Remove lowest scoring messages while preserving recent ones
    const preserveIndices = new Set(
      messages.slice(-options.preserveRecent).map((_, i) => messages.length - options.preserveRecent + i)
    );

    for (const scored of scoredMessages) {
      if (currentTokens <= targetTokens) break;
      if (preserveIndices.has(scored.index)) continue;

      removedMessages.push(scored.message);
      currentTokens -= scored.tokens;
    }

    // Rebuild message list in original order
    const removedIndices = new Set(removedMessages.map(msg => 
      messages.findIndex(m => m === msg)
    ));
    
    const trimmedMessages = messages.filter((_, index) => !removedIndices.has(index));

    return {
      trimmedMessages,
      removedMessages,
      tokensSaved: removedMessages.reduce((sum, msg) => 
        sum + (msg.tokens || this.tokenizer.countTokens(msg.content) + 4), 0),
      strategy: 'smart_trim'
    };
  }

  /**
   * Calculate message importance score (higher = more important)
   */
  private calculateMessageImportance(message: Message, index: number, totalMessages: number): number {
    let score = 0;

    // Recency bonus (more recent = higher score)
    const recencyScore = index / totalMessages;
    score += recencyScore * 10;

    // Role importance
    if (message.role === 'system') {
      score += 20; // System messages are very important
    } else if (message.role === 'user') {
      score += 5; // User messages are moderately important
    }

    // Content length penalty (very long messages are less important unless they're code)
    const contentLength = message.content.length;
    if (contentLength > 2000) {
      score -= 2;
    }

    // Code detection bonus
    if (this.containsCode(message.content)) {
      score += 3;
    }

    // Error/warning detection bonus
    if (this.containsErrorsOrWarnings(message.content)) {
      score += 4;
    }

    return score;
  }

  /**
   * Detect if content contains code
   */
  private containsCode(content: string): boolean {
    // Simple heuristics for code detection
    const codeIndicators = [
      /```[\s\S]*```/g, // Code blocks
      /`[^`]+`/g, // Inline code
      /\b(function|class|import|export|const|let|var|if|for|while|return)\b/g,
      /[{}[\];]/g, // Common programming symbols
      /\b\d+\.\d+\.\d+\b/g, // Version numbers
      /https?:\/\/[^\s]+/g // URLs
    ];

    return codeIndicators.some(pattern => pattern.test(content));
  }

  /**
   * Detect if content contains errors or warnings
   */
  private containsErrorsOrWarnings(content: string): boolean {
    const errorIndicators = [
      /\b(error|fail|exception|crash|bug)\b/gi,
      /\b(warning|warn|caution)\b/gi,
      /\b(fix|solve|debug|troubleshoot)\b/gi,
      /❌|⚠️|🚨|🔴/g // Error emojis
    ];

    return errorIndicators.some(pattern => pattern.test(content));
  }

  /**
   * Check if context would exceed limits with additional content
   */
  wouldExceedLimit(
    contextWindow: ContextWindow,
    additionalContent: string,
    bufferTokens = 1000
  ): boolean {
    const currentAnalysis = this.analyzeContext(contextWindow);
    const additionalTokens = this.tokenizer.countTokens(additionalContent);
    
    return (currentAnalysis.totalTokens + additionalTokens + bufferTokens) > currentAnalysis.contextLimit;
  }

  /**
   * Estimate tokens for content
   */
  estimateTokens(content: string): number {
    return this.tokenizer.countTokens(content);
  }

  /**
   * Get context utilization summary
   */
  getUtilizationSummary(contextWindow: ContextWindow): {
    analysis: ContextAnalysis;
    recommendations: string[];
  } {
    const analysis = this.analyzeContext(contextWindow);
    const recommendations: string[] = [];

    if (analysis.exceedsLimit) {
      recommendations.push('Context limit exceeded - immediate trimming required');
    } else if (analysis.utilizationPercent > 90) {
      recommendations.push('Context usage very high - consider trimming or summarizing');
    } else if (analysis.utilizationPercent > 80) {
      recommendations.push('Context usage high - monitor for next message');
    }

    if (analysis.messageTokens > analysis.contextLimit * 0.6) {
      recommendations.push('Message history is consuming most context - consider compression');
    }

    if (analysis.toolTokens > analysis.contextLimit * 0.2) {
      recommendations.push('Tool definitions are using significant context - consider reducing tools');
    }

    return { analysis, recommendations };
  }

  /**
   * Update tokenizer for different model
   */
  async updateForModel(modelName: string): Promise<void> {
    await this.tokenizer.updateForModel(modelName);
  }

  /**
   * Enable or disable automatic context compression
   */
  setCompressionEnabled(enabled: boolean): void {
    this.compressionEnabled = enabled;
  }

  /**
   * Update default compression options
   */
  updateCompressionOptions(options: Partial<ContextCompressionOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }
}