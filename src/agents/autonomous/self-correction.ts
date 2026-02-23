/**
 * Self-Correction Loop
 *
 * Handles failure recovery and learning from mistakes in the autonomous agent system.
 *
 * Features:
 * - Multiple correction strategies
 * - Pattern-based error recognition
 * - Learning from successful corrections
 * - Adaptive retry logic
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import type {
  CorrectionAttempt,
  CorrectionConfig,
  ExecutionError,
  ExecutionStep,
  LearningEntry,
  VerificationReport} from './types.js';
import {
  CorrectionStrategy,
  DEFAULT_CORRECTION_CONFIG,
  VerificationResult
} from './types.js';
import type { OllamaBackend } from './ollama-backend.js';
import { getOllamaBackend } from './ollama-backend.js';
import type { ReasoningEngine } from './reasoning-engine.js';
import { getReasoningEngine } from './reasoning-engine.js';

// ============================================================================
// Types
// ============================================================================

interface ErrorPattern {
  pattern: RegExp;
  category: string;
  suggestedStrategy: CorrectionStrategy;
  fixTemplate?: string;
}

interface CorrectionResult {
  success: boolean;
  attempt: CorrectionAttempt;
  newApproach?: string;
  decomposedSteps?: string[];
}

// ============================================================================
// Error Patterns
// ============================================================================

const ERROR_PATTERNS: ErrorPattern[] = [
  // Syntax errors
  {
    pattern: /SyntaxError|Unexpected token|Parse error/i,
    category: 'syntax',
    suggestedStrategy: CorrectionStrategy.MODIFY_APPROACH,
    fixTemplate: 'Fix the syntax error by correcting the code structure'
  },
  // Type errors
  {
    pattern: /TypeError|is not a function|undefined is not|cannot read property/i,
    category: 'type',
    suggestedStrategy: CorrectionStrategy.MODIFY_APPROACH,
    fixTemplate: 'Fix the type error by ensuring correct types and null checks'
  },
  // Import/module errors
  {
    pattern: /Cannot find module|Module not found|import.*from/i,
    category: 'import',
    suggestedStrategy: CorrectionStrategy.RETRY_SAME,
    fixTemplate: 'Check import paths and ensure dependencies are installed'
  },
  // Permission errors
  {
    pattern: /EACCES|Permission denied|EPERM/i,
    category: 'permission',
    suggestedStrategy: CorrectionStrategy.REQUEST_HELP,
    fixTemplate: 'Request elevated permissions or alternative approach'
  },
  // Network errors
  {
    pattern: /ECONNREFUSED|ETIMEDOUT|network|fetch failed/i,
    category: 'network',
    suggestedStrategy: CorrectionStrategy.RETRY_SAME
  },
  // File system errors
  {
    pattern: /ENOENT|no such file|file not found/i,
    category: 'filesystem',
    suggestedStrategy: CorrectionStrategy.MODIFY_APPROACH,
    fixTemplate: 'Verify file paths and create missing directories'
  },
  // Memory errors
  {
    pattern: /out of memory|heap|memory limit/i,
    category: 'memory',
    suggestedStrategy: CorrectionStrategy.DECOMPOSE_FURTHER
  },
  // Timeout errors
  {
    pattern: /timeout|timed out|ETIMEDOUT/i,
    category: 'timeout',
    suggestedStrategy: CorrectionStrategy.RETRY_SAME
  },
  // Compilation errors
  {
    pattern: /error TS\d+|compilation failed|build failed/i,
    category: 'compilation',
    suggestedStrategy: CorrectionStrategy.MODIFY_APPROACH
  },
  // Test failures
  {
    pattern: /test failed|assertion|expect.*to/i,
    category: 'test',
    suggestedStrategy: CorrectionStrategy.MODIFY_APPROACH
  },
  // Git errors
  {
    pattern: /git.*error|merge conflict|not a git repository/i,
    category: 'git',
    suggestedStrategy: CorrectionStrategy.REQUEST_HELP
  },
  // API errors
  {
    pattern: /rate limit|429|401|403|500|502|503/i,
    category: 'api',
    suggestedStrategy: CorrectionStrategy.RETRY_SAME
  }
];

// ============================================================================
// Self-Correction Loop
// ============================================================================

export class SelfCorrectionLoop extends EventEmitter {
  private config: CorrectionConfig;
  private ollama: OllamaBackend;
  private reasoning: ReasoningEngine;
  private learningStore: Map<string, LearningEntry> = new Map();
  private correctionHistory: CorrectionAttempt[] = [];
  private persistencePath: string;

  constructor(config: Partial<CorrectionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CORRECTION_CONFIG, ...config };
    this.ollama = getOllamaBackend();
    this.reasoning = getReasoningEngine();
    this.persistencePath = path.join(process.cwd(), '.canvas-cli', 'learning');
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.config.enableLearning) {
      await this.loadLearningData();
    }
  }

  // ==========================================================================
  // Main Correction Interface
  // ==========================================================================

  async attemptCorrection(
    step: ExecutionStep,
    error: ExecutionError,
    context: string,
    previousAttempts: CorrectionAttempt[] = []
  ): Promise<CorrectionResult> {
    const attemptId = uuidv4();
    const startTime = Date.now();

    this.emit('correction_started', { attemptId, stepId: step.id, error });

    // Determine best strategy
    const strategy = await this.selectStrategy(error, previousAttempts, step);

    this.emit('strategy_selected', { attemptId, strategy });

    let result: CorrectionResult;

    switch (strategy) {
      case CorrectionStrategy.RETRY_SAME:
        result = await this.retrySame(attemptId, step, error, startTime);
        break;

      case CorrectionStrategy.MODIFY_APPROACH:
        result = await this.modifyApproach(attemptId, step, error, context, startTime);
        break;

      case CorrectionStrategy.DECOMPOSE_FURTHER:
        result = await this.decomposeFurther(attemptId, step, error, context, startTime);
        break;

      case CorrectionStrategy.REQUEST_HELP:
        result = await this.requestHelp(attemptId, step, error, startTime);
        break;

      case CorrectionStrategy.SKIP_STEP:
        result = await this.skipStep(attemptId, step, error, startTime);
        break;

      case CorrectionStrategy.ABORT:
        result = await this.abort(attemptId, step, error, startTime);
        break;

      default:
        result = await this.retrySame(attemptId, step, error, startTime);
    }

    // Record history
    this.correctionHistory.push(result.attempt);

    // Learn from result if enabled
    if (this.config.enableLearning) {
      await this.learn(error, strategy, result.success, context);
    }

    this.emit('correction_completed', { attemptId, result });
    return result;
  }

  async handleVerificationFailure(
    step: ExecutionStep,
    report: VerificationReport,
    context: string
  ): Promise<CorrectionResult> {
    // Convert verification failure to an error
    const failedChecks = report.checks.filter(c => !c.passed);
    const errorMessage = failedChecks.map(c => c.message).join('; ');

    const error: ExecutionError = {
      code: 'VERIFICATION_FAILED',
      message: errorMessage,
      type: 'logic',
      recoverable: true,
      suggestedFix: report.suggestions?.join('; ')
    };

    return this.attemptCorrection(step, error, context);
  }

  // ==========================================================================
  // Correction Strategies
  // ==========================================================================

  private async retrySame(
    attemptId: string,
    step: ExecutionStep,
    error: ExecutionError,
    startTime: number
  ): Promise<CorrectionResult> {
    // Simple retry with exponential backoff
    const backoffMs = Math.min(1000 * Math.pow(2, step.retryCount), 30000);

    await this.delay(backoffMs);

    const attempt: CorrectionAttempt = {
      id: attemptId,
      stepId: step.id,
      error,
      strategy: CorrectionStrategy.RETRY_SAME,
      modification: `Retry after ${backoffMs}ms delay`,
      successful: false, // Will be determined by execution
      timestamp: new Date(),
      duration: Date.now() - startTime
    };

    return { success: true, attempt };
  }

  private async modifyApproach(
    attemptId: string,
    step: ExecutionStep,
    error: ExecutionError,
    context: string,
    startTime: number
  ): Promise<CorrectionResult> {
    // Use AI to generate a modified approach
    const model = this.ollama.selectModelForCapability('reasoning');

    try {
      const response = await this.ollama.generate({
        model,
        prompt: `Original task: ${step.description}

Error encountered: ${error.message}
${error.stackTrace ? `Stack trace: ${error.stackTrace.substring(0, 500)}` : ''}

Context: ${context}

Generate a modified approach that avoids this error.`,
        system: `You are an expert debugger. Analyze the error and suggest a modified approach.

Output JSON:
{
  "analysis": "What went wrong",
  "modifiedApproach": "New approach to try",
  "codeChanges": "Specific code modifications if applicable",
  "confidence": 0.0-1.0
}`,
        format: 'json',
        options: {
          temperature: 0.4,
          num_predict: 2000
        }
      });

      const result = JSON.parse(response.response);

      const attempt: CorrectionAttempt = {
        id: attemptId,
        stepId: step.id,
        error,
        strategy: CorrectionStrategy.MODIFY_APPROACH,
        modification: result.modifiedApproach || result.codeChanges || 'Modified approach',
        successful: false,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };

      return {
        success: result.confidence >= 0.5,
        attempt,
        newApproach: result.modifiedApproach
      };
    } catch {
      const attempt: CorrectionAttempt = {
        id: attemptId,
        stepId: step.id,
        error,
        strategy: CorrectionStrategy.MODIFY_APPROACH,
        modification: 'Failed to generate modified approach',
        successful: false,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };

      return { success: false, attempt };
    }
  }

  private async decomposeFurther(
    attemptId: string,
    step: ExecutionStep,
    error: ExecutionError,
    context: string,
    startTime: number
  ): Promise<CorrectionResult> {
    // Break down the step into smaller sub-steps
    const model = this.ollama.selectModelForCapability('planning');

    try {
      const response = await this.ollama.generate({
        model,
        prompt: `Task that failed: ${step.description}

Error: ${error.message}

Break this task into smaller, more manageable steps that might avoid the error.`,
        system: `You are a task decomposition expert. Break complex tasks into simpler steps.

Output JSON:
{
  "subSteps": [
    {"description": "Step description", "type": "code_modification|file_operation|shell_command|etc"}
  ],
  "reasoning": "Why this decomposition helps"
}`,
        format: 'json',
        options: {
          temperature: 0.4,
          num_predict: 2000
        }
      });

      const result = JSON.parse(response.response);

      const attempt: CorrectionAttempt = {
        id: attemptId,
        stepId: step.id,
        error,
        strategy: CorrectionStrategy.DECOMPOSE_FURTHER,
        modification: `Decomposed into ${result.subSteps?.length || 0} sub-steps`,
        successful: result.subSteps?.length > 0,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };

      return {
        success: result.subSteps?.length > 0,
        attempt,
        decomposedSteps: result.subSteps?.map((s: any) => s.description)
      };
    } catch {
      const attempt: CorrectionAttempt = {
        id: attemptId,
        stepId: step.id,
        error,
        strategy: CorrectionStrategy.DECOMPOSE_FURTHER,
        modification: 'Failed to decompose task',
        successful: false,
        timestamp: new Date(),
        duration: Date.now() - startTime
      };

      return { success: false, attempt };
    }
  }

  private async requestHelp(
    attemptId: string,
    step: ExecutionStep,
    error: ExecutionError,
    startTime: number
  ): Promise<CorrectionResult> {
    // Generate a help request for human intervention
    const model = this.ollama.selectModelForCapability('reasoning');

    let helpMessage = `Need assistance with: ${step.description}\n\nError: ${error.message}`;

    try {
      const response = await this.ollama.generate({
        model,
        prompt: `Task: ${step.description}
Error: ${error.message}

Generate a clear, concise help request explaining:
1. What was being attempted
2. What went wrong
3. What information or action is needed from the user`,
        system: 'Generate a helpful message requesting user assistance.',
        options: {
          temperature: 0.3,
          num_predict: 500
        }
      });

      helpMessage = response.response;
    } catch {
      // Use default message
    }

    const attempt: CorrectionAttempt = {
      id: attemptId,
      stepId: step.id,
      error,
      strategy: CorrectionStrategy.REQUEST_HELP,
      modification: helpMessage,
      successful: false, // Requires human response
      timestamp: new Date(),
      duration: Date.now() - startTime
    };

    this.emit('help_requested', { attemptId, stepId: step.id, message: helpMessage });

    return { success: false, attempt };
  }

  private async skipStep(
    attemptId: string,
    step: ExecutionStep,
    error: ExecutionError,
    startTime: number
  ): Promise<CorrectionResult> {
    const attempt: CorrectionAttempt = {
      id: attemptId,
      stepId: step.id,
      error,
      strategy: CorrectionStrategy.SKIP_STEP,
      modification: 'Step skipped due to unrecoverable error',
      successful: true, // Skip is "successful" in that we move on
      timestamp: new Date(),
      duration: Date.now() - startTime
    };

    this.emit('step_skipped', { attemptId, stepId: step.id, reason: error.message });

    return { success: true, attempt };
  }

  private async abort(
    attemptId: string,
    step: ExecutionStep,
    error: ExecutionError,
    startTime: number
  ): Promise<CorrectionResult> {
    const attempt: CorrectionAttempt = {
      id: attemptId,
      stepId: step.id,
      error,
      strategy: CorrectionStrategy.ABORT,
      modification: 'Execution aborted',
      successful: false,
      timestamp: new Date(),
      duration: Date.now() - startTime
    };

    this.emit('execution_aborted', { attemptId, stepId: step.id, error });

    return { success: false, attempt };
  }

  // ==========================================================================
  // Strategy Selection
  // ==========================================================================

  private async selectStrategy(
    error: ExecutionError,
    previousAttempts: CorrectionAttempt[],
    step: ExecutionStep
  ): Promise<CorrectionStrategy> {
    // Check if we've exceeded max retries
    if (step.retryCount >= this.config.maxRetries) {
      // If aggressive recovery, try decomposition before giving up
      if (this.config.aggressiveRecovery) {
        const hasTriedDecompose = previousAttempts.some(
          a => a.strategy === CorrectionStrategy.DECOMPOSE_FURTHER
        );
        if (!hasTriedDecompose) {
          return CorrectionStrategy.DECOMPOSE_FURTHER;
        }
      }
      return error.recoverable ? CorrectionStrategy.REQUEST_HELP : CorrectionStrategy.ABORT;
    }

    // Check learning store for known patterns
    if (this.config.enableLearning) {
      const learnedStrategy = this.getLearnedStrategy(error);
      if (learnedStrategy) {
        return learnedStrategy;
      }
    }

    // Match against error patterns
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(error.message)) {
        // Check if this strategy is allowed
        if (this.config.strategies.includes(pattern.suggestedStrategy)) {
          return pattern.suggestedStrategy;
        }
      }
    }

    // Default strategy based on error type
    switch (error.type) {
      case 'syntax':
      case 'logic':
        return CorrectionStrategy.MODIFY_APPROACH;

      case 'timeout':
      case 'external':
        return CorrectionStrategy.RETRY_SAME;

      case 'permission':
        return CorrectionStrategy.REQUEST_HELP;

      case 'runtime':
        // If previous attempt was retry, try modification
        if (previousAttempts.some(a => a.strategy === CorrectionStrategy.RETRY_SAME)) {
          return CorrectionStrategy.MODIFY_APPROACH;
        }
        return CorrectionStrategy.RETRY_SAME;

      default:
        return CorrectionStrategy.RETRY_SAME;
    }
  }

  private getLearnedStrategy(error: ExecutionError): CorrectionStrategy | null {
    // Create error signature for lookup
    const signature = this.createErrorSignature(error);

    const learned = this.learningStore.get(signature);
    if (learned && learned.frequency >= 3) { // Only use if seen multiple times
      return learned.successfulStrategy;
    }

    return null;
  }

  private createErrorSignature(error: ExecutionError): string {
    // Create a normalized signature for the error
    const normalizedMessage = error.message
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/['"][^'"]*['"]/g, 'STR') // Replace string literals
      .replace(/\/[^\s]+/g, 'PATH') // Replace paths
      .toLowerCase();

    return `${error.type}:${normalizedMessage.substring(0, 100)}`;
  }

  // ==========================================================================
  // Learning
  // ==========================================================================

  private async learn(
    error: ExecutionError,
    strategy: CorrectionStrategy,
    successful: boolean,
    context: string
  ): Promise<void> {
    if (!successful) return; // Only learn from successes

    const signature = this.createErrorSignature(error);

    const existing = this.learningStore.get(signature);
    if (existing) {
      // Update existing entry
      existing.frequency++;
      existing.lastOccurrence = new Date();
      // Update strategy only if this one is faster
      if (strategy === existing.successfulStrategy) {
        // Reinforce
      } else {
        // Consider updating if this strategy seems better
      }
    } else {
      // Create new entry
      this.learningStore.set(signature, {
        errorPattern: signature,
        successfulStrategy: strategy,
        context: context.substring(0, 200),
        frequency: 1,
        lastOccurrence: new Date(),
        averageRecoveryTime: 0
      });
    }

    // Persist periodically
    if (this.learningStore.size % 10 === 0) {
      await this.saveLearningData();
    }
  }

  private async loadLearningData(): Promise<void> {
    try {
      const dataPath = path.join(this.persistencePath, 'corrections.json');
      if (await fs.pathExists(dataPath)) {
        const data = await fs.readJson(dataPath);
        for (const entry of data.entries || []) {
          this.learningStore.set(entry.errorPattern, entry);
        }
        this.emit('learning_loaded', { count: this.learningStore.size });
      }
    } catch {
      // Start fresh if load fails
    }
  }

  private async saveLearningData(): Promise<void> {
    try {
      await fs.ensureDir(this.persistencePath);
      const dataPath = path.join(this.persistencePath, 'corrections.json');

      const entries = Array.from(this.learningStore.values());

      await fs.writeJson(dataPath, {
        version: 1,
        savedAt: new Date(),
        entries
      }, { spaces: 2 });

      this.emit('learning_saved', { count: entries.length });
    } catch (error) {
      this.emit('learning_save_failed', { error });
    }
  }

  // ==========================================================================
  // Analysis & Suggestions
  // ==========================================================================

  async analyzeError(error: ExecutionError): Promise<{
    category: string;
    suggestedStrategies: CorrectionStrategy[];
    explanation: string;
    possibleFixes: string[];
  }> {
    let category = 'unknown';
    const suggestedStrategies: CorrectionStrategy[] = [];
    const possibleFixes: string[] = [];

    // Match against patterns
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(error.message)) {
        category = pattern.category;
        suggestedStrategies.push(pattern.suggestedStrategy);
        if (pattern.fixTemplate) {
          possibleFixes.push(pattern.fixTemplate);
        }
        break;
      }
    }

    // Use AI for more detailed analysis
    const model = this.ollama.selectModelForCapability('reasoning');

    try {
      const response = await this.ollama.generate({
        model,
        prompt: `Error: ${error.message}
Type: ${error.type}
${error.stackTrace ? `Stack: ${error.stackTrace.substring(0, 300)}` : ''}

Analyze this error and suggest fixes.`,
        system: `Analyze the error and provide:
1. What went wrong
2. Why it happened
3. How to fix it

Output JSON:
{
  "explanation": "What happened",
  "possibleFixes": ["fix 1", "fix 2"]
}`,
        format: 'json',
        options: {
          temperature: 0.3,
          num_predict: 1000
        }
      });

      const result = JSON.parse(response.response);

      return {
        category,
        suggestedStrategies: suggestedStrategies.length > 0
          ? suggestedStrategies
          : [CorrectionStrategy.MODIFY_APPROACH],
        explanation: result.explanation || 'Error analysis unavailable',
        possibleFixes: [...possibleFixes, ...(result.possibleFixes || [])]
      };
    } catch {
      return {
        category,
        suggestedStrategies: suggestedStrategies.length > 0
          ? suggestedStrategies
          : [CorrectionStrategy.RETRY_SAME],
        explanation: `Error type: ${error.type}`,
        possibleFixes
      };
    }
  }

  getSimilarPastErrors(error: ExecutionError, limit: number = 5): LearningEntry[] {
    const signature = this.createErrorSignature(error);
    const results: LearningEntry[] = [];

    for (const [key, entry] of this.learningStore) {
      // Simple similarity check
      if (key.startsWith(error.type) || this.stringSimilarity(key, signature) > 0.6) {
        results.push(entry);
        if (results.length >= limit) break;
      }
    }

    return results.sort((a, b) => b.frequency - a.frequency);
  }

  private stringSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  // ==========================================================================
  // Statistics & History
  // ==========================================================================

  getStatistics(): {
    totalCorrections: number;
    successRate: number;
    byStrategy: Record<CorrectionStrategy, { count: number; successRate: number }>;
    byErrorType: Record<string, number>;
    learningEntries: number;
  } {
    const byStrategy: Record<string, { count: number; successes: number }> = {};
    const byErrorType: Record<string, number> = {};

    for (const attempt of this.correctionHistory) {
      // By strategy
      const key = attempt.strategy;
      if (!byStrategy[key]) {
        byStrategy[key] = { count: 0, successes: 0 };
      }
      byStrategy[key].count++;
      if (attempt.successful) {
        byStrategy[key].successes++;
      }

      // By error type
      const errorType = attempt.error.type;
      byErrorType[errorType] = (byErrorType[errorType] || 0) + 1;
    }

    const totalSuccesses = this.correctionHistory.filter(a => a.successful).length;

    const strategyStats: Record<CorrectionStrategy, { count: number; successRate: number }> =
      {} as any;

    for (const [strategy, stats] of Object.entries(byStrategy)) {
      strategyStats[strategy as CorrectionStrategy] = {
        count: stats.count,
        successRate: stats.count > 0 ? stats.successes / stats.count : 0
      };
    }

    return {
      totalCorrections: this.correctionHistory.length,
      successRate: this.correctionHistory.length > 0
        ? totalSuccesses / this.correctionHistory.length
        : 0,
      byStrategy: strategyStats,
      byErrorType,
      learningEntries: this.learningStore.size
    };
  }

  getRecentHistory(limit: number = 20): CorrectionAttempt[] {
    return this.correctionHistory.slice(-limit);
  }

  clearHistory(): void {
    this.correctionHistory = [];
    this.emit('history_cleared');
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  updateConfig(config: Partial<CorrectionConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): CorrectionConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let selfCorrectionInstance: SelfCorrectionLoop | null = null;

export async function getSelfCorrectionLoop(
  config?: Partial<CorrectionConfig>
): Promise<SelfCorrectionLoop> {
  if (!selfCorrectionInstance) {
    selfCorrectionInstance = new SelfCorrectionLoop(config);
    await selfCorrectionInstance.initialize();
  } else if (config) {
    selfCorrectionInstance.updateConfig(config);
  }
  return selfCorrectionInstance;
}

export function resetSelfCorrectionLoop(): void {
  if (selfCorrectionInstance) {
    selfCorrectionInstance.clearHistory();
    selfCorrectionInstance.removeAllListeners();
  }
  selfCorrectionInstance = null;
}
