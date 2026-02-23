/**
 * Enhanced Error Handling System for Distributed Agents
 * Provides comprehensive error detection, recovery, and reporting
 */

import { EventEmitter } from 'events';
import { z } from 'zod';

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
  FATAL = 'fatal'
}

// Error categories
export enum ErrorCategory {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  RESOURCE = 'resource',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  CONCURRENCY = 'concurrency',
  DATA_INTEGRITY = 'data_integrity',
  SYSTEM = 'system',
  UNKNOWN = 'unknown'
}

// Error context schema
export const ErrorContextSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  nodeId: z.string(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  severity: z.nativeEnum(ErrorSeverity),
  category: z.nativeEnum(ErrorCategory),
  code: z.string(),
  message: z.string(),
  stack: z.string().optional(),
  context: z.record(z.any()).optional(),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3),
  recoverable: z.boolean().default(true),
  recovered: z.boolean().default(false),
  resolution: z.string().optional(),
  relatedErrors: z.array(z.string()).optional()
});

export type ErrorContext = z.infer<typeof ErrorContextSchema>;

// Recovery strategy interface
export interface RecoveryStrategy {
  name: string;
  applicableTo: ErrorCategory[];
  canRecover: (error: ErrorContext) => boolean;
  recover: (error: ErrorContext) => Promise<boolean>;
  priority: number;
}

// Circuit breaker state
export interface CircuitBreakerState {
  service: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successfulCalls: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
  threshold: number;
  timeout: number;
  resetTimeout: number;
}

export class EnhancedErrorHandler extends EventEmitter {
  private errors: Map<string, ErrorContext> = new Map();
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private errorPatterns: Map<string, number> = new Map();
  private errorMetrics!: {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recovered: number;
    failed: number;
    averageRecoveryTime: number;
  };
  
  constructor() {
    super();
    this.initializeRecoveryStrategies();
    this.initializeMetrics();
  }
  
  private initializeMetrics(): void {
    this.errorMetrics = {
      total: 0,
      byCategory: Object.values(ErrorCategory).reduce((acc, cat) => {
        acc[cat] = 0;
        return acc;
      }, {} as Record<ErrorCategory, number>),
      bySeverity: Object.values(ErrorSeverity).reduce((acc, sev) => {
        acc[sev] = 0;
        return acc;
      }, {} as Record<ErrorSeverity, number>),
      recovered: 0,
      failed: 0,
      averageRecoveryTime: 0
    };
  }
  
  private initializeRecoveryStrategies(): void {
    // Network error recovery
    this.recoveryStrategies.set('network-retry', {
      name: 'Network Retry with Exponential Backoff',
      applicableTo: [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT],
      canRecover: (error) => error.retryCount < error.maxRetries && error.recoverable,
      recover: async (error) => {
        const delay = Math.min(1000 * Math.pow(2, error.retryCount), 30000);
        await this.delay(delay);
        
        // Attempt reconnection or retry
        this.emit('recovery:retry', { error, delay });
        return true;
      },
      priority: 1
    });
    
    // Resource exhaustion recovery
    this.recoveryStrategies.set('resource-cleanup', {
      name: 'Resource Cleanup and Reallocation',
      applicableTo: [ErrorCategory.RESOURCE],
      canRecover: (error) => error.recoverable,
      recover: async (error) => {
        // Trigger garbage collection and cleanup
        this.emit('recovery:cleanup', { error });
        
        // Wait for resources to be freed
        await this.delay(5000);
        
        // Check resource availability
        const available = await this.checkResourceAvailability();
        return available;
      },
      priority: 2
    });
    
    // Concurrency error recovery
    this.recoveryStrategies.set('concurrency-resolution', {
      name: 'Concurrency Conflict Resolution',
      applicableTo: [ErrorCategory.CONCURRENCY],
      canRecover: (error) => error.retryCount < 3,
      recover: async (error) => {
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 1000;
        await this.delay(1000 + jitter);
        
        // Acquire locks or resolve conflicts
        this.emit('recovery:concurrency', { error });
        return true;
      },
      priority: 3
    });
    
    // Data integrity recovery
    this.recoveryStrategies.set('data-integrity', {
      name: 'Data Integrity Restoration',
      applicableTo: [ErrorCategory.DATA_INTEGRITY],
      canRecover: (error) => {
        return error.context?.hasBackup === true;
      },
      recover: async (error) => {
        // Restore from backup or rollback
        this.emit('recovery:rollback', { error });
        
        // Verify data integrity
        const verified = await this.verifyDataIntegrity(error);
        return verified;
      },
      priority: 4
    });
    
    // Authentication recovery
    this.recoveryStrategies.set('auth-refresh', {
      name: 'Authentication Token Refresh',
      applicableTo: [ErrorCategory.AUTHENTICATION],
      canRecover: (error) => error.code === 'TOKEN_EXPIRED',
      recover: async (error) => {
        // Refresh authentication tokens
        this.emit('recovery:auth-refresh', { error });
        return true;
      },
      priority: 5
    });
  }
  
  async handleError(error: Error | ErrorContext, context?: Partial<ErrorContext>): Promise<ErrorContext> {
    const errorContext = this.createErrorContext(error, context);
    
    // Store error
    this.errors.set(errorContext.id, errorContext);
    
    // Update metrics
    this.updateMetrics(errorContext);
    
    // Check circuit breaker
    if (this.shouldTripCircuitBreaker(errorContext)) {
      this.tripCircuitBreaker(errorContext);
    }
    
    // Pattern detection
    this.detectErrorPatterns(errorContext);
    
    // Emit error event
    this.emit('error:occurred', errorContext);
    
    // Attempt recovery if possible
    if (errorContext.recoverable) {
      const recovered = await this.attemptRecovery(errorContext);
      errorContext.recovered = recovered;
      
      if (recovered) {
        this.errorMetrics.recovered++;
        this.emit('error:recovered', errorContext);
      } else {
        this.errorMetrics.failed++;
        this.emit('error:failed', errorContext);
      }
    }
    
    // Log based on severity
    this.logError(errorContext);
    
    return errorContext;
  }
  
  private createErrorContext(error: Error | ErrorContext, context?: Partial<ErrorContext>): ErrorContext {
    if (this.isErrorContext(error)) {
      return { ...error, ...context };
    }
    
    const category = this.categorizeError(error);
    const severity = this.determineSeverity(error, category);
    
    return {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      nodeId: context?.nodeId || 'unknown',
      agentId: context?.agentId,
      taskId: context?.taskId,
      severity,
      category,
      code: (error as any).code || 'UNKNOWN',
      message: error.message,
      stack: error.stack,
      context: context?.context,
      retryCount: context?.retryCount || 0,
      maxRetries: context?.maxRetries || 3,
      recoverable: this.isRecoverable(error, category),
      recovered: false,
      ...context
    };
  }
  
  private isErrorContext(error: any): error is ErrorContext {
    return error && typeof error === 'object' && 'severity' in error && 'category' in error;
  }
  
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const code = (error as any).code;
    
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || message.includes('network')) {
      return ErrorCategory.NETWORK;
    }
    if (code === 'ETIMEDOUT' || message.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }
    if (code === 'ENOMEM' || message.includes('memory') || message.includes('resource')) {
      return ErrorCategory.RESOURCE;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return ErrorCategory.AUTHORIZATION;
    }
    if (message.includes('lock') || message.includes('concurrent') || message.includes('conflict')) {
      return ErrorCategory.CONCURRENCY;
    }
    if (message.includes('corrupt') || message.includes('integrity')) {
      return ErrorCategory.DATA_INTEGRITY;
    }
    if (code && code.startsWith('E')) {
      return ErrorCategory.SYSTEM;
    }
    
    return ErrorCategory.UNKNOWN;
  }
  
  private determineSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    // Critical categories
    if (category === ErrorCategory.DATA_INTEGRITY) {
      return ErrorSeverity.CRITICAL;
    }
    
    // High severity
    if (category === ErrorCategory.AUTHENTICATION || 
        category === ErrorCategory.AUTHORIZATION ||
        category === ErrorCategory.SYSTEM) {
      return ErrorSeverity.HIGH;
    }
    
    // Medium severity
    if (category === ErrorCategory.NETWORK ||
        category === ErrorCategory.TIMEOUT ||
        category === ErrorCategory.RESOURCE) {
      return ErrorSeverity.MEDIUM;
    }
    
    // Low severity
    if (category === ErrorCategory.VALIDATION) {
      return ErrorSeverity.LOW;
    }
    
    return ErrorSeverity.MEDIUM;
  }
  
  private isRecoverable(error: Error, category: ErrorCategory): boolean {
    // Non-recoverable categories
    if (category === ErrorCategory.VALIDATION ||
        category === ErrorCategory.AUTHORIZATION) {
      return false;
    }
    
    // Check specific error codes
    const code = (error as any).code;
    const nonRecoverableCodes = ['EACCES', 'EPERM', 'ENOENT'];
    if (code && nonRecoverableCodes.includes(code)) {
      return false;
    }
    
    return true;
  }
  
  private async attemptRecovery(error: ErrorContext): Promise<boolean> {
    const startTime = Date.now();
    
    // Find applicable recovery strategies
    const strategies = Array.from(this.recoveryStrategies.values())
      .filter(s => s.applicableTo.includes(error.category))
      .sort((a, b) => a.priority - b.priority);
    
    for (const strategy of strategies) {
      if (strategy.canRecover(error)) {
        try {
          this.emit('recovery:attempting', { error, strategy: strategy.name });
          
          const recovered = await strategy.recover(error);
          
          if (recovered) {
            const recoveryTime = Date.now() - startTime;
            this.updateAverageRecoveryTime(recoveryTime);
            
            error.resolution = `Recovered using ${strategy.name}`;
            return true;
          }
        } catch (recoveryError) {
          this.emit('recovery:failed', { 
            error, 
            strategy: strategy.name, 
            recoveryError 
          });
        }
      }
    }
    
    return false;
  }
  
  private shouldTripCircuitBreaker(error: ErrorContext): boolean {
    const service = error.context?.service || error.nodeId;
    const breaker = this.circuitBreakers.get(service);
    
    if (!breaker) {
      // Initialize circuit breaker for this service
      this.circuitBreakers.set(service, {
        service,
        state: 'closed',
        failures: 1,
        successfulCalls: 0,
        lastFailureTime: new Date(),
        threshold: 5,
        timeout: 60000,
        resetTimeout: 30000
      });
      return false;
    }
    
    if (breaker.state === 'closed') {
      breaker.failures++;
      breaker.lastFailureTime = new Date();
      
      if (breaker.failures >= breaker.threshold) {
        return true;
      }
    }
    
    return false;
  }
  
  private tripCircuitBreaker(error: ErrorContext): void {
    const service = error.context?.service || error.nodeId;
    const breaker = this.circuitBreakers.get(service);
    
    if (breaker) {
      breaker.state = 'open';
      breaker.nextRetryTime = new Date(Date.now() + breaker.timeout);
      
      this.emit('circuit-breaker:opened', { service, breaker });
      
      // Schedule half-open transition
      setTimeout(() => {
        breaker.state = 'half-open';
        this.emit('circuit-breaker:half-open', { service, breaker });
      }, breaker.timeout);
    }
  }
  
  isCircuitBreakerOpen(service: string): boolean {
    const breaker = this.circuitBreakers.get(service);
    return breaker?.state === 'open';
  }
  
  private detectErrorPatterns(error: ErrorContext): void {
    const patternKey = `${error.category}-${error.code}`;
    const count = (this.errorPatterns.get(patternKey) || 0) + 1;
    this.errorPatterns.set(patternKey, count);
    
    // Detect patterns
    if (count > 10) {
      this.emit('pattern:detected', {
        pattern: patternKey,
        count,
        message: `Recurring error pattern detected: ${patternKey}`
      });
    }
    
    // Check for error storms
    const recentErrors = Array.from(this.errors.values())
      .filter(e => new Date(e.timestamp).getTime() > Date.now() - 60000);
    
    if (recentErrors.length > 50) {
      this.emit('error:storm', {
        count: recentErrors.length,
        categories: this.groupByCategory(recentErrors)
      });
    }
  }
  
  private groupByCategory(errors: ErrorContext[]): Record<ErrorCategory, number> {
    return errors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1;
      return acc;
    }, {} as Record<ErrorCategory, number>);
  }
  
  private updateMetrics(error: ErrorContext): void {
    this.errorMetrics.total++;
    this.errorMetrics.byCategory[error.category]++;
    this.errorMetrics.bySeverity[error.severity]++;
  }
  
  private updateAverageRecoveryTime(time: number): void {
    const current = this.errorMetrics.averageRecoveryTime;
    const count = this.errorMetrics.recovered;
    this.errorMetrics.averageRecoveryTime = (current * count + time) / (count + 1);
  }
  
  private logError(error: ErrorContext): void {
    const logLevel = this.getLogLevel(error.severity);
    const logMessage = this.formatErrorLog(error);
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'info':
        console.info(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
  
  private getLogLevel(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.FATAL:
      case ErrorSeverity.CRITICAL:
        return 'error';
      case ErrorSeverity.HIGH:
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'debug';
    }
  }
  
  private formatErrorLog(error: ErrorContext): string {
    return `[${error.severity.toUpperCase()}] ${error.category}: ${error.message}
    ID: ${error.id}
    Node: ${error.nodeId}
    Agent: ${error.agentId || 'N/A'}
    Task: ${error.taskId || 'N/A'}
    Recoverable: ${error.recoverable}
    Recovered: ${error.recovered}
    ${error.stack ? `Stack: ${error.stack}` : ''}`;
  }
  
  private async checkResourceAvailability(): Promise<boolean> {
    // Check memory availability
    const memUsage = process.memoryUsage();
    const availableMemory = memUsage.heapTotal - memUsage.heapUsed;
    
    return availableMemory > 50 * 1024 * 1024; // 50MB threshold
  }
  
  private async verifyDataIntegrity(error: ErrorContext): Promise<boolean> {
    // Implement data integrity verification
    this.emit('integrity:verifying', { error });
    
    // Simulate verification
    await this.delay(1000);
    
    return true;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Public API
  
  getMetrics() {
    return { ...this.errorMetrics };
  }
  
  getErrors(filter?: Partial<ErrorContext>): ErrorContext[] {
    let errors = Array.from(this.errors.values());
    
    if (filter) {
      errors = errors.filter(error => {
        for (const [key, value] of Object.entries(filter)) {
          if (error[key as keyof ErrorContext] !== value) {
            return false;
          }
        }
        return true;
      });
    }
    
    return errors;
  }
  
  clearErrors(): void {
    this.errors.clear();
    this.errorPatterns.clear();
    this.initializeMetrics();
  }
  
  addRecoveryStrategy(name: string, strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(name, strategy);
  }
  
  removeRecoveryStrategy(name: string): boolean {
    return this.recoveryStrategies.delete(name);
  }
  
  getCircuitBreakerStatus(service: string): CircuitBreakerState | undefined {
    return this.circuitBreakers.get(service);
  }
  
  resetCircuitBreaker(service: string): void {
    const breaker = this.circuitBreakers.get(service);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failures = 0;
      breaker.successfulCalls = 0;
      this.emit('circuit-breaker:reset', { service, breaker });
    }
  }
}

// Export singleton instance
export const enhancedErrorHandler = new EnhancedErrorHandler();