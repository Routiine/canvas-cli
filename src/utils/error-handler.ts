import { EventEmitter } from 'events';
import fs from 'fs-extra';
import * as path from 'path';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  onRetry?: (attempt: number, error: Error) => void;
  shouldRetry?: (error: Error) => boolean;
}

export interface ErrorContext {
  operation: string;
  timestamp: Date;
  error: Error;
  metadata?: Record<string, any>;
  stackTrace?: string;
  retryCount?: number;
}

export class ErrorHandler extends EventEmitter {
  private static instance: ErrorHandler;
  private errorLog: ErrorContext[] = [];
  private maxLogSize: number = 1000;
  private errorCounts: Map<string, number> = new Map();
  private cleanupHandlers: Array<{ name: string; handler: () => Promise<void> | void }> = [];
  private isShuttingDown: boolean = false;
  private static handlersSetup: boolean = false;
  
  // Default retry configuration
  private defaultRetryOptions: Required<RetryOptions> = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    onRetry: () => {},
    shouldRetry: (error) => {
      // Retry on network errors and rate limits
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('rate limit') ||
        message.includes('429') ||
        message.includes('503') ||
        message.includes('502')
      );
    }
  };

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  constructor() {
    super();
    this.setupGlobalHandlers();
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalHandlers(): void {
    if (ErrorHandler.handlersSetup) return;
    ErrorHandler.handlersSetup = true;

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('uncaughtException', error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.handleCriticalError('unhandledRejection', new Error(String(reason)));
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      void this.handleGracefulShutdown('SIGINT');
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      void this.handleGracefulShutdown('SIGTERM');
    });
  }

  /**
   * Execute function with retry logic
   */
  async withRetry<T>(
    fn: () => Promise<T>,
    operation: string,
    options?: RetryOptions
  ): Promise<T> {
    const opts = { ...this.defaultRetryOptions, ...options };
    let lastError: Error | null = null;
    let delay = opts.initialDelay;

    for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        // Log the error
        this.logError({
          operation,
          timestamp: new Date(),
          error,
          retryCount: attempt
        });

        // Check if we should retry
        if (attempt === opts.maxRetries || !opts.shouldRetry(error)) {
          throw error;
        }

        // Call retry callback
        opts.onRetry(attempt, error);
        this.emit('retry', { attempt, error, operation });

        // Wait before retrying with jitter to prevent thundering herd
        const jitter = Math.random() * 0.3 * delay; // ±15% jitter
        await this.delay(delay + jitter - delay * 0.15);

        // Calculate next delay with exponential backoff
        delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Create a retryable version of an async function
   */
  createRetryable<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    operation: string,
    options?: RetryOptions
  ): T {
    return (async (...args: Parameters<T>) => {
      return this.withRetry(() => fn(...args), operation, options);
    }) as T;
  }

  /**
   * Wrap async function with error handling
   */
  wrapAsync<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    operation: string
  ): T {
    return (async (...args: Parameters<T>) => {
      try {
        return await fn(...args);
      } catch (error: any) {
        this.handleError(operation, error);
        throw error;
      }
    }) as T;
  }

  /**
   * Handle error with logging and recovery
   */
  handleError(operation: string, error: Error, metadata?: Record<string, any>): void {
    const context: ErrorContext = {
      operation,
      timestamp: new Date(),
      error,
      metadata,
      stackTrace: error.stack
    };

    this.logError(context);
    this.emit('error', context);

    // Increment error count for this operation
    const count = (this.errorCounts.get(operation) || 0) + 1;
    this.errorCounts.set(operation, count);

    // Check for error patterns
    this.detectErrorPatterns(operation, count);
  }

  /**
   * Handle critical errors
   */
  private handleCriticalError(type: string, error: Error): void {
    console.error(`💀 Critical Error (${type}):`, error);
    
    this.logError({
      operation: type,
      timestamp: new Date(),
      error,
      metadata: { critical: true }
    });

    // Save error log before exit
    this.saveErrorLog();
    
    // Exit gracefully
    process.exit(1);
  }

  /**
   * Handle graceful shutdown
   */
  private async handleGracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`\n👋 Received ${signal}, shutting down gracefully...`);

    this.emit('shutdown', signal);

    // Run all cleanup handlers with timeout
    const timeout = 5000; // 5 second timeout for cleanup
    const cleanupPromises = this.cleanupHandlers.map(async ({ name, handler }) => {
      try {
        const result = handler();
        if (result instanceof Promise) {
          await Promise.race([
            result,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Cleanup timeout')), timeout)
            )
          ]);
        }
        console.log(`  ✓ ${name} cleaned up`);
      } catch (error: any) {
        console.log(`  ✗ ${name} cleanup failed: ${error.message}`);
      }
    });

    await Promise.allSettled(cleanupPromises);

    // Save error log
    this.saveErrorLog();

    console.log('👋 Goodbye!');
    process.exit(0);
  }

  /**
   * Register a cleanup handler to run on shutdown
   */
  registerCleanup(name: string, handler: () => Promise<void> | void): void {
    this.cleanupHandlers.push({ name, handler });
  }

  /**
   * Unregister a cleanup handler
   */
  unregisterCleanup(name: string): void {
    this.cleanupHandlers = this.cleanupHandlers.filter(h => h.name !== name);
  }

  /**
   * Log error to internal buffer
   */
  private logError(context: ErrorContext): void {
    this.errorLog.push(context);
    
    // Trim log if too large
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
  }

  /**
   * Detect error patterns
   */
  private detectErrorPatterns(operation: string, count: number): void {
    // Detect repeated errors
    if (count > 5) {
      this.emit('repeated-error', {
        operation,
        count,
        message: `Operation "${operation}" has failed ${count} times`
      });
    }

    // Detect error storms
    const recentErrors = this.errorLog.filter(
      e => Date.now() - e.timestamp.getTime() < 60000
    );
    
    if (recentErrors.length > 50) {
      this.emit('error-storm', {
        count: recentErrors.length,
        message: 'High error rate detected'
      });
    }
  }

  /**
   * Save error log to file
   */
  private saveErrorLog(): void {
    try {
      const logDir = path.join(process.cwd(), '.canvas-cli', 'logs');
      fs.ensureDirSync(logDir);
      
      const logFile = path.join(logDir, `errors-${Date.now()}.json`);
      fs.writeJsonSync(logFile, {
        errors: this.errorLog,
        counts: Object.fromEntries(this.errorCounts),
        timestamp: new Date()
      }, { spaces: 2 });
      
      console.log(`📝 Error log saved to: ${logFile}`);
    } catch (error) {
      console.error('Failed to save error log:', error);
    }
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics
   */
  getStatistics(): {
    totalErrors: number;
    errorsByOperation: Record<string, number>;
    recentErrors: number;
    errorRate: number;
  } {
    const now = Date.now();
    const recentErrors = this.errorLog.filter(
      e => now - e.timestamp.getTime() < 60000
    ).length;
    
    return {
      totalErrors: this.errorLog.length,
      errorsByOperation: Object.fromEntries(this.errorCounts),
      recentErrors,
      errorRate: recentErrors / 60 // Errors per second in last minute
    };
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
    this.errorCounts.clear();
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): ErrorContext[] {
    return this.errorLog.slice(-limit);
  }

  /**
   * Check if operation is failing frequently
   */
  isOperationFailing(operation: string, threshold: number = 3): boolean {
    return (this.errorCounts.get(operation) || 0) >= threshold;
  }

  /**
   * Reset error count for operation
   */
  resetOperationErrors(operation: string): void {
    this.errorCounts.delete(operation);
  }
}

/**
 * Circuit breaker for preventing cascading failures
 */
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  
  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
    private readonly halfOpenRequests: number = 3
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      
      // Handle success
      if (this.state === 'half-open') {
        this.successCount++;
        if (this.successCount >= this.halfOpenRequests) {
          this.state = 'closed';
          this.failures = 0;
        }
      } else if (this.state === 'closed') {
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      // Handle failure
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
      }
      
      throw error;
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successCount = 0;
  }
}

/**
 * Timeout wrapper for operations
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string = 'Operation'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
    timer.unref();
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Debounce function for reducing error spam
 */
export function debounceError(
  fn: (...args: any[]) => void,
  delay: number = 1000
): (...args: any[]) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: any[] | null = null;

  return (...args: any[]) => {
    lastArgs = args;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }, delay);
  };
}

/**
 * Error recovery strategies
 */
export const RecoveryStrategies = {
  /**
   * Exponential backoff with jitter
   */
  exponentialBackoff: (attempt: number, baseDelay: number = 1000): number => {
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, 30000);
  },

  /**
   * Linear backoff
   */
  linearBackoff: (attempt: number, increment: number = 1000): number => {
    return Math.min(attempt * increment, 30000);
  },

  /**
   * Fixed delay
   */
  fixedDelay: (delay: number = 1000): number => {
    return delay;
  }
};

/**
 * Decorator for adding retry logic to class methods
 */
export function withRetryDecorator(operation: string, options?: RetryOptions) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return errorHandler.withRetry(
        () => originalMethod.apply(this, args),
        `${operation}:${propertyKey}`,
        options
      );
    };

    return descriptor;
  };
}

/**
 * Decorator for wrapping methods with error handling
 */
export function handleErrors(operation: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error: any) {
        errorHandler.handleError(`${operation}:${propertyKey}`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();