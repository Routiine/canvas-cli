import { EventEmitter } from 'events';

export interface AIRecommendation {
  id: string;
  type: 'command' | 'optimization' | 'fix' | 'enhancement';
  title: string;
  description: string;
  confidence: number;
  context: string;
  action?: {
    type: 'execute' | 'suggest' | 'guide';
    command?: string;
    steps?: string[];
  };
  metadata: {
    timestamp: number;
    relevanceScore: number;
    category: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface RecommendationContext {
  currentCommand?: string;
  workingDirectory: string;
  recentCommands: string[];
  projectType?: string;
  gitStatus?: {
    branch: string;
    hasChanges: boolean;
    hasConflicts: boolean;
  };
  errorPatterns: string[];
}

export interface RecommendationConfig {
  enabledCategories: string[];
  maxRecommendations: number;
  confidenceThreshold: number;
  autoExecute: boolean;
  contextWindow: number;
  learningMode: boolean;
}

class ActiveAIRecommendations extends EventEmitter {
  private recommendations: Map<string, AIRecommendation> = new Map();
  private context: RecommendationContext;
  private config: RecommendationConfig;
  private analysisTimer?: NodeJS.Timeout;
  private learningData: Map<string, number> = new Map();

  constructor() {
    super();
    this.context = {
      workingDirectory: process.cwd(),
      recentCommands: [],
      errorPatterns: []
    };
    this.config = {
      enabledCategories: ['command', 'optimization', 'fix'],
      maxRecommendations: 5,
      confidenceThreshold: 0.7,
      autoExecute: false,
      contextWindow: 10,
      learningMode: true
    };
  }

  /**
   * Start active recommendation monitoring
   */
  public startMonitoring(): void {
    this.analysisTimer = setInterval(() => {
      this.analyzeContext();
    }, 2000);
    this.emit('monitoring:started');
  }

  /**
   * Stop active recommendation monitoring
   */
  public stopMonitoring(): void {
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = undefined;
    }
    this.emit('monitoring:stopped');
  }

  /**
   * Update the current context
   */
  public updateContext(newContext: Partial<RecommendationContext>): void {
    this.context = { ...this.context, ...newContext };
    
    // Trim recent commands to context window
    if (this.context.recentCommands.length > this.config.contextWindow) {
      this.context.recentCommands = this.context.recentCommands.slice(-this.config.contextWindow);
    }

    this.analyzeContext();
    this.emit('context:updated', this.context);
  }

  /**
   * Add a recent command to context
   */
  public addCommand(command: string, success: boolean = true): void {
    this.context.recentCommands.push(command);
    
    if (!success && this.config.learningMode) {
      this.context.errorPatterns.push(command);
    }

    this.updateContext({});
  }

  /**
   * Analyze current context and generate recommendations
   */
  private analyzeContext(): void {
    const newRecommendations = this.generateRecommendations();
    
    newRecommendations.forEach(rec => {
      if (!this.recommendations.has(rec.id)) {
        this.recommendations.set(rec.id, rec);
        this.emit('recommendation:new', rec);
      }
    });

    // Clean old recommendations
    this.cleanOldRecommendations();
  }

  /**
   * Generate AI recommendations based on current context
   */
  private generateRecommendations(): AIRecommendation[] {
    const recommendations: AIRecommendation[] = [];
    const now = Date.now();

    // Command optimization recommendations
    if (this.context.recentCommands.length > 2) {
      const repeated = this.findRepeatedPatterns();
      repeated.forEach(pattern => {
        recommendations.push({
          id: `opt-${pattern.pattern}-${now}`,
          type: 'optimization',
          title: 'Command Pattern Optimization',
          description: `Consider creating an alias for repeated pattern: ${pattern.pattern}`,
          confidence: Math.min(0.9, pattern.count * 0.2),
          context: `Detected ${pattern.count} repetitions`,
          action: {
            type: 'suggest',
            command: `alias ${this.generateAlias(pattern.pattern)}="${pattern.pattern}"`
          },
          metadata: {
            timestamp: now,
            relevanceScore: pattern.count * 0.15,
            category: 'productivity',
            priority: pattern.count > 5 ? 'medium' : 'low'
          }
        });
      });
    }

    // Git workflow recommendations
    if (this.context.gitStatus?.hasChanges && !this.context.recentCommands.some(cmd => cmd.includes('commit'))) {
      recommendations.push({
        id: `git-commit-${now}`,
        type: 'enhancement',
        title: 'Uncommitted Changes Detected',
        description: 'You have uncommitted changes. Consider committing your work.',
        confidence: 0.8,
        context: 'Git status shows uncommitted changes',
        action: {
          type: 'guide',
          steps: ['git add .', 'git commit -m "Your commit message"']
        },
        metadata: {
          timestamp: now,
          relevanceScore: 0.8,
          category: 'git',
          priority: 'medium'
        }
      });
    }

    // Error pattern recommendations
    this.context.errorPatterns.forEach(errorCmd => {
      const fix = this.suggestErrorFix(errorCmd);
      if (fix) {
        recommendations.push({
          id: `fix-${errorCmd.replace(/\s+/g, '-')}-${now}`,
          type: 'fix',
          title: 'Command Error Fix',
          description: `Suggested fix for: ${errorCmd}`,
          confidence: fix.confidence,
          context: `Recent command error: ${errorCmd}`,
          action: {
            type: 'suggest',
            command: fix.suggestion
          },
          metadata: {
            timestamp: now,
            relevanceScore: 0.9,
            category: 'error-fixing',
            priority: 'high'
          }
        });
      }
    });

    // Project-specific recommendations
    if (this.context.projectType) {
      const projectRecs = this.getProjectSpecificRecommendations();
      recommendations.push(...projectRecs);
    }

    return recommendations
      .filter(rec => rec.confidence >= this.config.confidenceThreshold)
      .filter(rec => this.config.enabledCategories.includes(rec.metadata.category))
      .sort((a, b) => b.metadata.relevanceScore - a.metadata.relevanceScore)
      .slice(0, this.config.maxRecommendations);
  }

  /**
   * Find repeated command patterns
   */
  private findRepeatedPatterns(): Array<{ pattern: string; count: number }> {
    const patterns = new Map<string, number>();
    
    this.context.recentCommands.forEach(cmd => {
      // Look for command prefixes (first 2 words)
      const prefix = cmd.split(' ').slice(0, 2).join(' ');
      patterns.set(prefix, (patterns.get(prefix) || 0) + 1);
    });

    return Array.from(patterns.entries())
      .filter(([_, count]) => count >= 3)
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate alias suggestion for command pattern
   */
  private generateAlias(pattern: string): string {
    const words = pattern.split(' ').filter(w => w.length > 2);
    if (words.length === 0) return 'cmd';
    
    return words.map(w => w.charAt(0)).join('').toLowerCase();
  }

  /**
   * Suggest fix for error command
   */
  private suggestErrorFix(errorCmd: string): { suggestion: string; confidence: number } | null {
    const fixes: Array<{ pattern: RegExp; fix: string; confidence: number }> = [
      { pattern: /^ls/, fix: 'ls -la', confidence: 0.7 },
      { pattern: /^cd (.+)/, fix: 'cd "$1"', confidence: 0.8 },
      { pattern: /^git push$/, fix: 'git push origin HEAD', confidence: 0.9 },
      { pattern: /^npm run/, fix: 'npm run build', confidence: 0.6 },
      { pattern: /^python (.+)/, fix: 'python3 $1', confidence: 0.8 }
    ];

    for (const { pattern, fix, confidence } of fixes) {
      if (pattern.test(errorCmd)) {
        return { suggestion: errorCmd.replace(pattern, fix), confidence };
      }
    }

    return null;
  }

  /**
   * Get project-specific recommendations
   */
  private getProjectSpecificRecommendations(): AIRecommendation[] {
    const recommendations: AIRecommendation[] = [];
    const now = Date.now();

    switch (this.context.projectType) {
      case 'node':
        if (!this.context.recentCommands.some(cmd => cmd.includes('npm test'))) {
          recommendations.push({
            id: `node-test-${now}`,
            type: 'enhancement',
            title: 'Run Tests',
            description: 'Consider running your test suite to ensure code quality.',
            confidence: 0.7,
            context: 'Node.js project detected',
            action: {
              type: 'suggest',
              command: 'npm test'
            },
            metadata: {
              timestamp: now,
              relevanceScore: 0.6,
              category: 'testing',
              priority: 'medium'
            }
          });
        }
        break;
      
      case 'python':
        if (!this.context.recentCommands.some(cmd => cmd.includes('pytest'))) {
          recommendations.push({
            id: `python-test-${now}`,
            type: 'enhancement',
            title: 'Run Python Tests',
            description: 'Consider running pytest to validate your changes.',
            confidence: 0.7,
            context: 'Python project detected',
            action: {
              type: 'suggest',
              command: 'pytest'
            },
            metadata: {
              timestamp: now,
              relevanceScore: 0.6,
              category: 'testing',
              priority: 'medium'
            }
          });
        }
        break;
    }

    return recommendations;
  }

  /**
   * Clean old recommendations
   */
  private cleanOldRecommendations(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [id, rec] of this.recommendations) {
      if (now - rec.metadata.timestamp > maxAge) {
        this.recommendations.delete(id);
        this.emit('recommendation:expired', rec);
      }
    }
  }

  /**
   * Get all active recommendations
   */
  public getRecommendations(): AIRecommendation[] {
    return Array.from(this.recommendations.values())
      .sort((a, b) => b.metadata.relevanceScore - a.metadata.relevanceScore);
  }

  /**
   * Execute a recommendation
   */
  public async executeRecommendation(id: string): Promise<boolean> {
    const recommendation = this.recommendations.get(id);
    if (!recommendation) {
      throw new Error(`Recommendation ${id} not found`);
    }

    try {
      if (recommendation.action?.type === 'execute' && recommendation.action.command) {
        this.emit('recommendation:executing', recommendation);
        
        // In a real implementation, this would execute the command
        // For now, we'll just simulate success
        this.emit('recommendation:executed', recommendation);
        
        // Update learning data
        if (this.config.learningMode) {
          const key = `${recommendation.type}:${recommendation.metadata.category}`;
          this.learningData.set(key, (this.learningData.get(key) || 0) + 1);
        }

        this.recommendations.delete(id);
        return true;
      }
    } catch (error) {
      this.emit('recommendation:error', { recommendation, error });
      return false;
    }

    return false;
  }

  /**
   * Dismiss a recommendation
   */
  public dismissRecommendation(id: string): void {
    const recommendation = this.recommendations.get(id);
    if (recommendation) {
      this.recommendations.delete(id);
      this.emit('recommendation:dismissed', recommendation);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<RecommendationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): RecommendationConfig {
    return { ...this.config };
  }

  /**
   * Get learning statistics
   */
  public getLearningStats(): Map<string, number> {
    return new Map(this.learningData);
  }

  /**
   * Reset all recommendations and learning data
   */
  public reset(): void {
    this.recommendations.clear();
    this.learningData.clear();
    this.context.recentCommands = [];
    this.context.errorPatterns = [];
    this.emit('system:reset');
  }
}

let activeRecommendationsInstance: ActiveAIRecommendations | null = null;

export function getActiveAIRecommendations(): ActiveAIRecommendations {
  if (!activeRecommendationsInstance) {
    activeRecommendationsInstance = new ActiveAIRecommendations();
  }
  return activeRecommendationsInstance;
}

export default ActiveAIRecommendations;