/**
 * Global model state management system
 * Based on goose-cli's global model tracking
 */

export interface ModelCapabilities {
  name: string;
  contextLimit: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsEmbeddings: boolean;
  tokenizerName?: string;
  provider: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface ModelSession {
  modelName: string;
  realModelName?: string; // Resolved alias
  startTime: Date;
  totalUsage: ModelUsage;
  requestCount: number;
  lastUsed: Date;
}

/**
 * Global singleton for managing model state
 */
class ModelManagerSingleton {
  private currentModel: string | null = null;
  private currentRealModel: string | null = null;
  private modelAliases: Map<string, string> = new Map();
  private modelCapabilities: Map<string, ModelCapabilities> = new Map();
  private sessions: Map<string, ModelSession> = new Map();
  private listeners: Set<(modelName: string, realModelName?: string) => void> = new Set();

  constructor() {
    this.initializeDefaultModels();
  }

  /**
   * Set the current active model
   */
  setCurrentModel(modelName: string, realModelName?: string): void {
    const previousModel = this.currentModel;
    this.currentModel = modelName;
    this.currentRealModel = realModelName || this.resolveModelAlias(modelName) || modelName;

    // Update session
    this.updateSession(this.currentRealModel);

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(this.currentModel!, this.currentRealModel!);
      } catch (error) {
        console.warn('Error in model change listener:', error);
      }
    });

    console.log(`Model changed: ${previousModel} → ${this.currentModel} (${this.currentRealModel})`);
  }

  /**
   * Get the current model name (alias)
   */
  getCurrentModel(): string | null {
    return this.currentModel;
  }

  /**
   * Get the current real model name (resolved alias)
   */
  getCurrentRealModel(): string | null {
    return this.currentRealModel;
  }

  /**
   * Register a model alias
   */
  registerAlias(alias: string, realModelName: string): void {
    this.modelAliases.set(alias, realModelName);
    console.log(`Registered alias: ${alias} → ${realModelName}`);
  }

  /**
   * Resolve a model alias to the real model name
   */
  resolveModelAlias(modelName: string): string | null {
    return this.modelAliases.get(modelName) || null;
  }

  /**
   * Get all registered aliases
   */
  getAllAliases(): Map<string, string> {
    return new Map(this.modelAliases);
  }

  /**
   * Register model capabilities
   */
  registerCapabilities(capabilities: ModelCapabilities): void {
    this.modelCapabilities.set(capabilities.name, capabilities);
  }

  /**
   * Get model capabilities
   */
  getCapabilities(modelName: string): ModelCapabilities | null {
    const realModelName = this.resolveModelAlias(modelName) || modelName;
    return this.modelCapabilities.get(realModelName) || this.inferCapabilities(realModelName);
  }

  /**
   * Get all registered model capabilities
   */
  getAllCapabilities(): Map<string, ModelCapabilities> {
    return new Map(this.modelCapabilities);
  }

  /**
   * Add a model change listener
   */
  onModelChange(listener: (modelName: string, realModelName?: string) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Record token usage for the current model
   */
  recordUsage(usage: ModelUsage): void {
    if (!this.currentRealModel) return;

    const session = this.getOrCreateSession(this.currentRealModel);
    session.totalUsage.inputTokens += usage.inputTokens;
    session.totalUsage.outputTokens += usage.outputTokens;
    session.totalUsage.totalTokens += usage.totalTokens;
    
    if (usage.cost !== undefined) {
      session.totalUsage.cost = (session.totalUsage.cost || 0) + usage.cost;
    }
    
    session.requestCount++;
    session.lastUsed = new Date();
  }

  /**
   * Get usage statistics for a model
   */
  getUsageStats(modelName?: string): ModelSession | null {
    const targetModel = modelName 
      ? (this.resolveModelAlias(modelName) || modelName)
      : this.currentRealModel;
    
    if (!targetModel) return null;
    return this.sessions.get(targetModel) || null;
  }

  /**
   * Get usage statistics for all models
   */
  getAllUsageStats(): Map<string, ModelSession> {
    return new Map(this.sessions);
  }

  /**
   * Get usage summary
   */
  getUsageSummary(): {
    totalModels: number;
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    currentModel: string | null;
    currentRealModel: string | null;
    topModelsByUsage: Array<{name: string, requests: number, tokens: number}>;
  } {
    const sessions = Array.from(this.sessions.values());
    const totalRequests = sessions.reduce((sum, s) => sum + s.requestCount, 0);
    const totalTokens = sessions.reduce((sum, s) => sum + s.totalUsage.totalTokens, 0);
    const totalCost = sessions.reduce((sum, s) => sum + (s.totalUsage.cost || 0), 0);
    
    const topModelsByUsage = sessions
      .map(s => ({
        name: s.modelName,
        requests: s.requestCount,
        tokens: s.totalUsage.totalTokens
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);

    return {
      totalModels: this.sessions.size,
      totalRequests,
      totalTokens,
      totalCost,
      currentModel: this.currentModel,
      currentRealModel: this.currentRealModel,
      topModelsByUsage
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats(modelName?: string): void {
    if (modelName) {
      const realModelName = this.resolveModelAlias(modelName) || modelName;
      this.sessions.delete(realModelName);
    } else {
      this.sessions.clear();
    }
  }

  /**
   * Export model manager state
   */
  exportState(): any {
    return {
      currentModel: this.currentModel,
      currentRealModel: this.currentRealModel,
      aliases: Object.fromEntries(this.modelAliases),
      capabilities: Object.fromEntries(this.modelCapabilities),
      sessions: Object.fromEntries(
        Array.from(this.sessions.entries()).map(([k, v]) => [
          k,
          {
            ...v,
            startTime: v.startTime.toISOString(),
            lastUsed: v.lastUsed.toISOString()
          }
        ])
      )
    };
  }

  /**
   * Import model manager state
   */
  importState(state: any): void {
    if (state.currentModel) {
      this.currentModel = state.currentModel;
    }
    if (state.currentRealModel) {
      this.currentRealModel = state.currentRealModel;
    }
    if (state.aliases) {
      this.modelAliases = new Map(Object.entries(state.aliases));
    }
    if (state.capabilities) {
      this.modelCapabilities = new Map(Object.entries(state.capabilities));
    }
    if (state.sessions) {
      this.sessions = new Map(
        Object.entries(state.sessions).map(([k, v]: [string, any]) => [
          k,
          {
            ...v,
            startTime: new Date(v.startTime),
            lastUsed: new Date(v.lastUsed)
          }
        ])
      );
    }
  }

  /**
   * Check if a model supports a specific capability
   */
  supportsCapability(modelName: string, capability: keyof ModelCapabilities): boolean {
    const caps = this.getCapabilities(modelName);
    if (!caps) return false;
    
    return Boolean(caps[capability]);
  }

  /**
   * Get recommended models for a specific use case
   */
  getRecommendedModels(criteria: {
    requiresTools?: boolean;
    requiresLargeContext?: boolean;
    requiresEmbeddings?: boolean;
    provider?: string;
  }): ModelCapabilities[] {
    const models = Array.from(this.modelCapabilities.values());
    
    return models.filter(model => {
      if (criteria.requiresTools && !model.supportsTools) return false;
      if (criteria.requiresLargeContext && model.contextLimit < 100000) return false;
      if (criteria.requiresEmbeddings && !model.supportsEmbeddings) return false;
      if (criteria.provider && model.provider !== criteria.provider) return false;
      return true;
    }).sort((a, b) => b.contextLimit - a.contextLimit); // Sort by context limit descending
  }

  // Private methods

  private initializeDefaultModels(): void {
    // Common Ollama model capabilities
    const defaultModels: ModelCapabilities[] = [
      {
        name: 'llama3.2',
        contextLimit: 128000,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
        tokenizerName: 'Xenova/llama-tokenizer',
        provider: 'ollama'
      },
      {
        name: 'llama3.3',
        contextLimit: 128000,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
        tokenizerName: 'Xenova/llama-tokenizer',
        provider: 'ollama'
      },
      {
        name: 'mistral',
        contextLimit: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
        tokenizerName: 'Xenova/gpt-4o',
        provider: 'ollama'
      },
      {
        name: 'qwen',
        contextLimit: 32768,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
        tokenizerName: 'Xenova/gpt-4o',
        provider: 'ollama'
      },
      {
        name: 'codellama',
        contextLimit: 16384,
        supportsTools: true,
        supportsStreaming: true,
        supportsEmbeddings: false,
        tokenizerName: 'Xenova/llama-tokenizer',
        provider: 'ollama'
      }
    ];

    defaultModels.forEach(model => {
      this.registerCapabilities(model);
    });

    // Common aliases
    this.registerAlias('llama', 'llama3.3');
    this.registerAlias('code', 'codellama');
    this.registerAlias('default', 'llama3.3');
  }

  private inferCapabilities(modelName: string): ModelCapabilities {
    const lowerName = modelName.toLowerCase();
    
    // Infer basic capabilities based on model name patterns
    let contextLimit = 128000; // default
    let tokenizerName = 'Xenova/gpt-4o'; // default
    
    if (lowerName.includes('claude')) {
      contextLimit = 200000;
      tokenizerName = 'Xenova/claude-tokenizer';
    } else if (lowerName.includes('gpt-4')) {
      contextLimit = 128000;
      tokenizerName = 'Xenova/gpt-4o';
    } else if (lowerName.includes('llama')) {
      tokenizerName = 'Xenova/llama-tokenizer';
    } else if (lowerName.includes('gemini')) {
      contextLimit = 1000000;
    }

    const capabilities: ModelCapabilities = {
      name: modelName,
      contextLimit,
      supportsTools: true, // Assume most modern models support tools
      supportsStreaming: true,
      supportsEmbeddings: false, // Conservative default
      tokenizerName,
      provider: 'unknown'
    };

    // Cache the inferred capabilities
    this.modelCapabilities.set(modelName, capabilities);
    
    return capabilities;
  }

  private updateSession(modelName: string): void {
    const session = this.getOrCreateSession(modelName);
    session.lastUsed = new Date();
  }

  private getOrCreateSession(modelName: string): ModelSession {
    if (!this.sessions.has(modelName)) {
      const session: ModelSession = {
        modelName,
        realModelName: modelName,
        startTime: new Date(),
        totalUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cost: 0
        },
        requestCount: 0,
        lastUsed: new Date()
      };
      this.sessions.set(modelName, session);
    }
    return this.sessions.get(modelName)!;
  }
}

// Export singleton instance
export const ModelManager = new ModelManagerSingleton();

// Convenience functions
export const setCurrentModel = (modelName: string, realModelName?: string) => 
  ModelManager.setCurrentModel(modelName, realModelName);

export const getCurrentModel = () => ModelManager.getCurrentModel();

export const getCurrentRealModel = () => ModelManager.getCurrentRealModel();

export const getModelCapabilities = (modelName: string) => 
  ModelManager.getCapabilities(modelName);

export const recordModelUsage = (usage: ModelUsage) => 
  ModelManager.recordUsage(usage);

export const onModelChange = (listener: (modelName: string, realModelName?: string) => void) =>
  ModelManager.onModelChange(listener);