/**
 * Canvas CLI Supported Models Configuration
 * Complete list of officially supported and tested AI models
 */

export interface ModelSpec {
  id: string;
  name: string;
  provider: string;
  size: string;
  contextWindow: number;
  description: string;
  recommended: boolean;
  requirements: {
    ram: string;
    vram?: string;
    storage: string;
  };
  capabilities: string[];
  performance: {
    speed: 'fast' | 'medium' | 'slow';
    quality: 'excellent' | 'good' | 'fair';
  };
}

export interface ProviderModels {
  provider: string;
  displayName: string;
  description: string;
  models: ModelSpec[];
}

export const SUPPORTED_MODELS: ProviderModels[] = [
  {
    provider: 'ollama',
    displayName: 'Ollama (Local)',
    description: '100% private, runs locally on your machine',
    models: [
      {
        id: 'llama3.2',
        name: 'Llama 3.2',
        provider: 'ollama',
        size: '3B',
        contextWindow: 128000,
        description: 'Latest Llama model, excellent for general coding tasks',
        recommended: true,
        requirements: {
          ram: '8GB',
          storage: '2GB'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'llama3.1:8b',
        name: 'Llama 3.1 8B',
        provider: 'ollama',
        size: '8B',
        contextWindow: 128000,
        description: 'Balanced performance and quality for most tasks',
        recommended: true,
        requirements: {
          ram: '16GB',
          storage: '5GB'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis'],
        performance: {
          speed: 'medium',
          quality: 'good'
        }
      },
      {
        id: 'llama3.1:70b',
        name: 'Llama 3.1 70B',
        provider: 'ollama',
        size: '70B',
        contextWindow: 128000,
        description: 'Highest quality for complex reasoning and code generation',
        recommended: false,
        requirements: {
          ram: '64GB',
          vram: '48GB',
          storage: '40GB'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis', 'architecture'],
        performance: {
          speed: 'slow',
          quality: 'excellent'
        }
      },
      {
        id: 'mistral:7b',
        name: 'Mistral 7B',
        provider: 'ollama',
        size: '7B',
        contextWindow: 32000,
        description: 'Fast and efficient for quick tasks',
        recommended: true,
        requirements: {
          ram: '8GB',
          storage: '4GB'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'mixtral:8x7b',
        name: 'Mixtral 8x7B',
        provider: 'ollama',
        size: '47B',
        contextWindow: 32000,
        description: 'MoE model with excellent performance',
        recommended: false,
        requirements: {
          ram: '48GB',
          storage: '26GB'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis'],
        performance: {
          speed: 'medium',
          quality: 'excellent'
        }
      },
      {
        id: 'codellama:7b',
        name: 'Code Llama 7B',
        provider: 'ollama',
        size: '7B',
        contextWindow: 16000,
        description: 'Specialized for code generation and completion',
        recommended: true,
        requirements: {
          ram: '8GB',
          storage: '4GB'
        },
        capabilities: ['code-generation', 'code-completion', 'debugging', 'optimization'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'codellama:13b',
        name: 'Code Llama 13B',
        provider: 'ollama',
        size: '13B',
        contextWindow: 16000,
        description: 'Enhanced code understanding and generation',
        recommended: false,
        requirements: {
          ram: '16GB',
          storage: '8GB'
        },
        capabilities: ['code-generation', 'code-completion', 'debugging', 'optimization', 'refactoring'],
        performance: {
          speed: 'medium',
          quality: 'good'
        }
      },
      {
        id: 'codellama:34b',
        name: 'Code Llama 34B',
        provider: 'ollama',
        size: '34B',
        contextWindow: 16000,
        description: 'Professional-grade code generation',
        recommended: false,
        requirements: {
          ram: '32GB',
          vram: '24GB',
          storage: '20GB'
        },
        capabilities: ['code-generation', 'code-completion', 'debugging', 'optimization', 'refactoring', 'architecture'],
        performance: {
          speed: 'slow',
          quality: 'excellent'
        }
      },
      {
        id: 'deepseek-coder:6.7b',
        name: 'DeepSeek Coder 6.7B',
        provider: 'ollama',
        size: '6.7B',
        contextWindow: 16000,
        description: 'Excellent for code completion and generation',
        recommended: true,
        requirements: {
          ram: '8GB',
          storage: '4GB'
        },
        capabilities: ['code-generation', 'code-completion', 'debugging'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'phi3:mini',
        name: 'Phi-3 Mini',
        provider: 'ollama',
        size: '3.8B',
        contextWindow: 128000,
        description: 'Compact model with impressive capabilities',
        recommended: true,
        requirements: {
          ram: '4GB',
          storage: '2GB'
        },
        capabilities: ['code-generation', 'debugging', 'documentation'],
        performance: {
          speed: 'fast',
          quality: 'fair'
        }
      },
      {
        id: 'phi3:medium',
        name: 'Phi-3 Medium',
        provider: 'ollama',
        size: '14B',
        contextWindow: 128000,
        description: 'Balanced Phi model for general tasks',
        recommended: false,
        requirements: {
          ram: '16GB',
          storage: '8GB'
        },
        capabilities: ['code-generation', 'debugging', 'documentation', 'analysis'],
        performance: {
          speed: 'medium',
          quality: 'good'
        }
      },
      {
        id: 'qwen2.5-coder:7b',
        name: 'Qwen 2.5 Coder 7B',
        provider: 'ollama',
        size: '7B',
        contextWindow: 32000,
        description: 'Specialized coding model from Alibaba',
        recommended: true,
        requirements: {
          ram: '8GB',
          storage: '4GB'
        },
        capabilities: ['code-generation', 'code-completion', 'debugging', 'multi-language'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'gemma2:9b',
        name: 'Gemma 2 9B',
        provider: 'ollama',
        size: '9B',
        contextWindow: 8192,
        description: 'Google\'s efficient open model',
        recommended: false,
        requirements: {
          ram: '12GB',
          storage: '6GB'
        },
        capabilities: ['code-generation', 'debugging', 'documentation'],
        performance: {
          speed: 'medium',
          quality: 'good'
        }
      }
    ]
  },
  {
    provider: 'openai',
    displayName: 'OpenAI',
    description: 'Industry-leading models via API',
    models: [
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        size: 'Large',
        contextWindow: 128000,
        description: 'Most capable GPT-4 model with vision capabilities',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis', 'architecture', 'vision'],
        performance: {
          speed: 'medium',
          quality: 'excellent'
        }
      },
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        size: 'Large',
        contextWindow: 8192,
        description: 'Advanced reasoning and code generation',
        recommended: false,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis', 'architecture'],
        performance: {
          speed: 'medium',
          quality: 'excellent'
        }
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        size: 'Medium',
        contextWindow: 16385,
        description: 'Fast and cost-effective for most tasks',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'o1-preview',
        name: 'o1 Preview',
        provider: 'openai',
        size: 'Large',
        contextWindow: 128000,
        description: 'Advanced reasoning model with chain-of-thought',
        recommended: false,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'complex-reasoning', 'algorithm-design', 'architecture', 'mathematics'],
        performance: {
          speed: 'slow',
          quality: 'excellent'
        }
      },
      {
        id: 'o1-mini',
        name: 'o1 Mini',
        provider: 'openai',
        size: 'Medium',
        contextWindow: 128000,
        description: 'Faster reasoning model for coding tasks',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'debugging', 'algorithm-design', 'optimization'],
        performance: {
          speed: 'medium',
          quality: 'excellent'
        }
      }
    ]
  },
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude models with excellent coding capabilities',
    models: [
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        size: 'Large',
        contextWindow: 200000,
        description: 'Most capable Claude model for complex tasks',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis', 'architecture', 'vision'],
        performance: {
          speed: 'medium',
          quality: 'excellent'
        }
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        provider: 'anthropic',
        size: 'Medium',
        contextWindow: 200000,
        description: 'Balanced performance and capability',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        provider: 'anthropic',
        size: 'Small',
        contextWindow: 200000,
        description: 'Fast and efficient for simple tasks',
        recommended: false,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'debugging', 'documentation'],
        performance: {
          speed: 'fast',
          quality: 'fair'
        }
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'anthropic',
        size: 'Medium',
        contextWindow: 200000,
        description: 'Latest and most capable Sonnet model',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis', 'architecture'],
        performance: {
          speed: 'fast',
          quality: 'excellent'
        }
      }
    ]
  },
  {
    provider: 'google',
    displayName: 'Google AI',
    description: 'Gemini models with multimodal capabilities',
    models: [
      {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        provider: 'google',
        size: 'Large',
        contextWindow: 1000000,
        description: 'Advanced model with massive context window',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'refactoring', 'debugging', 'documentation', 'analysis', 'vision', 'long-context'],
        performance: {
          speed: 'medium',
          quality: 'excellent'
        }
      },
      {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        provider: 'google',
        size: 'Medium',
        contextWindow: 1000000,
        description: 'Fast multimodal model for quick iterations',
        recommended: true,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'debugging', 'documentation', 'vision', 'long-context'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      },
      {
        id: 'gemini-1.0-pro',
        name: 'Gemini 1.0 Pro',
        provider: 'google',
        size: 'Medium',
        contextWindow: 32000,
        description: 'Stable model for general coding tasks',
        recommended: false,
        requirements: {
          ram: 'N/A',
          storage: 'N/A'
        },
        capabilities: ['code-generation', 'debugging', 'documentation'],
        performance: {
          speed: 'fast',
          quality: 'good'
        }
      }
    ]
  }
];

// Helper functions for model management
export function getModelById(modelId: string): ModelSpec | undefined {
  for (const provider of SUPPORTED_MODELS) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) return model;
  }
  return undefined;
}

export function getRecommendedModels(): ModelSpec[] {
  const recommended: ModelSpec[] = [];
  for (const provider of SUPPORTED_MODELS) {
    recommended.push(...provider.models.filter(m => m.recommended));
  }
  return recommended;
}

export function getModelsByProvider(providerName: string): ModelSpec[] {
  const provider = SUPPORTED_MODELS.find(p => p.provider === providerName);
  return provider ? provider.models : [];
}

export function getModelsByCapability(capability: string): ModelSpec[] {
  const models: ModelSpec[] = [];
  for (const provider of SUPPORTED_MODELS) {
    models.push(...provider.models.filter(m => m.capabilities.includes(capability)));
  }
  return models;
}

export function getBestModelForTask(task: string, preferLocal: boolean = true): ModelSpec | undefined {
  // Map tasks to required capabilities
  const taskCapabilities: Record<string, string[]> = {
    'code-completion': ['code-completion'],
    'debugging': ['debugging'],
    'refactoring': ['refactoring'],
    'documentation': ['documentation'],
    'architecture': ['architecture'],
    'analysis': ['analysis'],
    'vision': ['vision']
  };

  const requiredCapabilities = taskCapabilities[task] || ['code-generation'];
  
  // Get models with required capabilities
  const candidates: ModelSpec[] = [];
  for (const capability of requiredCapabilities) {
    candidates.push(...getModelsByCapability(capability));
  }

  if (candidates.length === 0) return undefined;

  // Sort by preference
  candidates.sort((a, b) => {
    // Prefer local models if requested
    if (preferLocal) {
      if (a.provider === 'ollama' && b.provider !== 'ollama') return -1;
      if (a.provider !== 'ollama' && b.provider === 'ollama') return 1;
    }
    
    // Then by recommendation
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    
    // Then by quality
    const qualityScore = { excellent: 3, good: 2, fair: 1 };
    const aQuality = qualityScore[a.performance.quality];
    const bQuality = qualityScore[b.performance.quality];
    if (aQuality !== bQuality) return bQuality - aQuality;
    
    // Finally by speed
    const speedScore = { fast: 3, medium: 2, slow: 1 };
    const aSpeed = speedScore[a.performance.speed];
    const bSpeed = speedScore[b.performance.speed];
    return bSpeed - aSpeed;
  });

  return candidates[0];
}