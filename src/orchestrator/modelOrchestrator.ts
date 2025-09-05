import axios from 'axios';
import chalk from 'chalk';
import { loadConfig } from '../config.js';

/**
 * Advanced Model Orchestrator for Canvas CLI
 * Intelligently selects the best model based on content analysis
 */

export interface ModelCapabilities {
  name: string;
  size: string;
  parameters: number;
  strengths: string[];
  weaknesses: string[];
  optimalFor: string[];
  performance: {
    speed: number; // 1-10 scale
    quality: number; // 1-10 scale
    reasoning: number; // 1-10 scale
    coding: number; // 1-10 scale
    creativity: number; // 1-10 scale
  };
  resourceUsage: {
    memory: string;
    computeIntensive: boolean;
  };
}

export interface ContentAnalysis {
  type: 'coding' | 'creative' | 'analytical' | 'conversational' | 'technical' | 'mixed';
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  languages: string[];
  keywords: string[];
  length: 'short' | 'medium' | 'long';
  urgency: 'low' | 'medium' | 'high';
  confidence: number; // 0-1 scale
}

export interface ModelRecommendation {
  primary: string;
  alternatives: string[];
  reasoning: string;
  confidence: number;
  expectedPerformance: {
    speed: string;
    quality: string;
  };
}

/**
 * Intelligent Model Orchestrator
 */
export class ModelOrchestrator {
  private models: Map<string, ModelCapabilities> = new Map();
  private config = loadConfig();

  constructor() {
    this.initializeModelCapabilities();
  }

  /**
   * Initialize model capabilities database
   */
  private initializeModelCapabilities(): void {
    // Based on your available models
    this.models.set('gpt-oss:20b', {
      name: 'gpt-oss:20b',
      size: '20B',
      parameters: 20900000000,
      strengths: ['General reasoning', 'Conversational AI', 'Problem solving', 'Code analysis'],
      weaknesses: ['Slower inference', 'Memory intensive'],
      optimalFor: ['complex analysis', 'detailed explanations', 'multi-step reasoning', 'code review'],
      performance: {
        speed: 5,
        quality: 9,
        reasoning: 9,
        coding: 7,
        creativity: 8
      },
      resourceUsage: {
        memory: '~14GB',
        computeIntensive: true
      }
    });

    this.models.set('qwen2.5-coder:32b', {
      name: 'qwen2.5-coder:32b',
      size: '32B',
      parameters: 32800000000,
      strengths: ['Code generation', 'Programming tasks', 'Technical documentation', 'Debugging'],
      weaknesses: ['Very slow', 'Extremely memory intensive', 'Less creative'],
      optimalFor: ['complex coding', 'software architecture', 'technical analysis', 'code optimization'],
      performance: {
        speed: 3,
        quality: 10,
        reasoning: 8,
        coding: 10,
        creativity: 6
      },
      resourceUsage: {
        memory: '~20GB',
        computeIntensive: true
      }
    });

    this.models.set('nuxt-ui-pro-elite:latest', {
      name: 'nuxt-ui-pro-elite:latest',
      size: '32B',
      parameters: 32800000000,
      strengths: ['UI/UX development', 'Frontend frameworks', 'Design systems', 'Web development'],
      weaknesses: ['Very slow', 'Memory intensive', 'Specialized scope'],
      optimalFor: ['nuxt development', 'vue.js', 'ui components', 'frontend architecture'],
      performance: {
        speed: 3,
        quality: 9,
        reasoning: 7,
        coding: 9,
        creativity: 8
      },
      resourceUsage: {
        memory: '~20GB',
        computeIntensive: true
      }
    });

    this.models.set('llama3.2:latest', {
      name: 'llama3.2:latest',
      size: '3B',
      parameters: 3200000000,
      strengths: ['Fast inference', 'General tasks', 'Conversational', 'Low memory'],
      weaknesses: ['Limited reasoning', 'Less detailed responses', 'Basic coding'],
      optimalFor: ['quick questions', 'simple tasks', 'brainstorming', 'casual conversation'],
      performance: {
        speed: 9,
        quality: 6,
        reasoning: 5,
        coding: 4,
        creativity: 6
      },
      resourceUsage: {
        memory: '~2GB',
        computeIntensive: false
      }
    });

    this.models.set('llama3.2:1b', {
      name: 'llama3.2:1b',
      size: '1B',
      parameters: 1200000000,
      strengths: ['Very fast', 'Minimal memory', 'Simple tasks', 'Real-time responses'],
      weaknesses: ['Very limited capabilities', 'Poor reasoning', 'Basic responses'],
      optimalFor: ['simple questions', 'quick summaries', 'basic text processing', 'testing'],
      performance: {
        speed: 10,
        quality: 4,
        reasoning: 3,
        coding: 2,
        creativity: 4
      },
      resourceUsage: {
        memory: '~1.3GB',
        computeIntensive: false
      }
    });
  }

  /**
   * Get available models from Ollama server
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.config.ollamaUrl}/api/tags`);
      return response.data.models.map((model: any) => model.name);
    } catch (error) {
      console.error('Error fetching models:', error);
      return Array.from(this.models.keys());
    }
  }

  /**
   * Analyze content to determine optimal model
   */
  analyzeContent(content: string): ContentAnalysis {
    const text = content.toLowerCase();
    const words = content.split(/\s+/).length;
    
    // Detect content type
    let type: ContentAnalysis['type'] = 'conversational';
    let confidence = 0.5;

    // Coding indicators
    const codingKeywords = ['function', 'class', 'import', 'export', 'const', 'let', 'var', 'def', 'public', 'private', 'return', 'if', 'else', 'for', 'while', 'try', 'catch', 'async', 'await'];
    const codingMatches = codingKeywords.filter(keyword => text.includes(keyword)).length;
    
    // Technical indicators
    const technicalKeywords = ['algorithm', 'database', 'api', 'server', 'client', 'architecture', 'performance', 'optimization', 'debug', 'error', 'bug', 'test', 'deployment'];
    const technicalMatches = technicalKeywords.filter(keyword => text.includes(keyword)).length;
    
    // Creative indicators
    const creativeKeywords = ['story', 'creative', 'imagine', 'design', 'brainstorm', 'idea', 'concept', 'artistic', 'narrative', 'character'];
    const creativeMatches = creativeKeywords.filter(keyword => text.includes(keyword)).length;
    
    // Analytical indicators
    const analyticalKeywords = ['analyze', 'compare', 'evaluate', 'assess', 'review', 'examine', 'study', 'research', 'data', 'statistics', 'metrics'];
    const analyticalMatches = analyticalKeywords.filter(keyword => text.includes(keyword)).length;

    // Framework/technology specific
    const frameworkKeywords = ['react', 'vue', 'nuxt', 'next.js', 'angular', 'svelte', 'typescript', 'javascript', 'python', 'java', 'c++', 'rust', 'go'];
    const frameworkMatches = frameworkKeywords.filter(keyword => text.includes(keyword));

    // Determine type based on matches
    if (codingMatches >= 3 || text.includes('code') || text.includes('programming')) {
      type = 'coding';
      confidence = Math.min(0.9, 0.6 + (codingMatches * 0.05));
    } else if (technicalMatches >= 2) {
      type = 'technical';
      confidence = Math.min(0.8, 0.6 + (technicalMatches * 0.05));
    } else if (analyticalMatches >= 2) {
      type = 'analytical';
      confidence = Math.min(0.8, 0.6 + (analyticalMatches * 0.05));
    } else if (creativeMatches >= 2) {
      type = 'creative';
      confidence = Math.min(0.8, 0.6 + (creativeMatches * 0.05));
    } else if (codingMatches > 0 && creativeMatches > 0) {
      type = 'mixed';
      confidence = 0.7;
    }

    // Determine complexity
    let complexity: ContentAnalysis['complexity'] = 'simple';
    if (words > 200 || codingMatches >= 5 || technicalMatches >= 4) {
      complexity = 'expert';
    } else if (words > 100 || codingMatches >= 3 || technicalMatches >= 2) {
      complexity = 'complex';
    } else if (words > 50 || codingMatches >= 1 || technicalMatches >= 1) {
      complexity = 'moderate';
    }

    // Determine length
    let length: ContentAnalysis['length'] = 'short';
    if (words > 500) length = 'long';
    else if (words > 100) length = 'medium';

    // Extract detected languages/frameworks
    const languages = frameworkMatches.concat(
      text.includes('python') ? ['python'] : [],
      text.includes('javascript') || text.includes('js') ? ['javascript'] : [],
      text.includes('typescript') || text.includes('ts') ? ['typescript'] : [],
      text.includes('react') ? ['react'] : [],
      text.includes('vue') || text.includes('nuxt') ? ['vue'] : []
    );

    return {
      type,
      complexity,
      languages,
      keywords: [...codingKeywords.filter(k => text.includes(k)), 
                ...technicalKeywords.filter(k => text.includes(k)),
                ...creativeKeywords.filter(k => text.includes(k))].slice(0, 10),
      length,
      urgency: text.includes('urgent') || text.includes('quick') || text.includes('fast') ? 'high' : 'medium',
      confidence
    };
  }

  /**
   * Recommend best model based on content analysis
   */
  async recommendModel(content: string): Promise<ModelRecommendation> {
    const analysis = this.analyzeContent(content);
    const availableModels = await this.getAvailableModels();
    
    // Filter to only available models
    const candidates = Array.from(this.models.entries())
      .filter(([name]) => availableModels.includes(name))
      .map(([name, capabilities]) => ({ name, capabilities }));

    if (candidates.length === 0) {
      return {
        primary: this.config.defaultModel,
        alternatives: [],
        reasoning: 'No model data available, using default model',
        confidence: 0.3,
        expectedPerformance: { speed: 'Unknown', quality: 'Unknown' }
      };
    }

    let scores = candidates.map(({ name, capabilities }) => {
      let score = 0;
      let reasoning: string[] = [];

      // Type-based scoring
      switch (analysis.type) {
        case 'coding':
          score += capabilities.performance.coding * 20;
          reasoning.push(`Coding score: ${capabilities.performance.coding}/10`);
          
          // Special bonus for coding models
          if (name.includes('coder')) {
            score += 30;
            reasoning.push('Specialized coding model bonus');
          }
          
          // Language-specific bonuses
          if (analysis.languages.includes('vue') || analysis.languages.includes('nuxt')) {
            if (name.includes('nuxt')) {
              score += 25;
              reasoning.push('Nuxt/Vue specialization bonus');
            }
          }
          break;

        case 'technical':
          score += capabilities.performance.reasoning * 15;
          score += capabilities.performance.quality * 10;
          reasoning.push(`Technical reasoning: ${capabilities.performance.reasoning}/10`);
          break;

        case 'analytical':
          score += capabilities.performance.reasoning * 20;
          score += capabilities.performance.quality * 15;
          reasoning.push(`Analytical reasoning: ${capabilities.performance.reasoning}/10`);
          break;

        case 'creative':
          score += capabilities.performance.creativity * 20;
          score += capabilities.performance.quality * 10;
          reasoning.push(`Creativity score: ${capabilities.performance.creativity}/10`);
          break;

        default:
          score += capabilities.performance.quality * 15;
          reasoning.push(`General quality: ${capabilities.performance.quality}/10`);
      }

      // Complexity-based adjustments
      switch (analysis.complexity) {
        case 'expert':
          score += capabilities.parameters > 20000000000 ? 20 : -10;
          reasoning.push('Expert complexity requires large model');
          break;
        case 'complex':
          score += capabilities.parameters > 10000000000 ? 10 : -5;
          reasoning.push('Complex task benefits from larger model');
          break;
        case 'simple':
          score += capabilities.performance.speed * 5;
          reasoning.push(`Simple task prioritizes speed: ${capabilities.performance.speed}/10`);
          break;
      }

      // Urgency adjustments
      if (analysis.urgency === 'high') {
        score += capabilities.performance.speed * 10;
        reasoning.push('High urgency prioritizes speed');
      }

      // Length considerations
      if (analysis.length === 'long' && capabilities.parameters < 5000000000) {
        score -= 15;
        reasoning.push('Long content needs larger model');
      }

      return {
        name,
        score,
        reasoning: reasoning.join('; '),
        capabilities
      };
    });

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    const primary = scores[0];
    const alternatives = scores.slice(1, 4).map(s => s.name);

    // Calculate expected performance
    const speedRating = primary.capabilities.performance.speed >= 8 ? 'Very Fast' :
                       primary.capabilities.performance.speed >= 6 ? 'Fast' :
                       primary.capabilities.performance.speed >= 4 ? 'Moderate' : 'Slow';
    
    const qualityRating = primary.capabilities.performance.quality >= 9 ? 'Excellent' :
                         primary.capabilities.performance.quality >= 7 ? 'Very Good' :
                         primary.capabilities.performance.quality >= 5 ? 'Good' : 'Fair';

    const overallReasoning = `Selected ${primary.name} based on content analysis: ${analysis.type} task with ${analysis.complexity} complexity. ${primary.reasoning}`;

    return {
      primary: primary.name,
      alternatives,
      reasoning: overallReasoning,
      confidence: analysis.confidence * 0.8 + 0.2, // Boost confidence slightly
      expectedPerformance: {
        speed: speedRating,
        quality: qualityRating
      }
    };
  }

  /**
   * Get detailed model information
   */
  getModelInfo(modelName: string): ModelCapabilities | null {
    return this.models.get(modelName) || null;
  }

  /**
   * Compare models side by side
   */
  compareModels(modelNames: string[]): { comparison: any[], recommendation: string } {
    const models = modelNames
      .map(name => this.models.get(name))
      .filter(Boolean) as ModelCapabilities[];

    const comparison = models.map(model => ({
      name: model.name,
      size: model.size,
      speed: `${model.performance.speed}/10`,
      quality: `${model.performance.quality}/10`,
      coding: `${model.performance.coding}/10`,
      reasoning: `${model.performance.reasoning}/10`,
      creativity: `${model.performance.creativity}/10`,
      memory: model.resourceUsage.memory,
      strengths: model.strengths.slice(0, 3).join(', ')
    }));

    // Simple recommendation based on overall score
    const bestModel = models.reduce((best, current) => {
      const currentScore = Object.values(current.performance).reduce((sum, val) => sum + val, 0);
      const bestScore = Object.values(best.performance).reduce((sum, val) => sum + val, 0);
      return currentScore > bestScore ? current : best;
    });

    return {
      comparison,
      recommendation: `Recommended: ${bestModel.name} - Best overall performance with ${bestModel.strengths.slice(0, 2).join(' and ')}`
    };
  }
}