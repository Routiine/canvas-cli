import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'cross-spawn';
import { ThemeManager } from './themes.js';
import { CheckpointManager } from './checkpoint.js';
import { ToolRegistry } from './tools/registry.js';
import { ContextLoader } from './tools/memory.js';
import { Message, TokenUsage } from './types.js';
import { loadConfig, saveConfig } from './config.js';
import { WorkflowEngine } from './tools/workflows.js';
import { intentDetector } from './tools/intentDetector.js';
import { interactiveMode } from './interactiveMode.js';
import { OrchestratorCommand } from './commands/orchestratorCommand.js';

export class CommandHandler {
  private themeManager: ThemeManager;
  private checkpointManager: CheckpointManager;
  private toolRegistry: ToolRegistry;
  private contextLoader: ContextLoader;
  private workflowEngine: WorkflowEngine;
  private messages: Message[] = [];
  private tokenUsage: TokenUsage = { input: 0, output: 0, total: 0 };
  private sessionStartTime: Date = new Date();
  private customCommands: Map<string, string> = new Map();
  private vimMode: boolean = false;
  private vscodeContext: any = null;
  private orchestrator: OrchestratorCommand;

  constructor() {
    const config = loadConfig();
    this.themeManager = new ThemeManager(config.theme);
    this.checkpointManager = new CheckpointManager();
    this.toolRegistry = new ToolRegistry();
    this.contextLoader = new ContextLoader();
    this.workflowEngine = new WorkflowEngine(this.toolRegistry);
    this.orchestrator = new OrchestratorCommand();
    this.vimMode = config.vimMode || false;
    this.loadCustomCommands();
  }

  private async loadCustomCommands(): Promise<void> {
    // Load global commands
    const globalCommandsPath = path.join(os.homedir(), '.canvas-cli', 'commands');
    if (await fs.pathExists(globalCommandsPath)) {
      const files = await fs.readdir(globalCommandsPath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const name = path.basename(file, '.md');
          const content = await fs.readFile(path.join(globalCommandsPath, file), 'utf-8');
          this.customCommands.set(name, content);
        }
      }
    }

    // Load project commands
    const projectCommandsPath = path.join(process.cwd(), '.canvas', 'commands');
    if (await fs.pathExists(projectCommandsPath)) {
      const files = await fs.readdir(projectCommandsPath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const name = path.basename(file, '.md');
          const content = await fs.readFile(path.join(projectCommandsPath, file), 'utf-8');
          this.customCommands.set(name, content);
        }
      }
    }
  }

  async handleCommand(input: string): Promise<string | null> {
    const parts = input.split(' ');
    const command = parts[0].slice(1); // Remove the leading /
    const args = parts.slice(1).join(' ');

    switch (command) {
      case 'help':
      case '?':
        return this.showHelp();

      case 'theme':
        return await this.changeTheme();

      case 'tools':
        return this.listTools(args);

      case 'chat':
        return await this.handleChatCommand(args);

      case 'checkpoint':
      case 'cp':
        return await this.handleCheckpointCommand(args);

      case 'stats':
        return this.showStats();

      case 'memory':
        return await this.handleMemoryCommand(args);

      case 'clear':
        console.clear();
        return 'Screen cleared';

      case 'vim':
        return this.toggleVimMode();

      case 'settings':
        return await this.openSettings();

      case 'restore':
        return await this.restoreFile(args);

      case 'init':
        return await this.initProject();

      case 'compress':
        return await this.compressContext();

      case 'copy':
        return await this.copyLastOutput();

      case 'directory':
      case 'dir':
        return await this.handleDirectoryCommand(args);

      case 'workflow':
      case 'wf':
        return await this.handleWorkflowCommand(args);

      case 'auto':
        return this.toggleAutoExecute();

      case 'confirm':
        return this.toggleConfirmations();

      case 'history':
        return await this.showHistory();

      case 'undo':
        return await this.undoLastAction();

      case 'intent':
        return await this.detectIntent(args);

      case 'orchestrator':
      case 'orch':
        return await this.orchestrator.execute(args ? args.split(' ').filter(Boolean) : []);

      case 'quit':
      case 'exit':
        process.exit(0);

      default:
        // Check for custom commands
        if (this.customCommands.has(command)) {
          return this.customCommands.get(command) || null;
        }
        return this.themeManager.warning(`Unknown command: /${command}`);
    }
  }

  private showHelp(): string {
    const commands = [
      { cmd: '/help, /?', desc: 'Show this help message' },
      { cmd: '/theme', desc: 'Change the visual theme' },
      { cmd: '/tools [desc]', desc: 'List available tools' },
      { cmd: '/chat save <tag>', desc: 'Save conversation checkpoint' },
      { cmd: '/chat resume <tag>', desc: 'Resume from checkpoint' },
      { cmd: '/chat list', desc: 'List checkpoints' },
      { cmd: '/stats', desc: 'Show session statistics' },
      { cmd: '/memory add <text>', desc: 'Add to memory' },
      { cmd: '/memory show', desc: 'Show memory context' },
      { cmd: '/clear', desc: 'Clear screen (Ctrl+L)' },
      { cmd: '/vim', desc: 'Toggle vim mode' },
      { cmd: '/settings', desc: 'Open settings editor' },
      { cmd: '/restore [id]', desc: 'Restore file backup' },
      { cmd: '/init', desc: 'Initialize project with CANVAS.md' },
      { cmd: '/compress', desc: 'Compress context to summary' },
      { cmd: '/copy', desc: 'Copy last output to clipboard' },
      { cmd: '/directory add <path>', desc: 'Add directory to workspace' },
      { cmd: '/quit, /exit', desc: 'Exit Canvas CLI' }
    ];

    let help = this.themeManager.primary('Canvas CLI Commands:\n\n');
    for (const { cmd, desc } of commands) {
      help += `  ${this.themeManager.secondary(cmd.padEnd(20))} ${this.themeManager.dim(desc)}\n`;
    }

    // Add custom commands
    if (this.customCommands.size > 0) {
      help += '\n' + this.themeManager.primary('Custom Commands:\n');
      for (const name of this.customCommands.keys()) {
        help += `  ${this.themeManager.secondary('/' + name)}\n`;
      }
    }

    return help;
  }

  private async changeTheme(): Promise<string> {
    const themes = this.themeManager.listThemes();
    const { theme } = await inquirer.prompt({
      type: 'list',
      name: 'theme',
      message: 'Select a theme:',
      choices: themes
    });

    this.themeManager.setTheme(theme);
    const config = loadConfig();
    config.theme = theme;
    saveConfig(config);

    return this.themeManager.success(`Theme changed to: ${theme}`);
  }

  private listTools(args: string): string {
    const showDesc = args.includes('desc');
    const tools = this.toolRegistry.listEnabled();
    
    let output = this.themeManager.primary('Available Tools:\n\n');
    for (const tool of tools) {
      output += `  ${this.themeManager.secondary(tool.name)}`;
      if (showDesc) {
        output += `\n    ${this.themeManager.dim(tool.description)}`;
      }
      output += '\n';
    }
    
    return output;
  }

  private async handleChatCommand(args: string): Promise<string> {
    const [subCommand, ...rest] = args.split(' ');
    const tag = rest.join(' ');

    switch (subCommand) {
      case 'save':
        if (!tag) return this.themeManager.error('Please provide a tag name');
        await this.checkpointManager.saveCheckpoint(this.messages, tag);
        return this.themeManager.success(`Conversation saved as: ${tag}`);

      case 'resume':
        if (!tag) return this.themeManager.error('Please provide a tag name');
        const checkpoint = await this.checkpointManager.loadCheckpoint(tag);
        if (checkpoint) {
          this.messages = checkpoint.messages;
          return this.themeManager.success(`Resumed conversation: ${tag}`);
        }
        return this.themeManager.error(`Checkpoint not found: ${tag}`);

      case 'list':
        const checkpoints = await this.checkpointManager.listCheckpoints();
        if (checkpoints.length === 0) {
          return this.themeManager.dim('No saved checkpoints');
        }
        let output = this.themeManager.primary('Saved Checkpoints:\n');
        for (const cp of checkpoints) {
          output += `  ${this.themeManager.secondary(cp.id)} - ${this.themeManager.dim(cp.timestamp.toString())}\n`;
        }
        return output;

      case 'delete':
        if (!tag) return this.themeManager.error('Please provide a tag name');
        const deleted = await this.checkpointManager.deleteCheckpoint(tag);
        return deleted 
          ? this.themeManager.success(`Deleted checkpoint: ${tag}`)
          : this.themeManager.error(`Checkpoint not found: ${tag}`);

      default:
        return this.themeManager.error('Usage: /chat [save|resume|list|delete] <tag>');
    }
  }

  private async handleCheckpointCommand(args: string): Promise<string> {
    return this.handleChatCommand(args);
  }

  private showStats(): string {
    const duration = Math.round((Date.now() - this.sessionStartTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    return this.themeManager.primary('Session Statistics:\n') +
      this.themeManager.formatStats('  Duration', `${minutes}m ${seconds}s`) + '\n' +
      this.themeManager.formatStats('  Messages', this.messages.length) + '\n' +
      this.themeManager.formatStats('  Input tokens', this.tokenUsage.input) + '\n' +
      this.themeManager.formatStats('  Output tokens', this.tokenUsage.output) + '\n' +
      this.themeManager.formatStats('  Total tokens', this.tokenUsage.total) + '\n' +
      (this.tokenUsage.cached ? this.themeManager.formatStats('  Cached tokens', this.tokenUsage.cached) + '\n' : '');
  }

  private async handleMemoryCommand(args: string): Promise<string> {
    const [subCommand, ...rest] = args.split(' ');
    const content = rest.join(' ');

    switch (subCommand) {
      case 'add':
        if (!content) return this.themeManager.error('Please provide content to remember');
        await this.toolRegistry.execute('save_memory', {
          key: `memory-${Date.now()}`,
          value: content,
          scope: 'session'
        });
        return this.themeManager.success('Added to memory');

      case 'show':
        const context = await this.contextLoader.loadContext();
        let output = this.themeManager.primary('Memory Context:\n');
        if (context.global.length > 0) {
          output += this.themeManager.secondary('\nGlobal:\n') + context.global.join('\n');
        }
        if (context.project.length > 0) {
          output += this.themeManager.secondary('\nProject:\n') + context.project.join('\n');
        }
        return output || this.themeManager.dim('No memory context loaded');

      case 'refresh':
        // Reload context
        await this.contextLoader.loadContext();
        return this.themeManager.success('Memory context refreshed');

      default:
        return this.themeManager.error('Usage: /memory [add|show|refresh]');
    }
  }

  private toggleVimMode(): string {
    this.vimMode = !this.vimMode;
    const config = loadConfig();
    config.vimMode = this.vimMode;
    saveConfig(config);
    
    return this.themeManager.success(`Vim mode ${this.vimMode ? 'enabled' : 'disabled'}`);
  }

  private async openSettings(): Promise<string> {
    const settingsPath = path.join(os.homedir(), '.canvas-cli', 'settings.json');
    await fs.ensureDir(path.dirname(settingsPath));
    
    if (!await fs.pathExists(settingsPath)) {
      await fs.writeJSON(settingsPath, loadConfig(), { spaces: 2 });
    }
    
    // Open in default editor
    const editor = process.env.EDITOR || 'notepad';
    spawn(editor, [settingsPath], { stdio: 'inherit' });
    
    return this.themeManager.info('Opening settings in editor...');
  }

  private async restoreFile(args: string): Promise<string> {
    if (!args) {
      const backups = await this.checkpointManager.listFileBackups();
      if (backups.length === 0) {
        return this.themeManager.dim('No file backups available');
      }
      let output = this.themeManager.primary('Available Backups:\n');
      for (const backup of backups) {
        output += `  ${this.themeManager.secondary(backup.toolCallId)} - ${backup.originalPath} (${backup.timestamp})\n`;
      }
      return output;
    }
    
    await this.checkpointManager.restoreFileBackup(args);
    return this.themeManager.success('File restored');
  }

  private async initProject(): Promise<string> {
    const canvasPath = path.join(process.cwd(), 'CANVAS.md');
    
    if (await fs.pathExists(canvasPath)) {
      return this.themeManager.warning('CANVAS.md already exists');
    }
    
    const template = `# Canvas CLI Configuration

This file provides context and instructions for the Canvas AI assistant in this project.

## Project Overview
[Describe your project here]

## Instructions
[Add specific instructions for the AI]

## Context
[Add any relevant context or background information]

## Preferences
- Code style: [Your preferred code style]
- Testing: [Testing preferences]
- Documentation: [Documentation preferences]
`;
    
    await fs.writeFile(canvasPath, template);
    return this.themeManager.success('Created CANVAS.md');
  }

  private async compressContext(): Promise<string> {
    // This would integrate with the AI model to summarize the conversation
    // For now, just clear old messages but keep recent ones
    const recentMessages = this.messages.slice(-10);
    this.messages = recentMessages;
    return this.themeManager.success('Context compressed to last 10 messages');
  }

  private async copyLastOutput(): Promise<string> {
    if (this.messages.length === 0) {
      return this.themeManager.warning('No output to copy');
    }
    
    const lastAssistantMessage = [...this.messages]
      .reverse()
      .find(m => m.role === 'assistant');
    
    if (!lastAssistantMessage) {
      return this.themeManager.warning('No assistant output to copy');
    }
    
    // Copy to clipboard (platform-specific)
    const { spawn } = await import('cross-spawn');
    const platform = process.platform;
    
    try {
      if (platform === 'darwin') {
        const proc = spawn('pbcopy', [], { stdio: 'pipe' });
        proc.stdin?.write(lastAssistantMessage.content);
        proc.stdin?.end();
      } else if (platform === 'win32') {
        const proc = spawn('clip', [], { stdio: 'pipe' });
        proc.stdin?.write(lastAssistantMessage.content);
        proc.stdin?.end();
      } else {
        const proc = spawn('xclip', ['-selection', 'clipboard'], { stdio: 'pipe' });
        proc.stdin?.write(lastAssistantMessage.content);
        proc.stdin?.end();
      }
      return this.themeManager.success('Copied to clipboard');
    } catch (error) {
      return this.themeManager.error('Failed to copy to clipboard');
    }
  }

  private async handleDirectoryCommand(args: string): Promise<string> {
    const [subCommand, ...paths] = args.split(' ');
    
    switch (subCommand) {
      case 'add':
        // This would add directories to the workspace
        return this.themeManager.success(`Added directory: ${paths.join(' ')}`);
      
      case 'show':
        return this.themeManager.info('Working directory: ' + process.cwd());
      
      default:
        return this.themeManager.error('Usage: /directory [add|show] <path>');
    }
  }

  // Public methods for main application
  addMessage(message: Message): void {
    this.messages.push(message);
  }

  updateTokenUsage(usage: Partial<TokenUsage>): void {
    this.tokenUsage = { ...this.tokenUsage, ...usage };
  }

  getThemeManager(): ThemeManager {
    return this.themeManager;
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  setVSCodeContext(context: any): void {
    this.vscodeContext = context;
  }

  getVSCodeContext(): any {
    return this.vscodeContext;
  }

  // New command implementations
  private async handleWorkflowCommand(args: string): Promise<string> {
    const [action, ...params] = args.split(' ');
    
    if (action === 'list') {
      const workflows = this.workflowEngine.listWorkflows();
      let output = this.themeManager.primary('Available Workflows:\n');
      workflows.forEach(wf => {
        output += this.themeManager.success(`  ${wf.name}: `) + 
                 this.themeManager.dim(wf.description) + '\n';
      });
      return output;
    }
    
    if (action === 'run') {
      const workflowName = params[0];
      if (!workflowName) {
        return this.themeManager.error('Usage: /workflow run <name>');
      }
      
      try {
        await this.workflowEngine.executeWorkflow(workflowName);
        return this.themeManager.success(`Workflow '${workflowName}' completed`);
      } catch (error: any) {
        return this.themeManager.error(`Workflow failed: ${error.message}`);
      }
    }
    
    return this.themeManager.warning('Usage: /workflow [list|run <name>]');
  }

  private toggleAutoExecute(): string {
    const enabled = !interactiveMode['autoExecute'];
    interactiveMode.setAutoExecute(enabled);
    return this.themeManager.success(`Auto-execute ${enabled ? 'enabled' : 'disabled'}`);
  }

  private toggleConfirmations(): string {
    const enabled = !interactiveMode['confirmationEnabled'];
    interactiveMode.setConfirmation(enabled);
    return this.themeManager.success(`Confirmations ${enabled ? 'enabled' : 'disabled'}`);
  }

  private async showHistory(): Promise<string> {
    await interactiveMode.showExecutionHistory();
    return '';
  }

  private async undoLastAction(): Promise<string> {
    await interactiveMode.undoLastAction();
    return this.themeManager.success('Last action undone');
  }

  private async detectIntent(text: string): Promise<string> {
    if (!text) {
      return this.themeManager.error('Usage: /intent <your request>');
    }
    
    const intent = intentDetector.detectIntent(text);
    await intentDetector.executeIntent(intent, this.toolRegistry);
    return this.themeManager.success('Intent executed');
  }
}