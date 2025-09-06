import { EventEmitter } from 'events';

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  version: string;
  description: string;
  capabilities: {
    textGeneration: boolean;
    codeGeneration: boolean;
    codeAnalysis: boolean;
    reasoning: boolean;
    multimodal: boolean;
    functionCalling: boolean;
  };
  limits: {
    maxTokens: number;
    contextWindow: number;
    rateLimit: {
      requests: number;
      window: number; // in seconds
    };
  };
  pricing: {
    inputCostPer1K: number;
    outputCostPer1K: number;
    currency: string;
  };
  metadata: {
    released: string;
    deprecated?: boolean;
    beta?: boolean;
    tags: string[];
  };
  performance: {
    latency: number; // average ms
    reliability: number; // 0-1 score
    accuracy: number; // 0-1 score
    userRating: number; // 0-5 stars
  };
}

export interface ModelProvider {
  id: string;
  name: string;
  website: string;
  apiEndpoint: string;
  authType: 'api_key' | 'oauth' | 'bearer_token';
  status: 'active' | 'deprecated' | 'maintenance';
  models: string[]; // model IDs
  features: {
    streaming: boolean;
    batching: boolean;
    fineTuning: boolean;
    customModels: boolean;
  };
  documentation: string;
}

export interface ModelSelection {
  primary: string; // model ID
  fallbacks: string[]; // fallback model IDs
  contextSpecific: {
    [context: string]: string; // context -> model ID
  };
  rules: SelectionRule[];
}

export interface SelectionRule {
  id: string;
  name: string;
  condition: {
    type: 'command_type' | 'file_type' | 'project_type' | 'context_size' | 'custom';
    operator: 'equals' | 'contains' | 'starts_with' | 'regex' | 'greater_than' | 'less_than';
    value: any;
  };
  action: {
    type: 'use_model' | 'prefer_model' | 'avoid_model';
    modelId: string;
    priority: number;
  };
  enabled: boolean;
}

export interface ModelUsage {
  modelId: string;
  timestamp: number;
  context: string;
  inputTokens: number;
  outputTokens: number;
  latency: number;
  success: boolean;
  cost: number;
  userRating?: number;
  feedback?: string;
}

export interface ModelConfig {
  autoSelect: boolean;
  loadBalancing: boolean;
  costOptimization: boolean;
  performanceOptimization: boolean;
  fallbackEnabled: boolean;
  usageTracking: boolean;
  rateLimitHandling: boolean;
  caching: boolean;
}

class AIModelSelection extends EventEmitter {
  private models: Map<string, AIModel> = new Map();
  private providers: Map<string, ModelProvider> = new Map();
  private selection: ModelSelection;
  private usageHistory: ModelUsage[] = [];
  private config: ModelConfig;
  private rateLimitTracking: Map<string, { count: number; windowStart: number }> = new Map();

  constructor() {
    super();
    
    this.selection = {
      primary: '',
      fallbacks: [],
      contextSpecific: {},
      rules: []
    };
    
    this.config = {
      autoSelect: true,
      loadBalancing: false,
      costOptimization: false,
      performanceOptimization: true,
      fallbackEnabled: true,
      usageTracking: true,
      rateLimitHandling: true,
      caching: true
    };

    this.initializeDefaultModels();
  }

  /**
   * Initialize with default AI models
   */
  private initializeDefaultModels(): void {
    const defaultModels: AIModel[] = [
      {
        id: 'claude-3-sonnet',
        name: 'Claude 3 Sonnet',
        provider: 'anthropic',
        version: '3.0',
        description: 'Balanced model for coding and reasoning tasks',
        capabilities: {
          textGeneration: true,
          codeGeneration: true,
          codeAnalysis: true,
          reasoning: true,
          multimodal: true,
          functionCalling: true
        },
        limits: {
          maxTokens: 4096,
          contextWindow: 200000,
          rateLimit: { requests: 50, window: 60 }
        },
        pricing: {
          inputCostPer1K: 0.003,
          outputCostPer1K: 0.015,
          currency: 'USD'
        },
        metadata: {
          released: '2024-03-01',
          tags: ['coding', 'reasoning', 'multimodal']
        },
        performance: {
          latency: 2000,
          reliability: 0.95,
          accuracy: 0.92,
          userRating: 4.5
        }
      },
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        version: '3.0',
        description: 'Most capable model for complex tasks',
        capabilities: {
          textGeneration: true,
          codeGeneration: true,
          codeAnalysis: true,
          reasoning: true,
          multimodal: true,
          functionCalling: true
        },
        limits: {
          maxTokens: 4096,
          contextWindow: 200000,
          rateLimit: { requests: 20, window: 60 }
        },
        pricing: {
          inputCostPer1K: 0.015,
          outputCostPer1K: 0.075,
          currency: 'USD'
        },
        metadata: {
          released: '2024-02-29',
          tags: ['premium', 'reasoning', 'complex']
        },
        performance: {
          latency: 3000,
          reliability: 0.98,
          accuracy: 0.96,
          userRating: 4.8
        }
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        version: '4.0',
        description: 'Fast and capable model for various tasks',
        capabilities: {
          textGeneration: true,
          codeGeneration: true,
          codeAnalysis: true,
          reasoning: true,
          multimodal: true,
          functionCalling: true
        },
        limits: {
          maxTokens: 4096,
          contextWindow: 128000,
          rateLimit: { requests: 100, window: 60 }
        },
        pricing: {
          inputCostPer1K: 0.01,
          outputCostPer1K: 0.03,
          currency: 'USD'
        },
        metadata: {
          released: '2024-01-15',
          tags: ['fast', 'versatile']
        },
        performance: {
          latency: 1500,
          reliability: 0.94,
          accuracy: 0.90,
          userRating: 4.3
        }
      },
      {
        id: 'codestral',
        name: 'Codestral',
        provider: 'mistral',
        version: '1.0',
        description: 'Specialized model for code generation',
        capabilities: {
          textGeneration: false,
          codeGeneration: true,
          codeAnalysis: true,
          reasoning: true,
          multimodal: false,
          functionCalling: false
        },
        limits: {
          maxTokens: 2048,
          contextWindow: 32000,
          rateLimit: { requests: 200, window: 60 }
        },
        pricing: {
          inputCostPer1K: 0.001,
          outputCostPer1K: 0.003,
          currency: 'USD'
        },
        metadata: {
          released: '2024-05-29',
          tags: ['coding', 'specialized', 'affordable']
        },
        performance: {
          latency: 800,
          reliability: 0.91,
          accuracy: 0.89,
          userRating: 4.1
        }
      }
    ];

    const defaultProviders: ModelProvider[] = [
      {
        id: 'anthropic',
        name: 'Anthropic',
        website: 'https://anthropic.com',
        apiEndpoint: 'https://api.anthropic.com/v1',
        authType: 'api_key',
        status: 'active',
        models: ['claude-3-sonnet', 'claude-3-opus'],
        features: {
          streaming: true,
          batching: false,
          fineTuning: false,
          customModels: false
        },
        documentation: 'https://docs.anthropic.com'
      },
      {
        id: 'openai',
        name: 'OpenAI',
        website: 'https://openai.com',
        apiEndpoint: 'https://api.openai.com/v1',
        authType: 'bearer_token',
        status: 'active',
        models: ['gpt-4-turbo'],
        features: {
          streaming: true,
          batching: true,
          fineTuning: true,
          customModels: true
        },
        documentation: 'https://platform.openai.com/docs'
      },
      {
        id: 'mistral',
        name: 'Mistral AI',
        website: 'https://mistral.ai',
        apiEndpoint: 'https://api.mistral.ai/v1',
        authType: 'bearer_token',
        status: 'active',
        models: ['codestral'],
        features: {
          streaming: true,
          batching: false,
          fineTuning: false,
          customModels: false
        },
        documentation: 'https://docs.mistral.ai'
      }
    ];

    // Initialize models and providers
    defaultModels.forEach(model => this.models.set(model.id, model));
    defaultProviders.forEach(provider => this.providers.set(provider.id, provider));

    // Set default selection
    this.selection.primary = 'claude-3-sonnet';
    this.selection.fallbacks = ['gpt-4-turbo', 'claude-3-opus'];
    this.selection.contextSpecific = {
      'code': 'codestral',
      'complex_reasoning': 'claude-3-opus',
      'general': 'claude-3-sonnet'
    };

    this.emit('initialized', { 
      modelCount: this.models.size, 
      providerCount: this.providers.size 
    });
  }

  /**
   * Select the best model for a given context
   */
  public selectModel(context: {
    type?: string;
    fileType?: string;
    projectType?: string;
    contentSize?: number;
    complexity?: 'low' | 'medium' | 'high';
    budget?: number;
    priority?: 'speed' | 'quality' | 'cost';
  }): string {
    // Check context-specific selections first
    if (context.type && this.selection.contextSpecific[context.type]) {
      const modelId = this.selection.contextSpecific[context.type];
      if (this.isModelAvailable(modelId)) {
        this.emit('model:selected', { modelId, reason: 'context_specific', context });
        return modelId;
      }
    }

    // Apply selection rules
    const ruleBasedModel = this.applySelectionRules(context);
    if (ruleBasedModel && this.isModelAvailable(ruleBasedModel)) {
      this.emit('model:selected', { modelId: ruleBasedModel, reason: 'rule_based', context });
      return ruleBasedModel;
    }

    // Auto-selection based on configuration
    if (this.config.autoSelect) {
      const autoSelected = this.autoSelectModel(context);
      if (autoSelected && this.isModelAvailable(autoSelected)) {
        this.emit('model:selected', { modelId: autoSelected, reason: 'auto_selected', context });
        return autoSelected;
      }
    }

    // Use primary model if available
    if (this.isModelAvailable(this.selection.primary)) {
      this.emit('model:selected', { 
        modelId: this.selection.primary, 
        reason: 'primary', 
        context 
      });
      return this.selection.primary;
    }

    // Try fallbacks
    for (const fallbackId of this.selection.fallbacks) {
      if (this.isModelAvailable(fallbackId)) {
        this.emit('model:selected', { 
          modelId: fallbackId, 
          reason: 'fallback', 
          context 
        });
        return fallbackId;
      }
    }

    // Last resort: any available model
    for (const [modelId] of this.models) {
      if (this.isModelAvailable(modelId)) {
        this.emit('model:selected', { 
          modelId, 
          reason: 'last_resort', 
          context 
        });
        return modelId;
      }
    }

    throw new Error('No available models found');
  }

  /**
   * Auto-select model based on context and configuration
   */
  private autoSelectModel(context: any): string | null {
    const availableModels = Array.from(this.models.values())
      .filter(model => this.isModelAvailable(model.id));

    if (availableModels.length === 0) return null;

    // Performance optimization
    if (this.config.performanceOptimization && context.priority === 'speed') {
      const fastest = availableModels
        .sort((a, b) => a.performance.latency - b.performance.latency)[0];
      return fastest.id;
    }

    // Cost optimization
    if (this.config.costOptimization || context.priority === 'cost') {
      const cheapest = availableModels
        .sort((a, b) => {
          const costA = a.pricing.inputCostPer1K + a.pricing.outputCostPer1K;
          const costB = b.pricing.inputCostPer1K + b.pricing.outputCostPer1K;
          return costA - costB;
        })[0];
      return cheapest.id;
    }

    // Quality optimization
    if (context.priority === 'quality' || context.complexity === 'high') {
      const bestQuality = availableModels
        .sort((a, b) => b.performance.accuracy - a.performance.accuracy)[0];
      return bestQuality.id;
    }

    // Context size considerations
    if (context.contentSize && context.contentSize > 50000) {
      const largeContext = availableModels
        .filter(model => model.limits.contextWindow >= context.contentSize)
        .sort((a, b) => b.limits.contextWindow - a.limits.contextWindow)[0];
      return largeContext?.id || null;
    }

    // Capability-based selection
    if (context.type === 'code' || context.fileType?.match(/\.(js|ts|py|java|cpp|c|go|rs|php|rb)$/)) {
      const bestForCode = availableModels
        .filter(model => model.capabilities.codeGeneration)
        .sort((a, b) => b.performance.accuracy - a.performance.accuracy)[0];
      return bestForCode?.id || null;
    }

    return null;
  }

  /**
   * Apply selection rules to determine model
   */
  private applySelectionRules(context: any): string | null {
    const applicableRules = this.selection.rules
      .filter(rule => rule.enabled)
      .filter(rule => this.evaluateRuleCondition(rule.condition, context))
      .sort((a, b) => b.action.priority - a.action.priority);

    for (const rule of applicableRules) {
      if (rule.action.type === 'use_model' || rule.action.type === 'prefer_model') {
        return rule.action.modelId;
      }
    }

    return null;
  }

  /**
   * Evaluate rule condition
   */
  private evaluateRuleCondition(condition: SelectionRule['condition'], context: any): boolean {
    const contextValue = this.getContextValue(condition.type, context);
    if (contextValue === undefined) return false;

    switch (condition.operator) {
      case 'equals':
        return contextValue === condition.value;
      case 'contains':
        return String(contextValue).includes(String(condition.value));
      case 'starts_with':
        return String(contextValue).startsWith(String(condition.value));
      case 'regex':
        return new RegExp(condition.value).test(String(contextValue));
      case 'greater_than':
        return Number(contextValue) > Number(condition.value);
      case 'less_than':
        return Number(contextValue) < Number(condition.value);
      default:
        return false;
    }
  }

  /**
   * Get context value for rule evaluation
   */
  private getContextValue(type: string, context: any): any {
    switch (type) {
      case 'command_type':
        return context.type;
      case 'file_type':
        return context.fileType;
      case 'project_type':
        return context.projectType;
      case 'context_size':
        return context.contentSize;
      default:
        return context[type];
    }
  }

  /**
   * Check if model is available (not rate limited, not down, etc.)
   */
  private isModelAvailable(modelId: string): boolean {
    const model = this.models.get(modelId);
    if (!model) return false;

    const provider = this.providers.get(model.provider);
    if (!provider || provider.status !== 'active') return false;

    // Check rate limits
    if (this.config.rateLimitHandling) {
      const rateLimitInfo = this.rateLimitTracking.get(modelId);
      if (rateLimitInfo) {
        const now = Date.now();
        const windowElapsed = (now - rateLimitInfo.windowStart) / 1000;
        
        if (windowElapsed < model.limits.rateLimit.window) {
          if (rateLimitInfo.count >= model.limits.rateLimit.requests) {
            return false; // Rate limited
          }
        } else {
          // Reset rate limit window
          this.rateLimitTracking.set(modelId, { count: 0, windowStart: now });
        }
      }
    }

    return true;
  }

  /**
   * Record model usage
   */
  public recordUsage(
    modelId: string,
    context: string,
    inputTokens: number,
    outputTokens: number,
    latency: number,
    success: boolean,
    userRating?: number,
    feedback?: string
  ): void {
    const model = this.models.get(modelId);
    if (!model) return;

    const cost = (inputTokens / 1000) * model.pricing.inputCostPer1K + 
                 (outputTokens / 1000) * model.pricing.outputCostPer1K;

    const usage: ModelUsage = {
      modelId,
      timestamp: Date.now(),
      context,
      inputTokens,
      outputTokens,
      latency,
      success,
      cost,
      userRating,
      feedback
    };

    this.usageHistory.push(usage);

    // Update rate limiting
    if (this.config.rateLimitHandling) {
      const rateLimitInfo = this.rateLimitTracking.get(modelId) || 
        { count: 0, windowStart: Date.now() };
      rateLimitInfo.count++;
      this.rateLimitTracking.set(modelId, rateLimitInfo);
    }

    // Update model performance metrics
    this.updateModelPerformance(modelId, latency, success);

    this.emit('usage:recorded', usage);
  }

  /**
   * Update model performance metrics based on usage
   */
  private updateModelPerformance(modelId: string, latency: number, success: boolean): void {
    const model = this.models.get(modelId);
    if (!model) return;

    // Update moving averages
    const alpha = 0.1; // smoothing factor
    model.performance.latency = model.performance.latency * (1 - alpha) + latency * alpha;
    model.performance.reliability = model.performance.reliability * (1 - alpha) + 
      (success ? 1 : 0) * alpha;

    this.emit('performance:updated', { modelId, performance: model.performance });
  }

  /**
   * Add selection rule
   */
  public addSelectionRule(rule: Omit<SelectionRule, 'id'>): string {
    const ruleWithId: SelectionRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...rule
    };

    this.selection.rules.push(ruleWithId);
    this.emit('rule:added', ruleWithId);

    return ruleWithId.id;
  }

  /**
   * Remove selection rule
   */
  public removeSelectionRule(ruleId: string): boolean {
    const index = this.selection.rules.findIndex(rule => rule.id === ruleId);
    if (index === -1) return false;

    const removed = this.selection.rules.splice(index, 1)[0];
    this.emit('rule:removed', removed);

    return true;
  }

  /**
   * Update model selection
   */
  public updateSelection(selection: Partial<ModelSelection>): void {
    this.selection = { ...this.selection, ...selection };
    this.emit('selection:updated', this.selection);
  }

  /**
   * Get available models
   */
  public getModels(filter?: {
    provider?: string;
    capability?: keyof AIModel['capabilities'];
    maxCost?: number;
    minRating?: number;
  }): AIModel[] {
    let models = Array.from(this.models.values());

    if (filter) {
      if (filter.provider) {
        models = models.filter(model => model.provider === filter.provider);
      }
      if (filter.capability) {
        models = models.filter(model => model.capabilities[filter.capability!]);
      }
      if (filter.maxCost) {
        models = models.filter(model => 
          (model.pricing.inputCostPer1K + model.pricing.outputCostPer1K) <= filter.maxCost!
        );
      }
      if (filter.minRating) {
        models = models.filter(model => model.performance.userRating >= filter.minRating!);
      }
    }

    return models.sort((a, b) => b.performance.userRating - a.performance.userRating);
  }

  /**
   * Get usage statistics
   */
  public getUsageStats(timeRange?: { from: number; to: number }): {
    totalUsage: number;
    totalCost: number;
    modelBreakdown: Record<string, { usage: number; cost: number }>;
    averageLatency: number;
    successRate: number;
  } {
    let relevantUsage = this.usageHistory;

    if (timeRange) {
      relevantUsage = relevantUsage.filter(usage => 
        usage.timestamp >= timeRange.from && usage.timestamp <= timeRange.to
      );
    }

    const totalUsage = relevantUsage.length;
    const totalCost = relevantUsage.reduce((sum, usage) => sum + usage.cost, 0);
    const modelBreakdown: Record<string, { usage: number; cost: number }> = {};
    
    relevantUsage.forEach(usage => {
      if (!modelBreakdown[usage.modelId]) {
        modelBreakdown[usage.modelId] = { usage: 0, cost: 0 };
      }
      modelBreakdown[usage.modelId].usage++;
      modelBreakdown[usage.modelId].cost += usage.cost;
    });

    const averageLatency = totalUsage > 0 ? 
      relevantUsage.reduce((sum, usage) => sum + usage.latency, 0) / totalUsage : 0;
    
    const successCount = relevantUsage.filter(usage => usage.success).length;
    const successRate = totalUsage > 0 ? successCount / totalUsage : 0;

    return {
      totalUsage,
      totalCost,
      modelBreakdown,
      averageLatency,
      successRate
    };
  }

  /**
   * Get current selection
   */
  public getSelection(): ModelSelection {
    return { ...this.selection };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<ModelConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): ModelConfig {
    return { ...this.config };
  }

  /**
   * Add custom model
   */
  public addCustomModel(model: AIModel): void {
    this.models.set(model.id, model);
    this.emit('model:added', model);
  }

  /**
   * Remove model
   */
  public removeModel(modelId: string): boolean {
    const removed = this.models.delete(modelId);
    if (removed) {
      this.emit('model:removed', { modelId });
    }
    return removed;
  }

  /**
   * Clear usage history
   */
  public clearUsageHistory(): void {
    this.usageHistory = [];
    this.emit('usage:cleared');
  }
}

let modelSelectionInstance: AIModelSelection | null = null;

export function getAIModelSelection(): AIModelSelection {
  if (!modelSelectionInstance) {
    modelSelectionInstance = new AIModelSelection();
  }
  return modelSelectionInstance;
}

export default AIModelSelection;