import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { BaseTool } from './base.js';

const execAsync = promisify(exec);

// Base class for CLI tool integrations
abstract class CLIIntegration extends BaseTool {
  protected toolCommand: string;
  protected isInstalled: boolean = false;
  
  constructor(toolCommand: string) {
    super();
    this.toolCommand = toolCommand;
    this.checkInstallation();
  }
  
  protected async checkInstallation(): Promise<boolean> {
    try {
      await execAsync(`which ${this.toolCommand}`);
      this.isInstalled = true;
      return true;
    } catch {
      this.isInstalled = false;
      return false;
    }
  }
  
  protected async ensureInstalled(): Promise<void> {
    // Always do a fresh check
    await this.checkInstallation();

    if (!this.isInstalled) {
      throw new Error(`${this.toolCommand} is not installed. Install it first to use this feature.`);
    }
  }
  
  protected getInstallCommand(): string {
    const platform = os.platform();
    const tool = this.toolCommand;
    
    switch (platform) {
      case 'darwin':
        return `brew install ${tool}`;
      case 'linux':
        return `sudo apt-get install ${tool} || sudo yum install ${tool}`;
      case 'win32':
        return `winget install ${tool} || choco install ${tool}`;
      default:
        return `Please install ${tool} manually`;
    }
  }
}

// 1. FZF - Fuzzy Finder Integration
export class FzfTool extends CLIIntegration {
  name = 'fzf_finder';
  description = 'Interactive fuzzy finder for files, commands, and more';
  parameters = {
    mode: { type: 'string', description: 'Mode: files, history, processes, git, or custom' },
    query: { type: 'string', description: 'Initial search query', optional: true },
    preview: { type: 'boolean', description: 'Show preview window', optional: true },
    multi: { type: 'boolean', description: 'Allow multiple selections', optional: true },
    customCommand: { type: 'string', description: 'Custom command for mode=custom', optional: true }
  };
  
  constructor() {
    super('fzf');
  }
  
  async execute(params: {
    mode?: 'files' | 'history' | 'processes' | 'git' | 'custom';
    query?: string;
    preview?: boolean;
    multi?: boolean;
    customCommand?: string;
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { mode = 'files', query = '', preview = true, multi = false, customCommand } = params;
    
    let command = '';
    
    switch (mode) {
      case 'files':
        // Find files with preview
        command = preview 
          ? `find . -type f | fzf --preview 'cat {}' --preview-window=right:50%`
          : `find . -type f | fzf`;
        break;
        
      case 'history':
        // Search command history
        command = `history | fzf --tac --no-sort`;
        break;
        
      case 'processes':
        // Interactive process selection
        command = `ps aux | fzf --header-lines=1 --preview 'echo {}'`;
        break;
        
      case 'git':
        // Git log browser
        command = `git log --oneline | fzf --preview 'git show {1}'`;
        break;
        
      case 'custom':
        command = customCommand || 'echo "No custom command provided" | fzf';
        break;
    }
    
    if (query) {
      command += ` --query="${query}"`;
    }
    
    if (multi) {
      command += ' --multi';
    }
    
    try {
      const { stdout } = await execAsync(command);
      return {
        selected: stdout.trim().split('\n').filter(Boolean),
        mode,
        success: true
      };
    } catch (error) {
      return {
        error: 'User cancelled or no selection',
        success: false
      };
    }
  }
}

// 2. Bpytop - Resource Monitor
export class BpytopTool extends CLIIntegration {
  name = 'resource_monitor';
  description = 'Interactive resource monitor showing CPU, memory, disk, and network usage';
  parameters = {
    mode: { type: 'string', description: 'Mode: interactive or snapshot', optional: true },
    duration: { type: 'number', description: 'Duration for snapshot mode', optional: true }
  };
  
  constructor() {
    super('bpytop');
  }
  
  async execute(params: {
    mode?: 'interactive' | 'snapshot';
    duration?: number;
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { mode = 'snapshot', duration = 5 } = params;
    
    if (mode === 'interactive') {
      // Launch interactive bpytop
      console.log(chalk.cyan('Launching bpytop... Press q to exit'));
      
      const bpytop = spawn(this.toolCommand, [], {
        stdio: 'inherit',
        shell: true
      });
      
      return new Promise((resolve) => {
        bpytop.on('exit', () => {
          resolve({ message: 'Bpytop session ended', success: true });
        });
      });
    } else {
      // Get system snapshot
      const snapshot = await this.getSystemSnapshot();
      return snapshot;
    }
  }
  
  private async getSystemSnapshot(): Promise<any> {
    const snapshot: any = {};
    
    // CPU info
    try {
      const { stdout: cpuInfo } = await execAsync('top -bn1 | grep "Cpu(s)" | head -1');
      snapshot.cpu = cpuInfo.trim();
    } catch (error) {
      snapshot.cpu = 'Unable to get CPU info';
    }
    
    // Memory info
    try {
      const { stdout: memInfo } = await execAsync('free -h | grep "^Mem"');
      snapshot.memory = memInfo.trim();
    } catch (error) {
      snapshot.memory = 'Unable to get memory info';
    }
    
    // Disk info
    try {
      const { stdout: diskInfo } = await execAsync('df -h | head -5');
      snapshot.disk = diskInfo.trim();
    } catch (error) {
      snapshot.disk = 'Unable to get disk info';
    }
    
    // Top processes
    try {
      const { stdout: processes } = await execAsync('ps aux --sort=-%cpu | head -6');
      snapshot.topProcesses = processes.trim();
    } catch (error) {
      snapshot.topProcesses = 'Unable to get process info';
    }
    
    return {
      snapshot,
      timestamp: new Date().toISOString(),
      success: true
    };
  }
}

// 3. Tmux - Terminal Multiplexer
export class TmuxTool extends CLIIntegration {
  name = 'tmux_manager';
  description = 'Terminal multiplexer for managing multiple sessions';
  parameters = {
    action: { type: 'string', description: 'Action: new, attach, list, kill, send, or split' },
    session: { type: 'string', description: 'Session name', optional: true },
    command: { type: 'string', description: 'Command to run', optional: true },
    direction: { type: 'string', description: 'Split direction: horizontal or vertical', optional: true }
  };
  
  constructor() {
    super('tmux');
  }
  
  async execute(params: {
    action: 'new' | 'attach' | 'list' | 'kill' | 'send' | 'split';
    session?: string;
    command?: string;
    direction?: 'horizontal' | 'vertical';
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { action, session = 'canvas', command, direction = 'horizontal' } = params;
    
    switch (action) {
      case 'new':
        // Create new session
        const newCmd = command 
          ? `tmux new-session -d -s ${session} "${command}"`
          : `tmux new-session -d -s ${session}`;
        
        try {
          await execAsync(newCmd);
          return { message: `Created tmux session: ${session}`, success: true };
        } catch (error: any) {
          if (error.message.includes('duplicate session')) {
            return { message: `Session ${session} already exists`, success: false };
          }
          throw error;
        }
        
      case 'attach':
        // Attach to session
        console.log(chalk.cyan(`Attaching to tmux session: ${session}`));
        const attachProcess = spawn('tmux', ['attach-session', '-t', session], {
          stdio: 'inherit'
        });
        
        return new Promise((resolve) => {
          attachProcess.on('exit', () => {
            resolve({ message: 'Detached from tmux session', success: true });
          });
        });
        
      case 'list':
        // List sessions
        try {
          const { stdout } = await execAsync('tmux list-sessions');
          const sessions = stdout.trim().split('\n').map(line => {
            const [name, rest] = line.split(':');
            return { name, details: rest?.trim() || '' };
          });
          return { sessions, success: true };
        } catch (error: any) {
          // Handle various "no server" error messages
          const errMsg = error.message || error.stderr || '';
          if (errMsg.includes('no server running') || errMsg.includes('error connecting') || errMsg.includes('No such file')) {
            return { sessions: [], message: 'No tmux sessions running', success: true };
          }
          throw error;
        }
        
      case 'kill':
        // Kill session
        try {
          await execAsync(`tmux kill-session -t ${session}`);
          return { message: `Killed tmux session: ${session}`, success: true };
        } catch (error) {
          return { message: `Failed to kill session: ${session}`, success: false };
        }
        
      case 'send':
        // Send command to session
        if (!command) {
          return { message: 'No command provided', success: false };
        }
        
        try {
          await execAsync(`tmux send-keys -t ${session} "${command}" Enter`);
          return { message: `Sent command to ${session}`, success: true };
        } catch (error) {
          return { message: `Failed to send command to ${session}`, success: false };
        }
        
      case 'split':
        // Split pane
        const splitFlag = direction === 'horizontal' ? '-h' : '-v';
        const splitCmd = command 
          ? `tmux split-window ${splitFlag} -t ${session} "${command}"`
          : `tmux split-window ${splitFlag} -t ${session}`;
        
        try {
          await execAsync(splitCmd);
          return { message: `Split pane ${direction}ly in ${session}`, success: true };
        } catch (error) {
          return { message: 'Failed to split pane', success: false };
        }
        
      default:
        return { message: 'Unknown action', success: false };
    }
  }
}

// 4. Lazygit - Git TUI
export class LazygitTool extends CLIIntegration {
  name = 'lazygit_ui';
  description = 'Terminal UI for git operations';
  parameters = {
    path: { type: 'string', description: 'Repository path', optional: true },
    mode: { type: 'string', description: 'Mode: interactive or status', optional: true }
  };
  
  constructor() {
    super('lazygit');
  }
  
  async execute(params: {
    path?: string;
    mode?: 'interactive' | 'status';
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { path = '.', mode = 'interactive' } = params;
    
    // Change to repository directory
    const originalDir = process.cwd();
    if (path !== '.') {
      process.chdir(path);
    }
    
    try {
      if (mode === 'interactive') {
        // Launch interactive lazygit
        console.log(chalk.cyan('Launching lazygit... Press q to exit'));
        
        const lazygit = spawn(this.toolCommand, [], {
          stdio: 'inherit',
          shell: true
        });
        
        return new Promise((resolve) => {
          lazygit.on('exit', () => {
            process.chdir(originalDir);
            resolve({ message: 'Lazygit session ended', success: true });
          });
        });
      } else {
        // Get git status
        const { stdout: status } = await execAsync('git status --short');
        const { stdout: branch } = await execAsync('git branch --show-current');
        const { stdout: remotes } = await execAsync('git remote -v');
        
        process.chdir(originalDir);
        
        return {
          branch: branch.trim(),
          status: status.trim().split('\n').filter(Boolean),
          remotes: remotes.trim().split('\n').filter(Boolean),
          success: true
        };
      }
    } catch (error) {
      process.chdir(originalDir);
      throw error;
    }
  }
}

// 5. GitHub CLI (gh)
export class GitHubCLITool extends CLIIntegration {
  name = 'github_cli';
  description = 'GitHub CLI for managing repos, issues, and PRs';
  parameters = {
    action: { type: 'string', description: 'Action: pr, issue, repo, gist, or workflow' },
    subAction: { type: 'string', description: 'Sub-action like list, create, view', optional: true },
    args: { type: 'array', description: 'Additional arguments', optional: true }
  };
  
  constructor() {
    super('gh');
  }
  
  async execute(params: {
    action: 'pr' | 'issue' | 'repo' | 'gist' | 'workflow';
    subAction?: string;
    args?: string[];
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { action, subAction = 'list', args = [] } = params;
    
    const command = `gh ${action} ${subAction} ${args.join(' ')}`;
    
    try {
      const { stdout } = await execAsync(command);
      
      // Parse output based on action
      switch (action) {
        case 'pr':
          return this.parsePROutput(stdout, subAction);
        case 'issue':
          return this.parseIssueOutput(stdout, subAction);
        case 'repo':
          return this.parseRepoOutput(stdout, subAction);
        case 'workflow':
          return this.parseWorkflowOutput(stdout, subAction);
        default:
          return { output: stdout.trim(), success: true };
      }
    } catch (error: any) {
      return { 
        error: error.message, 
        hint: 'Make sure you are authenticated with: gh auth login',
        success: false 
      };
    }
  }
  
  private parsePROutput(output: string, subAction: string): any {
    if (subAction === 'list') {
      const prs = output.trim().split('\n').map(line => {
        const parts = line.split('\t');
        return {
          number: parts[0],
          title: parts[1],
          branch: parts[2],
          status: parts[3]
        };
      });
      return { prs, success: true };
    }
    return { output: output.trim(), success: true };
  }
  
  private parseIssueOutput(output: string, subAction: string): any {
    if (subAction === 'list') {
      const issues = output.trim().split('\n').map(line => {
        const parts = line.split('\t');
        return {
          number: parts[0],
          title: parts[1],
          labels: parts[2],
          updated: parts[3]
        };
      });
      return { issues, success: true };
    }
    return { output: output.trim(), success: true };
  }
  
  private parseRepoOutput(output: string, subAction: string): any {
    return { output: output.trim(), success: true };
  }
  
  private parseWorkflowOutput(output: string, subAction: string): any {
    if (subAction === 'list') {
      const workflows = output.trim().split('\n').map(line => {
        const parts = line.split('\t');
        return {
          name: parts[0],
          status: parts[1],
          conclusion: parts[2]
        };
      });
      return { workflows, success: true };
    }
    return { output: output.trim(), success: true };
  }
}

// 6. Entr - File Watcher
export class EntrTool extends CLIIntegration {
  name = 'file_watcher';
  description = 'Run commands when files change';
  parameters = {
    action: { type: 'string', description: 'Action: watch, stop, or list' },
    files: { type: 'array', description: 'Files to watch', optional: true },
    pattern: { type: 'string', description: 'File pattern to watch', optional: true },
    command: { type: 'string', description: 'Command to run on change', optional: true },
    id: { type: 'string', description: 'Watcher ID', optional: true }
  };
  
  private watchers: Map<string, any> = new Map();
  
  constructor() {
    super('entr');
  }
  
  async execute(params: {
    action: 'watch' | 'stop' | 'list';
    files?: string[];
    pattern?: string;
    command?: string;
    id?: string;
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { action, files = [], pattern = '*.js', command, id = 'default' } = params;
    
    switch (action) {
      case 'watch':
        if (!command) {
          return { error: 'No command provided to run', success: false };
        }
        
        // Build file list command
        let fileListCmd = '';
        if (files.length > 0) {
          fileListCmd = `echo "${files.join('\n')}"`;
        } else {
          fileListCmd = `find . -name "${pattern}"`;
        }
        
        // Start watching
        const watchCmd = `${fileListCmd} | entr -c ${command}`;
        
        console.log(chalk.cyan(`Watching files matching ${pattern || files.join(', ')}`));
        console.log(chalk.dim(`Running: ${command}`));
        
        const watcher = spawn('sh', ['-c', watchCmd], {
          stdio: 'inherit'
        });
        
        this.watchers.set(id, watcher);
        
        return {
          message: `Started watching with ID: ${id}`,
          id,
          pattern: pattern || files.join(', '),
          command,
          success: true
        };
        
      case 'stop':
        const watcherToStop = this.watchers.get(id);
        if (watcherToStop) {
          watcherToStop.kill();
          this.watchers.delete(id);
          return { message: `Stopped watcher: ${id}`, success: true };
        }
        return { message: `No watcher found with ID: ${id}`, success: false };
        
      case 'list':
        const activeWatchers = Array.from(this.watchers.keys());
        return { 
          watchers: activeWatchers,
          count: activeWatchers.length,
          success: true 
        };
        
      default:
        return { error: 'Unknown action', success: false };
    }
  }
}

// 7. Just - Command Runner
export class JustTool extends CLIIntegration {
  name = 'just_runner';
  description = 'Command runner for project-specific tasks';
  parameters = {
    action: { type: 'string', description: 'Action: run, list, show, or init' },
    recipe: { type: 'string', description: 'Recipe name', optional: true },
    args: { type: 'array', description: 'Recipe arguments', optional: true }
  };
  
  constructor() {
    super('just');
  }
  
  async execute(params: {
    action: 'run' | 'list' | 'show' | 'init';
    recipe?: string;
    args?: string[];
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { action, recipe, args = [] } = params;
    
    switch (action) {
      case 'run':
        if (!recipe) {
          // Run default recipe
          try {
            const { stdout } = await execAsync('just');
            return { output: stdout.trim(), success: true };
          } catch (error: any) {
            return { error: error.message, success: false };
          }
        }
        
        // Run specific recipe
        try {
          const { stdout } = await execAsync(`just ${recipe} ${args.join(' ')}`);
          return { output: stdout.trim(), recipe, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'list':
        // List available recipes
        try {
          const { stdout } = await execAsync('just --list');
          const recipes = stdout.trim().split('\n')
            .filter(line => line.trim() && !line.startsWith('Available'))
            .map(line => {
              const match = line.match(/^\s*(\S+)(?:\s+(.*))?$/);
              if (match) {
                return {
                  name: match[1],
                  description: match[2] || ''
                };
              }
              return null;
            })
            .filter(Boolean);
          
          return { recipes, success: true };
        } catch (error: any) {
          return { error: 'No justfile found', success: false };
        }
        
      case 'show':
        // Show recipe details
        if (!recipe) {
          return { error: 'No recipe specified', success: false };
        }
        
        try {
          const { stdout } = await execAsync(`just --show ${recipe}`);
          return { recipe, content: stdout.trim(), success: true };
        } catch (error: any) {
          return { error: `Recipe '${recipe}' not found`, success: false };
        }
        
      case 'init':
        // Create a basic justfile
        const justfileContent = `# Canvas CLI Justfile
# https://github.com/casey/just

# Default recipe - runs when you type 'just'
default:
  @just --list

# Development tasks
dev:
  npm run dev

build:
  npm run build

test:
  npm test

# Git shortcuts  
commit message:
  git add -A
  git commit -m "{{message}}"

push:
  git push origin main

# Utility tasks
clean:
  rm -rf node_modules dist

install:
  npm install

# Docker tasks
docker-build:
  docker build -t canvas-cli .

docker-run:
  docker run -it canvas-cli
`;
        
        try {
          await fs.writeFile('justfile', justfileContent);
          return { 
            message: 'Created justfile with common recipes',
            path: 'justfile',
            success: true 
          };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      default:
        return { error: 'Unknown action', success: false };
    }
  }
}

// 8. Taskwarrior - Task Management
export class TaskwarriorTool extends CLIIntegration {
  name = 'taskwarrior';
  description = 'Command-line task management';
  parameters = {
    action: { type: 'string', description: 'Action: add, list, done, modify, delete, start, or stop' },
    description: { type: 'string', description: 'Task description', optional: true },
    id: { type: 'number', description: 'Task ID', optional: true },
    filter: { type: 'string', description: 'Filter for list', optional: true },
    tags: { type: 'array', description: 'Task tags', optional: true },
    priority: { type: 'string', description: 'Priority: L, M, or H', optional: true },
    due: { type: 'string', description: 'Due date', optional: true },
    project: { type: 'string', description: 'Project name', optional: true }
  };
  
  constructor() {
    super('task');
  }
  
  async execute(params: {
    action: 'add' | 'list' | 'done' | 'modify' | 'delete' | 'start' | 'stop';
    description?: string;
    id?: number;
    filter?: string;
    tags?: string[];
    priority?: 'L' | 'M' | 'H';
    due?: string;
    project?: string;
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { action, description, id, filter = '', tags = [], priority, due, project } = params;
    
    switch (action) {
      case 'add':
        if (!description) {
          return { error: 'No task description provided', success: false };
        }
        
        let addCmd = `task add "${description}"`;
        if (tags.length > 0) {
          addCmd += ` +${tags.join(' +')}`;
        }
        if (priority) {
          addCmd += ` priority:${priority}`;
        }
        if (due) {
          addCmd += ` due:${due}`;
        }
        if (project) {
          addCmd += ` project:${project}`;
        }
        
        try {
          const { stdout } = await execAsync(addCmd);
          const match = stdout.match(/Created task (\d+)/);
          const taskId = match ? parseInt(match[1]) : null;
          
          return { 
            message: 'Task created',
            id: taskId,
            description,
            success: true 
          };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'list':
        try {
          const { stdout } = await execAsync(`task ${filter} list`);
          
          // Parse task list
          const lines = stdout.trim().split('\n');
          const tasks = [];
          
          // Skip header lines
          let dataStarted = false;
          for (const line of lines) {
            if (line.includes('ID')) {
              dataStarted = true;
              continue;
            }
            if (!dataStarted || line.trim() === '' || line.includes('tasks')) {
              continue;
            }
            
            const parts = line.trim().split(/\s+/);
            if (parts[0] && !isNaN(parseInt(parts[0]))) {
              tasks.push({
                id: parseInt(parts[0]),
                description: parts.slice(1).join(' ')
              });
            }
          }
          
          return { tasks, count: tasks.length, success: true };
        } catch (error: any) {
          return { tasks: [], count: 0, success: true };
        }
        
      case 'done':
        if (!id) {
          return { error: 'No task ID provided', success: false };
        }
        
        try {
          await execAsync(`echo "yes" | task ${id} done`);
          return { message: `Task ${id} marked as done`, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'modify':
        if (!id) {
          return { error: 'No task ID provided', success: false };
        }
        
        let modifyCmd = `task ${id} modify`;
        if (description) {
          modifyCmd += ` "${description}"`;
        }
        if (tags.length > 0) {
          modifyCmd += ` +${tags.join(' +')}`;
        }
        if (priority) {
          modifyCmd += ` priority:${priority}`;
        }
        if (due) {
          modifyCmd += ` due:${due}`;
        }
        
        try {
          await execAsync(modifyCmd);
          return { message: `Task ${id} modified`, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'delete':
        if (!id) {
          return { error: 'No task ID provided', success: false };
        }
        
        try {
          await execAsync(`echo "yes" | task ${id} delete`);
          return { message: `Task ${id} deleted`, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'start':
        if (!id) {
          return { error: 'No task ID provided', success: false };
        }
        
        try {
          await execAsync(`task ${id} start`);
          return { message: `Started task ${id}`, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'stop':
        if (!id) {
          return { error: 'No task ID provided', success: false };
        }
        
        try {
          await execAsync(`task ${id} stop`);
          return { message: `Stopped task ${id}`, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      default:
        return { error: 'Unknown action', success: false };
    }
  }
}

// 9. TLDR - Simplified Man Pages
export class TldrTool extends CLIIntegration {
  name = 'tldr_pages';
  description = 'Simplified man pages with practical examples';
  parameters = {
    command: { type: 'string', description: 'Command to look up' },
    platform: { type: 'string', description: 'Platform: linux, osx, windows', optional: true },
    update: { type: 'boolean', description: 'Update tldr cache', optional: true }
  };
  
  constructor() {
    super('tldr');
  }
  
  async execute(params: {
    command: string;
    platform?: string;
    update?: boolean;
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { command, platform, update = false } = params;
    
    if (update) {
      // Update tldr cache
      try {
        console.log(chalk.cyan('Updating tldr cache...'));
        await execAsync('tldr --update');
        return { message: 'TLDR cache updated', success: true };
      } catch (error: any) {
        return { error: error.message, success: false };
      }
    }
    
    if (!command) {
      return { error: 'No command specified', success: false };
    }
    
    // Get tldr page
    let tldrCmd = `tldr ${command}`;
    if (platform) {
      tldrCmd += ` --platform ${platform}`;
    }
    
    try {
      const { stdout } = await execAsync(tldrCmd);
      
      // Parse the output to extract examples
      const lines = stdout.split('\n');
      const examples = [];
      let currentExample = null;
      
      for (const line of lines) {
        if (line.startsWith('  -')) {
          // Description line
          if (currentExample) {
            examples.push(currentExample);
          }
          currentExample = {
            description: line.substring(4).trim(),
            command: ''
          };
        } else if (line.startsWith('    ') && currentExample) {
          // Command line
          currentExample.command = line.trim();
        }
      }
      
      if (currentExample && currentExample.command) {
        examples.push(currentExample);
      }
      
      return {
        command,
        output: stdout,
        examples,
        success: true
      };
    } catch (error: any) {
      if (error.message.includes('Page not found')) {
        return { 
          error: `No tldr page found for '${command}'`,
          hint: 'Try: tldr --list to see available pages',
          success: false 
        };
      }
      return { error: error.message, success: false };
    }
  }
}

// 10. Pet - Snippet Manager
export class PetTool extends CLIIntegration {
  name = 'snippet_manager';
  description = 'Save and reuse complex command-line snippets';
  parameters = {
    action: { type: 'string', description: 'Action: new, search, list, exec, edit, or sync' },
    description: { type: 'string', description: 'Snippet description', optional: true },
    command: { type: 'string', description: 'Command to save', optional: true },
    tag: { type: 'string', description: 'Snippet tag', optional: true },
    id: { type: 'string', description: 'Snippet ID', optional: true }
  };
  
  constructor() {
    super('pet');
  }
  
  async execute(params: {
    action: 'new' | 'search' | 'list' | 'exec' | 'edit' | 'sync';
    description?: string;
    command?: string;
    tag?: string;
    id?: string;
  }): Promise<any> {
    await this.ensureInstalled();
    
    const { action, description, command, tag, id } = params;
    
    switch (action) {
      case 'new':
        if (!command || !description) {
          return { error: 'Command and description are required', success: false };
        }
        
        // Create new snippet
        const newCmd = tag 
          ? `pet new -t "${tag}" "${command}" "${description}"`
          : `pet new "${command}" "${description}"`;
        
        try {
          await execAsync(newCmd);
          return { 
            message: 'Snippet saved',
            command,
            description,
            tag,
            success: true 
          };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'search':
        // Interactive search
        console.log(chalk.cyan('Searching snippets... Use arrow keys to navigate'));
        
        const searchProcess = spawn('pet', ['search'], {
          stdio: 'inherit'
        });
        
        return new Promise((resolve) => {
          searchProcess.on('exit', (code) => {
            if (code === 0) {
              resolve({ message: 'Search completed', success: true });
            } else {
              resolve({ message: 'Search cancelled', success: false });
            }
          });
        });
        
      case 'list':
        try {
          const { stdout } = await execAsync('pet list');
          
          // Parse snippet list
          const lines = stdout.trim().split('\n');
          const snippets = lines.map(line => {
            const match = line.match(/\[(.+?)\]\s+(.+?)\s+:\s+(.+)/);
            if (match) {
              return {
                id: match[1],
                command: match[2],
                description: match[3]
              };
            }
            return null;
          }).filter(Boolean);
          
          return { snippets, count: snippets.length, success: true };
        } catch (error: any) {
          return { snippets: [], count: 0, success: true };
        }
        
      case 'exec':
        // Execute snippet
        if (!id) {
          // Interactive selection
          console.log(chalk.cyan('Select a snippet to execute...'));
          
          const execProcess = spawn('pet', ['exec'], {
            stdio: 'inherit'
          });
          
          return new Promise((resolve) => {
            execProcess.on('exit', (code) => {
              if (code === 0) {
                resolve({ message: 'Command executed', success: true });
              } else {
                resolve({ message: 'Execution cancelled', success: false });
              }
            });
          });
        }
        
        // Execute specific snippet
        try {
          const { stdout } = await execAsync(`pet exec -i ${id}`);
          return { output: stdout, success: true };
        } catch (error: any) {
          return { error: error.message, success: false };
        }
        
      case 'edit':
        // Edit snippets
        console.log(chalk.cyan('Opening snippet editor...'));
        
        const editProcess = spawn('pet', ['edit'], {
          stdio: 'inherit'
        });
        
        return new Promise((resolve) => {
          editProcess.on('exit', () => {
            resolve({ message: 'Finished editing snippets', success: true });
          });
        });
        
      case 'sync':
        // Sync snippets (requires Gist setup)
        try {
          await execAsync('pet sync');
          return { message: 'Snippets synced', success: true };
        } catch (error: any) {
          return { 
            error: 'Sync failed',
            hint: 'Configure Gist with: pet configure',
            success: false 
          };
        }
        
      default:
        return { error: 'Unknown action', success: false };
    }
  }
}

// Export all tools
export const cliIntegrations = {
  fzf: FzfTool,
  bpytop: BpytopTool,
  tmux: TmuxTool,
  lazygit: LazygitTool,
  gh: GitHubCLITool,
  entr: EntrTool,
  just: JustTool,
  taskwarrior: TaskwarriorTool,
  tldr: TldrTool,
  pet: PetTool
};