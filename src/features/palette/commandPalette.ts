import { EventEmitter } from 'events';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import fuzzy from 'fuzzy';
import readline from 'readline';

// 9. Smart Command Palette
export interface Command {
  id: string;
  name: string;
  description: string;
  category: 'git' | 'npm' | 'file' | 'system' | 'custom' | 'ai' | 'workflow';
  command: string | ((args: any) => Promise<string>);
  aliases: string[];
  shortcut?: string;
  icon: string;
  usage: number;
  lastUsed?: Date;
  parameters?: CommandParameter[];
  aiGenerated?: boolean;
}

export interface CommandParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'directory';
  description: string;
  required: boolean;
  default?: any;
  suggestions?: string[] | (() => Promise<string[]>);
}

export interface CommandHistory {
  commandId: string;
  executedAt: Date;
  parameters?: any;
  result?: string;
  duration?: number;
}

export class CommandPalette extends EventEmitter {
  private commands: Map<string, Command> = new Map();
  private history: CommandHistory[] = [];
  private favorites: Set<string> = new Set();
  private recentCommands: string[] = [];
  private storageDir: string;
  private isOpen: boolean = false;
  private searchQuery: string = '';
  private selectedIndex: number = 0;
  private rl: readline.Interface | null = null;
  
  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'palette');
    fs.ensureDirSync(this.storageDir);
    this.loadBuiltInCommands();
    this.loadCustomCommands();
    this.loadHistory();
  }
  
  private loadBuiltInCommands(): void {
    const builtInCommands: Command[] = [
      // Git Commands
      {
        id: 'git-status',
        name: 'Git Status',
        description: 'Show working tree status',
        category: 'git',
        command: 'git status',
        aliases: ['gs', 'status'],
        shortcut: 'Ctrl+G S',
        icon: '📦',
        usage: 0
      },
      {
        id: 'git-commit',
        name: 'Git Commit',
        description: 'Commit changes with message',
        category: 'git',
        command: async (args: any) => `git commit -m "${args.message}"`,
        aliases: ['gc', 'commit'],
        shortcut: 'Ctrl+G C',
        icon: '✅',
        usage: 0,
        parameters: [{
          name: 'message',
          type: 'string',
          description: 'Commit message',
          required: true
        }]
      },
      {
        id: 'git-push',
        name: 'Git Push',
        description: 'Push commits to remote',
        category: 'git',
        command: 'git push',
        aliases: ['gp', 'push'],
        shortcut: 'Ctrl+G P',
        icon: '🚀',
        usage: 0
      },
      {
        id: 'git-pull',
        name: 'Git Pull',
        description: 'Pull from remote',
        category: 'git',
        command: 'git pull',
        aliases: ['gl', 'pull'],
        icon: '⬇️',
        usage: 0
      },
      {
        id: 'git-branch',
        name: 'Git Branch',
        description: 'List or create branches',
        category: 'git',
        command: async (args: any) => args.name ? `git checkout -b ${args.name}` : 'git branch',
        aliases: ['gb', 'branch'],
        icon: '🌳',
        usage: 0,
        parameters: [{
          name: 'name',
          type: 'string',
          description: 'Branch name (optional)',
          required: false
        }]
      },
      
      // NPM Commands
      {
        id: 'npm-install',
        name: 'NPM Install',
        description: 'Install dependencies',
        category: 'npm',
        command: async (args: any) => args.package ? `npm install ${args.package}` : 'npm install',
        aliases: ['ni', 'install'],
        shortcut: 'Ctrl+N I',
        icon: '📦',
        usage: 0,
        parameters: [{
          name: 'package',
          type: 'string',
          description: 'Package name (optional)',
          required: false
        }]
      },
      {
        id: 'npm-run',
        name: 'NPM Run Script',
        description: 'Run package.json script',
        category: 'npm',
        command: async (args: any) => `npm run ${args.script}`,
        aliases: ['nr', 'run'],
        shortcut: 'Ctrl+N R',
        icon: '▶️',
        usage: 0,
        parameters: [{
          name: 'script',
          type: 'string',
          description: 'Script name',
          required: true,
          suggestions: async () => {
            try {
              const pkg = await fs.readJson('package.json');
              return Object.keys(pkg.scripts || {});
            } catch {
              return ['dev', 'build', 'test', 'start'];
            }
          }
        }]
      },
      
      // File Commands
      {
        id: 'create-file',
        name: 'Create File',
        description: 'Create a new file',
        category: 'file',
        command: async (args: any) => `touch ${args.path}`,
        aliases: ['cf', 'touch'],
        icon: '📄',
        usage: 0,
        parameters: [{
          name: 'path',
          type: 'file',
          description: 'File path',
          required: true
        }]
      },
      {
        id: 'create-directory',
        name: 'Create Directory',
        description: 'Create a new directory',
        category: 'file',
        command: async (args: any) => `mkdir -p ${args.path}`,
        aliases: ['md', 'mkdir'],
        icon: '📁',
        usage: 0,
        parameters: [{
          name: 'path',
          type: 'directory',
          description: 'Directory path',
          required: true
        }]
      },
      {
        id: 'search-files',
        name: 'Search Files',
        description: 'Search for files by pattern',
        category: 'file',
        command: async (args: any) => `find . -name "*${args.pattern}*"`,
        aliases: ['find', 'search'],
        shortcut: 'Ctrl+P',
        icon: '🔍',
        usage: 0,
        parameters: [{
          name: 'pattern',
          type: 'string',
          description: 'Search pattern',
          required: true
        }]
      },
      
      // System Commands
      {
        id: 'clear-terminal',
        name: 'Clear Terminal',
        description: 'Clear terminal screen',
        category: 'system',
        command: 'clear',
        aliases: ['cls', 'clear'],
        shortcut: 'Ctrl+L',
        icon: '🧹',
        usage: 0
      },
      {
        id: 'system-info',
        name: 'System Info',
        description: 'Show system information',
        category: 'system',
        command: process.platform === 'darwin' ? 'system_profiler SPSoftwareDataType' : 'uname -a',
        aliases: ['si', 'sysinfo'],
        icon: '💻',
        usage: 0
      },
      
      // Workflow Commands
      {
        id: 'run-workflow',
        name: 'Run Workflow',
        description: 'Execute a saved workflow',
        category: 'workflow',
        command: async (args: any) => `canvas workflow run ${args.name}`,
        aliases: ['wf', 'workflow'],
        icon: '🔄',
        usage: 0,
        parameters: [{
          name: 'name',
          type: 'string',
          description: 'Workflow name',
          required: true
        }]
      }
    ];
    
    for (const cmd of builtInCommands) {
      this.commands.set(cmd.id, cmd);
    }
  }
  
  async open(): Promise<void> {
    if (this.isOpen) return;
    
    this.isOpen = true;
    this.searchQuery = '';
    this.selectedIndex = 0;
    
    console.clear();
    this.render();
    
    // Setup input handling
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    process.stdin.on('data', this.handleInput.bind(this));
    
    this.emit('opened');
  }
  
  close(): void {
    if (!this.isOpen) return;
    
    this.isOpen = false;
    
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    
    console.clear();
    this.emit('closed');
  }
  
  private handleInput(key: string): void {
    if (!this.isOpen) return;
    
    // Handle special keys
    if (key === '\u001b') { // ESC
      this.close();
      return;
    }
    
    if (key === '\r' || key === '\n') { // Enter
      this.executeSelected();
      return;
    }
    
    if (key === '\u001b[A') { // Up arrow
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.render();
      return;
    }
    
    if (key === '\u001b[B') { // Down arrow
      const filtered = this.getFilteredCommands();
      this.selectedIndex = Math.min(filtered.length - 1, this.selectedIndex + 1);
      this.render();
      return;
    }
    
    if (key === '\u007f' || key === '\b') { // Backspace
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.selectedIndex = 0;
      this.render();
      return;
    }
    
    if (key === '\u0003') { // Ctrl+C
      this.close();
      process.exit(0);
      return;
    }
    
    // Regular character
    if (key.match(/^[\x20-\x7e]$/)) {
      this.searchQuery += key;
      this.selectedIndex = 0;
      this.render();
    }
  }
  
  private render(): void {
    console.clear();
    
    const width = process.stdout.columns || 80;
    const filtered = this.getFilteredCommands();
    
    // Header
    console.log(chalk.cyan('⌘ Command Palette'));
    console.log(chalk.dim('─'.repeat(width)));
    
    // Search box
    console.log(chalk.yellow('🔍 ') + chalk.white(this.searchQuery || 'Type to search...'));
    console.log(chalk.dim('─'.repeat(width)));
    
    // Commands list
    const maxDisplay = 10;
    const start = Math.max(0, this.selectedIndex - maxDisplay + 1);
    const end = Math.min(filtered.length, start + maxDisplay);
    
    for (let i = start; i < end; i++) {
      const cmd = filtered[i];
      const isSelected = i === this.selectedIndex;
      
      const prefix = isSelected ? chalk.cyan('▶ ') : '  ';
      const name = isSelected ? chalk.cyan.bold(cmd.name) : chalk.white(cmd.name);
      const desc = chalk.dim(` - ${cmd.description}`);
      const shortcut = cmd.shortcut ? chalk.dim(` [${cmd.shortcut}]`) : '';
      const usage = cmd.usage > 0 ? chalk.dim(` (${cmd.usage})`) : '';
      
      console.log(`${prefix}${cmd.icon} ${name}${desc}${shortcut}${usage}`);
    }
    
    // Footer
    console.log(chalk.dim('─'.repeat(width)));
    console.log(chalk.dim('ESC: Close | Enter: Execute | ↑↓: Navigate'));
    
    // Show recent/favorites if no search
    if (!this.searchQuery && this.recentCommands.length > 0) {
      console.log(chalk.dim('\nRecent:'));
      const recent = this.recentCommands.slice(0, 3).map(id => {
        const cmd = this.commands.get(id);
        return cmd ? `${cmd.icon} ${cmd.name}` : null;
      }).filter(Boolean);
      console.log(chalk.dim(recent.join(' | ')));
    }
  }
  
  private getFilteredCommands(): Command[] {
    const all = Array.from(this.commands.values());
    
    if (!this.searchQuery) {
      // Sort by usage and recency
      return all.sort((a, b) => {
        if (this.favorites.has(a.id) && !this.favorites.has(b.id)) return -1;
        if (!this.favorites.has(a.id) && this.favorites.has(b.id)) return 1;
        return b.usage - a.usage;
      });
    }
    
    // Fuzzy search
    const results = fuzzy.filter(this.searchQuery, all, {
      extract: (cmd) => `${cmd.name} ${cmd.aliases.join(' ')} ${cmd.description}`
    });
    
    return results.map(r => r.original);
  }
  
  private async executeSelected(): Promise<void> {
    const filtered = this.getFilteredCommands();
    const selected = filtered[this.selectedIndex];
    
    if (!selected) {
      this.close();
      return;
    }
    
    this.close();
    
    // Get parameters if needed
    const params: any = {};
    if (selected.parameters && selected.parameters.length > 0) {
      for (const param of selected.parameters) {
        params[param.name] = await this.promptParameter(param);
        if (param.required && !params[param.name]) {
          console.log(chalk.yellow('⚠️ Command cancelled'));
          return;
        }
      }
    }
    
    // Execute command
    await this.executeCommand(selected.id, params);
  }
  
  private async promptParameter(param: CommandParameter): Promise<any> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      const prompt = `${param.description}${param.required ? ' (required)' : ' (optional)'}: `;
      
      rl.question(chalk.cyan(prompt), async (answer) => {
        rl.close();
        
        if (!answer && param.default !== undefined) {
          resolve(param.default);
        } else if (!answer && !param.required) {
          resolve(null);
        } else {
          // Type conversion
          switch (param.type) {
            case 'number':
              resolve(parseFloat(answer));
              break;
            case 'boolean':
              resolve(answer.toLowerCase() === 'true' || answer === '1' || answer === 'yes');
              break;
            default:
              resolve(answer);
          }
        }
      });
      
      // Show suggestions if available
      if (param.suggestions) {
        (async () => {
          const suggestions = typeof param.suggestions === 'function'
            ? await param.suggestions()
            : param.suggestions;

          if (suggestions && suggestions.length > 0) {
            console.log(chalk.dim('Suggestions: ' + suggestions.join(', ')));
          }
        })();
      }
    });
  }
  
  async executeCommand(commandId: string, parameters?: any): Promise<any> {
    const command = this.commands.get(commandId);
    if (!command) throw new Error(`Command not found: ${commandId}`);
    
    console.log(chalk.cyan(`▶️ Executing: ${command.name}`));
    
    const startTime = Date.now();
    
    try {
      // Build command string
      let cmdString: string;
      if (typeof command.command === 'function') {
        cmdString = await command.command(parameters || {});
      } else {
        cmdString = command.command;
      }
      
      // Execute
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout, stderr } = await execAsync(cmdString);
      const result = stdout || stderr;
      
      // Update statistics
      command.usage++;
      command.lastUsed = new Date();
      
      // Add to history
      this.history.push({
        commandId,
        executedAt: new Date(),
        parameters,
        result,
        duration: Date.now() - startTime
      });
      
      // Update recent commands
      this.recentCommands = [commandId, ...this.recentCommands.filter(id => id !== commandId)].slice(0, 10);
      
      // Save state
      await this.saveHistory();
      
      console.log(chalk.green('✅ Command completed'));
      if (result) {
        console.log(chalk.dim(result));
      }
      
      this.emit('command-executed', { command, parameters, result });
      
      return result;
    } catch (error: any) {
      console.log(chalk.red(`❌ Error: ${error.message}`));
      throw error;
    }
  }
  
  registerCommand(command: Omit<Command, 'id' | 'usage'>): void {
    const id = command.name.toLowerCase().replace(/\s+/g, '-');
    const newCommand: Command = {
      ...command,
      id,
      usage: 0
    };
    
    this.commands.set(id, newCommand);
    this.saveCustomCommands();
    
    console.log(chalk.green(`✅ Registered command: ${command.name}`));
  }
  
  toggleFavorite(commandId: string): void {
    if (this.favorites.has(commandId)) {
      this.favorites.delete(commandId);
    } else {
      this.favorites.add(commandId);
    }
    
    this.saveFavorites();
  }
  
  private async loadCustomCommands(): Promise<void> {
    const customPath = path.join(this.storageDir, 'custom-commands.json');
    if (await fs.pathExists(customPath)) {
      const custom = await fs.readJson(customPath);
      for (const cmd of custom) {
        this.commands.set(cmd.id, cmd);
      }
    }
  }
  
  private async saveCustomCommands(): Promise<void> {
    const custom = Array.from(this.commands.values()).filter(cmd => cmd.category === 'custom');
    const customPath = path.join(this.storageDir, 'custom-commands.json');
    await fs.writeJson(customPath, custom, { spaces: 2 });
  }
  
  private async loadHistory(): Promise<void> {
    const historyPath = path.join(this.storageDir, 'history.json');
    if (await fs.pathExists(historyPath)) {
      this.history = await fs.readJson(historyPath);
      
      // Extract recent commands
      this.recentCommands = this.history
        .slice(-20)
        .map(h => h.commandId)
        .filter((id, index, self) => self.indexOf(id) === index)
        .slice(0, 10);
    }
  }
  
  private async saveHistory(): Promise<void> {
    const historyPath = path.join(this.storageDir, 'history.json');
    await fs.writeJson(historyPath, this.history.slice(-1000), { spaces: 2 });
  }
  
  private async saveFavorites(): Promise<void> {
    const favPath = path.join(this.storageDir, 'favorites.json');
    await fs.writeJson(favPath, Array.from(this.favorites), { spaces: 2 });
  }
}

// Singleton instance
let paletteInstance: CommandPalette | null = null;

export function getCommandPalette(): CommandPalette {
  if (!paletteInstance) {
    paletteInstance = new CommandPalette();
  }
  return paletteInstance;
}