import EventEmitter from 'events';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { permissionManager } from '../permissions/permission-manager.js';

const execAsync = promisify(exec);

// Hook types and triggers
export type HookTrigger = 
  | 'pre-command'
  | 'post-command'
  | 'pre-tool-use'
  | 'post-tool-use'
  | 'session-start'
  | 'session-end'
  | 'completion'
  | 'error'
  | 'notification'
  | 'context-injection'
  | 'transcript-save';

export interface HookContext {
  command?: string;
  tool?: string;
  parameters?: any;
  result?: any;
  error?: Error;
  session?: any;
  timestamp: Date;
  mode?: 'planning' | 'execution';
  user?: string;
}

export interface HookResult {
  allow: boolean;
  modified?: any;
  message?: string;
  suggestions?: string[];
  log?: boolean;
}

export interface Hook {
  name: string;
  trigger: HookTrigger;
  enabled: boolean;
  priority: number; // Lower numbers run first
  execute: (context: HookContext) => Promise<HookResult>;
  description?: string;
}

export class HookSystem extends EventEmitter {
  private hooks: Map<HookTrigger, Hook[]> = new Map();
  private hookHistory: Array<{ hook: string; trigger: HookTrigger; timestamp: Date; result: HookResult }> = [];
  private configPath: string;
  private scriptsPath: string;
  private transcriptsPath: string;
  
  constructor() {
    super();
    
    // Setup paths
    const canvasDir = path.join(os.homedir(), '.canvas-cli');
    this.configPath = path.join(canvasDir, 'hooks.json');
    this.scriptsPath = path.join(canvasDir, 'hooks');
    this.transcriptsPath = path.join(canvasDir, 'transcripts');
    
    // Ensure directories exist
    fs.ensureDirSync(canvasDir);
    fs.ensureDirSync(this.scriptsPath);
    fs.ensureDirSync(this.transcriptsPath);
    
    // Load hooks configuration
    this.loadHooks();
    
    // Register built-in hooks
    this.registerBuiltInHooks();
  }
  
  private loadHooks(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const config = fs.readJsonSync(this.configPath);
        // Load custom hooks from config
        if (config.customHooks) {
          for (const hookConfig of config.customHooks) {
            this.registerHook(this.createHookFromConfig(hookConfig));
          }
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠ Could not load hooks configuration'));
    }
  }
  
  private createHookFromConfig(config: any): Hook {
    return {
      name: config.name,
      trigger: config.trigger,
      enabled: config.enabled !== false,
      priority: config.priority || 50,
      description: config.description,
      execute: async (context: HookContext) => {
        // Execute script if provided
        if (config.script) {
          const scriptPath = path.join(this.scriptsPath, config.script);
          if (fs.existsSync(scriptPath)) {
            try {
              const { stdout } = await execAsync(`node "${scriptPath}" '${JSON.stringify(context)}'`);
              return JSON.parse(stdout);
            } catch (error) {
              return { allow: true, message: `Hook script error: ${error}` };
            }
          }
        }
        
        // Default allow
        return { allow: true };
      }
    };
  }
  
  private registerBuiltInHooks(): void {
    // Security validation hook
    this.registerHook({
      name: 'security-validator',
      trigger: 'pre-command',
      enabled: true,
      priority: 1,
      description: 'Validates commands for security risks',
      execute: async (context: HookContext) => {
        const dangerous = [
          /rm\s+-rf\s+\//i,
          /format\s+[cC]:/i,
          /del\s+\/[fF]/i,
          /sudo\s+rm/i,
          />\s*\/dev\/sda/i,
          /fork\s*bomb/i
        ];
        
        const command = context.command || '';
        for (const pattern of dangerous) {
          if (pattern.test(command)) {
            return {
              allow: false,
              message: '⚠️ Dangerous command detected',
              suggestions: ['Review the command carefully', 'Use safer alternatives']
            };
          }
        }
        
        return { allow: true };
      }
    });
    
    // Permission system hook
    this.registerHook({
      name: 'permission-checker',
      trigger: 'pre-tool-use',
      enabled: true,
      priority: 2,
      description: 'Checks tool permissions via the permission manager',
      execute: async (context: HookContext) => {
        if (!context.tool) return { allow: true };
        const decision = permissionManager.checkPermission({
          tool: context.tool,
          params: context.parameters,
        });
        if (decision === 'deny') {
          return {
            allow: false,
            message: `Permission denied for tool: ${context.tool}`,
            suggestions: ['Run "canvas permissions" to manage rules'],
          };
        }
        return { allow: true };
      },
    });

    // Context injection hook
    this.registerHook({
      name: 'context-injector',
      trigger: 'session-start',
      enabled: true,
      priority: 10,
      description: 'Loads project context on session start',
      execute: async (context: HookContext) => {
        const contextFiles = [
          '.canvas-context.json',
          'package.json',
          'README.md',
          '.env.example'
        ];
        
        const loadedContext: any = {};
        
        for (const file of contextFiles) {
          if (fs.existsSync(file)) {
            try {
              const content = fs.readFileSync(file, 'utf-8');
              loadedContext[file] = file.endsWith('.json') ? JSON.parse(content) : content;
            } catch (error) {
              // Skip files that can't be read
            }
          }
        }
        
        return {
          allow: true,
          modified: loadedContext,
          message: `Loaded ${Object.keys(loadedContext).length} context files`
        };
      }
    });
    
    // Command logger hook
    this.registerHook({
      name: 'command-logger',
      trigger: 'post-command',
      enabled: true,
      priority: 100,
      description: 'Logs all executed commands',
      execute: async (context: HookContext) => {
        const logPath = path.join(this.transcriptsPath, 'commands.log');
        const logEntry = `[${context.timestamp.toISOString()}] ${context.mode || 'unknown'}: ${context.command}\n`;
        
        try {
          fs.appendFileSync(logPath, logEntry);
        } catch (error) {
          // Silent fail
        }
        
        return { allow: true, log: true };
      }
    });
    
    // Transcript backup hook
    this.registerHook({
      name: 'transcript-backup',
      trigger: 'transcript-save',
      enabled: true,
      priority: 20,
      description: 'Creates backup of conversation transcripts',
      execute: async (context: HookContext) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(this.transcriptsPath, `transcript-${timestamp}.json`);
        
        if (context.session) {
          try {
            fs.writeJsonSync(backupPath, context.session, { spaces: 2 });
            
            // Keep only last 10 transcripts
            const files = fs.readdirSync(this.transcriptsPath)
              .filter(f => f.startsWith('transcript-'))
              .sort()
              .reverse();
            
            if (files.length > 10) {
              for (const file of files.slice(10)) {
                fs.removeSync(path.join(this.transcriptsPath, file));
              }
            }
            
            return { allow: true, message: `Transcript saved: ${backupPath}` };
          } catch (error) {
            return { allow: true, message: 'Failed to save transcript' };
          }
        }
        
        return { allow: true };
      }
    });
    
    // Smart completion hook
    this.registerHook({
      name: 'smart-completion',
      trigger: 'completion',
      enabled: true,
      priority: 30,
      description: 'Provides intelligent response completion',
      execute: async (context: HookContext) => {
        const suggestions = [];
        
        // Add contextual suggestions based on the last command
        if (context.command?.includes('error')) {
          suggestions.push('Check the error logs for more details');
          suggestions.push('Try running with --debug flag');
        } else if (context.command?.includes('install')) {
          suggestions.push('Run the application to test the installation');
          suggestions.push('Check the documentation for configuration');
        } else if (context.command?.includes('build')) {
          suggestions.push('Run tests to verify the build');
          suggestions.push('Deploy to staging environment');
        }
        
        return {
          allow: true,
          suggestions: suggestions.length > 0 ? suggestions : ['Type "help" for available commands']
        };
      }
    });
  }
  
  registerHook(hook: Hook): void {
    const trigger = hook.trigger;
    if (!this.hooks.has(trigger)) {
      this.hooks.set(trigger, []);
    }
    
    const hooks = this.hooks.get(trigger)!;
    hooks.push(hook);
    
    // Sort by priority
    hooks.sort((a, b) => a.priority - b.priority);
    
    this.emit('hook-registered', hook);
  }
  
  async executeHooks(trigger: HookTrigger, context: HookContext): Promise<HookResult> {
    const hooks = this.hooks.get(trigger) || [];
    let finalResult: HookResult = { allow: true };
    
    for (const hook of hooks) {
      if (!hook.enabled) continue;
      
      try {
        const result = await hook.execute(context);
        
        // Log hook execution
        this.hookHistory.push({
          hook: hook.name,
          trigger,
          timestamp: new Date(),
          result
        });
        
        // If any hook blocks, stop execution
        if (!result.allow) {
          console.log(chalk.red(`\n  ❌ Blocked by ${hook.name}: ${result.message}`));
          if (result.suggestions) {
            console.log(chalk.yellow('  💡 Suggestions:'));
            result.suggestions.forEach(s => console.log(chalk.yellow(`     • ${s}`)));
          }
          return result;
        }
        
        // Merge results
        if (result.modified) {
          context = { ...context, ...result.modified };
        }
        
        if (result.message && result.log !== false) {
          console.log(chalk.dim(`  ✓ ${hook.name}: ${result.message}`));
        }
        
        finalResult = { ...finalResult, ...result };
      } catch (error: any) {
        console.log(chalk.yellow(`  ⚠ Hook ${hook.name} error: ${error.message}`));
      }
    }
    
    return finalResult;
  }
  
  disableHook(name: string): void {
    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.name === name);
      if (hook) {
        hook.enabled = false;
        this.emit('hook-disabled', hook);
        return;
      }
    }
  }
  
  enableHook(name: string): void {
    for (const hooks of this.hooks.values()) {
      const hook = hooks.find(h => h.name === name);
      if (hook) {
        hook.enabled = true;
        this.emit('hook-enabled', hook);
        return;
      }
    }
  }
  
  listHooks(): Array<{ name: string; trigger: HookTrigger; enabled: boolean; description?: string }> {
    const allHooks = [];
    
    for (const [trigger, hooks] of this.hooks.entries()) {
      for (const hook of hooks) {
        allHooks.push({
          name: hook.name,
          trigger,
          enabled: hook.enabled,
          description: hook.description
        });
      }
    }
    
    return allHooks;
  }
  
  getHistory(limit: number = 10): typeof this.hookHistory {
    return this.hookHistory.slice(-limit);
  }
  
  clearHistory(): void {
    this.hookHistory = [];
  }
  
  // Save custom hook configuration
  async saveCustomHook(name: string, trigger: HookTrigger, scriptPath: string): Promise<void> {
    const config = fs.existsSync(this.configPath) ? fs.readJsonSync(this.configPath) : {};
    
    if (!config.customHooks) {
      config.customHooks = [];
    }
    
    config.customHooks.push({
      name,
      trigger,
      script: path.basename(scriptPath),
      enabled: true,
      priority: 50
    });
    
    // Copy script to hooks directory
    const destPath = path.join(this.scriptsPath, path.basename(scriptPath));
    fs.copySync(scriptPath, destPath);
    
    fs.writeJsonSync(this.configPath, config, { spaces: 2 });
    
    // Register the new hook
    this.registerHook(this.createHookFromConfig(config.customHooks[config.customHooks.length - 1]));
  }
}

// Singleton instance
let hookSystemInstance: HookSystem | null = null;

export function getHookSystem(): HookSystem {
  if (!hookSystemInstance) {
    hookSystemInstance = new HookSystem();
  }
  return hookSystemInstance;
}