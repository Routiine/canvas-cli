import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ErrorSuggestion {
  message: string;
  command?: string;
  action?: () => Promise<void>;
}

interface ErrorPattern {
  pattern: RegExp;
  suggestions: ErrorSuggestion[];
  category: 'connection' | 'file' | 'command' | 'permission' | 'syntax' | 'dependency' | 'unknown';
}

export class EnhancedErrorHandler {
  private static errorPatterns: ErrorPattern[] = [
    // Connection errors
    {
      pattern: /Cannot connect to Ollama/i,
      category: 'connection',
      suggestions: [
        { message: 'Start Ollama service', command: 'ollama serve' },
        { message: 'Check if Ollama is installed', command: 'ollama --version' },
                { message: 'Verify the Ollama URL in your config', command: 'canvas config --url <your_ollama_url>' }
      ]
    },
    {
      pattern: /ECONNREFUSED/i,
      category: 'connection',
      suggestions: [
        { message: 'Check if the service is running' },
        { message: 'Verify the port is correct' },
        { message: 'Check firewall settings' }
      ]
    },
    
    // File system errors
    {
      pattern: /ENOENT.*no such file or directory/i,
      category: 'file',
      suggestions: [
        { message: 'Check if the file path is correct' },
        { message: 'Verify the file exists', command: 'ls -la' },
        { message: 'Create the missing file or directory' }
      ]
    },
    {
      pattern: /EACCES.*permission denied/i,
      category: 'permission',
      suggestions: [
        { message: 'Check file permissions', command: 'ls -la' },
        { message: 'Try running with elevated permissions' },
        { message: 'Change file ownership or permissions', command: 'chmod' }
      ]
    },
    
    // Command errors
    {
      pattern: /command not found/i,
      category: 'command',
      suggestions: [
        { message: 'Install the missing command' },
        { message: 'Check if the command is in PATH', command: 'echo $PATH' },
        { message: 'Use the full path to the command' }
      ]
    },
    {
      pattern: /npm.*not found/i,
      category: 'dependency',
      suggestions: [
        { message: 'Install Node.js and npm', command: 'https://nodejs.org' },
        { message: 'Verify npm installation', command: 'which npm' },
        { message: 'Restart your terminal after installation' }
      ]
    },
    
    // Module/dependency errors
    {
      pattern: /Cannot find module/i,
      category: 'dependency',
      suggestions: [
        { message: 'Install dependencies', command: 'npm install' },
        { message: 'Clear npm cache', command: 'npm cache clean --force' },
        { message: 'Delete node_modules and reinstall', command: 'rm -rf node_modules && npm install' }
      ]
    },
    {
      pattern: /Module not found/i,
      category: 'dependency',
      suggestions: [
        { message: 'Check if the module is installed' },
        { message: 'Verify import path is correct' },
        { message: 'Run npm install to install dependencies' }
      ]
    },
    
    // Syntax errors
    {
      pattern: /SyntaxError/i,
      category: 'syntax',
      suggestions: [
        { message: 'Check for missing brackets or parentheses' },
        { message: 'Verify JSON is properly formatted' },
        { message: 'Look for unclosed strings or comments' }
      ]
    },
    {
      pattern: /Unexpected token/i,
      category: 'syntax',
      suggestions: [
        { message: 'Check syntax around the reported line' },
        { message: 'Verify all brackets and braces are matched' },
        { message: 'Look for missing commas or semicolons' }
      ]
    },
    
    // Memory errors
    {
      pattern: /JavaScript heap out of memory/i,
      category: 'unknown',
      suggestions: [
        { message: 'Increase Node.js memory limit', command: 'export NODE_OPTIONS="--max-old-space-size=4096"' },
        { message: 'Check for memory leaks in code' },
        { message: 'Process data in smaller chunks' }
      ]
    }
  ];
  
  static async handle(error: Error | any, context?: string): Promise<void> {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    const errorStack = error?.stack;
    
    // Display formatted error
    console.log('');
    console.log(chalk.red.bold('  ✗ Error Detected'));
    console.log(chalk.red(`  ${errorMessage}`));
    
    if (context) {
      console.log(chalk.dim(`  Context: ${context}`));
    }
    
    // Find matching patterns and suggestions
    const suggestions = this.getSuggestions(errorMessage);
    
    if (suggestions.length > 0) {
      console.log('');
      console.log(chalk.yellow.bold('  💡 Suggestions:'));
      
      for (let i = 0; i < suggestions.length; i++) {
        const suggestion = suggestions[i];
        console.log(chalk.yellow(`  ${i + 1}. ${suggestion.message}`));
        
        if (suggestion.command) {
          console.log(chalk.dim(`     → ${suggestion.command}`));
        }
      }
      
      // Auto-fix option for certain errors
      const fixableSuggestion = suggestions.find(s => s.action);
      if (fixableSuggestion) {
        console.log('');
        console.log(chalk.green('  🔧 Auto-fix available'));
        console.log(chalk.dim('     Press Enter to attempt auto-fix, or any other key to skip'));
        
        // Wait for user input (simplified for now)
        // In a real implementation, you'd handle this properly
      }
    } else {
      // Generic suggestions for unknown errors
      console.log('');
      console.log(chalk.yellow.bold('  💡 General Suggestions:'));
      console.log(chalk.yellow('  1. Check the error message for clues'));
      console.log(chalk.yellow('  2. Search for the error online'));
      console.log(chalk.yellow('  3. Review recent changes'));
      console.log(chalk.yellow('  4. Check logs for more details'));
    }
    
    // Show stack trace in debug mode
    if (process.env.DEBUG && errorStack) {
      console.log('');
      console.log(chalk.dim('  Stack Trace:'));
      const stackLines = errorStack.split('\n').slice(1, 6);
      stackLines.forEach((line: string) => {
        console.log(chalk.dim(`  ${line.trim()}`));
      });
    }
    
    // Log to error file
    await this.logError(error, context);
  }
  
  private static getSuggestions(errorMessage: string): ErrorSuggestion[] {
    const suggestions: ErrorSuggestion[] = [];
    
    for (const errorPattern of this.errorPatterns) {
      if (errorPattern.pattern.test(errorMessage)) {
        suggestions.push(...errorPattern.suggestions);
      }
    }
    
    // Limit to top 3 suggestions
    return suggestions.slice(0, 3);
  }
  
  private static async logError(error: any, context?: string): Promise<void> {
    // Create error log entry
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      error: error?.message || error?.toString(),
      stack: error?.stack,
      context
    };
    
    // In production, write to log file
    // For now, just store in memory or skip
    if (process.env.DEBUG) {
      console.log(chalk.dim('\n  Error logged for debugging'));
    }
  }
  
  // Helper to display common error fixes
  static showQuickFix(errorType: 'ollama' | 'npm' | 'permission' | 'syntax'): void {
    const fixes = {
      ollama: [
        'Start Ollama: ollama serve',
        'Pull a model: ollama pull qwen2.5-coder:14b',
        'Check status: ollama list'
      ],
      npm: [
        'Install deps: npm install',
        'Clear cache: npm cache clean --force',
        'Rebuild: npm rebuild'
      ],
      permission: [
        'Check permissions: ls -la',
        'Change ownership: sudo chown -R $(whoami) .',
        'Fix permissions: chmod 755 <file>'
      ],
      syntax: [
        'Format code: npm run format',
        'Lint code: npm run lint',
        'Type check: npm run typecheck'
      ]
    };
    
    const fixList = fixes[errorType] || [];
    
    console.log(chalk.cyan.bold(`\n  Quick Fixes for ${errorType}:`));
    fixList.forEach((fix, i) => {
      console.log(chalk.cyan(`  ${i + 1}. ${fix}`));
    });
  }
  
  // Format error for display with context
  static format(error: any, options: { 
    showStack?: boolean; 
    showSuggestions?: boolean;
    compact?: boolean;
  } = {}): string {
    const {
      showStack = false,
      showSuggestions = true,
      compact = false
    } = options;
    
    if (compact) {
      return chalk.red(`✗ ${error?.message || error}`);
    }
    
    let output = '';
    output += chalk.red.bold('\n╔════ Error ════╗\n');
    output += chalk.red(`║ ${error?.message || error}\n`);
    output += chalk.red.bold('╚═══════════════╝\n');
    
    if (showSuggestions) {
      const suggestions = this.getSuggestions(error?.message || '');
      if (suggestions.length > 0) {
        output += chalk.yellow('\n💡 Try:\n');
        suggestions.forEach((s, i) => {
          output += chalk.yellow(`  ${i + 1}. ${s.message}\n`);
        });
      }
    }
    
    if (showStack && error?.stack) {
      output += chalk.dim('\nStack:\n');
      output += chalk.dim(error.stack);
    }
    
    return output;
  }
  
  // Create a recovery checkpoint before risky operations
  static async createRecoveryPoint(operation: string): Promise<() => Promise<void>> {
    const timestamp = Date.now();
    const recoveryData = {
      operation,
      timestamp,
      cwd: process.cwd(),
      env: { ...process.env }
    };
    
    // Return recovery function
    return async () => {
      console.log(chalk.green(`\n  🔄 Recovering from ${operation}...`));
      // Restore working directory
      process.chdir(recoveryData.cwd);
      // Could restore other state here
      console.log(chalk.green('  ✓ Recovery complete'));
    };
  }
}

// Convenience function for quick error handling
export async function handleError(error: any, context?: string): Promise<void> {
  await EnhancedErrorHandler.handle(error, context);
}

// Wrap async functions with error handling
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      await EnhancedErrorHandler.handle(error, context);
      throw error; // Re-throw to maintain function signature
    }
  }) as T;
}

// Error boundary for sync functions
export function tryCatch<T>(
  fn: () => T,
  fallback?: T,
  context?: string
): T | undefined {
  try {
    return fn();
  } catch (error) {
    EnhancedErrorHandler.handle(error, context);
    return fallback;
  }
}