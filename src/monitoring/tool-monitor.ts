/**
 * Tool monitoring and repetition detection system
 * Based on goose-cli's tool_monitor.rs
 */

export interface ToolCall {
  name: string;
  parameters: any;
  timestamp?: Date;
  executionTime?: number;
  success?: boolean;
  error?: string;
}

export interface ToolStats {
  name: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageExecutionTime: number;
  lastCalled: Date | null;
  consecutiveFailures: number;
}

export interface MonitoringConfig {
  maxRepetitions?: number;
  maxConsecutiveFailures?: number;
  cooldownPeriod?: number; // ms
  enableStatistics?: boolean;
  logVerbose?: boolean;
}

export class ToolMonitor {
  private maxRepetitions: number | null;
  private maxConsecutiveFailures: number;
  private cooldownPeriod: number;
  private enableStatistics: boolean;
  private logVerbose: boolean;
  
  private lastCall: ToolCall | null = null;
  private repeatCount: number = 0;
  private callCounts: Map<string, number> = new Map();
  private toolStats: Map<string, ToolStats> = new Map();
  private cooldowns: Map<string, Date> = new Map();
  private executionTimes: Map<string, number[]> = new Map();

  constructor(config: MonitoringConfig = {}) {
    this.maxRepetitions = config.maxRepetitions ?? 3;
    this.maxConsecutiveFailures = config.maxConsecutiveFailures ?? 5;
    this.cooldownPeriod = config.cooldownPeriod ?? 1000; // 1 second default
    this.enableStatistics = config.enableStatistics ?? true;
    this.logVerbose = config.logVerbose ?? false;
  }

  /**
   * Check if a tool call should be allowed
   * Returns false if the call should be blocked
   */
  checkToolCall(toolCall: ToolCall): {
    allowed: boolean;
    reason?: string;
    suggestion?: string;
  } {
    const now = new Date();
    toolCall.timestamp = now;

    // Check cooldown period
    if (this.isInCooldown(toolCall.name)) {
      const cooldownEnd = this.cooldowns.get(toolCall.name)!;
      const remainingMs = cooldownEnd.getTime() - now.getTime();
      return {
        allowed: false,
        reason: `Tool ${toolCall.name} is in cooldown period`,
        suggestion: `Please wait ${Math.ceil(remainingMs / 1000)} seconds before using this tool again`
      };
    }

    // Check consecutive failures
    const stats = this.getToolStats(toolCall.name);
    if (stats.consecutiveFailures >= this.maxConsecutiveFailures) {
      return {
        allowed: false,
        reason: `Tool ${toolCall.name} has ${stats.consecutiveFailures} consecutive failures`,
        suggestion: `This tool appears to be having issues. Consider using an alternative approach`
      };
    }

    // Check repetitions (if enabled)
    if (this.maxRepetitions !== null) {
      if (this.lastCall && this.matchesLastCall(toolCall)) {
        this.repeatCount++;
        if (this.repeatCount > this.maxRepetitions) {
          return {
            allowed: false,
            reason: `Tool call repeated ${this.repeatCount} times (max: ${this.maxRepetitions})`,
            suggestion: `Try a different approach or modify the parameters`
          };
        }
      } else {
        this.repeatCount = 1;
      }
    }

    // Update tracking
    this.updateCallCount(toolCall.name);
    this.lastCall = { ...toolCall };

    if (this.logVerbose) {
      console.log(`[ToolMonitor] Allowing ${toolCall.name} (attempt ${this.repeatCount})`);
    }

    return { allowed: true };
  }

  /**
   * Record the result of a tool execution
   */
  recordResult(toolCall: ToolCall, success: boolean, executionTime?: number, error?: string): void {
    const stats = this.getToolStats(toolCall.name);
    
    // Update basic stats
    stats.totalCalls++;
    stats.lastCalled = new Date();
    
    if (success) {
      stats.successfulCalls++;
      stats.consecutiveFailures = 0;
    } else {
      stats.failedCalls++;
      stats.consecutiveFailures++;
    }

    // Track execution times
    if (executionTime !== undefined) {
      if (!this.executionTimes.has(toolCall.name)) {
        this.executionTimes.set(toolCall.name, []);
      }
      const times = this.executionTimes.get(toolCall.name)!;
      times.push(executionTime);
      
      // Keep only last 100 execution times
      if (times.length > 100) {
        times.shift();
      }
      
      // Update average
      stats.averageExecutionTime = times.reduce((a, b) => a + b, 0) / times.length;
    }

    // Set cooldown if too many consecutive failures
    if (stats.consecutiveFailures >= Math.floor(this.maxConsecutiveFailures / 2)) {
      const cooldownEnd = new Date(Date.now() + this.cooldownPeriod * stats.consecutiveFailures);
      this.cooldowns.set(toolCall.name, cooldownEnd);
      
      if (this.logVerbose) {
        console.log(`[ToolMonitor] Setting cooldown for ${toolCall.name} (${stats.consecutiveFailures} failures)`);
      }
    }

    // Update stored stats
    this.toolStats.set(toolCall.name, stats);

    if (this.logVerbose) {
      console.log(`[ToolMonitor] Recorded result for ${toolCall.name}: ${success ? 'success' : 'failure'} (${executionTime}ms)`);
    }
  }

  /**
   * Get statistics for a specific tool
   */
  getToolStats(toolName: string): ToolStats {
    if (!this.toolStats.has(toolName)) {
      this.toolStats.set(toolName, {
        name: toolName,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        averageExecutionTime: 0,
        lastCalled: null,
        consecutiveFailures: 0
      });
    }
    return this.toolStats.get(toolName)!;
  }

  /**
   * Get statistics for all tools
   */
  getAllStats(): Map<string, ToolStats> {
    return new Map(this.toolStats);
  }

  /**
   * Get summary statistics
   */
  getSummaryStats(): {
    totalTools: number;
    totalCalls: number;
    successRate: number;
    toolsInCooldown: number;
    mostUsedTool: string | null;
    leastReliableTool: string | null;
  } {
    const stats = Array.from(this.toolStats.values());
    const totalCalls = stats.reduce((sum, s) => sum + s.totalCalls, 0);
    const successfulCalls = stats.reduce((sum, s) => sum + s.successfulCalls, 0);
    const successRate = totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0;
    
    const toolsInCooldown = Array.from(this.cooldowns.keys()).filter(tool => this.isInCooldown(tool)).length;
    
    const mostUsedTool = stats.length > 0 
      ? stats.reduce((max, s) => s.totalCalls > max.totalCalls ? s : max).name
      : null;
    
    const leastReliableTool = stats.filter(s => s.totalCalls > 0).length > 0
      ? stats.filter(s => s.totalCalls > 0)
          .reduce((min, s) => {
            const minRate = min.successfulCalls / min.totalCalls;
            const sRate = s.successfulCalls / s.totalCalls;
            return sRate < minRate ? s : min;
          }).name
      : null;

    return {
      totalTools: this.toolStats.size,
      totalCalls,
      successRate,
      toolsInCooldown,
      mostUsedTool,
      leastReliableTool
    };
  }

  /**
   * Reset all monitoring data
   */
  reset(): void {
    this.lastCall = null;
    this.repeatCount = 0;
    this.callCounts.clear();
    this.toolStats.clear();
    this.cooldowns.clear();
    this.executionTimes.clear();
    
    if (this.logVerbose) {
      console.log('[ToolMonitor] Reset all monitoring data');
    }
  }

  /**
   * Reset data for a specific tool
   */
  resetTool(toolName: string): void {
    this.callCounts.delete(toolName);
    this.toolStats.delete(toolName);
    this.cooldowns.delete(toolName);
    this.executionTimes.delete(toolName);
    
    if (this.lastCall?.name === toolName) {
      this.lastCall = null;
      this.repeatCount = 0;
    }
    
    if (this.logVerbose) {
      console.log(`[ToolMonitor] Reset data for ${toolName}`);
    }
  }

  /**
   * Force clear cooldown for a tool
   */
  clearCooldown(toolName: string): void {
    this.cooldowns.delete(toolName);
    if (this.logVerbose) {
      console.log(`[ToolMonitor] Cleared cooldown for ${toolName}`);
    }
  }

  /**
   * Get tools currently in cooldown
   */
  getToolsInCooldown(): Array<{name: string, cooldownEnds: Date}> {
    const result: Array<{name: string, cooldownEnds: Date}> = [];
    const now = new Date();
    
    for (const [toolName, cooldownEnd] of this.cooldowns.entries()) {
      if (cooldownEnd > now) {
        result.push({ name: toolName, cooldownEnds: cooldownEnd });
      } else {
        // Clean up expired cooldowns
        this.cooldowns.delete(toolName);
      }
    }
    
    return result;
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(config: Partial<MonitoringConfig>): void {
    if (config.maxRepetitions !== undefined) {
      this.maxRepetitions = config.maxRepetitions;
    }
    if (config.maxConsecutiveFailures !== undefined) {
      this.maxConsecutiveFailures = config.maxConsecutiveFailures;
    }
    if (config.cooldownPeriod !== undefined) {
      this.cooldownPeriod = config.cooldownPeriod;
    }
    if (config.enableStatistics !== undefined) {
      this.enableStatistics = config.enableStatistics;
    }
    if (config.logVerbose !== undefined) {
      this.logVerbose = config.logVerbose;
    }
  }

  /**
   * Export monitoring data for persistence
   */
  exportData(): any {
    return {
      callCounts: Object.fromEntries(this.callCounts),
      toolStats: Object.fromEntries(this.toolStats),
      cooldowns: Object.fromEntries(
        Array.from(this.cooldowns.entries()).map(([k, v]) => [k, v.toISOString()])
      ),
      executionTimes: Object.fromEntries(this.executionTimes),
      lastCall: this.lastCall,
      repeatCount: this.repeatCount
    };
  }

  /**
   * Import monitoring data from persistence
   */
  importData(data: any): void {
    if (data.callCounts) {
      this.callCounts = new Map(Object.entries(data.callCounts));
    }
    if (data.toolStats) {
      this.toolStats = new Map(Object.entries(data.toolStats));
    }
    if (data.cooldowns) {
      this.cooldowns = new Map(
        Object.entries(data.cooldowns).map(([k, v]) => [k, new Date(v as string)])
      );
    }
    if (data.executionTimes) {
      this.executionTimes = new Map(Object.entries(data.executionTimes));
    }
    if (data.lastCall) {
      this.lastCall = data.lastCall;
    }
    if (data.repeatCount !== undefined) {
      this.repeatCount = data.repeatCount;
    }
  }

  // Private methods

  private matchesLastCall(toolCall: ToolCall): boolean {
    if (!this.lastCall) return false;
    
    return this.lastCall.name === toolCall.name && 
           JSON.stringify(this.lastCall.parameters) === JSON.stringify(toolCall.parameters);
  }

  private updateCallCount(toolName: string): void {
    const current = this.callCounts.get(toolName) || 0;
    this.callCounts.set(toolName, current + 1);
  }

  private isInCooldown(toolName: string): boolean {
    const cooldownEnd = this.cooldowns.get(toolName);
    if (!cooldownEnd) return false;
    
    const now = new Date();
    if (cooldownEnd <= now) {
      // Clean up expired cooldown
      this.cooldowns.delete(toolName);
      return false;
    }
    
    return true;
  }
}