import chalk from 'chalk';
import type { HookContext } from './hookSystem.js';
import { getHookSystem } from './hookSystem.js';
import { getTranscriptManager } from './transcriptManager.js';

export interface CompletionSuggestion {
  text: string;
  confidence: number;
  category: 'command' | 'explanation' | 'next-step' | 'warning' | 'tip';
}

export class SmartCompletionSystem {
  private patterns: Map<RegExp, (context: HookContext) => CompletionSuggestion[]> = new Map();
  private recentContext: HookContext[] = [];
  private maxContextSize: number = 10;
  
  constructor() {
    this.initializePatterns();
    this.registerCompletionHooks();
  }
  
  private initializePatterns(): void {
    // Error handling patterns
    this.patterns.set(/error|failed|exception/i, (context) => [
      { text: 'Check the error logs for more details', confidence: 0.9, category: 'next-step' },
      { text: 'Try running with --debug flag for verbose output', confidence: 0.8, category: 'tip' },
      { text: 'Review recent changes that might have caused this', confidence: 0.7, category: 'next-step' }
    ]);
    
    // Installation patterns
    this.patterns.set(/npm install|yarn add|pip install/i, (context) => [
      { text: 'Run tests to verify the installation', confidence: 0.9, category: 'next-step' },
      { text: 'Check package.json for version conflicts', confidence: 0.7, category: 'tip' },
      { text: 'Clear cache if installation fails: npm cache clean --force', confidence: 0.6, category: 'command' }
    ]);
    
    // Build patterns
    this.patterns.set(/build|compile|webpack|rollup/i, (context) => [
      { text: 'Run tests to verify the build', confidence: 0.9, category: 'next-step' },
      { text: 'Check build output in dist/ or build/ directory', confidence: 0.8, category: 'next-step' },
      { text: 'Deploy to staging environment for testing', confidence: 0.7, category: 'next-step' }
    ]);
    
    // Git patterns
    this.patterns.set(/git commit|git push/i, (context) => [
      { text: 'Create a pull request for code review', confidence: 0.9, category: 'next-step' },
      { text: 'Run git status to check for uncommitted changes', confidence: 0.8, category: 'command' },
      { text: 'Tag this version if it\'s a release', confidence: 0.6, category: 'tip' }
    ]);
    
    // Testing patterns
    this.patterns.set(/test|jest|mocha|cypress/i, (context) => [
      { text: 'Generate coverage report: npm run test:coverage', confidence: 0.8, category: 'command' },
      { text: 'Fix failing tests before committing', confidence: 0.9, category: 'warning' },
      { text: 'Add more test cases for edge scenarios', confidence: 0.7, category: 'tip' }
    ]);
    
    // File operations
    this.patterns.set(/created file|wrote to|saved/i, (context) => [
      { text: 'Open the file in your editor to review', confidence: 0.8, category: 'next-step' },
      { text: 'Add the file to git: git add <filename>', confidence: 0.7, category: 'command' },
      { text: 'Create a backup before making changes', confidence: 0.6, category: 'tip' }
    ]);
    
    // Configuration patterns
    this.patterns.set(/config|setup|initialize/i, (context) => [
      { text: 'Verify configuration with a test run', confidence: 0.9, category: 'next-step' },
      { text: 'Document configuration changes in README', confidence: 0.7, category: 'tip' },
      { text: 'Create .env.example for team members', confidence: 0.6, category: 'next-step' }
    ]);
  }
  
  private registerCompletionHooks(): void {
    const hookSystem = getHookSystem();
    
    // Register main completion hook
    hookSystem.registerHook({
      name: 'smart-completion',
      trigger: 'completion',
      enabled: true,
      priority: 10,
      description: 'Provides intelligent completion suggestions',
      execute: async (context: HookContext) => {
        const suggestions = this.generateSuggestions(context);
        
        if (suggestions.length > 0) {
          this.displaySuggestions(suggestions);
        }
        
        return {
          allow: true,
          suggestions: suggestions.map(s => s.text)
        };
      }
    });
    
    // Register context tracking hook
    hookSystem.registerHook({
      name: 'context-tracker',
      trigger: 'post-command',
      enabled: true,
      priority: 90,
      description: 'Tracks command context for smart completions',
      execute: async (context: HookContext) => {
        this.updateContext(context);
        return { allow: true };
      }
    });
  }
  
  private generateSuggestions(context: HookContext): CompletionSuggestion[] {
    const suggestions: CompletionSuggestion[] = [];
    const seenSuggestions = new Set<string>();
    
    // Check all patterns
    for (const [pattern, generator] of this.patterns.entries()) {
      if (context.command && pattern.test(context.command)) {
        const patternSuggestions = generator(context);
        
        for (const suggestion of patternSuggestions) {
          if (!seenSuggestions.has(suggestion.text)) {
            suggestions.push(suggestion);
            seenSuggestions.add(suggestion.text);
          }
        }
      }
    }
    
    // Analyze recent context for patterns
    const contextSuggestions = this.analyzeContext();
    for (const suggestion of contextSuggestions) {
      if (!seenSuggestions.has(suggestion.text)) {
        suggestions.push(suggestion);
        seenSuggestions.add(suggestion.text);
      }
    }
    
    // Sort by confidence and category priority
    const categoryPriority = {
      'warning': 1,
      'next-step': 2,
      'command': 3,
      'tip': 4,
      'explanation': 5
    };
    
    suggestions.sort((a, b) => {
      const priorityDiff = categoryPriority[a.category] - categoryPriority[b.category];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });
    
    // Return top 5 suggestions
    return suggestions.slice(0, 5);
  }
  
  private analyzeContext(): CompletionSuggestion[] {
    const suggestions: CompletionSuggestion[] = [];
    
    if (this.recentContext.length === 0) {
      return suggestions;
    }
    
    // Check for repeated errors
    const errorCount = this.recentContext.filter(c => c.error).length;
    if (errorCount >= 2) {
      suggestions.push({
        text: 'Multiple errors detected. Consider reviewing your approach',
        confidence: 0.8,
        category: 'warning'
      });
    }
    
    // Check for incomplete workflows
    const hasInstall = this.recentContext.some(c => c.command?.includes('install'));
    const hasBuild = this.recentContext.some(c => c.command?.includes('build'));
    const hasTest = this.recentContext.some(c => c.command?.includes('test'));
    
    if (hasInstall && !hasBuild) {
      suggestions.push({
        text: 'Build the project after installation: npm run build',
        confidence: 0.7,
        category: 'next-step'
      });
    }
    
    if (hasBuild && !hasTest) {
      suggestions.push({
        text: 'Run tests to verify the build: npm test',
        confidence: 0.8,
        category: 'next-step'
      });
    }
    
    // Check session duration
    const transcript = getTranscriptManager();
    const stats = transcript.getStats();
    
    if (stats.currentSessionEntries > 50) {
      suggestions.push({
        text: 'Consider saving your work and taking a break',
        confidence: 0.6,
        category: 'tip'
      });
    }
    
    return suggestions;
  }
  
  private displaySuggestions(suggestions: CompletionSuggestion[]): void {
    if (suggestions.length === 0) return;
    
    console.log('');
    console.log(chalk.cyan.bold('  💡 Smart Suggestions:'));
    
    const icons = {
      'command': '⚡',
      'explanation': '📖',
      'next-step': '➡️',
      'warning': '⚠️',
      'tip': '💭'
    };
    
    const colors = {
      'command': chalk.green,
      'explanation': chalk.blue,
      'next-step': chalk.cyan,
      'warning': chalk.yellow,
      'tip': chalk.magenta
    };
    
    suggestions.forEach((suggestion, index) => {
      const icon = icons[suggestion.category];
      const color = colors[suggestion.category];
      const confidence = Math.round(suggestion.confidence * 100);
      
      console.log(color(`  ${index + 1}. ${icon} ${suggestion.text}`));
      
      if (process.env.DEBUG) {
        console.log(chalk.dim(`     Confidence: ${confidence}%`));
      }
    });
    
    console.log('');
  }
  
  private updateContext(context: HookContext): void {
    this.recentContext.push(context);
    
    // Keep only recent context
    if (this.recentContext.length > this.maxContextSize) {
      this.recentContext = this.recentContext.slice(-this.maxContextSize);
    }
  }
  
  // Add custom pattern
  addPattern(
    pattern: RegExp,
    generator: (context: HookContext) => CompletionSuggestion[]
  ): void {
    this.patterns.set(pattern, generator);
  }
  
  // Get suggestions for specific text
  getSuggestionsForText(text: string): CompletionSuggestion[] {
    // Create a proper context from the input text
    const context: HookContext = {
      command: text,
      timestamp: new Date()
    };
    
    return this.generateSuggestions(context);
  }
  
  // Clear context (useful for new sessions)
  clearContext(): void {
    this.recentContext = [];
  }
}

// Singleton instance
let completionInstance: SmartCompletionSystem | null = null;

export function getSmartCompletionSystem(): SmartCompletionSystem {
  if (!completionInstance) {
    completionInstance = new SmartCompletionSystem();
  }
  return completionInstance;
}

// Helper function for quick suggestions
export function getSuggestions(text: string): CompletionSuggestion[] {
  const system = getSmartCompletionSystem();
  return system.getSuggestionsForText(text);
}