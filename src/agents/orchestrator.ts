import { EventEmitter } from 'events';
import chalk from 'chalk';
import { agents } from './cliAgents.js';
import { getHookSystem } from '../hooks/hookSystem.js';
import { getNotificationSystem } from '../hooks/notificationSystem.js';
import { getTranscriptManager } from '../hooks/transcriptManager.js';
import { getSmartCompletionSystem } from '../hooks/smartCompletion.js';
import { getModeManager } from '../modes/modeManager.js';
import {
  getAutonomousOrchestrator,
  AutonomousOrchestrator,
  AutonomousConfig,
  TaskResult,
  AutonomousEvent
} from './autonomous/index.js';

interface AgentTask {
  id: string;
  agent: string;
  task: any;
  priority: number;
  dependencies?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  result?: any;
  error?: any;
  timeout?: number; // Task-specific timeout in ms
  startedAt?: Date;
}

interface Workflow {
  name: string;
  description: string;
  tasks: AgentTask[];
  parallel?: boolean;
}

export class OrchestratorAgent extends EventEmitter {
  private agents: Map<string, any> = new Map();
  private taskQueue: AgentTask[] = [];
  private runningTasks: Map<string, AgentTask> = new Map();
  private completedTasks: Map<string, AgentTask> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private isRunning: boolean = false;
  private taskAbortControllers: Map<string, AbortController> = new Map();

  // Autonomous mode support
  private autonomousEnabled: boolean = false;
  private autonomousOrchestrator: AutonomousOrchestrator | null = null;
  private autonomousConfig: Partial<AutonomousConfig> = {};

  // Default timeout for task execution (2 minutes)
  private static readonly DEFAULT_TASK_TIMEOUT = 120000;

  constructor() {
    super();
    this.initializeWorkflows();
  }
  
  async initialize(): Promise<void> {
    console.log(chalk.bold.cyan('\n🎭 Orchestrator Agent Initializing...'));
    
    // Initialize all specialized agents
    const agentClasses = [
      agents.FzfAgent,
      agents.ResourceMonitorAgent,
      agents.SessionManagerAgent,
      agents.GitWorkflowAgent,
      agents.AutomationAgent,
      agents.TaskManagementAgent,
      agents.KnowledgeAgent
    ];
    
    for (const AgentClass of agentClasses) {
      const agent = new AgentClass();
      await agent.activate();
      this.agents.set(agent.name, agent);
      
      // Listen to agent events
      agent.on('activated', (name: string) => {
        console.log(chalk.green(`  ✓ ${name} activated`));
      });
      
      agent.on('deactivated', (name: string) => {
        console.log(chalk.yellow(`  ✗ ${name} deactivated`));
      });
    }
    
    console.log(chalk.bold.green(`\n✅ Orchestrator ready with ${this.agents.size} agents\n`));
    
    // Start processing loop
    this.startProcessing();
  }
  
  private initializeWorkflows(): void {
    // Development Workflow
    this.workflows.set('development', {
      name: 'development',
      description: 'Complete development environment setup',
      tasks: [
        {
          id: 'dev-1',
          agent: 'SessionManagerAgent',
          task: { type: 'create_workspace', config: { name: 'dev', layout: 'dev' } },
          priority: 1,
          status: 'pending'
        },
        {
          id: 'dev-2',
          agent: 'AutomationAgent',
          task: { type: 'watch_files', config: { pattern: '*.ts', command: 'npm run build' } },
          priority: 2,
          status: 'pending',
          dependencies: ['dev-1']
        },
        {
          id: 'dev-3',
          agent: 'ResourceMonitorAgent',
          task: { type: 'start_monitoring', interval: 30000 },
          priority: 3,
          status: 'pending'
        }
      ],
      parallel: true
    });
    
    // Deployment Workflow
    this.workflows.set('deployment', {
      name: 'deployment',
      description: 'Automated deployment pipeline',
      tasks: [
        {
          id: 'deploy-1',
          agent: 'GitWorkflowAgent',
          task: { type: 'auto_commit', config: { type: 'chore', message: 'Pre-deployment commit' } },
          priority: 1,
          status: 'pending'
        },
        {
          id: 'deploy-2',
          agent: 'AutomationAgent',
          task: { type: 'run_recipe', config: { recipe: 'build' } },
          priority: 2,
          status: 'pending',
          dependencies: ['deploy-1']
        },
        {
          id: 'deploy-3',
          agent: 'AutomationAgent',
          task: { type: 'run_recipe', config: { recipe: 'test' } },
          priority: 3,
          status: 'pending',
          dependencies: ['deploy-2']
        },
        {
          id: 'deploy-4',
          agent: 'GitWorkflowAgent',
          task: { type: 'create_pr', config: { title: 'Deployment PR', body: 'Automated deployment' } },
          priority: 4,
          status: 'pending',
          dependencies: ['deploy-3']
        }
      ],
      parallel: false
    });
    
    // Debug Workflow
    this.workflows.set('debug', {
      name: 'debug',
      description: 'Debug environment with monitoring',
      tasks: [
        {
          id: 'debug-1',
          agent: 'SessionManagerAgent',
          task: { type: 'create_workspace', config: { name: 'debug', layout: 'debug' } },
          priority: 1,
          status: 'pending'
        },
        {
          id: 'debug-2',
          agent: 'ResourceMonitorAgent',
          task: { type: 'start_monitoring', interval: 5000 },
          priority: 1,
          status: 'pending'
        },
        {
          id: 'debug-3',
          agent: 'AutomationAgent',
          task: { type: 'watch_files', config: { pattern: '*.log', command: 'tail -f' } },
          priority: 2,
          status: 'pending'
        }
      ],
      parallel: true
    });
  }
  
  async executeWorkflow(workflowName: string): Promise<any> {
    const workflow = this.workflows.get(workflowName);
    
    if (!workflow) {
      throw new Error(`Workflow '${workflowName}' not found`);
    }
    
    console.log(chalk.bold.blue(`\n🚀 Executing workflow: ${workflow.name}`));
    console.log(chalk.dim(`   ${workflow.description}`));
    console.log(chalk.dim(`   Tasks: ${workflow.tasks.length}, Parallel: ${workflow.parallel}`));
    
    // Add tasks to queue
    for (const task of workflow.tasks) {
      this.addTask(task);
    }
    
    // Wait for workflow completion
    return await this.waitForWorkflowCompletion(workflow);
  }
  
  async executeTask(agentName: string, task: any): Promise<any> {
    const agent = this.agents.get(agentName);
    
    if (!agent) {
      throw new Error(`Agent '${agentName}' not found`);
    }
    
    // Check if agent is enabled for current mode
    const modeManager = getModeManager();
    if (!modeManager.isAgentEnabled(agentName)) {
      throw new Error(`Agent '${agentName}' is not available in ${modeManager.getCurrentMode()} mode`);
    }
    
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const agentTask: AgentTask = {
      id: taskId,
      agent: agentName,
      task,
      priority: 5,
      status: 'pending'
    };
    
    this.addTask(agentTask);
    
    // Wait for task completion
    return await this.waitForTaskCompletion(taskId);
  }
  
  private addTask(task: AgentTask): void {
    this.taskQueue.push(task);
    this.taskQueue.sort((a, b) => a.priority - b.priority);
    this.emit('task-added', task);
  }
  
  private async startProcessing(): Promise<void> {
    this.isRunning = true;
    
    while (this.isRunning) {
      await this.processTasks();
      await this.sleep(100); // Small delay to prevent CPU spinning
    }
  }
  
  private async processTasks(): Promise<void> {
    // Get next available task
    const task = this.getNextAvailableTask();

    if (!task) {
      return;
    }

    // Mark as running
    task.status = 'running';
    task.startedAt = new Date();
    this.runningTasks.set(task.id, task);

    // Remove from queue
    const index = this.taskQueue.indexOf(task);
    if (index > -1) {
      this.taskQueue.splice(index, 1);
    }

    console.log(chalk.cyan(`\n▶️ Running task ${task.id} with ${task.agent}`));

    // Create abort controller for this task
    const abortController = new AbortController();
    this.taskAbortControllers.set(task.id, abortController);

    // Set up timeout
    const timeoutMs = task.timeout || OrchestratorAgent.DEFAULT_TASK_TIMEOUT;
    const timeoutId = setTimeout(() => {
      abortController.abort();
      this.handleTaskTimeout(task);
    }, timeoutMs);

    try {
      // Execute task with agent and timeout support
      const agent = this.agents.get(task.agent);
      const result = await this.executeWithAbort(
        agent.execute(task.task),
        abortController.signal,
        task
      );

      // Clear timeout on success
      clearTimeout(timeoutId);
      this.taskAbortControllers.delete(task.id);

      // Mark as completed
      task.status = 'completed';
      task.result = result;
      this.completedTasks.set(task.id, task);
      this.runningTasks.delete(task.id);

      console.log(chalk.green(`✅ Task ${task.id} completed`));
      this.emit('task-completed', task);

    } catch (error: any) {
      // Clear timeout on error
      clearTimeout(timeoutId);
      this.taskAbortControllers.delete(task.id);

      // Check if this was a timeout (already handled by handleTaskTimeout)
      if ((task.status as string) === 'timeout') {
        return;
      }

      // Mark as failed
      task.status = 'failed';
      task.error = error;
      this.completedTasks.set(task.id, task);
      this.runningTasks.delete(task.id);

      console.log(chalk.red(`❌ Task ${task.id} failed: ${error.message}`));
      this.emit('task-failed', task);
    }
  }

  /**
   * Execute a promise with abort signal support
   */
  private async executeWithAbort<T>(
    promise: Promise<T>,
    signal: AbortSignal,
    task: AgentTask
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // Check if already aborted
      if (signal.aborted) {
        reject(new Error('Task aborted'));
        return;
      }

      // Listen for abort
      const abortHandler = () => {
        reject(new Error('Task aborted due to timeout'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });

      // Execute the promise
      promise
        .then((result) => {
          signal.removeEventListener('abort', abortHandler);
          resolve(result);
        })
        .catch((error) => {
          signal.removeEventListener('abort', abortHandler);
          reject(error);
        });
    });
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(task: AgentTask): void {
    console.log(chalk.yellow(`⏰ Task ${task.id} timed out after ${task.timeout || OrchestratorAgent.DEFAULT_TASK_TIMEOUT}ms`));

    task.status = 'timeout';
    task.error = new Error('Task execution timeout');
    this.completedTasks.set(task.id, task);
    this.runningTasks.delete(task.id);
    this.taskAbortControllers.delete(task.id);

    this.emit('task-timeout', task);
  }

  /**
   * Cancel a running task
   */
  cancelTask(taskId: string): boolean {
    const controller = this.taskAbortControllers.get(taskId);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }
  
  private getNextAvailableTask(): AgentTask | null {
    for (const task of this.taskQueue) {
      // Check if dependencies are satisfied
      if (this.areDependenciesSatisfied(task)) {
        return task;
      }
    }
    return null;
  }
  
  private areDependenciesSatisfied(task: AgentTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }
    
    for (const depId of task.dependencies) {
      const dep = this.completedTasks.get(depId);
      if (!dep || dep.status !== 'completed') {
        return false;
      }
    }
    
    return true;
  }
  
  private async waitForTaskCompletion(taskId: string, timeout: number = 300000): Promise<any> {
    const existing = this.completedTasks.get(taskId);
    if (existing) {
      if (existing.status === 'completed') return existing.result;
      throw existing.error || new Error('Task failed');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('task-completed', completedHandler);
        this.off('task-failed', failedHandler);
        this.off('task-timeout', timeoutHandler);
        reject(new Error('Task timeout'));
      }, timeout);

      const completedHandler = (task: AgentTask) => {
        if (task.id === taskId) {
          clearTimeout(timer);
          this.off('task-completed', completedHandler);
          this.off('task-failed', failedHandler);
          this.off('task-timeout', timeoutHandler);
          resolve(task.result);
        }
      };

      const failedHandler = (task: AgentTask) => {
        if (task.id === taskId) {
          clearTimeout(timer);
          this.off('task-completed', completedHandler);
          this.off('task-failed', failedHandler);
          this.off('task-timeout', timeoutHandler);
          reject(task.error || new Error('Task failed'));
        }
      };

      const timeoutHandler = (task: AgentTask) => {
        if (task.id === taskId) {
          clearTimeout(timer);
          this.off('task-completed', completedHandler);
          this.off('task-failed', failedHandler);
          this.off('task-timeout', timeoutHandler);
          reject(new Error('Task execution timeout'));
        }
      };

      this.on('task-completed', completedHandler);
      this.on('task-failed', failedHandler);
      this.on('task-timeout', timeoutHandler);
    });
  }
  
  private buildWorkflowResult(workflow: Workflow): any {
    const results = workflow.tasks.map(task => {
      const completed = this.completedTasks.get(task.id);
      return {
        id: task.id,
        agent: task.agent,
        status: completed?.status,
        result: completed?.result,
        error: completed?.error
      };
    });
    return {
      workflow: workflow.name,
      results,
      success: results.every(r => r.status === 'completed')
    };
  }

  private isWorkflowDone(workflow: Workflow): boolean {
    return workflow.tasks.every(task => {
      const completed = this.completedTasks.get(task.id);
      return completed && (completed.status === 'completed' || completed.status === 'failed' || completed.status === 'timeout');
    });
  }

  private async waitForWorkflowCompletion(workflow: Workflow, timeout: number = 600000): Promise<any> {
    // Check if already done (all tasks pre-completed)
    if (this.isWorkflowDone(workflow)) {
      return this.buildWorkflowResult(workflow);
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.off('task-completed', handler);
        this.off('task-failed', handler);
        this.off('task-timeout', handler);
        resolve({
          workflow: workflow.name,
          error: 'Workflow timeout',
          success: false
        });
      }, timeout);

      const handler = (_task: AgentTask) => {
        if (this.isWorkflowDone(workflow)) {
          clearTimeout(timer);
          this.off('task-completed', handler);
          this.off('task-failed', handler);
          this.off('task-timeout', handler);
          resolve(this.buildWorkflowResult(workflow));
        }
      };

      this.on('task-completed', handler);
      this.on('task-failed', handler);
      this.on('task-timeout', handler);
    });
  }
  
  // Intelligence methods
  async analyzeTask(userInput: string): Promise<{
    agent: string;
    task: any;
    confidence: number;
  }> {
    const modeManager = getModeManager();
    const currentMode = modeManager.getCurrentMode();
    const analysis = {
      agent: '',
      task: {},
      confidence: 0
    };
    
    // Keyword analysis for agent selection
    // Filter keywords based on current mode
    let keywords: { [key: string]: string[] } = {
      FzfAgent: ['search', 'find', 'select', 'fuzzy', 'pick', 'choose'],
      ResourceMonitorAgent: ['monitor', 'resource', 'cpu', 'memory', 'performance', 'usage'],
      SessionManagerAgent: ['session', 'tmux', 'terminal', 'pane', 'window', 'workspace'],
      GitWorkflowAgent: ['git', 'commit', 'push', 'pull', 'branch', 'pr', 'merge'],
      AutomationAgent: ['automate', 'watch', 'trigger', 'recipe', 'task', 'just'],
      TaskManagementAgent: ['task', 'todo', 'project', 'deadline', 'priority'],
      KnowledgeAgent: ['help', 'snippet', 'command', 'learn', 'example', 'tldr']
    };
    
    // Filter based on mode
    if (currentMode !== 'dev') {
      const enabledAgents = Object.keys(keywords).filter(agent => 
        modeManager.isAgentEnabled(agent)
      );
      
      const filteredKeywords: { [key: string]: string[] } = {};
      for (const agent of enabledAgents) {
        filteredKeywords[agent] = keywords[agent];
      }
      keywords = filteredKeywords;
    }
    
    const lowerInput = userInput.toLowerCase();
    let bestMatch = { agent: '', score: 0 };
    
    for (const [agent, words] of Object.entries(keywords)) {
      const score = words.filter(w => lowerInput.includes(w)).length;
      if (score > bestMatch.score) {
        bestMatch = { agent, score };
      }
    }
    
    if (bestMatch.score > 0) {
      analysis.agent = bestMatch.agent;
      analysis.confidence = Math.min(bestMatch.score / 3, 1); // Normalize confidence
      
      // Build task based on agent and input
      analysis.task = this.buildTaskForAgent(bestMatch.agent, userInput);
    }
    
    return analysis;
  }
  
  private buildTaskForAgent(agentName: string, input: string): any {
    // Simple task building based on agent type
    switch (agentName) {
      case 'FzfAgent':
        if (input.includes('file')) return { type: 'search_files' };
        if (input.includes('history')) return { type: 'search_history' };
        if (input.includes('process')) return { type: 'select_process' };
        return { type: 'search_files' };
        
      case 'ResourceMonitorAgent':
        if (input.includes('start')) return { type: 'start_monitoring' };
        if (input.includes('stop')) return { type: 'stop_monitoring' };
        return { type: 'get_snapshot' };
        
      case 'GitWorkflowAgent':
        if (input.includes('commit')) return { type: 'auto_commit' };
        if (input.includes('pr')) return { type: 'create_pr' };
        return { type: 'interactive' };
        
      case 'AutomationAgent':
        if (input.includes('watch')) return { type: 'watch_files' };
        if (input.includes('recipe')) return { type: 'run_recipe' };
        return { type: 'create_automation' };
        
      case 'TaskManagementAgent':
        if (input.includes('add')) return { type: 'add_task' };
        if (input.includes('complete')) return { type: 'complete_task' };
        return { type: 'list_tasks' };
        
      case 'KnowledgeAgent':
        if (input.includes('save')) return { type: 'save_snippet' };
        if (input.includes('find')) return { type: 'find_snippet' };
        return { type: 'get_help' };
        
      default:
        return { type: 'unknown' };
    }
  }
  
  // Coordination methods
  async coordinateAgents(goal: string): Promise<any> {
    console.log(chalk.bold.magenta(`\n🎯 Coordinating agents for goal: ${goal}`));
    
    // Analyze goal to determine required agents and workflow
    const requiredAgents: string[] = [];
    const tasks: AgentTask[] = [];
    
    // Simple goal analysis
    const lowerGoal = goal.toLowerCase();
    
    if (lowerGoal.includes('develop') || lowerGoal.includes('code')) {
      return await this.executeWorkflow('development');
    }
    
    if (lowerGoal.includes('deploy') || lowerGoal.includes('release')) {
      return await this.executeWorkflow('deployment');
    }
    
    if (lowerGoal.includes('debug') || lowerGoal.includes('troubleshoot')) {
      return await this.executeWorkflow('debug');
    }
    
    // Custom coordination based on goal
    const analysis = await this.analyzeTask(goal);
    if (analysis.confidence > 0.5) {
      return await this.executeTask(analysis.agent, analysis.task);
    }
    
    return {
      message: 'Could not determine appropriate workflow',
      suggestion: 'Try using a specific workflow: development, deployment, or debug'
    };
  }

  // ==========================================================================
  // Autonomous Mode Support
  // ==========================================================================

  /**
   * Enable autonomous mode for intelligent, self-correcting task execution
   */
  async enableAutonomousMode(config?: Partial<AutonomousConfig>): Promise<void> {
    console.log(chalk.bold.magenta('\n🤖 Enabling Autonomous Mode...'));

    try {
      this.autonomousConfig = config || {};
      this.autonomousOrchestrator = await getAutonomousOrchestrator(this.autonomousConfig);

      // Set up event forwarding
      this.autonomousOrchestrator.onEvent((event: AutonomousEvent) => {
        this.handleAutonomousEvent(event);
      });

      this.autonomousEnabled = true;
      console.log(chalk.bold.green('✅ Autonomous Mode enabled'));
      console.log(chalk.dim('   Chain-of-thought reasoning: Active'));
      console.log(chalk.dim('   Self-correction: Active'));
      console.log(chalk.dim('   Verification: Active'));
    } catch (error: any) {
      console.error(chalk.red(`Failed to enable autonomous mode: ${error.message}`));
      throw error;
    }
  }

  /**
   * Disable autonomous mode
   */
  disableAutonomousMode(): void {
    this.autonomousEnabled = false;
    console.log(chalk.yellow('🔌 Autonomous Mode disabled'));
  }

  /**
   * Check if autonomous mode is enabled
   */
  isAutonomousModeEnabled(): boolean {
    return this.autonomousEnabled;
  }

  /**
   * Execute a goal using the autonomous system
   */
  async executeAutonomous(
    goal: string,
    context?: {
      conversationHistory?: string[];
      relevantFiles?: string[];
      codebaseState?: string;
    },
    onProgress?: (progress: number, message: string) => void
  ): Promise<TaskResult> {
    if (!this.autonomousEnabled || !this.autonomousOrchestrator) {
      // Auto-enable if not enabled
      await this.enableAutonomousMode();
    }

    console.log(chalk.bold.cyan(`\n🧠 Autonomous Execution: ${goal}`));

    return await this.autonomousOrchestrator!.execute(
      goal,
      context,
      undefined,
      onProgress
    );
  }

  /**
   * Handle events from autonomous orchestrator
   */
  private handleAutonomousEvent(event: AutonomousEvent): void {
    switch (event.type) {
      case 'thinking_started':
        console.log(chalk.dim(`  💭 Thinking about task...`));
        break;

      case 'thinking_step':
        console.log(chalk.dim(`  📝 ${event.step.type}: ${event.step.content.substring(0, 100)}...`));
        break;

      case 'thinking_completed':
        console.log(chalk.green(`  ✓ Reasoning complete (confidence: ${Math.round(event.chain.overallConfidence * 100)}%)`));
        break;

      case 'planning_started':
        console.log(chalk.dim(`  📋 Creating execution plan...`));
        break;

      case 'planning_completed':
        console.log(chalk.green(`  ✓ Plan created with ${event.plan.steps.length} steps`));
        break;

      case 'step_started':
        console.log(chalk.cyan(`  ▶ Executing: ${event.step.description}`));
        break;

      case 'step_completed':
        console.log(chalk.green(`  ✓ Step completed`));
        break;

      case 'step_failed':
        console.log(chalk.red(`  ✗ Step failed: ${event.error.message}`));
        break;

      case 'verification_started':
        console.log(chalk.dim(`  🔍 Verifying results...`));
        break;

      case 'verification_completed':
        const status = event.report.result === 'passed' ? chalk.green('✓') : chalk.yellow('⚠');
        console.log(`  ${status} Verification: ${event.report.result}`);
        break;

      case 'correction_started':
        console.log(chalk.yellow(`  🔄 Attempting correction: ${event.strategy}`));
        break;

      case 'correction_completed':
        if (event.attempt.successful) {
          console.log(chalk.green(`  ✓ Correction successful`));
        } else {
          console.log(chalk.red(`  ✗ Correction failed`));
        }
        break;

      case 'task_completed':
        console.log(chalk.bold.green(`\n✅ Task completed successfully!`));
        if (event.result.filesModified.length > 0) {
          console.log(chalk.dim(`   Files modified: ${event.result.filesModified.join(', ')}`));
        }
        break;

      case 'task_failed':
        console.log(chalk.bold.red(`\n❌ Task failed: ${event.error.message}`));
        break;

      case 'approval_required':
        console.log(chalk.bold.yellow(`\n⚠️ Approval required: ${event.operation}`));
        console.log(chalk.dim(`   ${event.details}`));
        break;
    }

    // Forward to orchestrator event listeners
    this.emit('autonomous-event', event);
  }

  /**
   * Get autonomous orchestrator status
   */
  getAutonomousStatus(): any {
    if (!this.autonomousOrchestrator) {
      return { enabled: false };
    }

    return {
      enabled: this.autonomousEnabled,
      activeTasks: this.autonomousOrchestrator.getActiveTasks().length,
      recentTasks: this.autonomousOrchestrator.getTaskHistory(5).map(t => ({
        id: t.id,
        goal: t.goal,
        status: t.status,
        success: t.result?.success
      })),
      config: this.autonomousOrchestrator.getConfig()
    };
  }

  // Status and monitoring
  getStatus(): any {
    return {
      agents: Array.from(this.agents.keys()),
      queue: this.taskQueue.length,
      running: this.runningTasks.size,
      completed: this.completedTasks.size,
      workflows: Array.from(this.workflows.keys())
    };
  }
  
  getAgentStatus(agentName: string): any {
    const agent = this.agents.get(agentName);
    if (!agent) {
      return { error: 'Agent not found' };
    }
    
    return {
      name: agentName,
      active: agent.isActive(),
      capabilities: agent.getCapabilities()
    };
  }
  
  async shutdown(): Promise<void> {
    console.log(chalk.yellow('\n🛑 Orchestrator shutting down...'));

    this.isRunning = false;

    // Cancel all running tasks
    for (const [taskId, controller] of this.taskAbortControllers) {
      console.log(chalk.dim(`  Cancelling task ${taskId}...`));
      controller.abort();
    }
    this.taskAbortControllers.clear();

    // Shutdown all agents
    for (const [name, agent] of this.agents) {
      console.log(chalk.dim(`  Shutting down ${name}...`));
      await agent.deactivate();
    }

    console.log(chalk.green('✅ Orchestrator shutdown complete'));
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let orchestratorInstance: OrchestratorAgent | null = null;

export async function getOrchestrator(): Promise<OrchestratorAgent> {
  if (!orchestratorInstance) {
    orchestratorInstance = new OrchestratorAgent();
    await orchestratorInstance.initialize();
  }
  return orchestratorInstance;
}

// Helper functions for easy access
export async function executeWorkflow(workflowName: string): Promise<any> {
  const orchestrator = await getOrchestrator();
  return await orchestrator.executeWorkflow(workflowName);
}

export async function executeAgentTask(agentName: string, task: any): Promise<any> {
  const orchestrator = await getOrchestrator();
  return await orchestrator.executeTask(agentName, task);
}

export async function coordinateGoal(goal: string): Promise<any> {
  const orchestrator = await getOrchestrator();
  return await orchestrator.coordinateAgents(goal);
}

// Autonomous mode helper functions
export async function enableAutonomousMode(config?: Partial<AutonomousConfig>): Promise<void> {
  const orchestrator = await getOrchestrator();
  await orchestrator.enableAutonomousMode(config);
}

export async function executeAutonomousGoal(
  goal: string,
  context?: {
    conversationHistory?: string[];
    relevantFiles?: string[];
    codebaseState?: string;
  },
  onProgress?: (progress: number, message: string) => void
): Promise<TaskResult> {
  const orchestrator = await getOrchestrator();
  return await orchestrator.executeAutonomous(goal, context, onProgress);
}

export async function getAutonomousStatus(): Promise<any> {
  const orchestrator = await getOrchestrator();
  return orchestrator.getAutonomousStatus();
}