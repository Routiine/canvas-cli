/**
 * Token Optimization System for Agent Communications
 * Reduces token usage while maintaining communication effectiveness
 */

import { z } from 'zod';
import type { AgentMessage } from './agent-communication.js';

export interface TokenUsageMetrics {
  originalTokens: number;
  optimizedTokens: number;
  reductionPercentage: number;
  compressionMethod: string;
  timestamp: Date;
}

export interface OptimizationStrategy {
  name: string;
  priority: number;
  applicability: (message: any) => boolean;
  optimize: (message: any) => any;
  estimatedReduction: number; // Percentage
}

export class TokenOptimizer {
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private cache: Map<string, any> = new Map();
  private metrics: TokenUsageMetrics[] = [];
  private compressionDictionary: Map<string, string> = new Map();
  private contextWindow: number = 4096; // Default context window
  
  constructor() {
    this.initializeStrategies();
    this.initializeCompressionDictionary();
  }
  
  private initializeStrategies(): void {
    // Strategy 1: Remove redundant whitespace and formatting
    this.strategies.set('whitespace', {
      name: 'Whitespace Compression',
      priority: 1,
      applicability: (msg) => typeof msg === 'string' || (msg.content && typeof msg.content === 'string'),
      optimize: (msg) => {
        if (typeof msg === 'string') {
          return msg.replace(/\s+/g, ' ').trim();
        }
        if (msg.content && typeof msg.content === 'string') {
          msg.content = msg.content.replace(/\s+/g, ' ').trim();
        }
        return msg;
      },
      estimatedReduction: 10
    });
    
    // Strategy 2: Use abbreviations and shortcuts
    this.strategies.set('abbreviation', {
      name: 'Abbreviation Replacement',
      priority: 2,
      applicability: (msg) => true,
      optimize: (msg) => {
        const content = JSON.stringify(msg);
        let optimized = content;
        
        // Common technical abbreviations
        const abbreviations = {
          'implementation': 'impl',
          'configuration': 'config',
          'repository': 'repo',
          'development': 'dev',
          'production': 'prod',
          'environment': 'env',
          'application': 'app',
          'database': 'db',
          'authentication': 'auth',
          'authorization': 'authz',
          'administrator': 'admin',
          'management': 'mgmt',
          'information': 'info',
          'documentation': 'docs',
          'dependency': 'dep',
          'dependencies': 'deps',
          'javascript': 'js',
          'typescript': 'ts',
          'performance': 'perf',
          'optimization': 'opt',
          'message': 'msg',
          'response': 'res',
          'request': 'req',
          'function': 'fn',
          'parameter': 'param',
          'parameters': 'params',
          'argument': 'arg',
          'arguments': 'args',
          'variable': 'var',
          'constant': 'const',
          'temporary': 'tmp',
          'directory': 'dir',
          'source': 'src',
          'destination': 'dest',
          'reference': 'ref',
          'component': 'comp',
          'element': 'elem',
          'attribute': 'attr',
          'property': 'prop',
          'properties': 'props'
        };
        
        for (const [full, abbr] of Object.entries(abbreviations)) {
          const regex = new RegExp(`\\b${full}\\b`, 'gi');
          optimized = optimized.replace(regex, abbr);
        }
        
        return JSON.parse(optimized);
      },
      estimatedReduction: 15
    });
    
    // Strategy 3: Remove non-essential metadata
    this.strategies.set('metadata-pruning', {
      name: 'Metadata Pruning',
      priority: 3,
      applicability: (msg) => msg.metadata || msg.debug || msg.verbose,
      optimize: (msg) => {
        const pruned = { ...msg };
        
        // Remove debug and verbose fields
        delete pruned.debug;
        delete pruned.verbose;
        delete pruned.stackTrace;
        delete pruned.rawData;
        
        // Simplify metadata
        if (pruned.metadata) {
          const essential = {
            id: pruned.metadata.id,
            type: pruned.metadata.type,
            priority: pruned.metadata.priority
          };
          pruned.metadata = essential;
        }
        
        // Remove empty arrays and objects
        Object.keys(pruned).forEach(key => {
          if (Array.isArray(pruned[key]) && pruned[key].length === 0) {
            delete pruned[key];
          }
          if (typeof pruned[key] === 'object' && 
              pruned[key] !== null && 
              Object.keys(pruned[key]).length === 0) {
            delete pruned[key];
          }
        });
        
        return pruned;
      },
      estimatedReduction: 20
    });
    
    // Strategy 4: Context summarization
    this.strategies.set('context-summary', {
      name: 'Context Summarization',
      priority: 4,
      applicability: (msg) => msg.context && JSON.stringify(msg.context).length > 500,
      optimize: (msg) => {
        if (!msg.context) return msg;
        
        const summarized = { ...msg };
        const contextStr = JSON.stringify(msg.context);
        
        if (contextStr.length > 500) {
          // Extract key information
          summarized.context = {
            summary: this.summarizeContext(msg.context),
            keyPoints: this.extractKeyPoints(msg.context),
            _original_size: contextStr.length
          };
        }
        
        return summarized;
      },
      estimatedReduction: 30
    });
    
    // Strategy 5: Differential updates
    this.strategies.set('differential', {
      name: 'Differential Updates',
      priority: 5,
      applicability: (msg) => msg.type === 'update' && msg.previousState,
      optimize: (msg) => {
        if (!msg.previousState || !msg.currentState) return msg;
        
        const diff = this.computeDiff(msg.previousState, msg.currentState);
        return {
          ...msg,
          diff,
          previousState: undefined,
          currentState: undefined
        };
      },
      estimatedReduction: 40
    });
    
    // Strategy 6: Reference-based compression
    this.strategies.set('reference', {
      name: 'Reference Compression',
      priority: 6,
      applicability: (msg) => this.hasRepetitiveContent(msg),
      optimize: (msg) => {
        const content = JSON.stringify(msg);
        const references = new Map<string, string>();
        let refCounter = 0;
        
        // Find repetitive patterns
        const patterns = this.findRepetitivePatterns(content);
        let optimized = content;
        
        patterns.forEach(pattern => {
          if (pattern.length > 20) {
            const ref = `$ref${refCounter++}`;
            references.set(ref, pattern);
            optimized = optimized.replace(new RegExp(pattern, 'g'), ref);
          }
        });
        
        if (references.size > 0) {
          const parsed = JSON.parse(optimized);
          parsed._refs = Object.fromEntries(references);
          return parsed;
        }
        
        return msg;
      },
      estimatedReduction: 25
    });
    
    // Strategy 7: Batch message aggregation
    this.strategies.set('batching', {
      name: 'Message Batching',
      priority: 7,
      applicability: (msg) => Array.isArray(msg) && msg.length > 1,
      optimize: (messages) => {
        if (!Array.isArray(messages)) return messages;
        
        // Group similar messages
        const grouped = new Map<string, any[]>();
        
        messages.forEach(msg => {
          const key = `${msg.type}-${msg.to}-${msg.from}`;
          if (!grouped.has(key)) {
            grouped.set(key, []);
          }
          grouped.get(key)!.push(msg.content);
        });
        
        // Create batched messages
        const batched = Array.from(grouped.entries()).map(([key, contents]) => {
          const [type, to, from] = key.split('-');
          return {
            type: 'batch',
            originalType: type,
            to,
            from,
            contents,
            count: contents.length,
            timestamp: new Date().toISOString()
          };
        });
        
        return batched.length === 1 ? batched[0] : batched;
      },
      estimatedReduction: 35
    });
  }
  
  private initializeCompressionDictionary(): void {
    // Common phrases and their compressed versions
    this.compressionDictionary.set('successfully completed', 'OK');
    this.compressionDictionary.set('failed to execute', 'FAIL');
    this.compressionDictionary.set('in progress', 'WIP');
    this.compressionDictionary.set('not available', 'N/A');
    this.compressionDictionary.set('to be determined', 'TBD');
    this.compressionDictionary.set('for your information', 'FYI');
    this.compressionDictionary.set('as soon as possible', 'ASAP');
    this.compressionDictionary.set('end of day', 'EOD');
    this.compressionDictionary.set('beginning of day', 'BOD');
    this.compressionDictionary.set('out of office', 'OOO');
    this.compressionDictionary.set('point of contact', 'POC');
    this.compressionDictionary.set('return on investment', 'ROI');
    this.compressionDictionary.set('key performance indicator', 'KPI');
    this.compressionDictionary.set('service level agreement', 'SLA');
    this.compressionDictionary.set('minimum viable product', 'MVP');
    this.compressionDictionary.set('proof of concept', 'POC');
    this.compressionDictionary.set('user acceptance testing', 'UAT');
    this.compressionDictionary.set('quality assurance', 'QA');
    this.compressionDictionary.set('continuous integration', 'CI');
    this.compressionDictionary.set('continuous deployment', 'CD');
  }
  
  async optimizeMessage(message: AgentMessage | any): Promise<{
    optimized: any;
    metrics: TokenUsageMetrics;
  }> {
    const startTime = Date.now();
    const originalSize = this.estimateTokens(message);
    let optimized = message;
    
    // Apply strategies in order of priority
    const sortedStrategies = Array.from(this.strategies.values())
      .sort((a, b) => a.priority - b.priority);
    
    for (const strategy of sortedStrategies) {
      if (strategy.applicability(optimized)) {
        try {
          optimized = strategy.optimize(optimized);
        } catch (error) {
          console.warn(`Strategy ${strategy.name} failed:`, error);
        }
      }
    }
    
    // Apply dictionary compression
    optimized = this.applyDictionaryCompression(optimized);
    
    // Ensure message fits in context window
    optimized = this.enforceContextWindow(optimized);
    
    const optimizedSize = this.estimateTokens(optimized);
    const metrics: TokenUsageMetrics = {
      originalTokens: originalSize,
      optimizedTokens: optimizedSize,
      reductionPercentage: ((originalSize - optimizedSize) / originalSize) * 100,
      compressionMethod: 'multi-strategy',
      timestamp: new Date()
    };
    
    this.metrics.push(metrics);
    
    return { optimized, metrics };
  }
  
  async optimizeBatch(messages: AgentMessage[]): Promise<{
    optimized: any;
    metrics: TokenUsageMetrics;
  }> {
    // Check if batching is beneficial
    const individualSize = messages.reduce((sum, msg) => sum + this.estimateTokens(msg), 0);
    
    if (messages.length > 3 && individualSize > 1000) {
      // Apply batching strategy
      const batchStrategy = this.strategies.get('batching');
      if (batchStrategy) {
        const batched = batchStrategy.optimize(messages);
        return this.optimizeMessage(batched);
      }
    }
    
    // Otherwise optimize individually
    const optimizedMessages = await Promise.all(
      messages.map(msg => this.optimizeMessage(msg))
    );
    
    const totalOriginal = optimizedMessages.reduce((sum, { metrics }) => sum + metrics.originalTokens, 0);
    const totalOptimized = optimizedMessages.reduce((sum, { metrics }) => sum + metrics.optimizedTokens, 0);
    
    return {
      optimized: optimizedMessages.map(({ optimized }) => optimized),
      metrics: {
        originalTokens: totalOriginal,
        optimizedTokens: totalOptimized,
        reductionPercentage: ((totalOriginal - totalOptimized) / totalOriginal) * 100,
        compressionMethod: 'individual-optimization',
        timestamp: new Date()
      }
    };
  }
  
  private summarizeContext(context: any): string {
    const contextStr = JSON.stringify(context);
    
    // Extract important values
    const important = [];
    
    // Look for IDs, names, types
    const idMatch = contextStr.match(/"(id|name|type)"\s*:\s*"([^"]+)"/g);
    if (idMatch) {
      important.push(...idMatch.map(m => m.replace(/"/g, '').replace(/\s/g, '')));
    }
    
    // Look for numbers
    const numMatch = contextStr.match(/"[^"]+"\s*:\s*\d+/g);
    if (numMatch) {
      important.push(...numMatch.slice(0, 3));
    }
    
    return important.join(', ').substring(0, 200);
  }
  
  private extractKeyPoints(context: any): string[] {
    const points: string[] = [];
    
    const traverse = (obj: any, path = '') => {
      if (points.length >= 5) return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          traverse(value, currentPath);
        } else if (key.match(/^(id|name|type|status|error|result)$/i)) {
          points.push(`${currentPath}=${JSON.stringify(value)}`);
        }
      }
    };
    
    traverse(context);
    return points.slice(0, 5);
  }
  
  private computeDiff(prev: any, curr: any): any {
    const diff: any = {};
    
    // Find added and modified fields
    for (const [key, value] of Object.entries(curr)) {
      if (!(key in prev)) {
        diff[`+${key}`] = value;
      } else if (JSON.stringify(prev[key]) !== JSON.stringify(value)) {
        diff[`~${key}`] = value;
      }
    }
    
    // Find removed fields
    for (const key of Object.keys(prev)) {
      if (!(key in curr)) {
        diff[`-${key}`] = null;
      }
    }
    
    return diff;
  }
  
  private hasRepetitiveContent(msg: any): boolean {
    const content = JSON.stringify(msg);
    
    // Check for repeated substrings
    const substrings = new Map<string, number>();
    const minLength = 20;
    
    for (let i = 0; i < content.length - minLength; i++) {
      for (let len = minLength; len <= Math.min(100, content.length - i); len++) {
        const substr = content.substring(i, i + len);
        substrings.set(substr, (substrings.get(substr) || 0) + 1);
      }
    }
    
    // Check if any substring repeats more than twice
    return Array.from(substrings.values()).some(count => count > 2);
  }
  
  private findRepetitivePatterns(content: string): string[] {
    const patterns: Map<string, number> = new Map();
    const minLength = 20;
    const maxLength = 100;
    
    for (let len = minLength; len <= maxLength; len++) {
      for (let i = 0; i <= content.length - len; i++) {
        const pattern = content.substring(i, i + len);
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }
    
    // Return patterns that repeat more than twice
    return Array.from(patterns.entries())
      .filter(([_, count]) => count > 2)
      .map(([pattern]) => pattern)
      .sort((a, b) => b.length - a.length)
      .slice(0, 10);
  }
  
  private applyDictionaryCompression(message: any): any {
    let content = JSON.stringify(message);
    
    for (const [phrase, compressed] of this.compressionDictionary.entries()) {
      const regex = new RegExp(phrase, 'gi');
      content = content.replace(regex, compressed);
    }
    
    try {
      return JSON.parse(content);
    } catch {
      return message;
    }
  }
  
  private enforceContextWindow(message: any): any {
    const tokens = this.estimateTokens(message);
    
    if (tokens <= this.contextWindow) {
      return message;
    }
    
    // Truncate or summarize to fit
    const ratio = this.contextWindow / tokens;
    const truncated = { ...message };
    
    if (truncated.content && typeof truncated.content === 'string') {
      const targetLength = Math.floor(truncated.content.length * ratio * 0.9);
      truncated.content = truncated.content.substring(0, targetLength) + '... [truncated]';
    }
    
    if (truncated.context) {
      truncated.context = {
        summary: this.summarizeContext(truncated.context),
        _truncated: true
      };
    }
    
    return truncated;
  }
  
  private estimateTokens(message: any): number {
    // Rough estimation: 1 token ≈ 4 characters
    const content = JSON.stringify(message);
    return Math.ceil(content.length / 4);
  }
  
  getMetrics(): {
    totalMessages: number;
    averageReduction: number;
    totalTokensSaved: number;
    strategies: { [key: string]: number };
  } {
    const totalMessages = this.metrics.length;
    const averageReduction = totalMessages > 0
      ? this.metrics.reduce((sum, m) => sum + m.reductionPercentage, 0) / totalMessages
      : 0;
    const totalTokensSaved = this.metrics.reduce(
      (sum, m) => sum + (m.originalTokens - m.optimizedTokens),
      0
    );
    
    const strategies: { [key: string]: number } = {};
    this.strategies.forEach((strategy, name) => {
      strategies[name] = strategy.estimatedReduction;
    });
    
    return {
      totalMessages,
      averageReduction,
      totalTokensSaved,
      strategies
    };
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  resetMetrics(): void {
    this.metrics = [];
  }
  
  setContextWindow(tokens: number): void {
    this.contextWindow = tokens;
  }
  
  addCustomStrategy(name: string, strategy: OptimizationStrategy): void {
    this.strategies.set(name, strategy);
  }
  
  removeStrategy(name: string): boolean {
    return this.strategies.delete(name);
  }
  
  addToDictionary(phrase: string, compressed: string): void {
    this.compressionDictionary.set(phrase.toLowerCase(), compressed);
  }
}

// Export singleton instance
export const tokenOptimizer = new TokenOptimizer();