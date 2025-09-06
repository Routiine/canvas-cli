import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import yaml from 'js-yaml';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 4. Workflow System & 5. Agent Task Lists Combined
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  command?: string;
  agent?: string;
  agentTask?: any;
  parameters?: Map<string, any>;
  dependencies?: string[];
  condition?: string;
  retryCount?: number;
  timeout?: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output?: string;
  error?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  parameters: Map<string, WorkflowParameter>;
  steps: WorkflowStep[];
  variables: Map<string, any>;
  triggers?: WorkflowTrigger[];
  marketplace?: {
    published: boolean;
    downloads: number;
    rating: number;
    reviews: any[];
  };
}

interface WorkflowParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description?: string;
}

interface WorkflowTrigger {
  type: 'schedule' | 'webhook' | 'file-change' | 'event';
  config: any;
}

export interface AgentTaskList {
  id: string;
  workflowId: string;
  tasks: AgentTask[];
  progress: number;
  status: 'pending' | 'active' | 'completed' | 'failed';
  checkpoints: Checkpoint[];
}

interface AgentTask {
  id: string;
  description: string;
  agent: string;
  action: any;
  dependencies: string[];
  priority: number;
  completed: boolean;
  result?: any;
}

interface Checkpoint {
  id: string;
  name: string;
  timestamp: Date;
  state: any;
}

export class WorkflowSystem extends EventEmitter {
  private workflows: Map<string, Workflow> = new Map();
  private runningWorkflows: Map<string, WorkflowExecution> = new Map();
  private taskLists: Map<string, AgentTaskList> = new Map();
  private storageDir: string;
  private marketplaceDir: string;
  
  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'workflows');
    this.marketplaceDir = path.join(this.storageDir, 'marketplace');
    fs.ensureDirSync(this.storageDir);
    fs.ensureDirSync(this.marketplaceDir);
    this.loadWorkflows();
    this.loadMarketplace();
  }
  
  createWorkflow(name: string, description: string = ''): Workflow {
    const workflow: Workflow = {
      id: uuidv4(),
      name,
      description,
      version: '1.0.0',
      author: os.userInfo().username,
      tags: [],
      parameters: new Map(),
      steps: [],
      variables: new Map()
    };
    
    this.workflows.set(workflow.id, workflow);
    this.saveWorkflow(workflow);
    this.emit('workflow-created', workflow);
    
    return workflow;
  }
  
  addStep(
    workflowId: string,
    step: Omit<WorkflowStep, 'id' | 'status'>
  ): WorkflowStep {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    const fullStep: WorkflowStep = {
      ...step,
      id: uuidv4(),
      status: 'pending'
    };
    
    workflow.steps.push(fullStep);
    this.saveWorkflow(workflow);
    this.emit('step-added', { workflow, step: fullStep });
    
    return fullStep;
  }
  
  async executeWorkflow(
    workflowId: string,
    parameters?: Map<string, any>
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    const execution = new WorkflowExecution(workflow, parameters);
    this.runningWorkflows.set(execution.id, execution);
    
    // Create agent task list
    const taskList = this.createTaskList(workflow, execution.id);
    
    console.log(chalk.cyan(`\n🔄 Executing workflow: ${workflow.name}`));
    console.log(chalk.dim(`   Steps: ${workflow.steps.length}`));
    
    execution.on('step-start', (step) => {
      console.log(chalk.yellow(`   ▶️ ${step.name}`));
    });
    
    execution.on('step-complete', (step) => {
      console.log(chalk.green(`   ✅ ${step.name}`));
      this.updateTaskProgress(taskList.id, step.id);
    });
    
    execution.on('step-failed', (step, error) => {
      console.log(chalk.red(`   ❌ ${step.name}: ${error.message}`));
    });
    
    execution.on('complete', () => {
      console.log(chalk.green(`\n✅ Workflow completed successfully`));
      this.runningWorkflows.delete(execution.id);
      taskList.status = 'completed';
    });
    
    execution.on('failed', (error) => {
      console.log(chalk.red(`\n❌ Workflow failed: ${error.message}`));
      this.runningWorkflows.delete(execution.id);
      taskList.status = 'failed';
    });
    
    await execution.start();
    return execution;
  }
  
  private createTaskList(workflow: Workflow, executionId: string): AgentTaskList {
    const tasks: AgentTask[] = workflow.steps.map(step => ({
      id: step.id,
      description: step.description || step.name,
      agent: step.agent || 'default',
      action: step.agentTask || { command: step.command },
      dependencies: step.dependencies || [],
      priority: workflow.steps.indexOf(step),
      completed: false
    }));
    
    const taskList: AgentTaskList = {
      id: uuidv4(),
      workflowId: workflow.id,
      tasks,
      progress: 0,
      status: 'active',
      checkpoints: []
    };
    
    this.taskLists.set(taskList.id, taskList);
    this.emit('task-list-created', taskList);
    
    return taskList;
  }
  
  private updateTaskProgress(taskListId: string, taskId: string): void {
    const taskList = this.taskLists.get(taskListId);
    if (!taskList) return;
    
    const task = taskList.tasks.find(t => t.id === taskId);
    if (task) {
      task.completed = true;
      const completedCount = taskList.tasks.filter(t => t.completed).length;
      taskList.progress = (completedCount / taskList.tasks.length) * 100;
      
      this.emit('task-progress', { taskList, progress: taskList.progress });
    }
  }
  
  createCheckpoint(taskListId: string, name: string, state: any): void {
    const taskList = this.taskLists.get(taskListId);
    if (!taskList) return;
    
    const checkpoint: Checkpoint = {
      id: uuidv4(),
      name,
      timestamp: new Date(),
      state
    };
    
    taskList.checkpoints.push(checkpoint);
    this.emit('checkpoint-created', { taskList, checkpoint });
  }
  
  exportWorkflow(workflowId: string, format: 'yaml' | 'json' = 'yaml'): string {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    const exportData = {
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      author: workflow.author,
      tags: workflow.tags,
      parameters: Array.from(workflow.parameters.entries()),
      steps: workflow.steps.map(step => ({
        name: step.name,
        description: step.description,
        command: step.command,
        agent: step.agent,
        agentTask: step.agentTask,
        parameters: step.parameters ? Array.from(step.parameters.entries()) : undefined,
        dependencies: step.dependencies,
        condition: step.condition,
        retryCount: step.retryCount,
        timeout: step.timeout
      })),
      variables: Array.from(workflow.variables.entries())
    };
    
    if (format === 'yaml') {
      return yaml.dump(exportData);
    } else {
      return JSON.stringify(exportData, null, 2);
    }
  }
  
  importWorkflow(content: string, format: 'yaml' | 'json' = 'yaml'): Workflow {
    const data = format === 'yaml' ? yaml.load(content) : JSON.parse(content);
    
    const workflow = this.createWorkflow(data.name, data.description);
    workflow.version = data.version || '1.0.0';
    workflow.author = data.author || os.userInfo().username;
    workflow.tags = data.tags || [];
    
    if (data.parameters) {
      workflow.parameters = new Map(data.parameters);
    }
    
    if (data.variables) {
      workflow.variables = new Map(data.variables);
    }
    
    for (const stepData of data.steps) {
      this.addStep(workflow.id, {
        name: stepData.name,
        description: stepData.description,
        command: stepData.command,
        agent: stepData.agent,
        agentTask: stepData.agentTask,
        parameters: stepData.parameters ? new Map(stepData.parameters) : undefined,
        dependencies: stepData.dependencies,
        condition: stepData.condition,
        retryCount: stepData.retryCount,
        timeout: stepData.timeout
      });
    }
    
    this.saveWorkflow(workflow);
    return workflow;
  }
  
  publishToMarketplace(workflowId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    workflow.marketplace = {
      published: true,
      downloads: 0,
      rating: 0,
      reviews: []
    };
    
    const marketplacePath = path.join(this.marketplaceDir, `${workflow.id}.yaml`);
    fs.writeFileSync(marketplacePath, this.exportWorkflow(workflowId));
    
    console.log(chalk.green(`📤 Published to marketplace: ${workflow.name}`));
    this.emit('workflow-published', workflow);
  }
  
  async searchMarketplace(query: string): Promise<Workflow[]> {
    const results: Workflow[] = [];
    const files = fs.readdirSync(this.marketplaceDir);
    
    for (const file of files) {
      if (file.endsWith('.yaml')) {
        const content = fs.readFileSync(path.join(this.marketplaceDir, file), 'utf-8');
        const workflow = this.importWorkflow(content);
        
        if (
          workflow.name.toLowerCase().includes(query.toLowerCase()) ||
          workflow.description.toLowerCase().includes(query.toLowerCase()) ||
          workflow.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
        ) {
          results.push(workflow);
        }
      }
    }
    
    return results;
  }
  
  generateAIWorkflow(prompt: string): Workflow {
    // This would integrate with AI to generate workflows
    console.log(chalk.cyan('🤖 Generating workflow from prompt...'));
    
    const workflow = this.createWorkflow(
      `AI Generated: ${prompt.slice(0, 30)}...`,
      `Workflow generated from: ${prompt}`
    );
    
    // Simple example - in production, this would use AI
    const steps = [
      { name: 'Setup', command: 'npm install' },
      { name: 'Build', command: 'npm run build', dependencies: ['Setup'] },
      { name: 'Test', command: 'npm test', dependencies: ['Build'] },
      { name: 'Deploy', command: 'npm run deploy', dependencies: ['Test'] }
    ];
    
    for (const step of steps) {
      this.addStep(workflow.id, step as any);
    }
    
    return workflow;
  }
  
  visualizeWorkflow(workflowId: string): string {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error('Workflow not found');
    
    const lines: string[] = [];
    lines.push(chalk.bold.cyan(`📊 ${workflow.name}`));
    lines.push(chalk.dim(`   ${workflow.description}`));
    lines.push('');
    
    // Create visual task list
    const taskList = this.taskLists.get(
      Array.from(this.taskLists.values()).find(tl => tl.workflowId === workflowId)?.id || ''
    );
    
    if (taskList) {
      const progressBar = this.createProgressBar(taskList.progress);
      lines.push(chalk.cyan(`Progress: ${progressBar} ${taskList.progress.toFixed(0)}%`));
      lines.push('');
    }
    
    // Visualize steps with dependencies
    for (const step of workflow.steps) {
      const statusIcon = this.getStatusIcon(step.status);
      const deps = step.dependencies ? ` [deps: ${step.dependencies.join(', ')}]` : '';
      
      lines.push(`${statusIcon} ${step.name}${deps}`);
      
      if (step.description) {
        lines.push(chalk.dim(`     ${step.description}`));
      }
    }
    
    return lines.join('\n');
  }
  
  private createProgressBar(progress: number): string {
    const width = 20;
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }
  
  private getStatusIcon(status: WorkflowStep['status']): string {
    const icons = {
      pending: chalk.gray('○'),
      running: chalk.yellow('◉'),
      completed: chalk.green('✓'),
      failed: chalk.red('✗'),
      skipped: chalk.dim('⊘')
    };
    
    return icons[status];
  }
  
  private saveWorkflow(workflow: Workflow): void {
    const workflowPath = path.join(this.storageDir, `${workflow.id}.json`);
    fs.writeJsonSync(workflowPath, workflow);
  }
  
  private loadWorkflows(): void {
    try {
      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const workflow = fs.readJsonSync(path.join(this.storageDir, file));
        this.workflows.set(workflow.id, workflow);
      }
    } catch (error) {
      // Silent fail on first run
    }
  }
  
  private loadMarketplace(): void {
    // Load marketplace workflows on startup
    // This would connect to a real marketplace in production
  }
}

// Workflow Execution Engine
class WorkflowExecution extends EventEmitter {
  id: string;
  workflow: Workflow;
  parameters: Map<string, any>;
  variables: Map<string, any>;
  currentStep: number = 0;
  status: 'running' | 'completed' | 'failed' = 'running';
  
  constructor(workflow: Workflow, parameters?: Map<string, any>) {
    super();
    this.id = uuidv4();
    this.workflow = workflow;
    this.parameters = parameters || new Map();
    this.variables = new Map(workflow.variables);
  }
  
  async start(): Promise<void> {
    for (const step of this.workflow.steps) {
      if (this.status === 'failed') break;
      
      // Check dependencies
      if (step.dependencies && !this.areDependenciesMet(step.dependencies)) {
        step.status = 'skipped';
        continue;
      }
      
      // Check condition
      if (step.condition && !this.evaluateCondition(step.condition)) {
        step.status = 'skipped';
        continue;
      }
      
      await this.executeStep(step);
    }
    
    if (this.status === 'running') {
      this.status = 'completed';
      this.emit('complete');
    }
  }
  
  private async executeStep(step: WorkflowStep): Promise<void> {
    step.status = 'running';
    this.emit('step-start', step);
    
    try {
      if (step.command) {
        const command = this.interpolateVariables(step.command);
        const { stdout, stderr } = await execAsync(command);
        step.output = stdout || stderr;
      } else if (step.agent && step.agentTask) {
        // Execute with agent
        // This would integrate with the agent system
        step.output = 'Agent task executed';
      }
      
      step.status = 'completed';
      this.emit('step-complete', step);
    } catch (error: any) {
      step.status = 'failed';
      step.error = error.message;
      
      if (step.retryCount && step.retryCount > 0) {
        console.log(chalk.yellow(`   Retrying ${step.name}...`));
        step.retryCount--;
        await this.executeStep(step);
      } else {
        this.status = 'failed';
        this.emit('step-failed', step, error);
        this.emit('failed', error);
      }
    }
  }
  
  private areDependenciesMet(dependencies: string[]): boolean {
    for (const dep of dependencies) {
      const depStep = this.workflow.steps.find(s => s.name === dep || s.id === dep);
      if (!depStep || depStep.status !== 'completed') {
        return false;
      }
    }
    return true;
  }
  
  private evaluateCondition(condition: string): boolean {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      return eval(condition);
    } catch {
      return false;
    }
  }
  
  private interpolateVariables(text: string): string {
    let result = text;
    
    // Replace ${var} with variable values
    for (const [key, value] of this.variables) {
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }
    
    // Replace ${param.name} with parameter values
    for (const [key, value] of this.parameters) {
      result = result.replace(new RegExp(`\\$\\{param\\.${key}\\}`, 'g'), value);
    }
    
    return result;
  }
}

// Singleton instance
let workflowSystemInstance: WorkflowSystem | null = null;

export function getWorkflowSystem(): WorkflowSystem {
  if (!workflowSystemInstance) {
    workflowSystemInstance = new WorkflowSystem();
  }
  return workflowSystemInstance;
}