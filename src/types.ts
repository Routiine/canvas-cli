export interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface Config {
  // Legacy fields for backward compatibility
  ollamaUrl?: string;
  defaultModel?: string;
  model?: string;
  theme?: string;
  vimMode?: boolean;
  autoExecute?: boolean;
  mcpServers?: MCPServerConfig[];
  
  // New structured configuration
  ollama?: {
    baseUrl: string;
    defaultModel: string;
    models?: string[];
    timeout?: number;
    maxRetries?: number;
  };
  
  ui?: {
    theme: string;
    vimMode: boolean;
    autoComplete?: boolean;
    syntaxHighlighting?: boolean;
    showLineNumbers?: boolean;
  };
  
  features?: {
    autoExecute: boolean;
    confirmBeforeExecute?: boolean;
    saveHistory?: boolean;
    maxHistorySize?: number;
    enableTelemetry?: boolean;
  };
  
  paths?: {
    workspaceRoot?: string;
    sessionsDir?: string;
    logsDir?: string;
    cacheDir?: string;
    templatesDir?: string;
  };
  
  sandbox?: {
    enabled: boolean;
    type?: 'docker' | 'podman' | 'none';
    allowedPaths?: string[];
    blockedCommands?: string[];
    maxTimeout?: number;
    filterEnv?: boolean;
  };
  
  tools?: {
    fileOperations?: boolean;
    shellCommands?: boolean;
    webSearch?: boolean;
    webFetch?: boolean;
  };
  
  telemetry?: boolean;
  customCommands?: Record<string, string>;
  firstRun?: boolean;
  version?: string;
}

export interface ToolParameterDefinition {
  type: string;  // Common values: 'string', 'number', 'boolean', 'object', 'array'
  description: string;
  optional?: boolean;
  default?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Tool<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters?: Record<string, ToolParameterDefinition>;
  execute: (params: TParams) => Promise<TResult>;
  requiresConfirmation?: boolean;
}

export interface ConversationCheckpoint {
  id: string;
  timestamp: Date;
  messages: Message[];
  tag?: string;
}

export interface MessageMetadata {
  model?: string;
  tokenCount?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  timestamp?: Date;
  metadata?: MessageMetadata;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: ToolParameters;
  result?: unknown;
  error?: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cached?: number;
}

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    text: string;
    dim: string;
  };
}

export interface MemoryContext {
  global: string[];
  project: string[];
  session: string[];
}

export interface MCPServer {
  name: string;
  url: string;
  tools: Tool[];
  connected: boolean;
}

/**
 * Utility type for tool parameters
 */
export type ToolParameters = Record<string, unknown>;

/**
 * Utility function to extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Utility function to check if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard for checking if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if value is a string array
 */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Safe JSON parse with type guard
 */
export function safeJsonParse<T>(json: string, validator?: (value: unknown) => value is T): T | null {
  try {
    const parsed = JSON.parse(json);
    if (validator && !validator(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}