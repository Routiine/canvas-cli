export interface Config {
  ollamaUrl: string;
  defaultModel: string;
  theme?: string;
  vimMode?: boolean;
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