/**
 * Autonomous Agent System
 *
 * A fully autonomous coding assistant that uses chain-of-thought reasoning,
 * intelligent planning, verification, and self-correction to accomplish
 * complex coding tasks with minimal human intervention.
 */

// Types
export * from './types.js';

// Core Components
export {
  OllamaBackend,
  getOllamaBackend,
  resetOllamaBackend
} from './ollama-backend.js';

export {
  ReasoningEngine,
  getReasoningEngine,
  resetReasoningEngine
} from './reasoning-engine.js';

export {
  PlanningSystem,
  getPlanningSystem,
  resetPlanningSystem
} from './planning-system.js';

export {
  VerificationEngine,
  getVerificationEngine,
  resetVerificationEngine
} from './verification-engine.js';

export {
  SelfCorrectionLoop,
  getSelfCorrectionLoop,
  resetSelfCorrectionLoop
} from './self-correction.js';

export {
  AutonomousOrchestrator,
  getAutonomousOrchestrator,
  resetAutonomousOrchestrator
} from './autonomous-orchestrator.js';

export {
  buildAgentGraph,
  runAutonomousGraph,
} from './state-graph.js';
export type { RunAgentOptions, AgentStateType } from './state-graph.js';

// Re-export embeddings
export {
  HybridEmbeddingService,
  getEmbeddingService,
  resetEmbeddingService
} from '../embeddings/hybrid-embeddings.js';
