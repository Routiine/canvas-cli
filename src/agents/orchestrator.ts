import { EventEmitter } from 'events';
import chalk from 'chalk';
import { agents } from './cliAgents.js';
import { getHookSystem } from '../hooks/hookSystem.js';
import { getNotificationSystem } from '../hooks/notificationSystem.js';
import { getTranscriptManager } from '../hooks/transcriptManager.js';
import { getSmartCompletionSystem } from '../hooks/smartCompletion.js';
import { getModeManager } from '../modes/modeManager.js';

interface AgentTask {
  id: string;
  agent: string;
  task: any;
  priority: number;
  dependencies?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: any;
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
    
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    this.runningTasks.set(task.id, task);
    
    // Remove from queue
    const index = this.taskQueue.indexOf(task);
    if (index > -1) {
      this.taskQueue.splice(index, 1);
    }
    
    console.log(chalk.cyan(`\n▶️ Running task ${task.id} with ${task.agent}`));
    
    try {
      // Execute task with agent
      const agent = this.agents.get(task.agent);
      const result = await agent.execute(task.task);
      
      // Mark as completed
      task.status = 'completed';
      task.result = result;
      this.completedTasks.set(task.id, task);
      this.runningTasks.delete(task.id);
      
      console.log(chalk.green(`✅ Task ${task.id} completed`));
      this.emit('task-completed', task);
      
    } catch (error: any) {
      // Mark as failed
      task.status = 'failed';
      task.error = error;
      this.completedTasks.set(task.id, task);
      this.runningTasks.delete(task.id);
      
      console.log(chalk.red(`❌ Task ${task.id} failed: ${error.message}`));
      this.emit('task-failed', task);
    }
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
  
  private async waitForTaskCompletion(taskId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const task = this.completedTasks.get(taskId);
        
        if (task) {
          clearInterval(checkInterval);
          
          if (task.status === 'completed') {
            resolve(task.result);
          } else {
            reject(task.error || new Error('Task failed'));
          }
        }
      }, 100);
      
      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Task timeout'));
      }, 300000);
    });
  }
  
  private async waitForWorkflowCompletion(workflow: Workflow): Promise<any> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const allCompleted = workflow.tasks.every(task => {
          const completed = this.completedTasks.get(task.id);
          return completed && (completed.status === 'completed' || completed.status === 'failed');
        });
        
        if (allCompleted) {
          clearInterval(checkInterval);
          
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
          
          resolve({
            workflow: workflow.name,
            results,
            success: results.every(r => r.status === 'completed')
          });
        }
      }, 100);
      
      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({
          workflow: workflow.name,
          error: 'Workflow timeout',
          success: false
        });
      }, 600000);
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