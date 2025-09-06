import { loadConfig } from '../config.js';
import { EventEmitter } from 'events';
import { confirmationService } from '../utils/confirmation-service.js';
import { errorHandler, CircuitBreaker, withTimeout } from '../utils/error-handler.js';
import { performanceConfig } from '../config/performance.js';
import { TokenCounter } from '../utils/token-counter.js';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: any) => Promise<any>;
  requiresConfirmation?: boolean;
  costEstimate?: (params: any) => number;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
  tokenCost?: number;
  retries?: number;
}

export interface ToolExecutionContext {
  toolName: string;
  parameters: any;
  round: number;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

export class ToolExecutor extends EventEmitter {
  private tools: Map<string, Tool> = new Map();
  private executionHistory: ToolExecutionContext[] = [];
  private currentRound: number = 0;
  private maxRounds: number;
  private maxConcurrent: number;
  private cooldownMs: number;
  private activeExecutions: Set<string> = new Set();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private tokenCounter: TokenCounter;
  private lastExecutionTime: Map<string, number> = new Map();

  constructor(model: string = 'gpt-4') {
    super();
    const config = performanceConfig.getConfig();
    this.maxRounds = config.toolLimits.maxRounds;
    this.maxConcurrent = config.toolLimits.maxConcurrent;
    this.cooldownMs = config.toolLimits.cooldownMs;
    this.tokenCounter = new TokenCounter(model);
  }

  /**
   * Register a tool
   */
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.circuitBreakers.set(tool.name, new CircuitBreaker());
    this.emit('tool-registered', tool.name);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): void {
    this.tools.delete(name);
    this.circuitBreakers.delete(name);
    this.emit('tool-unregistered', name);
  }

  /**
   * Execute a tool with all safety checks
   */
  async execute(
    toolName: string,
    parameters: any,
    context?: Partial<ToolExecutionContext>
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    let retries = 0;

    try {
      // Check if tool exists
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`Tool "${toolName}" not found`);
      }

      // Check execution limits
      this.checkExecutionLimits();

      // Check cooldown
      await this.checkCooldown(toolName);

      // Create execution context
      const executionContext: ToolExecutionContext = {
        toolName,
        parameters,
        round: this.currentRound,
        timestamp: new Date(),
        ...context
      };

      // Log execution
      this.executionHistory.push(executionContext);
      this.emit('tool-execution-start', executionContext);

      // Request confirmation if needed
      if (tool.requiresConfirmation) {
        const confirmed = await this.requestConfirmation(tool, parameters);
        if (!confirmed) {
          return {
            success: false,
            error: 'Execution cancelled by user',
            duration: Date.now() - startTime
          };
        }
      }

      // Mark as active
      const executionId = `${toolName}-${Date.now()}`;
      this.activeExecutions.add(executionId);

      // Get circuit breaker
      const circuitBreaker = this.circuitBreakers.get(toolName)!;

      // Execute with circuit breaker and retry logic
      const result = await errorHandler.withRetry(
        async () => {
          return await circuitBreaker.execute(async () => {
            // Execute with timeout
            const timeout = this.getToolTimeout(toolName);
            return await withTimeout(
              tool.execute(parameters),
              timeout,
              `Tool ${toolName}`
            );
          });
        },
        `tool-${toolName}`,
        {
          maxRetries: 3,
          onRetry: (attempt) => {
            retries = attempt;
            this.emit('tool-retry', { toolName, attempt, parameters });
          }
        }
      );

      // Calculate token cost if applicable
      let tokenCost: number | undefined;
      if (tool.costEstimate) {
        tokenCost = tool.costEstimate(parameters);
      } else if (typeof result === 'string') {
        tokenCost = this.tokenCounter.countTokens(result);
      }

      // Mark as completed
      this.activeExecutions.delete(executionId);
      this.lastExecutionTime.set(toolName, Date.now());

      // Emit success event
      this.emit('tool-execution-success', {
        ...executionContext,
        result,
        duration: Date.now() - startTime
      });

      return {
        success: true,
        output: result,
        duration: Date.now() - startTime,
        tokenCost,
        retries
      };

    } catch (error: any) {
      // Handle error
      errorHandler.handleError(`tool-${toolName}`, error, { parameters });
      
      this.emit('tool-execution-error', {
        toolName,
        error,
        parameters,
        duration: Date.now() - startTime
      });

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        retries
      };
    }
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeBatch(
    executions: Array<{ toolName: string; parameters: any }>
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const batches = this.createBatches(executions, this.maxConcurrent);

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(exec => this.execute(exec.toolName, exec.parameters))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Execute tools in sequence with continuation
   */
  async executeSequence(
    executions: Array<{ toolName: string; parameters: any; continueOnError?: boolean }>
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const exec of executions) {
      const result = await this.execute(exec.toolName, exec.parameters);
      results.push(result);

      if (!result.success && !exec.continueOnError) {
        break;
      }
    }

    return results;
  }

  /**
   * Start a new execution round
   */
  startRound(): void {
    this.currentRound++;
    this.emit('round-start', this.currentRound);
  }

  /**
   * End current execution round
   */
  endRound(): void {
    this.emit('round-end', this.currentRound);
  }

  /**
   * Check execution limits
   */
  private checkExecutionLimits(): void {
    // Check max rounds
    if (this.currentRound >= this.maxRounds) {
      throw new Error(`Maximum tool rounds (${this.maxRounds}) exceeded`);
    }

    // Check concurrent executions
    if (this.activeExecutions.size >= this.maxConcurrent) {
      throw new Error(`Maximum concurrent executions (${this.maxConcurrent}) exceeded`);
    }
  }

  /**
   * Check cooldown period
   */
  private async checkCooldown(toolName: string): Promise<void> {
    const lastExecution = this.lastExecutionTime.get(toolName);
    if (!lastExecution) return;

    const timeSinceLastExecution = Date.now() - lastExecution;
    if (timeSinceLastExecution < this.cooldownMs) {
      const waitTime = this.cooldownMs - timeSinceLastExecution;
      await this.delay(waitTime);
    }
  }

  /**
   * Request confirmation for tool execution
   */
  private async requestConfirmation(tool: Tool, parameters: any): Promise<boolean> {
    const result = await confirmationService.requestConfirmation({
      operation: `Execute ${tool.name}`,
      content: JSON.stringify(parameters, null, 2),
      metadata: { tool: tool.name }
    }, 'toolExecutions');

    return result.confirmed;
  }

  /**
   * Get timeout for specific tool
   */
  private getToolTimeout(toolName: string): number {
    const config = performanceConfig.getConfig();
    
    // Tool-specific timeouts
    const toolTimeouts: Record<string, number> = {
      'search': config.timeouts.search,
      'bash': config.timeouts.command,
      'api': config.timeouts.api
    };

    return toolTimeouts[toolName] || config.timeouts.tool;
  }

  /**
   * Create batches for parallel execution
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get execution statistics
   */
  getStatistics(): {
    totalExecutions: number;
    currentRound: number;
    activeExecutions: number;
    successRate: number;
    averageDuration: number;
    toolUsage: Record<string, number>;
  } {
    const toolUsage: Record<string, number> = {};
    let totalDuration = 0;
    let successCount = 0;

    for (const execution of this.executionHistory) {
      toolUsage[execution.toolName] = (toolUsage[execution.toolName] || 0) + 1;
    }

    return {
      totalExecutions: this.executionHistory.length,
      currentRound: this.currentRound,
      activeExecutions: this.activeExecutions.size,
      successRate: this.executionHistory.length > 0 ? successCount / this.executionHistory.length : 0,
      averageDuration: this.executionHistory.length > 0 ? totalDuration / this.executionHistory.length : 0,
      toolUsage
    };
  }

  /**
   * Reset executor state
   */
  reset(): void {
    this.currentRound = 0;
    this.executionHistory = [];
    this.activeExecutions.clear();
    this.lastExecutionTime.clear();
    
    // Reset circuit breakers
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
    
    this.emit('reset');
  }

  /**
   * Get execution history
   */
  getHistory(limit?: number): ToolExecutionContext[] {
    if (limit) {
      return this.executionHistory.slice(-limit);
    }
    return [...this.executionHistory];
  }

  /**
   * Check if tool is available
   */
  isToolAvailable(toolName: string): boolean {
    if (!this.tools.has(toolName)) {
      return false;
    }

    const breaker = this.circuitBreakers.get(toolName);
    return breaker ? breaker.getState() !== 'open' : false;
  }

  /**
   * Get available tools
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys()).filter(name => this.isToolAvailable(name));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<{
    maxRounds: number;
    maxConcurrent: number;
    cooldownMs: number;
  }>): void {
    if (config.maxRounds !== undefined) {
      this.maxRounds = config.maxRounds;
    }
    if (config.maxConcurrent !== undefined) {
      this.maxConcurrent = config.maxConcurrent;
    }
    if (config.cooldownMs !== undefined) {
      this.cooldownMs = config.cooldownMs;
    }
    
    this.emit('config-updated', config);
  }
}

/**
 * Tool registry for managing available tools
 */
export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, Tool> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  /**
   * Register a tool with category
   */
  register(tool: Tool, category: string = 'general'): void {
    this.tools.set(tool.name, tool);
    
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(tool.name);
  }

  /**
   * Get tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tools by category
   */
  getByCategory(category: string): Tool[] {
    const toolNames = this.categories.get(category);
    if (!toolNames) return [];
    
    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter(Boolean) as Tool[];
  }

  /**
   * Get all tools
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Search tools by description
   */
  search(query: string): Tool[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(tool => 
      tool.name.toLowerCase().includes(lowerQuery) ||
      tool.description.toLowerCase().includes(lowerQuery)
    );
  }
}

// Export singleton instances
export const toolRegistry = ToolRegistry.getInstance();