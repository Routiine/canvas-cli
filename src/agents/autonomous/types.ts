/**
 * Autonomous Agent System - Type Definitions
 *
 * Core interfaces for the fully autonomous coding assistant system
 * that uses chain-of-thought reasoning, planning, verification, and self-correction.
 */

// ============================================================================
// Core Enums
// ============================================================================

export enum ThinkingStepType {
  OBSERVATION = 'observation',
  HYPOTHESIS = 'hypothesis',
  ANALYSIS = 'analysis',
  DECISION = 'decision',
  REFLECTION = 'reflection'
}

export enum ExecutionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  SKIPPED = 'skipped'
}

export enum VerificationResult {
  PASSED = 'passed',
  FAILED = 'failed',
  PARTIAL = 'partial',
  NEEDS_REVIEW = 'needs_review'
}

export enum CorrectionStrategy {
  RETRY_SAME = 'retry_same',
  MODIFY_APPROACH = 'modify_approach',
  DECOMPOSE_FURTHER = 'decompose_further',
  REQUEST_HELP = 'request_help',
  SKIP_STEP = 'skip_step',
  ABORT = 'abort'
}

export enum TaskType {
  CODE_GENERATION = 'code_generation',
  CODE_ANALYSIS = 'code_analysis',
  CODE_MODIFICATION = 'code_modification',
  BUG_FIX = 'bug_fix',
  REFACTORING = 'refactoring',
  TESTING = 'testing',
  DOCUMENTATION = 'documentation',
  FILE_OPERATION = 'file_operation',
  SHELL_COMMAND = 'shell_command',
  RESEARCH = 'research',
  PLANNING = 'planning'
}

// ============================================================================
// Reasoning Types
// ============================================================================

export interface ThinkingStep {
  id: string;
  type: ThinkingStepType;
  content: string;
  confidence: number;  // 0-1
  timestamp: Date;
  duration?: number;   // ms
  metadata?: Record<string, unknown>;
}

export interface ReasoningChain {
  id: string;
  task: string;
  steps: ThinkingStep[];
  conclusion: string;
  overallConfidence: number;
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;
  context: ReasoningContext;
}

export interface ReasoningContext {
  codebaseUnderstanding: string[];
  relevantFiles: string[];
  constraints: string[];
  assumptions: string[];
  risks: string[];
}

export interface ReasoningConfig {
  maxSteps: number;
  minConfidence: number;
  enableReflection: boolean;
  temperature: number;
  timeoutMs: number;
}

// ============================================================================
// Planning Types
// ============================================================================

export interface ExecutionStep {
  id: string;
  description: string;
  type: TaskType;
  status: ExecutionStatus;
  dependencies: string[];  // Step IDs
  estimatedComplexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';
  toolsRequired: string[];
  inputs: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  startTime?: Date;
  endTime?: Date;
  error?: ExecutionError;
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  steps: ExecutionStep[];
  dependencies: Map<string, string[]>;  // stepId -> dependencyIds
  criticalPath: string[];  // Ordered step IDs for longest path
  fallbackPlans: Map<string, ExecutionPlan>;  // stepId -> fallback plan
  checkpoints: string[];  // Step IDs where verification is required
  createdAt: Date;
  updatedAt: Date;
  estimatedDuration?: number;
  metadata: PlanMetadata;
}

export interface PlanMetadata {
  complexity: 'simple' | 'moderate' | 'complex';
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
  affectedFiles: string[];
  potentialSideEffects: string[];
}

export interface PlanningConfig {
  maxStepsPerPlan: number;
  maxPlanDepth: number;
  enableParallelExecution: boolean;
  requireCheckpoints: boolean;
  autoReplan: boolean;
}

// ============================================================================
// Verification Types
// ============================================================================

export interface VerificationCheck {
  id: string;
  name: string;
  description: string;
  type: 'syntax' | 'semantic' | 'functional' | 'integration' | 'custom';
  passed: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface VerificationReport {
  stepId: string;
  result: VerificationResult;
  checks: VerificationCheck[];
  diffAnalysis?: DiffAnalysis;
  timestamp: Date;
  duration: number;
  suggestions?: string[];
}

export interface DiffAnalysis {
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  syntaxValid: boolean;
  semanticChanges: SemanticChange[];
  potentialIssues: string[];
}

export interface SemanticChange {
  type: 'function_added' | 'function_removed' | 'function_modified' |
        'class_added' | 'class_removed' | 'class_modified' |
        'import_added' | 'import_removed' | 'export_changed' |
        'variable_changed' | 'type_changed' | 'other';
  name: string;
  file: string;
  description: string;
  impact: 'none' | 'low' | 'medium' | 'high';
}

export interface VerificationConfig {
  enableSyntaxCheck: boolean;
  enableSemanticAnalysis: boolean;
  enableTestExecution: boolean;
  enableTypeCheck: boolean;
  strictMode: boolean;
  timeoutMs: number;
}

// ============================================================================
// Self-Correction Types
// ============================================================================

export interface ExecutionError {
  code: string;
  message: string;
  type: 'syntax' | 'runtime' | 'logic' | 'timeout' | 'permission' | 'external' | 'unknown';
  stackTrace?: string;
  context?: Record<string, unknown>;
  recoverable: boolean;
  suggestedFix?: string;
}

export interface CorrectionAttempt {
  id: string;
  stepId: string;
  error: ExecutionError;
  strategy: CorrectionStrategy;
  modification: string;
  successful: boolean;
  timestamp: Date;
  duration: number;
  resultingError?: ExecutionError;
}

export interface LearningEntry {
  errorPattern: string;
  successfulStrategy: CorrectionStrategy;
  context: string;
  frequency: number;
  lastOccurrence: Date;
  averageRecoveryTime: number;
}

export interface CorrectionConfig {
  maxRetries: number;
  enableLearning: boolean;
  aggressiveRecovery: boolean;
  fallbackTimeout: number;
  strategies: CorrectionStrategy[];
}

// ============================================================================
// Ollama Backend Types
// ============================================================================

export interface OllamaModel {
  name: string;
  contextLength: number;
  capabilities: ModelCapability[];
  speed: 'fast' | 'medium' | 'slow';
  quality: 'basic' | 'good' | 'excellent';
  memoryRequirement: number;  // GB
}

export type ModelCapability =
  | 'reasoning'
  | 'code_generation'
  | 'code_analysis'
  | 'planning'
  | 'summarization'
  | 'embedding'
  | 'chat'
  | 'instruction_following';

export interface ModelRouting {
  reasoning: string[];
  code_generation: string[];
  code_analysis: string[];
  planning: string[];
  summarization: string[];
  embedding: string[];
}

export interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  routing: ModelRouting;
  timeout: number;
  maxRetries: number;
  enableStreaming: boolean;
  contextWindowPercentage: number;  // How much of context to use (0-1)
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  system?: string;
  context?: number[];
  options?: OllamaOptions;
  stream?: boolean;
  format?: 'json';
}

export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  stop?: string[];
  seed?: number;
  num_ctx?: number;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

export interface OllamaEmbeddingResponse {
  embedding: number[];
}

// ============================================================================
// Autonomous Orchestrator Types
// ============================================================================

export interface AutonomousTask {
  id: string;
  goal: string;
  type: TaskType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  context: TaskContext;
  constraints: TaskConstraints;
  status: ExecutionStatus;
  plan?: ExecutionPlan;
  reasoningChain?: ReasoningChain;
  verificationReports: VerificationReport[];
  correctionAttempts: CorrectionAttempt[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TaskResult;
}

export interface TaskContext {
  conversationHistory: string[];
  relevantFiles: string[];
  codebaseState: string;
  userPreferences: Record<string, unknown>;
  previousAttempts: string[];
}

export interface TaskConstraints {
  maxIterations: number;
  timeoutMs: number;
  requireApprovalFor: ApprovalRequired[];
  allowedTools: string[];
  disallowedOperations: string[];
}

export type ApprovalRequired =
  | 'file_write'
  | 'file_delete'
  | 'shell_command'
  | 'git_push'
  | 'git_commit'
  | 'external_api'
  | 'install_dependency';

export interface TaskResult {
  success: boolean;
  output: string;
  filesModified: string[];
  commandsExecuted: string[];
  errors: ExecutionError[];
  metrics: TaskMetrics;
}

export interface TaskMetrics {
  totalDuration: number;
  thinkingDuration: number;
  planningDuration: number;
  executionDuration: number;
  verificationDuration: number;
  correctionDuration: number;
  iterationCount: number;
  tokensUsed: number;
  modelCalls: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type AutonomousEvent =
  | { type: 'task_started'; task: AutonomousTask }
  | { type: 'thinking_started'; taskId: string }
  | { type: 'thinking_step'; taskId: string; step: ThinkingStep }
  | { type: 'thinking_completed'; taskId: string; chain: ReasoningChain }
  | { type: 'planning_started'; taskId: string }
  | { type: 'planning_completed'; taskId: string; plan: ExecutionPlan }
  | { type: 'step_started'; taskId: string; step: ExecutionStep }
  | { type: 'step_completed'; taskId: string; stepId: string; result: unknown }
  | { type: 'step_failed'; taskId: string; stepId: string; error: ExecutionError }
  | { type: 'verification_started'; taskId: string; stepId: string }
  | { type: 'verification_completed'; taskId: string; report: VerificationReport }
  | { type: 'correction_started'; taskId: string; stepId: string; strategy: CorrectionStrategy }
  | { type: 'correction_completed'; taskId: string; attempt: CorrectionAttempt }
  | { type: 'task_completed'; task: AutonomousTask; result: TaskResult }
  | { type: 'task_failed'; task: AutonomousTask; error: ExecutionError }
  | { type: 'approval_required'; taskId: string; operation: ApprovalRequired; details: string };

export type EventHandler = (event: AutonomousEvent) => void | Promise<void>;

// ============================================================================
// Configuration Types
// ============================================================================

export interface AutonomousConfig {
  enabled: boolean;
  maxIterations: number;
  requireApprovalFor: ApprovalRequired[];
  reasoning: ReasoningConfig;
  planning: PlanningConfig;
  verification: VerificationConfig;
  correction: CorrectionConfig;
  ollama: OllamaConfig;
  embeddings: EmbeddingsConfig;
}

export interface EmbeddingsConfig {
  provider: 'local' | 'ollama' | 'hybrid';
  localModel: string;
  ollamaModel: string;
  dimensions: number;
  cacheSize: number;
  fallbackToApi: boolean;
  apiProvider?: 'openai' | 'cohere';
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface ProgressCallback {
  (progress: number, message: string): void;
}

export interface CancellationToken {
  isCancelled: boolean;
  onCancelled: (callback: () => void) => void;
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_REASONING_CONFIG: ReasoningConfig = {
  maxSteps: 10,
  minConfidence: 0.7,
  enableReflection: true,
  temperature: 0.3,
  timeoutMs: 60000
};

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  maxStepsPerPlan: 20,
  maxPlanDepth: 5,
  enableParallelExecution: true,
  requireCheckpoints: true,
  autoReplan: true
};

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  enableSyntaxCheck: true,
  enableSemanticAnalysis: true,
  enableTestExecution: false,
  enableTypeCheck: true,
  strictMode: false,
  timeoutMs: 30000
};

export const DEFAULT_CORRECTION_CONFIG: CorrectionConfig = {
  maxRetries: 3,
  enableLearning: true,
  aggressiveRecovery: false,
  fallbackTimeout: 120000,
  strategies: [
    CorrectionStrategy.RETRY_SAME,
    CorrectionStrategy.MODIFY_APPROACH,
    CorrectionStrategy.DECOMPOSE_FURTHER,
    CorrectionStrategy.REQUEST_HELP
  ]
};

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  defaultModel: 'llama3.2:3b',
  routing: {
    reasoning: ['llama3.1:70b', 'llama3.2:3b', 'qwen2.5:7b'],
    code_generation: ['codellama:34b', 'deepseek-coder:6.7b', 'llama3.2:3b'],
    code_analysis: ['codellama:34b', 'llama3.2:3b'],
    planning: ['llama3.1:70b', 'mistral:7b', 'llama3.2:3b'],
    summarization: ['llama3.2:1b', 'mistral:7b', 'llama3.2:3b'],
    embedding: ['nomic-embed-text', 'mxbai-embed-large']
  },
  timeout: 120000,
  maxRetries: 3,
  enableStreaming: true,
  contextWindowPercentage: 0.85
};

export const DEFAULT_EMBEDDINGS_CONFIG: EmbeddingsConfig = {
  provider: 'hybrid',
  localModel: 'Xenova/all-MiniLM-L6-v2',
  ollamaModel: 'nomic-embed-text',
  dimensions: 384,
  cacheSize: 10000,
  fallbackToApi: false
};

export const DEFAULT_AUTONOMOUS_CONFIG: AutonomousConfig = {
  enabled: true,
  maxIterations: 50,
  requireApprovalFor: ['git_push', 'install_dependency', 'external_api'],
  reasoning: DEFAULT_REASONING_CONFIG,
  planning: DEFAULT_PLANNING_CONFIG,
  verification: DEFAULT_VERIFICATION_CONFIG,
  correction: DEFAULT_CORRECTION_CONFIG,
  ollama: DEFAULT_OLLAMA_CONFIG,
  embeddings: DEFAULT_EMBEDDINGS_CONFIG
};
