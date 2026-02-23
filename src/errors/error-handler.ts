/**
 * Central error handler with recovery strategies
 */

import type { 
  RecoveryAction} from './error-types.js';
import { 
  CanvasError, 
  ErrorType, 
  ErrorSeverity,
  isRetryableError,
  isRecoverableError,
  wrapError 
} from './error-types.js';

export interface ErrorHandlerConfig {
  maxRetryAttempts: number;
  retryBaseDelay: number;
  retryMultiplier: number;
  enableAutoRecovery: boolean;
  logErrors: boolean;
  reportErrors: boolean;
}

export interface ErrorStats {
  totalErrors: number;
  errorsByType: Map<ErrorType, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  retriedErrors: number;
  recoveredErrors: number;
  lastError?: CanvasError;
  errorRate: number; // errors per minute
}

export interface RecoveryResult {
  success: boolean;
  action: RecoveryAction;
  newError?: CanvasError;
  data?: any;
}

export type ErrorListener = (error: CanvasError) => void | Promise<void>;
export type RecoveryHandler = (error: CanvasError, action: RecoveryAction) => Promise<RecoveryResult>;

/**
 * Central error handler for Canvas CLI
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private stats: ErrorStats;
  private listeners: Set<ErrorListener> = new Set();
  private recoveryHandlers: Map<RecoveryAction['type'], RecoveryHandler> = new Map();
  private errorHistory: CanvasError[] = [];
  private retryAttempts: Map<string, number> = new Map();
  private startTime: Date;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = {
      maxRetryAttempts: 3,
      retryBaseDelay: 1000,
      retryMultiplier: 2,
      enableAutoRecovery: true,
      logErrors: true,
      reportErrors: false,
      ...config
    };

    this.stats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      retriedErrors: 0,
      recoveredErrors: 0,
      errorRate: 0
    };

    this.startTime = new Date();
    this.setupDefaultRecoveryHandlers();
  }

  /**
   * Handle an error with automatic recovery attempts
   */
  async handle(error: any, context: string = 'unknown'): Promise<CanvasError> {
    const canvasError = error instanceof CanvasError ? error : wrapError(error, ErrorType.UNKNOWN, { operation: context });
    
    // Update statistics
    this.updateStats(canvasError);
    
    // Log error if enabled
    if (this.config.logErrors) {
      this.logError(canvasError);
    }

    // Store in history
    this.errorHistory.push(canvasError);
    if (this.errorHistory.length > 100) {
      this.errorHistory.shift(); // Keep only last 100 errors
    }

    // Notify listeners
    await this.notifyListeners(canvasError);

    // Attempt automatic recovery if enabled
    if (this.config.enableAutoRecovery && canvasError.recoverable) {
      const recoveryResult = await this.attemptRecovery(canvasError);
      if (recoveryResult) {
        if (recoveryResult.success) {
          this.stats.recoveredErrors++;
          return canvasError; // Return original error but mark as recovered
        } else if (recoveryResult.newError) {
          return await this.handle(recoveryResult.newError, context);
        }
      }
    }

    return canvasError;
  }

  /**
   * Attempt to recover from an error
   */
  private async attemptRecovery(error: CanvasError): Promise<RecoveryResult | null> {
    const automaticActions = error.getAutomaticRecoveryActions();
    
    for (const action of automaticActions) {
      // Check retry limits for retry actions
      if (action.type === 'retry') {
        const retryKey = this.getRetryKey(error);
        const attempts = this.retryAttempts.get(retryKey) || 0;
        
        if (attempts >= (action.maxAttempts || this.config.maxRetryAttempts)) {
          console.warn(`Max retry attempts reached for ${retryKey}`);
          continue;
        }
        
        this.retryAttempts.set(retryKey, attempts + 1);
      }

      // Get recovery handler
      const handler = this.recoveryHandlers.get(action.type);
      if (!handler) {
        console.warn(`No recovery handler for action type: ${action.type}`);
        continue;
      }

      try {
        // Add delay if specified
        if (action.delay) {
          await this.delay(action.delay);
        }

        console.log(`Attempting recovery: ${action.description}`);
        const result = await handler(error, action);
        
        if (result.success) {
          console.log(`Recovery successful: ${action.description}`);
          return result;
        } else {
          console.warn(`Recovery failed: ${action.description}`);
          if (result.newError) {
            return result; // Return to handle new error
          }
        }
      } catch (recoveryError) {
        console.error(`Recovery handler error:`, recoveryError);
        return {
          success: false,
          action,
          newError: wrapError(recoveryError, ErrorType.INTERNAL, { operation: 'recovery' })
        };
      }
    }

    return null; // No recovery possible
  }

  /**
   * Add error listener
   */
  onError(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Add recovery handler
   */
  addRecoveryHandler(type: RecoveryAction['type'], handler: RecoveryHandler): void {
    this.recoveryHandlers.set(type, handler);
  }

  /**
   * Get error statistics
   */
  getStats(): ErrorStats & { uptime: number } {
    const uptime = Date.now() - this.startTime.getTime();
    const uptimeMinutes = uptime / (1000 * 60);
    
    return {
      ...this.stats,
      errorRate: uptimeMinutes > 0 ? this.stats.totalErrors / uptimeMinutes : 0,
      uptime
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): CanvasError[] {
    return this.errorHistory.slice(-limit);
  }

  /**
   * Clear error statistics and history
   */
  clearStats(): void {
    this.stats = {
      totalErrors: 0,
      errorsByType: new Map(),
      errorsBySeverity: new Map(),
      retriedErrors: 0,
      recoveredErrors: 0,
      errorRate: 0
    };
    this.errorHistory = [];
    this.retryAttempts.clear();
    this.startTime = new Date();
  }

  /**
   * Check if system is experiencing high error rate
   */
  isHighErrorRate(): boolean {
    return this.getStats().errorRate > 5; // More than 5 errors per minute
  }

  /**
   * Get most common error types
   */
  getTopErrorTypes(limit: number = 5): Array<{ type: ErrorType; count: number }> {
    return Array.from(this.stats.errorsByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([type, count]) => ({ type, count }));
  }

  /**
   * Export error data for debugging
   */
  exportErrorData(): any {
    return {
      config: this.config,
      stats: {
        ...this.stats,
        errorsByType: Object.fromEntries(this.stats.errorsByType),
        errorsBySeverity: Object.fromEntries(this.stats.errorsBySeverity)
      },
      recentErrors: this.getRecentErrors(20).map(error => error.toJSON()),
      retryAttempts: Object.fromEntries(this.retryAttempts),
      uptime: Date.now() - this.startTime.getTime()
    };
  }

  // Private methods

  private updateStats(error: CanvasError): void {
    this.stats.totalErrors++;
    this.stats.lastError = error;

    // Update by type
    const typeCount = this.stats.errorsByType.get(error.type) || 0;
    this.stats.errorsByType.set(error.type, typeCount + 1);

    // Update by severity
    const severityCount = this.stats.errorsBySeverity.get(error.severity) || 0;
    this.stats.errorsBySeverity.set(error.severity, severityCount + 1);

    // Check if this is a retry
    if (this.retryAttempts.has(this.getRetryKey(error))) {
      this.stats.retriedErrors++;
    }
  }

  private async notifyListeners(error: CanvasError): Promise<void> {
    const promises = Array.from(this.listeners).map(async listener => {
      try {
        await listener(error);
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError);
      }
    });
    
    await Promise.all(promises);
  }

  private logError(error: CanvasError): void {
    const logLevel = this.getSeverityLogLevel(error.severity);
    
    console[logLevel](`[${error.type}] ${error.message}`, {
      severity: error.severity,
      retryable: error.retryable,
      recoverable: error.recoverable,
      context: error.context,
      userMessage: error.userMessage
    });

    if (error.technicalMessage) {
      console.debug(`Technical details: ${error.technicalMessage}`);
    }
  }

  private getSeverityLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'debug' {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 'error';
      case ErrorSeverity.HIGH: return 'error';
      case ErrorSeverity.MEDIUM: return 'warn';
      case ErrorSeverity.LOW: return 'info';
      default: return 'debug';
    }
  }

  private getRetryKey(error: CanvasError): string {
    return `${error.type}:${error.context.operation}:${error.context.component}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private setupDefaultRecoveryHandlers(): void {
    // Retry handler
    this.addRecoveryHandler('retry', async (error, action) => {
      console.log(`Retrying operation: ${error.context.operation}`);
      // The actual retry logic should be implemented by the calling code
      // This handler just provides the framework
      return { success: false, action }; // Let caller handle retry logic
    });

    // Ignore handler
    this.addRecoveryHandler('ignore', async (error, action) => {
      console.log(`Ignoring error: ${error.message}`);
      return { success: true, action };
    });

    // Fallback handler
    this.addRecoveryHandler('fallback', async (error, action) => {
      console.log(`Applying fallback: ${action.description}`);
      // Specific fallback logic should be implemented by components
      return { success: false, action };
    });

    // Escalate handler
    this.addRecoveryHandler('escalate', async (error, action) => {
      console.log(`Escalating error: ${error.message}`);
      // Create a new error with higher severity
      const escalatedError = new CanvasError({
        ...error,
        severity: ErrorSeverity.CRITICAL,
        message: `Escalated: ${error.message}`,
        recoveryActions: [{
          type: 'user_action',
          description: 'Manual intervention required',
          automatic: false
        }]
      });
      return { success: false, action, newError: escalatedError };
    });

    // User action handler (no automatic recovery)
    this.addRecoveryHandler('user_action', async (error, action) => {
      console.log(`User action required: ${action.description}`);
      return { success: false, action }; // Cannot auto-recover
    });

    // Restart handler
    this.addRecoveryHandler('restart', async (error, action) => {
      console.log(`Restart recommended: ${action.description}`);
      // Don't actually restart here - just flag it
      return { success: false, action };
    });
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Convenience functions
export const handleError = (error: any, context?: string) => errorHandler.handle(error, context);
export const onError = (listener: ErrorListener) => errorHandler.onError(listener);
export const getErrorStats = () => errorHandler.getStats();
export const clearErrorStats = () => errorHandler.clearStats();