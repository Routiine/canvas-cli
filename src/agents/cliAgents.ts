import { EventEmitter } from 'events';
import chalk from 'chalk';
import { cliIntegrations } from '../tools/cliIntegrations.js';
import { getHookSystem } from '../hooks/hookSystem.js';
import { getNotificationSystem } from '../hooks/notificationSystem.js';

// Base Agent class
export abstract class Agent extends EventEmitter {
  public name: string;
  protected description: string;
  protected capabilities: string[];
  protected tool: any;
  protected active: boolean = false;
  protected context: Map<string, any> = new Map();
  
  constructor(name: string, description: string, capabilities: string[]) {
    super();
    this.name = name;
    this.description = description;
    this.capabilities = capabilities;
  }
  
  abstract initialize(): Promise<void>;
  abstract execute(task: any): Promise<any>;
  abstract shutdown(): Promise<void>;
  
  async activate(): Promise<void> {
    if (!this.active) {
      await this.initialize();
      this.active = true;
      this.emit('activated', this.name);
    }
  }
  
  async deactivate(): Promise<void> {
    if (this.active) {
      await this.shutdown();
      this.active = false;
      this.emit('deactivated', this.name);
    }
  }
  
  isActive(): boolean {
    return this.active;
  }
  
  getCapabilities(): string[] {
    return this.capabilities;
  }
  
  setContext(key: string, value: any): void {
    this.context.set(key, value);
  }
  
  getContext(key: string): any {
    return this.context.get(key);
  }
}

// 1. FZF Agent - Smart Search and Selection
export class FzfAgent extends Agent {
  constructor() {
    super(
      'FzfAgent',
      'Intelligent fuzzy search and selection agent',
      ['file_search', 'history_search', 'process_selection', 'git_browsing', 'interactive_selection']
    );
  }
  
  async initialize(): Promise<void> {
    this.tool = new cliIntegrations.fzf();
    console.log(chalk.cyan(`🔍 ${this.name} initialized - Ready for fuzzy searching`));
  }
  
  async execute(task: {
    type: 'search_files' | 'search_history' | 'select_process' | 'browse_git' | 'custom_search';
    query?: string;
    options?: any;
  }): Promise<any> {
    const { type, query, options = {} } = task;
    
    switch (type) {
      case 'search_files':
        return await this.searchFiles(query, options);
      case 'search_history':
        return await this.searchHistory(query);
      case 'select_process':
        return await this.selectProcess(query);
      case 'browse_git':
        return await this.browseGit(query);
      case 'custom_search':
        return await this.customSearch(options);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }
  
  private async searchFiles(query?: string, options: any = {}): Promise<any> {
    console.log(chalk.dim('🔍 Searching files...'));
    return await this.tool.execute({
      mode: 'files',
      query,
      preview: options.preview !== false,
      multi: options.multi || false
    });
  }
  
  private async searchHistory(query?: string): Promise<any> {
    console.log(chalk.dim('📜 Searching command history...'));
    return await this.tool.execute({
      mode: 'history',
      query
    });
  }
  
  private async selectProcess(query?: string): Promise<any> {
    console.log(chalk.dim('🔧 Selecting process...'));
    return await this.tool.execute({
      mode: 'processes',
      query
    });
  }
  
  private async browseGit(query?: string): Promise<any> {
    console.log(chalk.dim('📚 Browsing git history...'));
    return await this.tool.execute({
      mode: 'git',
      query
    });
  }
  
  private async customSearch(options: any): Promise<any> {
    return await this.tool.execute({
      mode: 'custom',
      ...options
    });
  }
  
  async shutdown(): Promise<void> {
    console.log(chalk.dim(`🔍 ${this.name} shutting down`));
  }
}

// 2. Resource Monitor Agent
export class ResourceMonitorAgent extends Agent {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private thresholds = {
    cpu: 80,
    memory: 85,
    disk: 90
  };
  
  constructor() {
    super(
      'ResourceMonitorAgent',
      'System resource monitoring and alerting agent',
      ['monitor_resources', 'alert_thresholds', 'snapshot_system', 'track_processes']
    );
  }
  
  async initialize(): Promise<void> {
    this.tool = new cliIntegrations.bpytop();
    console.log(chalk.green(`📊 ${this.name} initialized - Monitoring system resources`));
  }
  
  async execute(task: {
    type: 'start_monitoring' | 'stop_monitoring' | 'get_snapshot' | 'set_thresholds';
    interval?: number;
    thresholds?: any;
  }): Promise<any> {
    const { type, interval = 30000, thresholds } = task;
    
    switch (type) {
      case 'start_monitoring':
        return await this.startMonitoring(interval);
      case 'stop_monitoring':
        return this.stopMonitoring();
      case 'get_snapshot':
        return await this.getSnapshot();
      case 'set_thresholds':
        return this.setThresholds(thresholds);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }
  
  private async startMonitoring(interval: number): Promise<any> {
    if (this.monitoringInterval) {
      return { message: 'Already monitoring', success: false };
    }
    
    console.log(chalk.green(`📊 Starting resource monitoring (interval: ${interval}ms)`));
    
    this.monitoringInterval = setInterval(async () => {
      const snapshot = await this.tool.execute({ mode: 'snapshot' });
      await this.checkThresholds(snapshot);
    }, interval);
    
    return { message: 'Monitoring started', interval, success: true };
  }
  
  private stopMonitoring(): any {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log(chalk.yellow('📊 Resource monitoring stopped'));
      return { message: 'Monitoring stopped', success: true };
    }
    return { message: 'Not monitoring', success: false };
  }
  
  private async getSnapshot(): Promise<any> {
    return await this.tool.execute({ mode: 'snapshot' });
  }
  
  private setThresholds(thresholds: any): any {
    this.thresholds = { ...this.thresholds, ...thresholds };
    return { thresholds: this.thresholds, success: true };
  }
  
  private async checkThresholds(snapshot: any): Promise<void> {
    const notifications = getNotificationSystem();
    
    // Parse and check CPU
    if (snapshot.snapshot?.cpu) {
      const cpuMatch = snapshot.snapshot.cpu.match(/(\d+\.\d+)%/);
      if (cpuMatch && parseFloat(cpuMatch[1]) > this.thresholds.cpu) {
        await notifications.warning(`High CPU usage: ${cpuMatch[1]}%`);
        this.emit('threshold_exceeded', { type: 'cpu', value: parseFloat(cpuMatch[1]) });
      }
    }
    
    // Check memory
    if (snapshot.snapshot?.memory) {
      const memMatch = snapshot.snapshot.memory.match(/(\d+\.\d+)%/);
      if (memMatch && parseFloat(memMatch[1]) > this.thresholds.memory) {
        await notifications.warning(`High memory usage: ${memMatch[1]}%`);
        this.emit('threshold_exceeded', { type: 'memory', value: parseFloat(memMatch[1]) });
      }
    }
  }
  
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    console.log(chalk.dim(`📊 ${this.name} shutting down`));
  }
}

// 3. Session Manager Agent (Tmux)
export class SessionManagerAgent extends Agent {
  private sessions: Map<string, any> = new Map();
  
  constructor() {
    super(
      'SessionManagerAgent',
      'Terminal session management agent using tmux',
      ['create_session', 'manage_panes', 'orchestrate_workflows', 'session_persistence']
    );
  }
  
  async initialize(): Promise<void> {
    this.tool = new cliIntegrations.tmux();
    await this.loadSessions();
    console.log(chalk.blue(`🖥️ ${this.name} initialized - Managing terminal sessions`));
  }
  
  async execute(task: {
    type: 'create_workspace' | 'run_workflow' | 'manage_session' | 'cleanup';
    config?: any;
  }): Promise<any> {
    const { type, config = {} } = task;
    
    switch (type) {
      case 'create_workspace':
        return await this.createWorkspace(config);
      case 'run_workflow':
        return await this.runWorkflow(config);
      case 'manage_session':
        return await this.manageSession(config);
      case 'cleanup':
        return await this.cleanup();
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }
  
  private async createWorkspace(config: {
    name: string;
    layout?: 'dev' | 'debug' | 'monitor' | 'custom';
    commands?: string[];
  }): Promise<any> {
    const { name, layout = 'dev', commands = [] } = config;
    
    // Create main session
    await this.tool.execute({
      action: 'new',
      session: name
    });
    
    // Apply layout
    switch (layout) {
      case 'dev':
        // Create development layout: editor | terminal | logs
        await this.tool.execute({ action: 'split', session: name, direction: 'vertical' });
        await this.tool.execute({ action: 'split', session: name, direction: 'horizontal' });
        break;
      case 'debug':
        // Create debug layout: code | debugger | console
        await this.tool.execute({ action: 'split', session: name, direction: 'horizontal' });
        await this.tool.execute({ action: 'split', session: name, direction: 'vertical' });
        break;
      case 'monitor':
        // Create monitoring layout: metrics | logs | alerts
        await this.tool.execute({ action: 'split', session: name, direction: 'horizontal' });
        await this.tool.execute({ action: 'split', session: name, direction: 'horizontal' });
        break;
    }
    
    // Run commands in panes
    for (let i = 0; i < commands.length; i++) {
      await this.tool.execute({
        action: 'send',
        session: name,
        command: commands[i]
      });
    }
    
    this.sessions.set(name, { layout, commands, created: new Date() });
    
    return { message: `Workspace ${name} created`, layout, success: true };
  }
  
  private async runWorkflow(config: {
    workflow: string;
    session?: string;
  }): Promise<any> {
    const { workflow, session = 'workflow' } = config;
    
    const workflows: { [key: string]: string[] } = {
      'dev-setup': [
        'npm install',
        'npm run dev',
        'npm run test:watch'
      ],
      'deploy': [
        'npm run build',
        'npm run test',
        'npm run deploy'
      ],
      'debug': [
        'npm run debug',
        'tail -f logs/debug.log',
        'htop'
      ]
    };
    
    const commands = workflows[workflow] || [];
    
    for (const command of commands) {
      await this.tool.execute({
        action: 'send',
        session,
        command
      });
    }
    
    return { workflow, commands, success: true };
  }
  
  private async manageSession(config: any): Promise<any> {
    return await this.tool.execute(config);
  }
  
  private async loadSessions(): Promise<void> {
    const result = await this.tool.execute({ action: 'list' });
    if (result.sessions) {
      for (const session of result.sessions) {
        this.sessions.set(session.name, session);
      }
    }
  }
  
  private async cleanup(): Promise<any> {
    const killed = [];
    for (const [name] of this.sessions) {
      try {
        await this.tool.execute({ action: 'kill', session: name });
        killed.push(name);
      } catch (error) {
        // Session might already be gone
      }
    }
    this.sessions.clear();
    return { killed, success: true };
  }
  
  async shutdown(): Promise<void> {
    console.log(chalk.dim(`🖥️ ${this.name} shutting down`));
  }
}

// 4. Git Workflow Agent
export class GitWorkflowAgent extends Agent {
  constructor() {
    super(
      'GitWorkflowAgent',
      'Git workflow automation and management agent',
      ['interactive_git', 'automated_commits', 'pr_management', 'branch_workflows']
    );
  }
  
  async initialize(): Promise<void> {
    this.tool = new cliIntegrations.lazygit();
    this.ghTool = new cliIntegrations.gh();
    console.log(chalk.magenta(`🔀 ${this.name} initialized - Managing git workflows`));
  }
  
  private ghTool: any;
  
  async execute(task: {
    type: 'interactive' | 'auto_commit' | 'create_pr' | 'review_pr' | 'branch_workflow';
    config?: any;
  }): Promise<any> {
    const { type, config = {} } = task;
    
    switch (type) {
      case 'interactive':
        return await this.launchInteractive();
      case 'auto_commit':
        return await this.autoCommit(config);
      case 'create_pr':
        return await this.createPR(config);
      case 'review_pr':
        return await this.reviewPR(config);
      case 'branch_workflow':
        return await this.branchWorkflow(config);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }
  
  private async launchInteractive(): Promise<any> {
    return await this.tool.execute({ mode: 'interactive' });
  }
  
  private async autoCommit(config: {
    message?: string;
    type?: 'feat' | 'fix' | 'docs' | 'style' | 'refactor' | 'test' | 'chore';
  }): Promise<any> {
    const status = await this.tool.execute({ mode: 'status' });
    
    if (status.status.length === 0) {
      return { message: 'No changes to commit', success: false };
    }
    
    const { type = 'chore', message = 'Auto-commit by GitWorkflowAgent' } = config;
    const commitMessage = `${type}: ${message}\n\nCommitted by Canvas CLI GitWorkflowAgent`;
    
    // This would integrate with git tools
    return { message: commitMessage, files: status.status, success: true };
  }
  
  private async createPR(config: {
    title: string;
    body?: string;
    draft?: boolean;
  }): Promise<any> {
    return await this.ghTool.execute({
      action: 'pr',
      subAction: 'create',
      args: [
        '--title', config.title,
        '--body', config.body || '',
        config.draft ? '--draft' : ''
      ].filter(Boolean)
    });
  }
  
  private async reviewPR(config: { pr: number }): Promise<any> {
    return await this.ghTool.execute({
      action: 'pr',
      subAction: 'review',
      args: [config.pr.toString()]
    });
  }
  
  private async branchWorkflow(config: {
    workflow: 'feature' | 'hotfix' | 'release';
    name: string;
  }): Promise<any> {
    const { workflow, name } = config;
    const branchName = `${workflow}/${name}`;
    
    console.log(chalk.magenta(`Creating ${workflow} branch: ${branchName}`));
    
    // This would integrate with git tools to create and setup branch
    return { branch: branchName, workflow, success: true };
  }
  
  async shutdown(): Promise<void> {
    console.log(chalk.dim(`🔀 ${this.name} shutting down`));
  }
}

// 5. Automation Agent (Entr + Just)
export class AutomationAgent extends Agent {
  private automations: Map<string, any> = new Map();
  
  constructor() {
    super(
      'AutomationAgent',
      'File watching and task automation agent',
      ['file_watching', 'task_automation', 'workflow_orchestration', 'build_automation']
    );
  }
  
  async initialize(): Promise<void> {
    this.entrTool = new cliIntegrations.entr();
    this.justTool = new cliIntegrations.just();
    console.log(chalk.yellow(`⚡ ${this.name} initialized - Ready for automation`));
  }
  
  private entrTool: any;
  private justTool: any;
  
  async execute(task: {
    type: 'watch_files' | 'run_recipe' | 'create_automation' | 'stop_automation';
    config?: any;
  }): Promise<any> {
    const { type, config = {} } = task;
    
    switch (type) {
      case 'watch_files':
        return await this.watchFiles(config);
      case 'run_recipe':
        return await this.runRecipe(config);
      case 'create_automation':
        return await this.createAutomation(config);
      case 'stop_automation':
        return await this.stopAutomation(config.id);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }
  
  private async watchFiles(config: {
    pattern: string;
    command: string;
    id?: string;
  }): Promise<any> {
    const { pattern, command, id = `watch-${Date.now()}` } = config;
    
    const result = await this.entrTool.execute({
      action: 'watch',
      pattern,
      command,
      id
    });
    
    if (result.success) {
      this.automations.set(id, { type: 'watch', pattern, command });
    }
    
    return result;
  }
  
  private async runRecipe(config: {
    recipe: string;
    args?: string[];
  }): Promise<any> {
    return await this.justTool.execute({
      action: 'run',
      recipe: config.recipe,
      args: config.args
    });
  }
  
  private async createAutomation(config: {
    name: string;
    trigger: 'file_change' | 'time' | 'event';
    action: string;
    options?: any;
  }): Promise<any> {
    const { name, trigger, action, options = {} } = config;
    
    const automation = {
      name,
      trigger,
      action,
      options,
      created: new Date(),
      active: true
    };
    
    this.automations.set(name, automation);
    
    // Set up the automation based on trigger type
    if (trigger === 'file_change') {
      await this.watchFiles({
        pattern: options.pattern || '*',
        command: action,
        id: name
      });
    }
    
    return { automation, success: true };
  }
  
  private async stopAutomation(id: string): Promise<any> {
    const automation = this.automations.get(id);
    
    if (!automation) {
      return { message: 'Automation not found', success: false };
    }
    
    if (automation.type === 'watch') {
      await this.entrTool.execute({ action: 'stop', id });
    }
    
    this.automations.delete(id);
    return { message: `Automation ${id} stopped`, success: true };
  }
  
  async shutdown(): Promise<void> {
    // Stop all automations
    for (const [id] of this.automations) {
      await this.stopAutomation(id);
    }
    console.log(chalk.dim(`⚡ ${this.name} shutting down`));
  }
}

// 6. Task Management Agent
export class TaskManagementAgent extends Agent {
  private activeProject: string | null = null;
  
  constructor() {
    super(
      'TaskManagementAgent',
      'Task tracking and management agent',
      ['task_tracking', 'project_management', 'priority_management', 'deadline_tracking']
    );
  }
  
  async initialize(): Promise<void> {
    this.tool = new cliIntegrations.taskwarrior();
    console.log(chalk.green(`✅ ${this.name} initialized - Managing tasks`));
  }
  
  async execute(task: {
    type: 'add_task' | 'complete_task' | 'list_tasks' | 'manage_project';
    config?: any;
  }): Promise<any> {
    const { type, config = {} } = task;
    
    switch (type) {
      case 'add_task':
        return await this.addTask(config);
      case 'complete_task':
        return await this.completeTask(config.id);
      case 'list_tasks':
        return await this.listTasks(config);
      case 'manage_project':
        return await this.manageProject(config);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }
  
  private async addTask(config: {
    description: string;
    priority?: 'L' | 'M' | 'H';
    due?: string;
    tags?: string[];
  }): Promise<any> {
    const project = this.activeProject;
    
    return await this.tool.execute({
      action: 'add',
      description: config.description,
      priority: config.priority,
      due: config.due,
      tags: config.tags,
      project
    });
  }
  
  private async completeTask(id: number): Promise<any> {
    return await this.tool.execute({
      action: 'done',
      id
    });
  }
  
  private async listTasks(config: {
    filter?: string;
    project?: string;
  }): Promise<any> {
    return await this.tool.execute({
      action: 'list',
      filter: config.filter || config.project || ''
    });
  }
  
  private async manageProject(config: {
    action: 'create' | 'switch' | 'close';
    name: string;
  }): Promise<any> {
    const { action, name } = config;
    
    switch (action) {
      case 'create':
      case 'switch':
        this.activeProject = name;
        return { project: name, active: true, success: true };
      case 'close':
        this.activeProject = null;
        return { project: name, active: false, success: true };
      default:
        return { error: 'Unknown project action', success: false };
    }
  }
  
  async shutdown(): Promise<void> {
    console.log(chalk.dim(`✅ ${this.name} shutting down`));
  }
}

// 7. Knowledge Agent (TLDR + Pet)
export class KnowledgeAgent extends Agent {
  private snippets: Map<string, any> = new Map();
  
  constructor() {
    super(
      'KnowledgeAgent',
      'Command knowledge and snippet management agent',
      ['command_help', 'snippet_management', 'knowledge_search', 'learning']
    );
  }
  
  async initialize(): Promise<void> {
    this.tldrTool = new cliIntegrations.tldr();
    this.petTool = new cliIntegrations.pet();
    console.log(chalk.blue(`📚 ${this.name} initialized - Managing knowledge`));
  }
  
  private tldrTool: any;
  private petTool: any;
  
  async execute(task: {
    type: 'get_help' | 'save_snippet' | 'find_snippet' | 'learn_command';
    config?: any;
  }): Promise<any> {
    const { type, config = {} } = task;
    
    switch (type) {
      case 'get_help':
        return await this.getHelp(config.command);
      case 'save_snippet':
        return await this.saveSnippet(config);
      case 'find_snippet':
        return await this.findSnippet(config.query);
      case 'learn_command':
        return await this.learnCommand(config.command);
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
  }
  
  private async getHelp(command: string): Promise<any> {
    return await this.tldrTool.execute({ command });
  }
  
  private async saveSnippet(config: {
    command: string;
    description: string;
    tags?: string;
  }): Promise<any> {
    const result = await this.petTool.execute({
      action: 'new',
      command: config.command,
      description: config.description,
      tag: config.tags
    });
    
    if (result.success) {
      this.snippets.set(config.description, config);
    }
    
    return result;
  }
  
  private async findSnippet(query?: string): Promise<any> {
    if (!query) {
      return await this.petTool.execute({ action: 'search' });
    }
    
    // Search local cache first
    const matches = Array.from(this.snippets.entries())
      .filter(([desc]) => desc.toLowerCase().includes(query.toLowerCase()));
    
    if (matches.length > 0) {
      return { snippets: matches.map(([desc, snippet]) => snippet), success: true };
    }
    
    // Search in pet
    return await this.petTool.execute({ action: 'list' });
  }
  
  private async learnCommand(command: string): Promise<any> {
    // Get help for the command
    const help = await this.getHelp(command);
    
    // Extract and save useful examples as snippets
    if (help.examples && help.examples.length > 0) {
      for (const example of help.examples) {
        await this.saveSnippet({
          command: example.command,
          description: `${command}: ${example.description}`,
          tags: 'learned'
        });
      }
    }
    
    return { command, learned: help.examples?.length || 0, success: true };
  }
  
  async shutdown(): Promise<void> {
    console.log(chalk.dim(`📚 ${this.name} shutting down`));
  }
}

// Export all agents
export const agents = {
  FzfAgent,
  ResourceMonitorAgent,
  SessionManagerAgent,
  GitWorkflowAgent,
  AutomationAgent,
  TaskManagementAgent,
  KnowledgeAgent
};