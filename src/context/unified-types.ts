/**
 * Unified Context System - Type Definitions
 *
 * Types for the unified context management system that handles
 * conversation history, code context, and semantic memory.
 */

// ============================================================================
// Context Entry Types
// ============================================================================

export enum ContextEntryType {
  MESSAGE = 'message',
  CODE = 'code',
  FILE = 'file',
  COMMAND = 'command',
  RESULT = 'result',
  ERROR = 'error',
  SYSTEM = 'system',
  SUMMARY = 'summary'
}

export enum ContextPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  EPHEMERAL = 'ephemeral'
}

export interface ContextEntry {
  id: string;
  type: ContextEntryType;
  content: string;
  timestamp: Date;
  priority: ContextPriority;
  tokens: number;
  embedding?: Float32Array;
  metadata: ContextMetadata;
  version: number;
  deleted: boolean;
}

export interface ContextMetadata {
  source?: string;
  file?: string;
  language?: string;
  role?: 'user' | 'assistant' | 'system';
  tags?: string[];
  references?: string[];  // IDs of related entries
  expiresAt?: Date;
  summarizedFrom?: string[];  // IDs of entries this summarizes
}

// ============================================================================
// Context Window Types
// ============================================================================

export interface ContextWindow {
  entries: ContextEntry[];
  totalTokens: number;
  maxTokens: number;
  model: string;
  compressionLevel: number;  // 0-1, how much has been compressed
}

export interface WindowConfig {
  maxTokens: number;
  reservedTokens: number;  // Reserved for response
  compressionThreshold: number;  // Start compressing at this % of max
  priorityWeights: Record<ContextPriority, number>;
  typeWeights: Record<ContextEntryType, number>;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface ContextSnapshot {
  id: string;
  timestamp: Date;
  entries: ContextEntry[];
  totalTokens: number;
  checksum: string;
}

export interface ContextDelta {
  snapshotId: string;
  timestamp: Date;
  added: ContextEntry[];
  modified: Array<{ id: string; changes: Partial<ContextEntry> }>;
  deleted: string[];
}

export interface StorageStats {
  totalEntries: number;
  totalTokens: number;
  snapshots: number;
  deltas: number;
  compressionRatio: number;
  oldestEntry: Date;
  newestEntry: Date;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResult {
  entry: ContextEntry;
  score: number;
  matchType: 'semantic' | 'keyword' | 'exact';
  highlights?: string[];
}

export interface SearchOptions {
  query: string;
  limit?: number;
  types?: ContextEntryType[];
  minScore?: number;
  dateRange?: { start: Date; end: Date };
  semantic?: boolean;
  includeDeleted?: boolean;
}

// ============================================================================
// Summarization Types
// ============================================================================

export interface SummarizationRequest {
  entries: ContextEntry[];
  targetTokens: number;
  preserveTypes?: ContextEntryType[];
  preserveIds?: string[];
  style?: 'concise' | 'detailed' | 'bullet';
}

export interface SummarizationResult {
  summary: string;
  originalTokens: number;
  summaryTokens: number;
  compressionRatio: number;
  preservedEntries: string[];
  summarizedEntries: string[];
}

// ============================================================================
// Event Types
// ============================================================================

export type ContextEvent =
  | { type: 'entry_added'; entry: ContextEntry }
  | { type: 'entry_modified'; id: string; changes: Partial<ContextEntry> }
  | { type: 'entry_deleted'; id: string }
  | { type: 'context_compressed'; before: number; after: number }
  | { type: 'snapshot_created'; snapshot: ContextSnapshot }
  | { type: 'window_updated'; window: ContextWindow }
  | { type: 'search_performed'; query: string; results: number };

// ============================================================================
// Configuration Types
// ============================================================================

export interface UnifiedContextConfig {
  storage: {
    persistPath: string;
    snapshotInterval: number;  // ms
    maxSnapshots: number;
    compressOlderThan: number;  // ms
  };
  window: WindowConfig;
  summarization: {
    enabled: boolean;
    model: string;
    autoCompress: boolean;
    preserveRecent: number;  // Number of recent entries to always keep
  };
  embeddings: {
    enabled: boolean;
    provider: 'local' | 'ollama' | 'hybrid';
    dimensions: number;
    cacheSize: number;
  };
  search: {
    maxResults: number;
    minScore: number;
    semanticWeight: number;
    keywordWeight: number;
  };
}

// ============================================================================
// Model-Specific Configurations
// ============================================================================

export interface ModelContextConfig {
  name: string;
  maxContextTokens: number;
  reservedOutputTokens: number;
  compressionThreshold: number;
  supportedFeatures: ('embeddings' | 'functions' | 'vision')[];
}

export const MODEL_CONTEXT_CONFIGS: Record<string, ModelContextConfig> = {
  'llama3.2:3b': {
    name: 'llama3.2:3b',
    maxContextTokens: 128000,
    reservedOutputTokens: 4096,
    compressionThreshold: 0.85,
    supportedFeatures: []
  },
  'llama3.2:1b': {
    name: 'llama3.2:1b',
    maxContextTokens: 128000,
    reservedOutputTokens: 2048,
    compressionThreshold: 0.80,
    supportedFeatures: []
  },
  'llama3.1:70b': {
    name: 'llama3.1:70b',
    maxContextTokens: 128000,
    reservedOutputTokens: 8192,
    compressionThreshold: 0.85,
    supportedFeatures: []
  },
  'codellama:34b': {
    name: 'codellama:34b',
    maxContextTokens: 16384,
    reservedOutputTokens: 4096,
    compressionThreshold: 0.75,
    supportedFeatures: []
  },
  'codellama:13b': {
    name: 'codellama:13b',
    maxContextTokens: 16384,
    reservedOutputTokens: 2048,
    compressionThreshold: 0.75,
    supportedFeatures: []
  },
  'mistral:7b': {
    name: 'mistral:7b',
    maxContextTokens: 32768,
    reservedOutputTokens: 4096,
    compressionThreshold: 0.80,
    supportedFeatures: []
  },
  'qwen2.5:7b': {
    name: 'qwen2.5:7b',
    maxContextTokens: 32768,
    reservedOutputTokens: 4096,
    compressionThreshold: 0.80,
    supportedFeatures: []
  },
  'gpt-4': {
    name: 'gpt-4',
    maxContextTokens: 128000,
    reservedOutputTokens: 8192,
    compressionThreshold: 0.90,
    supportedFeatures: ['functions', 'vision']
  },
  'claude-3': {
    name: 'claude-3',
    maxContextTokens: 200000,
    reservedOutputTokens: 8192,
    compressionThreshold: 0.90,
    supportedFeatures: ['vision']
  }
};

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_UNIFIED_CONTEXT_CONFIG: UnifiedContextConfig = {
  storage: {
    persistPath: '.canvas-cli/context',
    snapshotInterval: 300000,  // 5 minutes
    maxSnapshots: 50,
    compressOlderThan: 3600000  // 1 hour
  },
  window: {
    maxTokens: 32768,
    reservedTokens: 4096,
    compressionThreshold: 0.8,
    priorityWeights: {
      [ContextPriority.CRITICAL]: 10,
      [ContextPriority.HIGH]: 5,
      [ContextPriority.MEDIUM]: 2,
      [ContextPriority.LOW]: 1,
      [ContextPriority.EPHEMERAL]: 0.5
    },
    typeWeights: {
      [ContextEntryType.MESSAGE]: 2,
      [ContextEntryType.CODE]: 3,
      [ContextEntryType.FILE]: 2,
      [ContextEntryType.COMMAND]: 1,
      [ContextEntryType.RESULT]: 1.5,
      [ContextEntryType.ERROR]: 2,
      [ContextEntryType.SYSTEM]: 1,
      [ContextEntryType.SUMMARY]: 0.5
    }
  },
  summarization: {
    enabled: true,
    model: 'llama3.2:1b',
    autoCompress: true,
    preserveRecent: 10
  },
  embeddings: {
    enabled: true,
    provider: 'hybrid',
    dimensions: 384,
    cacheSize: 10000
  },
  search: {
    maxResults: 20,
    minScore: 0.5,
    semanticWeight: 0.7,
    keywordWeight: 0.3
  }
};
