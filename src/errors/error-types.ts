/**
 * Structured error handling system
 * Based on goose-cli's error management
 */

export enum ErrorType {
  // Provider errors
  PROVIDER_CONNECTION = 'provider_connection',
  PROVIDER_AUTHENTICATION = 'provider_authentication',
  PROVIDER_RATE_LIMIT = 'provider_rate_limit',
  PROVIDER_CONTEXT_EXCEEDED = 'provider_context_exceeded',
  PROVIDER_MODEL_UNAVAILABLE = 'provider_model_unavailable',
  PROVIDER_CONFIGURATION = 'provider_configuration',

  // Tool errors
  TOOL_EXECUTION_FAILED = 'tool_execution_failed',
  TOOL_TIMEOUT = 'tool_timeout',
  TOOL_PERMISSION_DENIED = 'tool_permission_denied',
  TOOL_NOT_FOUND = 'tool_not_found',
  TOOL_VALIDATION = 'tool_validation',

  // Recipe errors
  RECIPE_NOT_FOUND = 'recipe_not_found',
  RECIPE_VALIDATION = 'recipe_validation',
  RECIPE_PARAMETER_MISSING = 'recipe_parameter_missing',
  RECIPE_EXECUTION = 'recipe_execution',
  RECIPE_TEMPLATE = 'recipe_template',

  // Context errors
  CONTEXT_LIMIT_EXCEEDED = 'context_limit_exceeded',
  CONTEXT_INVALID = 'context_invalid',
  CONTEXT_COMPRESSION_FAILED = 'context_compression_failed',

  // File system errors
  FILE_NOT_FOUND = 'file_not_found',
  FILE_PERMISSION_DENIED = 'file_permission_denied',
  FILE_READ_ERROR = 'file_read_error',
  FILE_WRITE_ERROR = 'file_write_error',

  // Network errors
  NETWORK_CONNECTION = 'network_connection',
  NETWORK_TIMEOUT = 'network_timeout',
  NETWORK_DNS = 'network_dns',

  // Configuration errors
  CONFIG_VALIDATION = 'config_validation',
  CONFIG_MISSING = 'config_missing',
  CONFIG_INCOMPATIBLE = 'config_incompatible',

  // System errors
  SYSTEM_RESOURCE = 'system_resource',
  SYSTEM_PERMISSION = 'system_permission',
  SYSTEM_DEPENDENCY = 'system_dependency',

  // User input errors
  INPUT_VALIDATION = 'input_validation',
  INPUT_FORMAT = 'input_format',

  // Unknown/generic
  UNKNOWN = 'unknown',
  INTERNAL = 'internal'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ErrorContext {
  operation?: string;
  component?: string;
  model?: string;
  tool?: string;
  recipe?: string;
  file?: string;
  timestamp: Date;
  stack?: string;
  metadata?: Record<string, any>;
}

export interface RecoveryAction {
  type: 'retry' | 'fallback' | 'ignore' | 'escalate' | 'user_action' | 'restart';
  description: string;
  automatic: boolean;
  delay?: number;
  maxAttempts?: number;
  data?: any;
}

export interface ErrorDetails {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  retryable: boolean;
  recoverable: boolean;
  context: ErrorContext;
  recoveryActions: RecoveryAction[];
  userMessage?: string;
  technicalMessage?: string;
  helpUrl?: string;
  relatedErrors?: string[];
}

/**
 * Base error class for Canvas CLI
 */
export class CanvasError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly recoverable: boolean;
  public readonly context: ErrorContext;
  public readonly recoveryActions: RecoveryAction[];
  public readonly userMessage?: string;
  public readonly technicalMessage?: string;
  public readonly helpUrl?: string;
  public readonly relatedErrors: string[];

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = 'CanvasError';
    
    this.type = details.type;
    this.severity = details.severity;
    this.retryable = details.retryable;
    this.recoverable = details.recoverable;
    this.context = details.context;
    this.recoveryActions = details.recoveryActions;
    this.userMessage = details.userMessage;
    this.technicalMessage = details.technicalMessage;
    this.helpUrl = details.helpUrl;
    this.relatedErrors = details.relatedErrors || [];

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CanvasError);
    }
    this.context.stack = this.stack;
  }

  /**
   * Convert to JSON for logging/storage
   */
  toJSON(): any {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      retryable: this.retryable,
      recoverable: this.recoverable,
      context: this.context,
      recoveryActions: this.recoveryActions,
      userMessage: this.userMessage,
      technicalMessage: this.technicalMessage,
      helpUrl: this.helpUrl,
      relatedErrors: this.relatedErrors,
      stack: this.stack
    };
  }

  /**
   * Create a user-friendly message
   */
  getUserFriendlyMessage(): string {
    return this.userMessage || this.message;
  }

  /**
   * Get automatic recovery actions
   */
  getAutomaticRecoveryActions(): RecoveryAction[] {
    return this.recoveryActions.filter(action => action.automatic);
  }

  /**
   * Get manual recovery actions
   */
  getManualRecoveryActions(): RecoveryAction[] {
    return this.recoveryActions.filter(action => !action.automatic);
  }

  /**
   * Check if error has a specific recovery action type
   */
  hasRecoveryAction(type: RecoveryAction['type']): boolean {
    return this.recoveryActions.some(action => action.type === type);
  }
}

/**
 * Error factory functions for common error types
 */
export class ErrorFactory {
  static providerConnection(
    message: string,
    provider: string,
    url?: string
  ): CanvasError {
    return new CanvasError({
      type: ErrorType.PROVIDER_CONNECTION,
      severity: ErrorSeverity.HIGH,
      message,
      retryable: true,
      recoverable: true,
      context: {
        component: 'provider',
        metadata: { provider, url },
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'retry',
          description: 'Retry connection after delay',
          automatic: true,
          delay: 5000,
          maxAttempts: 3
        },
        {
          type: 'user_action',
          description: 'Check provider service status and configuration',
          automatic: false
        }
      ],
      userMessage: `Cannot connect to ${provider}. Please check your connection and try again.`,
      helpUrl: 'https://docs.canvas-cli.com/troubleshooting/provider-connection'
    });
  }

  static contextLimitExceeded(
    tokensUsed: number,
    tokenLimit: number,
    model: string
  ): CanvasError {
    return new CanvasError({
      type: ErrorType.CONTEXT_LIMIT_EXCEEDED,
      severity: ErrorSeverity.MEDIUM,
      message: `Context limit exceeded: ${tokensUsed}/${tokenLimit} tokens`,
      retryable: false,
      recoverable: true,
      context: {
        component: 'context',
        model,
        metadata: { tokensUsed, tokenLimit },
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'fallback',
          description: 'Compress context automatically',
          automatic: true,
          data: { strategy: 'smart_trim' }
        },
        {
          type: 'user_action',
          description: 'Manually reduce conversation length',
          automatic: false
        }
      ],
      userMessage: 'Conversation too long. Context will be automatically compressed.',
      helpUrl: 'https://docs.canvas-cli.com/features/context-management'
    });
  }

  static toolExecutionFailed(
    toolName: string,
    error: string,
    retryable = true
  ): CanvasError {
    return new CanvasError({
      type: ErrorType.TOOL_EXECUTION_FAILED,
      severity: ErrorSeverity.MEDIUM,
      message: `Tool execution failed: ${toolName}`,
      retryable,
      recoverable: true,
      context: {
        component: 'tool',
        tool: toolName,
        metadata: { originalError: error },
        timestamp: new Date()
      },
      recoveryActions: retryable ? [
        {
          type: 'retry',
          description: 'Retry tool execution',
          automatic: true,
          delay: 1000,
          maxAttempts: 2
        },
        {
          type: 'fallback',
          description: 'Skip tool and continue',
          automatic: false
        }
      ] : [
        {
          type: 'ignore',
          description: 'Skip tool and continue',
          automatic: false
        }
      ],
      userMessage: `Tool "${toolName}" failed to execute. ${retryable ? 'Retrying...' : 'Continuing without this tool.'}`,
      technicalMessage: error
    });
  }

  static recipeNotFound(recipeName: string): CanvasError {
    return new CanvasError({
      type: ErrorType.RECIPE_NOT_FOUND,
      severity: ErrorSeverity.MEDIUM,
      message: `Recipe not found: ${recipeName}`,
      retryable: false,
      recoverable: false,
      context: {
        component: 'recipe',
        recipe: recipeName,
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'user_action',
          description: 'Check recipe name and availability',
          automatic: false
        }
      ],
      userMessage: `Recipe "${recipeName}" was not found. Use 'canvas recipe list' to see available recipes.`,
      helpUrl: 'https://docs.canvas-cli.com/features/recipes'
    });
  }

  static fileNotFound(filePath: string, operation: string): CanvasError {
    return new CanvasError({
      type: ErrorType.FILE_NOT_FOUND,
      severity: ErrorSeverity.MEDIUM,
      message: `File not found: ${filePath}`,
      retryable: false,
      recoverable: false,
      context: {
        component: 'filesystem',
        operation,
        file: filePath,
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'user_action',
          description: 'Check file path and permissions',
          automatic: false
        }
      ],
      userMessage: `File not found: ${filePath}. Please check the path and try again.`
    });
  }

  static configurationError(
    setting: string,
    issue: string,
    suggestion?: string
  ): CanvasError {
    return new CanvasError({
      type: ErrorType.CONFIG_VALIDATION,
      severity: ErrorSeverity.HIGH,
      message: `Configuration error: ${setting} - ${issue}`,
      retryable: false,
      recoverable: true,
      context: {
        component: 'config',
        metadata: { setting, issue, suggestion },
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'user_action',
          description: suggestion || 'Fix configuration and restart',
          automatic: false
        }
      ],
      userMessage: `Configuration issue with ${setting}: ${issue}${suggestion ? ` Suggestion: ${suggestion}` : ''}`,
      helpUrl: 'https://docs.canvas-cli.com/configuration'
    });
  }

  static networkTimeout(operation: string, timeout: number): CanvasError {
    return new CanvasError({
      type: ErrorType.NETWORK_TIMEOUT,
      severity: ErrorSeverity.MEDIUM,
      message: `Network timeout during ${operation}`,
      retryable: true,
      recoverable: true,
      context: {
        component: 'network',
        operation,
        metadata: { timeout },
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'retry',
          description: 'Retry with longer timeout',
          automatic: true,
          delay: 2000,
          maxAttempts: 2,
          data: { timeout: timeout * 1.5 }
        }
      ],
      userMessage: `Network timeout during ${operation}. Retrying with longer timeout...`
    });
  }

  static validationError(
    field: string,
    value: any,
    requirement: string
  ): CanvasError {
    return new CanvasError({
      type: ErrorType.INPUT_VALIDATION,
      severity: ErrorSeverity.LOW,
      message: `Validation error: ${field} ${requirement}`,
      retryable: false,
      recoverable: false,
      context: {
        component: 'validation',
        metadata: { field, value, requirement },
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'user_action',
          description: 'Provide valid input',
          automatic: false
        }
      ],
      userMessage: `Invalid ${field}: ${requirement}`
    });
  }

  static internalError(
    message: string,
    component: string,
    metadata?: any
  ): CanvasError {
    return new CanvasError({
      type: ErrorType.INTERNAL,
      severity: ErrorSeverity.CRITICAL,
      message: `Internal error: ${message}`,
      retryable: false,
      recoverable: false,
      context: {
        component,
        metadata,
        timestamp: new Date()
      },
      recoveryActions: [
        {
          type: 'restart',
          description: 'Restart application',
          automatic: false
        },
        {
          type: 'user_action',
          description: 'Report bug if issue persists',
          automatic: false
        }
      ],
      userMessage: 'An internal error occurred. Please restart the application.',
      technicalMessage: message,
      helpUrl: 'https://github.com/canvas-cli/canvas-cli/issues'
    });
  }
}

/**
 * Helper function to convert native errors to CanvasError
 */
export function wrapError(
  error: any,
  type: ErrorType = ErrorType.UNKNOWN,
  context: Partial<ErrorContext> = {}
): CanvasError {
  if (error instanceof CanvasError) {
    return error;
  }

  const message = error?.message || String(error);
  const stack = error?.stack;

  return new CanvasError({
    type,
    severity: ErrorSeverity.MEDIUM,
    message,
    retryable: false,
    recoverable: false,
    context: {
      ...context,
      timestamp: new Date(),
      stack,
      metadata: { originalError: error }
    },
    recoveryActions: []
  });
}

/**
 * Check if error is of a specific type
 */
export function isErrorType(error: any, type: ErrorType): boolean {
  return error instanceof CanvasError && error.type === type;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  return error instanceof CanvasError && error.retryable;
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error: any): boolean {
  return error instanceof CanvasError && error.recoverable;
}