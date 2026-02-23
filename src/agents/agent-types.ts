/**
 * Agent Type Definitions
 * Core types for the Canvas CLI agent system
 */

export interface AgentConfig {
  name: string;
  role: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  capabilities?: string[];
  tools?: string[];
}

export interface AgentResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, any>;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface AgentTask {
  id: string;
  type: string;
  description: string;
  input: any;
  priority?: number;
  timeout?: number;
  retries?: number;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface AgentContext {
  messages: AgentMessage[];
  variables: Record<string, any>;
  tools: string[];
  memory?: any[];
}

export interface AgentCapability {
  name: string;
  description: string;
  handler: (input: any) => Promise<any>;
}

export type AgentStatus = 'idle' | 'busy' | 'error' | 'offline';

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  averageResponseTime: number;
  totalTokensUsed: number;
  uptime: number;
}

export interface AgentLogger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

// Memory types for agent memory system
export type MemoryType =
  | 'error'
  | 'conversation'
  | 'context'
  | 'decision'
  | 'learning'
  | 'preference'
  | 'communication'
  | 'consultation'
  | 'task_execution'
  | 'execution_plan'
  | 'replication'
  | 'notification'
  | 'request'
  | 'query'
  | 'response'
  | 'broadcast'
  | 'coordination'
  | 'system'
  | 'user'
  | 'assistant';

export interface MemoryEntry {
  type: MemoryType;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  relevanceScore?: number;
}
