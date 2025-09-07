export interface Config {
  // Legacy fields for backward compatibility
  ollamaUrl?: string;
  defaultModel?: string;
  model?: string;
  theme?: string;
  vimMode?: boolean;
  autoExecute?: boolean;
  mcpServers?: any[];
  
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

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  execute: (params: any) => Promise<any>;
  requiresConfirmation?: boolean;
}

export interface ConversationCheckpoint {
  id: string;
  timestamp: Date;
  messages: Message[];
  tag?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  timestamp?: Date;
  metadata?: any;
}

export interface ToolCall {
  id: string;
  name: string;
  parameters: any;
  result?: any;
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