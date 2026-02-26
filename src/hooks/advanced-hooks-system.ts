/**
 * Advanced Hooks System
 * Automate workflows by triggering actions before or after operations
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import * as vm from 'vm';

const execAsync = promisify(exec);

// Hook trigger points
export enum HookPoint {
  // File operations
  BEFORE_FILE_READ = 'before:file:read',
  AFTER_FILE_READ = 'after:file:read',
  BEFORE_FILE_WRITE = 'before:file:write',
  AFTER_FILE_WRITE = 'after:file:write',
  BEFORE_FILE_DELETE = 'before:file:delete',
  AFTER_FILE_DELETE = 'after:file:delete',
  
  // Code operations
  BEFORE_CODE_GENERATION = 'before:code:generation',
  AFTER_CODE_GENERATION = 'after:code:generation',
  BEFORE_CODE_ANALYSIS = 'before:code:analysis',
  AFTER_CODE_ANALYSIS = 'after:code:analysis',
  BEFORE_CODE_REFACTOR = 'before:code:refactor',
  AFTER_CODE_REFACTOR = 'after:code:refactor',
  
  // Build operations
  BEFORE_BUILD = 'before:build',
  AFTER_BUILD = 'after:build',
  BEFORE_TEST = 'before:test',
  AFTER_TEST = 'after:test',
  BEFORE_DEPLOY = 'before:deploy',
  AFTER_DEPLOY = 'after:deploy',
  
  // Git operations
  BEFORE_COMMIT = 'before:git:commit',
  AFTER_COMMIT = 'after:git:commit',
  BEFORE_PUSH = 'before:git:push',
  AFTER_PUSH = 'after:git:push',
  BEFORE_PULL = 'before:git:pull',
  AFTER_PULL = 'after:git:pull',
  BEFORE_MERGE = 'before:git:merge',
  AFTER_MERGE = 'after:git:merge',
  
  // AI operations
  BEFORE_AI_PROMPT = 'before:ai:prompt',
  AFTER_AI_RESPONSE = 'after:ai:response',
  BEFORE_AGENT_TASK = 'before:agent:task',
  AFTER_AGENT_TASK = 'after:agent:task',
  
  // System events
  ON_STARTUP = 'on:startup',
  ON_SHUTDOWN = 'on:shutdown',
  ON_ERROR = 'on:error',
  ON_WARNING = 'on:warning',
  ON_SUCCESS = 'on:success',
  
  // Custom events
  CUSTOM = 'custom'
}

// Hook types
export enum HookType {
  SCRIPT = 'script',           // Shell script
  JAVASCRIPT = 'javascript',    // JavaScript function
  WEBHOOK = 'webhook',          // HTTP webhook
  PLUGIN = 'plugin',           // Plugin execution
  WORKFLOW = 'workflow',       // Multi-step workflow
  CONDITIONAL = 'conditional'   // Conditional execution
}

// Hook execution modes
export enum ExecutionMode {
  SYNC = 'sync',               // Synchronous execution
  ASYNC = 'async',             // Asynchronous execution
  PARALLEL = 'parallel',       // Parallel execution
  SEQUENTIAL = 'sequential',   // Sequential execution
  BACKGROUND = 'background'    // Background execution
}

interface Hook {
  id: string;
  name: string;
  description?: string;
  point: HookPoint;
  type: HookType;
  mode: ExecutionMode;
  enabled: boolean;
  priority: number; // Lower number = higher priority
  conditions?: HookCondition[];
  action: HookAction;
  timeout?: number;
  retries?: number;
  errorHandling?: ErrorHandling;
  metadata?: Record<string, any>;
  statistics?: HookStatistics;
}

interface HookCondition {
  type: 'expression' | 'pattern' | 'environment' | 'time' | 'custom';
  operator: 'equals' | 'contains' | 'matches' | 'greater' | 'less' | 'between';
  field?: string;
  value: any;
  negate?: boolean;
}

interface HookAction {
  type: HookType;
  target: string; // Script path, function, URL, etc.
  arguments?: any[];
  environment?: Record<string, string>;
  workingDirectory?: string;
  input?: any;
  output?: 'ignore' | 'capture' | 'stream' | 'pipe';
  timeout?: number;
}

interface ErrorHandling {
  strategy: 'fail' | 'continue' | 'retry' | 'fallback' | 'notify';
  fallbackAction?: HookAction;
  notificationChannel?: string;
  maxRetries?: number;
  retryDelay?: number;
}

interface HookStatistics {
  executions: number;
  successes: number;
  failures: number;
  averageDuration: number;
  lastExecution?: Date;
  lastError?: string;
}

interface HookContext {
  point: HookPoint;
  timestamp: Date;
  data: any;
  environment: Record<string, string>;
  user?: string;
  session?: string;
  correlationId: string;
}

interface HookResult {
  hookId: string;
  success: boolean;
  duration: number;
  output?: any;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: WorkflowStep[];
  variables: Record<string, any>;
  triggers: HookPoint[];
  conditions?: HookCondition[];
  errorHandling?: ErrorHandling;
}

interface WorkflowStep {
  id: string;
  name: string;
  action: HookAction;
  conditions?: HookCondition[];
  onSuccess?: string; // Next step ID
  onFailure?: string; // Error step ID
  parallel?: string[]; // Parallel step IDs
  timeout?: number;
  retries?: number;
}

export class AdvancedHooksSystem extends EventEmitter {
  private hooks: Map<string, Hook> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private hooksByPoint: Map<HookPoint, Set<string>> = new Map();
  private executionHistory: Map<string, HookResult[]> = new Map();
  private activeExecutions: Set<string> = new Set();
  private globalVariables: Map<string, any> = new Map();
  private plugins: Map<string, any> = new Map();
  private scriptCache: Map<string, any> = new Map();
  
  constructor() {
    super();
    this.initializeDefaultHooks();
    void this.loadHooksFromConfig();
  }
  
  private initializeDefaultHooks(): void {
    // Code quality hook
    this.registerHook({
      id: 'code-quality-check',
      name: 'Code Quality Check',
      description: 'Run linters and formatters before code generation',
      point: HookPoint.AFTER_CODE_GENERATION,
      type: HookType.SCRIPT,
      mode: ExecutionMode.SYNC,
      enabled: true,
      priority: 10,
      action: {
        type: HookType.SCRIPT,
        target: 'npm run lint:fix',
        output: 'capture'
      },
      errorHandling: {
        strategy: 'continue',
        notificationChannel: 'console'
      }
    });
    
    // Auto-commit hook
    this.registerHook({
      id: 'auto-commit',
      name: 'Auto Commit',
      description: 'Automatically commit changes after successful operations',
      point: HookPoint.AFTER_CODE_GENERATION,
      type: HookType.WORKFLOW,
      mode: ExecutionMode.ASYNC,
      enabled: false,
      priority: 20,
      conditions: [
        {
          type: 'environment',
          operator: 'equals',
          field: 'AUTO_COMMIT',
          value: 'true'
        }
      ],
      action: {
        type: HookType.WORKFLOW,
        target: 'auto-commit-workflow'
      }
    });
    
    // Security scan hook
    this.registerHook({
      id: 'security-scan',
      name: 'Security Vulnerability Scan',
      description: 'Scan for security vulnerabilities before deployment',
      point: HookPoint.BEFORE_DEPLOY,
      type: HookType.SCRIPT,
      mode: ExecutionMode.SYNC,
      enabled: true,
      priority: 5,
      action: {
        type: HookType.SCRIPT,
        target: 'npm audit',
        output: 'capture'
      },
      errorHandling: {
        strategy: 'fail'
      }
    });
  }
  
  private async loadHooksFromConfig(): Promise<void> {
    try {
      const configPath = path.join(process.cwd(), '.canvas-cli', 'hooks.json');
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);
      
      if (configExists) {
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
        
        // Load hooks
        if (config.hooks) {
          for (const hook of config.hooks) {
            this.registerHook(hook);
          }
        }
        
        // Load workflows
        if (config.workflows) {
          for (const workflow of config.workflows) {
            this.registerWorkflow(workflow);
          }
        }
        
        // Load global variables
        if (config.variables) {
          for (const [key, value] of Object.entries(config.variables)) {
            this.globalVariables.set(key, value);
          }
        }
        
        this.emit('hooks:loaded', { 
          hooks: this.hooks.size, 
          workflows: this.workflows.size 
        });
      }
    } catch (error) {
      this.emit('hooks:load-error', error);
    }
  }
  
  // Hook registration and management
  
  registerHook(hook: Hook): void {
    // Validate hook
    if (!hook.id || !hook.point || !hook.action) {
      throw new Error('Invalid hook configuration');
    }
    
    // Initialize statistics
    if (!hook.statistics) {
      hook.statistics = {
        executions: 0,
        successes: 0,
        failures: 0,
        averageDuration: 0
      };
    }
    
    // Store hook
    this.hooks.set(hook.id, hook);
    
    // Index by trigger point
    if (!this.hooksByPoint.has(hook.point)) {
      this.hooksByPoint.set(hook.point, new Set());
    }
    this.hooksByPoint.get(hook.point)!.add(hook.id);
    
    this.emit('hook:registered', { hookId: hook.id, point: hook.point });
  }
  
  unregisterHook(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;
    
    // Remove from index
    const pointHooks = this.hooksByPoint.get(hook.point);
    if (pointHooks) {
      pointHooks.delete(hookId);
    }
    
    // Remove hook
    this.hooks.delete(hookId);
    
    this.emit('hook:unregistered', { hookId });
    return true;
  }
  
  // Hook execution
  
  async trigger(point: HookPoint, context: Partial<HookContext> = {}): Promise<HookResult[]> {
    const fullContext: HookContext = {
      point,
      timestamp: new Date(),
      data: context.data || {},
      environment: { ...process.env, ...context.environment } as Record<string, string>,
      user: context.user,
      session: context.session,
      correlationId: context.correlationId || crypto.randomUUID()
    };
    
    this.emit('hooks:trigger', { point, context: fullContext });
    
    // Get hooks for this trigger point
    const hookIds = this.hooksByPoint.get(point);
    if (!hookIds || hookIds.size === 0) {
      return [];
    }
    
    // Get enabled hooks sorted by priority
    const hooks = Array.from(hookIds)
      .map(id => this.hooks.get(id)!)
      .filter(hook => hook.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    const results: HookResult[] = [];
    
    // Execute hooks based on mode
    const groups = this.groupHooksByMode(hooks);
    
    // Execute synchronous hooks first
    for (const hook of groups.sync) {
      const result = await this.executeHook(hook, fullContext);
      results.push(result);
      
      // Stop chain if hook failed and strategy is 'fail'
      if (!result.success && hook.errorHandling?.strategy === 'fail') {
        break;
      }
    }
    
    // Execute async hooks
    const asyncPromises = groups.async.map(hook => 
      this.executeHook(hook, fullContext)
    );
    
    // Execute parallel hooks
    const parallelPromises = groups.parallel.map(hook => 
      this.executeHook(hook, fullContext)
    );
    
    // Execute background hooks (fire and forget)
    for (const hook of groups.background) {
      this.executeHook(hook, fullContext).catch(error => {
        this.emit('hook:background-error', { hookId: hook.id, error });
      });
    }
    
    // Wait for async and parallel hooks
    const asyncResults = await Promise.all(asyncPromises);
    const parallelResults = await Promise.all(parallelPromises);
    
    results.push(...asyncResults, ...parallelResults);
    
    this.emit('hooks:completed', { point, results });
    
    return results;
  }
  
  private async executeHook(hook: Hook, context: HookContext): Promise<HookResult> {
    const startTime = Date.now();
    const executionId = `${hook.id}_${Date.now()}`;
    
    // Mark as executing
    this.activeExecutions.add(executionId);
    
    try {
      // Check conditions
      if (hook.conditions && !this.evaluateConditions(hook.conditions, context)) {
        return {
          hookId: hook.id,
          success: true,
          duration: 0,
          skipped: true,
          skipReason: 'Conditions not met'
        };
      }
      
      this.emit('hook:executing', { hookId: hook.id, context });
      
      // Execute based on type
      let output: any;
      
      switch (hook.type) {
        case HookType.SCRIPT:
          output = await this.executeScript(hook.action, context);
          break;
          
        case HookType.JAVASCRIPT:
          output = await this.executeJavaScript(hook.action, context);
          break;
          
        case HookType.WEBHOOK:
          output = await this.executeWebhook(hook.action, context);
          break;
          
        case HookType.PLUGIN:
          output = await this.executePlugin(hook.action, context);
          break;
          
        case HookType.WORKFLOW:
          output = await this.executeWorkflow(hook.action, context);
          break;
          
        case HookType.CONDITIONAL:
          output = await this.executeConditional(hook, context);
          break;
          
        default:
          throw new Error(`Unknown hook type: ${hook.type}`);
      }
      
      const duration = Date.now() - startTime;
      
      // Update statistics
      if (hook.statistics) {
        hook.statistics.executions++;
        hook.statistics.successes++;
        hook.statistics.averageDuration = 
          (hook.statistics.averageDuration * (hook.statistics.executions - 1) + duration) / 
          hook.statistics.executions;
        hook.statistics.lastExecution = new Date();
      }
      
      const result: HookResult = {
        hookId: hook.id,
        success: true,
        duration,
        output
      };
      
      // Store in history
      this.addToHistory(hook.id, result);
      
      this.emit('hook:success', result);
      
      return result;
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Update statistics
      if (hook.statistics) {
        hook.statistics.executions++;
        hook.statistics.failures++;
        hook.statistics.lastError = error.message;
      }
      
      // Handle error based on strategy
      const result = await this.handleHookError(hook, error, context, duration);
      
      // Store in history
      this.addToHistory(hook.id, result);
      
      this.emit('hook:failure', result);
      
      return result;
      
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }
  
  private async executeScript(action: HookAction, context: HookContext): Promise<any> {
    const options: any = {
      cwd: action.workingDirectory || process.cwd(),
      env: { ...process.env, ...action.environment }
    };
    
    // Prepare command with arguments
    let command = action.target;
    if (action.arguments && action.arguments.length > 0) {
      command += ' ' + action.arguments.join(' ');
    }
    
    // Replace variables in command
    command = this.replaceVariables(command, context);
    
    // Execute script
    const { stdout, stderr } = await execAsync(command, options);
    
    if (action.output === 'capture') {
      return { stdout, stderr };
    }
    
    return stdout;
  }
  
  private async executeJavaScript(action: HookAction, context: HookContext): Promise<any> {
    // Check cache
    let func = this.scriptCache.get(action.target);
    
    if (!func) {
      // Load and compile function
      if (action.target.startsWith('function')) {
        // Inline function
        func = new Function('context', 'variables', action.target);
      } else {
        // Load from file
        const code = await fs.readFile(action.target, 'utf-8');
        func = new Function('context', 'variables', code);
      }
      
      this.scriptCache.set(action.target, func);
    }
    
    // Create sandbox context
    const sandbox = {
      context,
      variables: Object.fromEntries(this.globalVariables),
      console,
      process: {
        env: {},
        cwd: process.cwd
      }
    };
    
    // Execute in VM for isolation
    const script = new vm.Script(`
      (${func.toString()})(context, variables);
    `);
    
    const vmContext = vm.createContext(sandbox);
    return script.runInContext(vmContext, { timeout: action.timeout || 30000 });
  }
  
  private async executeWebhook(action: HookAction, context: HookContext): Promise<any> {
    const url = this.replaceVariables(action.target, context);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hook-ID': context.correlationId
      },
      body: JSON.stringify({
        hook: action,
        context,
        data: action.input || context.data
      })
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }
    
    return await response.json();
  }
  
  private async executePlugin(action: HookAction, context: HookContext): Promise<any> {
    const plugin = this.plugins.get(action.target);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${action.target}`);
    }
    
    // Execute plugin method
    const method = action.arguments?.[0] || 'execute';
    const args = action.arguments?.slice(1) || [];
    
    if (typeof plugin[method] !== 'function') {
      throw new Error(`Plugin method not found: ${method}`);
    }
    
    return await plugin[method](context, ...args);
  }
  
  private async executeWorkflow(action: HookAction, context: HookContext): Promise<any> {
    const workflow = this.workflows.get(action.target);
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${action.target}`);
    }
    
    return await this.runWorkflow(workflow, context);
  }
  
  private async executeConditional(hook: Hook, context: HookContext): Promise<any> {
    // Evaluate conditions and execute appropriate action
    for (const condition of hook.conditions || []) {
      if (this.evaluateCondition(condition, context)) {
        return await this.executeHook(hook, context);
      }
    }
    
    return null;
  }
  
  // Workflow execution
  
  private async runWorkflow(workflow: Workflow, context: HookContext): Promise<any> {
    this.emit('workflow:start', { workflowId: workflow.id, context });
    
    const results: Record<string, any> = {};
    const executedSteps = new Set<string>();
    
    // Initialize workflow variables
    const variables = { ...workflow.variables };
    
    // Execute steps
    let currentStepId = workflow.steps[0]?.id;
    
    while (currentStepId && !executedSteps.has(currentStepId)) {
      const step = workflow.steps.find(s => s.id === currentStepId);
      
      if (!step) break;
      
      executedSteps.add(currentStepId);
      
      try {
        // Check step conditions
        if (step.conditions && !this.evaluateConditions(step.conditions, context)) {
          currentStepId = step.onSuccess ?? '';
          continue;
        }
        
        // Execute step action
        const result = await this.executeAction(step.action, context);
        results[step.id] = result;
        
        // Store result in variables
        variables[`${step.id}_result`] = result;
        
        // Execute parallel steps if any
        if (step.parallel && step.parallel.length > 0) {
          const parallelPromises = step.parallel.map(async stepId => {
            const parallelStep = workflow.steps.find(s => s.id === stepId);
            if (parallelStep) {
              const parallelResult = await this.executeAction(parallelStep.action, context);
              results[stepId] = parallelResult;
              executedSteps.add(stepId);
            }
          });
          
          await Promise.all(parallelPromises);
        }
        
        // Move to next step
        currentStepId = step.onSuccess ?? '';

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.emit('workflow:step-error', { workflowId: workflow.id, stepId: step.id, error: err });

        if (step.onFailure) {
          currentStepId = step.onFailure;
        } else if (workflow.errorHandling) {
          await this.handleWorkflowError(workflow, err, context);
          break;
        } else {
          throw err;
        }
      }
    }
    
    this.emit('workflow:complete', { workflowId: workflow.id, results });
    
    return results;
  }
  
  private async executeAction(action: HookAction, context: HookContext): Promise<any> {
    // Create a temporary hook for action execution
    const tempHook: Hook = {
      id: `temp_${Date.now()}`,
      name: 'Temporary Hook',
      point: HookPoint.CUSTOM,
      type: action.type,
      mode: ExecutionMode.SYNC,
      enabled: true,
      priority: 0,
      action
    };
    
    const result = await this.executeHook(tempHook, context);
    return result.output;
  }
  
  // Condition evaluation
  
  private evaluateConditions(conditions: HookCondition[], context: HookContext): boolean {
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }
  
  private evaluateCondition(condition: HookCondition, context: HookContext): boolean {
    let result = false;
    
    switch (condition.type) {
      case 'expression':
        result = this.evaluateExpression(condition, context);
        break;
        
      case 'pattern':
        result = this.evaluatePattern(condition, context);
        break;
        
      case 'environment':
        result = this.evaluateEnvironment(condition, context);
        break;
        
      case 'time':
        result = this.evaluateTime(condition);
        break;
        
      case 'custom':
        result = this.evaluateCustom(condition, context);
        break;
    }
    
    return condition.negate ? !result : result;
  }
  
  private evaluateExpression(condition: HookCondition, context: HookContext): boolean {
    const value = this.getFieldValue(condition.field!, context);
    
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'greater':
        return value > condition.value;
      case 'less':
        return value < condition.value;
      default:
        return false;
    }
  }
  
  private evaluatePattern(condition: HookCondition, context: HookContext): boolean {
    const value = this.getFieldValue(condition.field!, context);
    const pattern = new RegExp(condition.value);
    return pattern.test(String(value));
  }
  
  private evaluateEnvironment(condition: HookCondition, context: HookContext): boolean {
    const envValue = context.environment[condition.field!];
    return envValue === condition.value;
  }
  
  private evaluateTime(condition: HookCondition): boolean {
    const now = new Date();
    
    switch (condition.operator) {
      case 'between':
        const [start, end] = condition.value;
        return now >= new Date(start) && now <= new Date(end);
      default:
        return false;
    }
  }
  
  private evaluateCustom(condition: HookCondition, context: HookContext): boolean {
    // Execute custom evaluation function
    try {
      const func = new Function('context', 'condition', condition.value);
      const sandbox = { context, condition };
      const vmCtx = vm.createContext(sandbox);
      const script = new vm.Script(`(${func.toString()})(context, condition)`);
      return Boolean(script.runInContext(vmCtx, { timeout: 5000 }));
    } catch {
      return false;
    }
  }
  
  // Error handling
  
  private async handleHookError(
    hook: Hook, 
    error: Error, 
    context: HookContext, 
    duration: number
  ): Promise<HookResult> {
    const errorHandling = hook.errorHandling || { strategy: 'fail' };
    
    switch (errorHandling.strategy) {
      case 'continue':
        return {
          hookId: hook.id,
          success: false,
          duration,
          error: error.message
        };
        
      case 'retry':
        const maxRetries = errorHandling.maxRetries || hook.retries || 3;
        const retryDelay = errorHandling.retryDelay || 1000;
        
        for (let i = 0; i < maxRetries; i++) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
          
          try {
            const result = await this.executeHook(hook, context);
            return result;
          } catch (retryError) {
            // Continue retrying
          }
        }
        
        return {
          hookId: hook.id,
          success: false,
          duration,
          error: `Failed after ${maxRetries} retries: ${error.message}`
        };
        
      case 'fallback':
        if (errorHandling.fallbackAction) {
          try {
            const output = await this.executeAction(errorHandling.fallbackAction, context);
            return {
              hookId: hook.id,
              success: true,
              duration,
              output,
              error: `Fallback executed: ${error.message}`
            };
          } catch (fallbackError: any) {
            return {
              hookId: hook.id,
              success: false,
              duration,
              error: `Fallback failed: ${fallbackError.message}`
            };
          }
        }
        break;
        
      case 'notify':
        if (errorHandling.notificationChannel) {
          this.emit('hook:notify', {
            channel: errorHandling.notificationChannel,
            hookId: hook.id,
            error: error.message
          });
        }
        break;
    }
    
    return {
      hookId: hook.id,
      success: false,
      duration,
      error: error.message
    };
  }
  
  private async handleWorkflowError(
    workflow: Workflow, 
    error: Error, 
    context: HookContext
  ): Promise<void> {
    if (!workflow.errorHandling) return;
    
    switch (workflow.errorHandling.strategy) {
      case 'notify':
        this.emit('workflow:notify', {
          workflowId: workflow.id,
          error: error.message
        });
        break;
        
      case 'fallback':
        if (workflow.errorHandling.fallbackAction) {
          await this.executeAction(workflow.errorHandling.fallbackAction, context);
        }
        break;
    }
  }
  
  // Helper methods
  
  private groupHooksByMode(hooks: Hook[]): Record<string, Hook[]> {
    return {
      sync: hooks.filter(h => h.mode === ExecutionMode.SYNC || h.mode === ExecutionMode.SEQUENTIAL),
      async: hooks.filter(h => h.mode === ExecutionMode.ASYNC),
      parallel: hooks.filter(h => h.mode === ExecutionMode.PARALLEL),
      background: hooks.filter(h => h.mode === ExecutionMode.BACKGROUND)
    };
  }
  
  private replaceVariables(text: string, context: HookContext): string {
    // Replace context variables
    text = text.replace(/\{\{context\.(\w+)\}\}/g, (match, key) => {
      return context[key as keyof HookContext] || match;
    });
    
    // Replace data variables
    text = text.replace(/\{\{data\.([.\w]+)\}\}/g, (match, path) => {
      return this.getFieldValue(`data.${path}`, context) || match;
    });
    
    // Replace global variables
    text = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return this.globalVariables.get(key) || match;
    });
    
    return text;
  }
  
  private getFieldValue(path: string, context: HookContext): any {
    const parts = path.split('.');
    let value: any = context;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }
    
    return value;
  }
  
  private addToHistory(hookId: string, result: HookResult): void {
    if (!this.executionHistory.has(hookId)) {
      this.executionHistory.set(hookId, []);
    }
    
    const history = this.executionHistory.get(hookId)!;
    history.push(result);
    
    // Keep only last 100 executions
    if (history.length > 100) {
      history.shift();
    }
  }
  
  // Workflow management
  
  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
    
    // Register triggers as hooks
    for (const trigger of workflow.triggers) {
      this.registerHook({
        id: `workflow_trigger_${workflow.id}_${trigger}`,
        name: `Workflow Trigger: ${workflow.name}`,
        point: trigger,
        type: HookType.WORKFLOW,
        mode: ExecutionMode.ASYNC,
        enabled: true,
        priority: 50,
        conditions: workflow.conditions,
        action: {
          type: HookType.WORKFLOW,
          target: workflow.id
        },
        errorHandling: workflow.errorHandling
      });
    }
    
    this.emit('workflow:registered', { workflowId: workflow.id });
  }
  
  unregisterWorkflow(workflowId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;
    
    // Remove trigger hooks
    for (const trigger of workflow.triggers) {
      this.unregisterHook(`workflow_trigger_${workflowId}_${trigger}`);
    }
    
    this.workflows.delete(workflowId);
    
    this.emit('workflow:unregistered', { workflowId });
    return true;
  }
  
  // Plugin management
  
  registerPlugin(name: string, plugin: any): void {
    this.plugins.set(name, plugin);
    
    // Initialize plugin if it has an init method
    if (typeof plugin.init === 'function') {
      plugin.init(this);
    }
    
    this.emit('plugin:registered', { name });
  }
  
  unregisterPlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;
    
    // Cleanup plugin if it has a cleanup method
    if (typeof plugin.cleanup === 'function') {
      plugin.cleanup();
    }
    
    this.plugins.delete(name);
    
    this.emit('plugin:unregistered', { name });
    return true;
  }
  
  // Public API
  
  getHook(hookId: string): Hook | undefined {
    return this.hooks.get(hookId);
  }
  
  getHooksByPoint(point: HookPoint): Hook[] {
    const hookIds = this.hooksByPoint.get(point) || new Set();
    return Array.from(hookIds).map(id => this.hooks.get(id)!).filter(Boolean);
  }
  
  getAllHooks(): Hook[] {
    return Array.from(this.hooks.values());
  }
  
  enableHook(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;
    
    hook.enabled = true;
    return true;
  }
  
  disableHook(hookId: string): boolean {
    const hook = this.hooks.get(hookId);
    if (!hook) return false;
    
    hook.enabled = false;
    return true;
  }
  
  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }
  
  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }
  
  getExecutionHistory(hookId?: string): HookResult[] {
    if (hookId) {
      return this.executionHistory.get(hookId) || [];
    }
    
    const allHistory: HookResult[] = [];
    for (const history of this.executionHistory.values()) {
      allHistory.push(...history);
    }
    
    return allHistory;
  }
  
  getStatistics(hookId?: string): any {
    if (hookId) {
      const hook = this.hooks.get(hookId);
      return hook?.statistics;
    }
    
    // Aggregate statistics
    const stats = {
      totalHooks: this.hooks.size,
      enabledHooks: Array.from(this.hooks.values()).filter(h => h.enabled).length,
      totalExecutions: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      averageDuration: 0
    };
    
    for (const hook of this.hooks.values()) {
      if (hook.statistics) {
        stats.totalExecutions += hook.statistics.executions;
        stats.totalSuccesses += hook.statistics.successes;
        stats.totalFailures += hook.statistics.failures;
        stats.averageDuration += hook.statistics.averageDuration;
      }
    }
    
    if (this.hooks.size > 0) {
      stats.averageDuration /= this.hooks.size;
    }
    
    return stats;
  }
  
  setGlobalVariable(key: string, value: any): void {
    this.globalVariables.set(key, value);
  }
  
  getGlobalVariable(key: string): any {
    return this.globalVariables.get(key);
  }
  
  async saveConfiguration(configPath?: string): Promise<void> {
    const savePath = configPath || path.join(process.cwd(), '.canvas-cli', 'hooks.json');

    const config = {
      hooks: Array.from(this.hooks.values()),
      workflows: Array.from(this.workflows.values()),
      variables: Object.fromEntries(this.globalVariables)
    };

    await fs.writeFile(savePath, JSON.stringify(config, null, 2), 'utf-8');

    this.emit('config:saved', { path: savePath });
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _hooksSystem: AdvancedHooksSystem | null = null;
export function getHooksSystem(): AdvancedHooksSystem {
  if (!_hooksSystem) _hooksSystem = new AdvancedHooksSystem();
  return _hooksSystem;
}