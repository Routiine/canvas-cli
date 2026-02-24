/**
 * Priority 1: Model Router
 * Routes tasks between local Ollama and frontier AI APIs
 */

import { classifyTask, type ClassificationResult } from './complexity-classifier.js';
import { getProviderRegistry, type Message, type CompletionOptions } from './provider-registry.js';
import { getCostTracker, hashTask } from './cost-tracker.js';

export interface RouterContext {
  conversationHistory?: Message[];
  fileCount?: number;
  forceLocal?: boolean;
  forceApi?: boolean;
  preferredProvider?: string;
}

export interface RouterDecision {
  routed_to: string;
  provider?: string;
  model?: string;
  reason: string;
  complexity: ClassificationResult;
  estimatedCost: number;
}

export class ModelRouter {
  private localOnlyMode: boolean;
  
  constructor() {
    this.localOnlyMode = process.env.CANVAS_LOCAL_ONLY === '1' || process.argv.includes('--local-only');
  }
  
  async routeTask(task: string, context: RouterContext = {}): Promise<RouterDecision> {
    const tracker = getCostTracker();
    const registry = getProviderRegistry();
    
    // Force local if flag set
    if (this.localOnlyMode || context.forceLocal) {
      const complexity = classifyTask(task, {
        fileCount: context.fileCount,
        conversationLength: context.conversationHistory?.length
      });
      return {
        routed_to: 'local',
        reason: 'Local-only mode enabled',
        complexity,
        estimatedCost: 0
      };
    }
    
    const complexity = classifyTask(task, {
      fileCount: context.fileCount,
      codeBlockCount: (task.match(/```/g) || []).length / 2,
      conversationLength: context.conversationHistory?.length
    });
    
    // Check budget
    const remaining = tracker.getRemainingBudget();
    if (remaining <= 0) {
      return {
        routed_to: 'local',
        reason: 'Session budget exhausted',
        complexity,
        estimatedCost: 0
      };
    }
    
    // For low complexity, always use local
    if (complexity.tier === 'local' && !context.forceApi) {
      return {
        routed_to: 'local',
        reason: `Low complexity (score: ${complexity.score})`,
        complexity,
        estimatedCost: 0
      };
    }
    
    // Try to get an API provider
    const preferredName = context.preferredProvider || process.env.CANVAS_PREFERRED_PROVIDER;
    const provider = registry.getBestAvailable(preferredName);
    
    if (!provider) {
      return {
        routed_to: 'local',
        reason: 'No API providers configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY)',
        complexity,
        estimatedCost: 0
      };
    }
    
    // For local-preferred tier, check if local is sufficient
    if (complexity.tier === 'local-preferred' && !context.forceApi) {
      // Use local unless user explicitly wants API routing
      return {
        routed_to: 'local',
        reason: `Medium complexity (score: ${complexity.score}), using local`,
        complexity,
        estimatedCost: 0
      };
    }
    
    const model = provider.getDefaultModel();
    const estimatedTokens = Math.ceil(task.length / 4);
    const estimatedCost = provider.estimateCost(estimatedTokens, estimatedTokens * 2, model);
    
    // Log decision
    tracker.logRouting({
      session_id: '',
      task_hash: hashTask(task),
      complexity_score: complexity.score,
      routed_to: provider.name as 'claude' | 'openai',
      cost_usd: estimatedCost,
      tokens_in: estimatedTokens,
      tokens_out: estimatedTokens * 2
    });

    return {
      routed_to: provider.name,
      provider: provider.name,
      model,
      reason: `High complexity (score: ${complexity.score})`,
      complexity,
      estimatedCost
    };
  }

  /**
   * Complete with automatic fallback to other available providers on failure.
   */
  async complete(task: string, messages: Message[], context: RouterContext = {}): Promise<string> {
    const decision = await this.routeTask(task, context);

    if (decision.routed_to === 'local') {
      return ''; // Caller should handle local completion
    }

    const registry = getProviderRegistry();
    const available = registry.getAvailable();

    // Try preferred provider first, then fall back to others
    const ordered = decision.provider
      ? [registry.get(decision.provider), ...available.filter(p => p.name !== decision.provider)].filter(Boolean) as typeof available
      : available;

    for (const provider of ordered) {
      try {
        return await provider.complete(messages, { model: decision.model });
      } catch (error: any) {
        console.warn(`Provider ${provider.name} failed: ${error.message}, trying fallback...`);
      }
    }

    throw new Error('All providers failed');
  }
}

let router: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!router) router = new ModelRouter();
  return router;
}
