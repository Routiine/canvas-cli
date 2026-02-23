/**
 * CommandHandler - Slim router that delegates to focused handlers
 *
 * This is a refactored version of the original commands.ts that was 1000+ lines.
 * Command logic is now split into focused handlers in src/handlers/
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'cross-spawn';
import { ThemeManager } from './themes.js';
import { CheckpointManager } from './checkpoint.js';
import { ToolRegistry } from './tools/registry.js';
import { ContextLoader } from './tools/memory.js';
import type { Message, TokenUsage } from './types.js';
import { loadConfig, saveConfig } from './config.js';
import { WorkflowEngine } from './tools/workflows.js';
import { intentDetector } from './tools/intentDetector.js';
import { interactiveMode } from './interactiveMode.js';
import { OrchestratorCommand } from './commands/orchestratorCommand.js';
import { configCommand } from './commands/config-command.js';
import { displaySplash, setTheme as setSplashTheme } from './utils/splash.js';
import { setCurrentModel, getCurrentModel } from './models/model-manager.js';

// Import focused handlers
import { ChatHandler } from './handlers/chat-handler.js';
import { MemoryHandler } from './handlers/memory-handler.js';
import { WorkflowHandler } from './handlers/workflow-handler.js';
import { SkillHandler } from './handlers/skill-handler.js';

// Types for new features
interface TodoItem {
  id: string;
  text: string;
  status: 'pending' | 'in_progress' | 'done';
  created: Date;
}

interface BackgroundTask {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  pid?: number;
}

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

  // New state for Claude Code-style features
  private sessionName: string = `session-${Date.now()}`;
  private todos: TodoItem[] = [];
  private backgroundTasks: BackgroundTask[] = [];
  private workingDirectories: string[] = [process.cwd()];
  private conversationHistory: Array<{ role: string; content: string; timestamp: Date }> = [];

  // Focused handlers
  private chatHandler: ChatHandler;
  private memoryHandler: MemoryHandler;
  private workflowHandler: WorkflowHandler;
  private skillHandler: SkillHandler;

  // Memory management
  private static readonly MAX_MESSAGES = 1000;
  private static readonly CLEANUP_THRESHOLD = 800;
  private static readonly MESSAGES_TO_KEEP = 500;

  constructor() {
    const config = loadConfig();
    const themeName = config.theme || config.ui?.theme || 'default';
    this.themeManager = new ThemeManager(themeName);
    this.checkpointManager = new CheckpointManager();
    this.toolRegistry = new ToolRegistry();
    this.contextLoader = new ContextLoader();
    this.workflowEngine = new WorkflowEngine(this.toolRegistry);
    this.orchestrator = new OrchestratorCommand();
    this.vimMode = config.vimMode || config.ui?.vimMode || false;

    // Initialize focused handlers
    this.chatHandler = new ChatHandler(this.themeManager, this.checkpointManager, this.messages);
    this.memoryHandler = new MemoryHandler(this.themeManager, this.toolRegistry, this.contextLoader);
    this.workflowHandler = new WorkflowHandler(this.themeManager, this.workflowEngine);
    this.skillHandler = new SkillHandler(this.themeManager);

    void this.loadCustomCommands();
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
    const command = parts[0].slice(1); // Remove leading /
    const args = parts.slice(1).join(' ');

    switch (command) {
      // Help & info
      case 'help':
      case '?':
        return this.showHelp();

      // Delegate to focused handlers
      case 'chat':
      case 'checkpoint':
      case 'cp':
        return await this.chatHandler.handleCommand(args);

      case 'memory':
        return await this.memoryHandler.handleCommand(args);

      case 'workflow':
      case 'wf':
        return await this.workflowHandler.handleCommand(args);

      case 'skill':
      case 'skills':
        return await this.skillHandler.handleCommand(args);

      // Simple commands handled inline
      case 'theme':
        return await this.changeTheme();

      case 'model':
        return await this.changeModel();

      case 'tools':
        return this.listTools(args);

      case 'stats':
        return this.showStats();

      case 'clear':
        console.clear();
        return 'Screen cleared';

      case 'compact':
        return await this.compactConversation(args);

      case 'status':
        return this.showStatus();

      case 'resume':
        return await this.resumeSession(args);

      case 'context':
        return this.showContext();

      case 'cost':
        return this.showCost();

      case 'usage':
        return this.showUsage();

      case 'todos':
        return this.showTodos();

      case 'bashes':
        return this.showBashes();

      case 'sandbox':
        return await this.toggleSandbox();

      case 'rename':
        return await this.renameSession(args);

      case 'rewind':
        return await this.rewindConversation(args);

      case 'export':
        return await this.exportConversation(args);

      case 'add-dir':
        return await this.addDirectory(args);

      case 'todo':
        return await this.manageTodos(args);

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

      case 'config':
        return await configCommand.execute(args);

      case 'agentic':
      case 'agents':
        const { agenticCommand } = await import('./commands/agentic-command.js');
        return await agenticCommand.execute(args);

      case 'task':
        return await this.runTask(args);

      case 'tasks':
        return await this.listAgentTasks();

      case 'recipe':
      case 'r':
        return await this.handleRecipeCommand(args);

      case 'quit':
      case 'exit':
        process.exit(0);

      case 'voice':
        return await this.handleVoiceInput(args);

      case 'speak':
      case 'tts':
        return await this.handleTextToSpeech(args);

      default:
        if (this.customCommands.has(command)) {
          return this.customCommands.get(command) || null;
        }
        return this.themeManager.warning(`Unknown command: /${command}`);
    }
  }

  private showHelp(): string {
    let help = this.themeManager.primary('Canvas CLI Commands\n\n');

    // Core Commands
    help += this.themeManager.secondary('  Core\n');
    help += `    ${this.themeManager.text('/help')}      ${this.themeManager.dim('Show this help')}\n`;
    help += `    ${this.themeManager.text('/exit')}      ${this.themeManager.dim('Exit Canvas CLI')}\n`;
    help += `    ${this.themeManager.text('/clear')}     ${this.themeManager.dim('Clear conversation')}\n`;
    help += `    ${this.themeManager.text('/compact')}   ${this.themeManager.dim('Compact conversation')}\n`;
    help += `    ${this.themeManager.text('/model')}     ${this.themeManager.dim('Change AI model')}\n`;
    help += `    ${this.themeManager.text('/config')}    ${this.themeManager.dim('Manage configuration')}\n`;
    help += `    ${this.themeManager.text('/status')}    ${this.themeManager.dim('Show status info')}\n`;
    help += '\n';

    // Session & Context
    help += this.themeManager.secondary('  Session & Context\n');
    help += `    ${this.themeManager.text('/resume')}    ${this.themeManager.dim('Resume previous session')}\n`;
    help += `    ${this.themeManager.text('/rename')}    ${this.themeManager.dim('Rename current session')}\n`;
    help += `    ${this.themeManager.text('/rewind')}    ${this.themeManager.dim('Rewind conversation')}\n`;
    help += `    ${this.themeManager.text('/context')}   ${this.themeManager.dim('Show context usage')}\n`;
    help += `    ${this.themeManager.text('/export')}    ${this.themeManager.dim('Export conversation')}\n`;
    help += `    ${this.themeManager.text('/add-dir')}   ${this.themeManager.dim('Add working directory')}\n`;
    help += '\n';

    // Usage & Stats
    help += this.themeManager.secondary('  Usage & Stats\n');
    help += `    ${this.themeManager.text('/cost')}      ${this.themeManager.dim('Show token costs')}\n`;
    help += `    ${this.themeManager.text('/stats')}     ${this.themeManager.dim('Session statistics')}\n`;
    help += `    ${this.themeManager.text('/usage')}     ${this.themeManager.dim('Usage limits')}\n`;
    help += `    ${this.themeManager.text('/todo')}      ${this.themeManager.dim('Manage TODO items')}\n`;
    help += `    ${this.themeManager.text('/todos')}     ${this.themeManager.dim('List TODO items')}\n`;
    help += '\n';

    // Tools & Extensions
    help += this.themeManager.secondary('  Tools & Extensions\n');
    help += `    ${this.themeManager.text('/tools')}     ${this.themeManager.dim('List available tools')}\n`;
    help += `    ${this.themeManager.text('/bashes')}    ${this.themeManager.dim('Background tasks')}\n`;
    help += `    ${this.themeManager.text('/agentic')}   ${this.themeManager.dim('Agentic planning')}\n`;
    help += `    ${this.themeManager.text('/recipe')}    ${this.themeManager.dim('Run recipes')}\n`;
    help += `    ${this.themeManager.text('/skill')}     ${this.themeManager.dim('Manage skills')}\n`;
    help += `    ${this.themeManager.text('/sandbox')}   ${this.themeManager.dim('Toggle sandbox mode')}\n`;
    help += '\n';

    // Memory & Knowledge
    help += this.themeManager.secondary('  Memory & Knowledge\n');
    help += `    ${this.themeManager.text('/memory')}    ${this.themeManager.dim('Manage memory')}\n`;
    help += `    ${this.themeManager.text('/chat')}      ${this.themeManager.dim('Save/resume checkpoints')}\n`;
    help += `    ${this.themeManager.text('/init')}      ${this.themeManager.dim('Initialize CANVAS.md')}\n`;
    help += '\n';

    // Voice
    help += this.themeManager.secondary('  Voice\n');
    help += `    ${this.themeManager.text('/voice')}     ${this.themeManager.dim('Record & transcribe voice')}\n`;
    help += `    ${this.themeManager.text('/voice 15')}  ${this.themeManager.dim('Record for 15 seconds')}\n`;
    help += `    ${this.themeManager.text('/speak')}     ${this.themeManager.dim('Text-to-speech')}\n`;
    help += '\n';

    // Customization
    help += this.themeManager.secondary('  Customization\n');
    help += `    ${this.themeManager.text('/theme')}     ${this.themeManager.dim('Change visual theme')}\n`;
    help += `    ${this.themeManager.text('/vim')}       ${this.themeManager.dim('Toggle vim mode')}\n`;
    help += '\n';

    return help;
  }

  private showHelpOld(): string {
    const commands = [
      { cmd: '/help, /?', desc: 'Show this help message' },
      { cmd: '/config [show|set|get]', desc: 'Manage configuration' },
      { cmd: '/agentic [plan|develop|execute]', desc: 'Canvas agentic planning & development' },
      { cmd: '/recipe [list|run|create]', desc: 'Recipe management and execution' },
      { cmd: '/skill [list|show|create|delete]', desc: 'Manage AI skills' },
      { cmd: '/theme', desc: 'Change the visual theme' },
      { cmd: '/model', desc: 'Change the AI model' },
      { cmd: '/tools [desc]', desc: 'List available tools' },
      { cmd: '/chat save <tag>', desc: 'Save conversation checkpoint' },
      { cmd: '/chat resume <tag>', desc: 'Resume from checkpoint' },
      { cmd: '/stats', desc: 'Show session statistics' },
      { cmd: '/memory add <text>', desc: 'Add to memory' },
      { cmd: '/workflow [list|run]', desc: 'Manage workflows' },
      { cmd: '/quit, /exit', desc: 'Exit Canvas CLI' }
    ];

    let help = this.themeManager.primary('Canvas CLI Commands:\n\n');
    for (const { cmd, desc } of commands) {
      help += `  ${this.themeManager.secondary(cmd.padEnd(30))} ${this.themeManager.dim(desc)}\n`;
    }

    if (this.customCommands.size > 0) {
      help += '\n' + this.themeManager.primary('Custom Commands:\n');
      for (const name of this.customCommands.keys()) {
        help += `  ${this.themeManager.secondary('/' + name)}\n`;
      }
    }

    return help;
  }

  private async changeTheme(): Promise<string> {
    const inquirer = await import('inquirer');
    const themes = this.themeManager.listThemes();
    const { theme } = await inquirer.default.prompt({
      type: 'list',
      name: 'theme',
      message: 'Select a theme:',
      choices: themes
    });

    this.themeManager.setTheme(theme);
    setSplashTheme(theme);
    const config = loadConfig();
    config.theme = theme;
    saveConfig(config);

    // Redisplay splash with new theme
    displaySplash(theme);

    return this.themeManager.success(`Theme changed to: ${theme}`);
  }

  private async changeModel(): Promise<string> {
    const config = loadConfig();
    const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';

    // Fetch available models from Ollama
    let models: string[] = [];
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        models = data.models?.map((m: any) => m.name) || [];
      }
    } catch (error) {
      return this.themeManager.error('Could not connect to Ollama. Is it running?');
    }

    if (models.length === 0) {
      return this.themeManager.warning('No models found. Run "ollama pull <model>" to download one.');
    }

    const inquirer = await import('inquirer');
    const currentModel = config.defaultModel || config.ollama?.defaultModel || 'none';

    const { model } = await inquirer.default.prompt({
      type: 'list',
      name: 'model',
      message: `Select model (current: ${currentModel}):`,
      choices: models,
      default: models.includes(currentModel) ? currentModel : models[0]
    });

    // Save to config
    config.defaultModel = model;
    if (config.ollama) {
      config.ollama.defaultModel = model;
    }
    saveConfig(config);

    // Update the running session
    setCurrentModel(model, model);

    return this.themeManager.success(`Model changed to: ${model}`);
  }

  private listTools(args: string): string {
    const showDesc = args.includes('desc');
    const showCore = args.includes('core');
    const showExtra = args.includes('extra');

    const summary = this.toolRegistry.getToolSummary();
    let output = this.themeManager.primary('Tools\n\n');
    output += `  ${this.themeManager.dim('core:')} ${summary.core}  ${this.themeManager.dim('extra:')} ${summary.extra}  ${this.themeManager.dim('total:')} ${summary.total}\n\n`;

    // Get tools based on filter
    const tools = showCore ? this.toolRegistry.listCore() :
                showExtra ? this.toolRegistry.listExtra() :
                this.toolRegistry.listEnabled();

    // Group by category for cleaner display
    const coreTools = this.toolRegistry.listCore();
    const coreNames = new Set(coreTools.map(t => t.name));

    if (!showCore && !showExtra) {
      // Show core first, then extra
      output += `  ${this.themeManager.info('Core')}\n`;
      for (const tool of coreTools) {
        output += `    ${this.themeManager.secondary(tool.name)}`;
        if (showDesc) output += ` ${this.themeManager.dim('- ' + tool.description)}`;
        output += '\n';
      }

      const extraTools = tools.filter(t => !coreNames.has(t.name));
      if (extraTools.length > 0) {
        output += `\n  ${this.themeManager.info('Extra')}\n`;
        for (const tool of extraTools.slice(0, 20)) {
          output += `    ${this.themeManager.dim(tool.name)}`;
          if (showDesc) output += ` ${this.themeManager.dim('- ' + tool.description)}`;
          output += '\n';
        }
        if (extraTools.length > 20) {
          output += `    ${this.themeManager.dim(`... and ${extraTools.length - 20} more (use /tools extra)`)}\n`;
        }
      }
    } else {
      for (const tool of tools) {
        output += `  ${this.themeManager.secondary(tool.name)}`;
        if (showDesc) output += `\n    ${this.themeManager.dim(tool.description)}`;
        output += '\n';
      }
    }

    return output;
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
      this.themeManager.formatStats('  Total tokens', this.tokenUsage.total) + '\n';
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
`;

    await fs.writeFile(canvasPath, template);
    return this.themeManager.success('Created CANVAS.md');
  }

  private async compressContext(): Promise<string> {
    const recentMessages = this.messages.slice(-10);
    this.messages.length = 0;
    this.messages.push(...recentMessages);
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
        return this.themeManager.success(`Added directory: ${paths.join(' ')}`);
      case 'show':
        return this.themeManager.info('Working directory: ' + process.cwd());
      default:
        return this.themeManager.error('Usage: /directory [add|show] <path>');
    }
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

  private async handleRecipeCommand(args: string): Promise<string> {
    const { RecipeManager } = await import('./recipes/recipe-manager.js');
    const recipeManager = new RecipeManager();

    const [subCommand, ...rest] = args.split(' ');
    const recipeName = rest[0];
    const params = rest.slice(1).join(' ');

    switch (subCommand) {
      case 'list':
      case 'ls':
        try {
          await recipeManager.loadLibraries();
          const recipes = await recipeManager.listRecipes();

          if (recipes.length === 0) {
            return this.themeManager.warning('No recipes found');
          }

          let output = this.themeManager.primary('Available Recipes:\n\n');
          recipes.forEach((item: any) => {
            output += `  ${this.themeManager.success(item.name)}\n`;
            output += `    ${this.themeManager.dim(item.recipe.description)}\n`;
          });
          return output;
        } catch (error: any) {
          return this.themeManager.error(`Failed to list recipes: ${error.message}`);
        }

      case 'run':
      case 'exec':
        if (!recipeName) {
          return this.themeManager.error('Usage: /recipe run <recipe-name>');
        }

        try {
          await recipeManager.loadLibraries();
          const parameters: Record<string, string> = {};
          if (params) {
            const pairs = params.match(/(\w+)=([^\s]+)/g);
            if (pairs) {
              pairs.forEach(pair => {
                const [key, value] = pair.split('=');
                parameters[key] = value;
              });
            }
          }

          const result = await recipeManager.executeRecipe(recipeName, parameters);
          return result.success
            ? this.themeManager.success(`Recipe executed!\n\n${result.output}`)
            : this.themeManager.error(`Recipe failed: ${result.error}`);
        } catch (error: any) {
          return this.themeManager.error(`Failed to run recipe: ${error.message}`);
        }

      default:
        return this.themeManager.error('Usage: /recipe [list|run] <name>');
    }
  }

  // Public API
  addMessage(message: Message): void {
    this.messages.push(message);
    if (this.messages.length >= CommandHandler.CLEANUP_THRESHOLD) {
      this.cleanupMessages();
    }
  }

  private cleanupMessages(): void {
    if (this.messages.length > CommandHandler.MESSAGES_TO_KEEP) {
      const removed = this.messages.length - CommandHandler.MESSAGES_TO_KEEP;
      this.messages = this.messages.slice(-CommandHandler.MESSAGES_TO_KEEP);
      console.log(this.themeManager.dim(`ℹ️ Memory cleanup: removed ${removed} old messages`));
    }
  }

  getMessages(): Message[] {
    return this.messages;
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

  // ============================================================================
  // Claude Code-style commands
  // ============================================================================

  private async compactConversation(args: string): Promise<string> {
    const focus = args.trim() || undefined;
    const originalCount = this.messages.length;

    // Keep system messages and last 10 exchanges
    const systemMsgs = this.messages.filter(m => m.role === 'system');
    const recentMsgs = this.messages.filter(m => m.role !== 'system').slice(-20);

    this.messages = [...systemMsgs, ...recentMsgs];
    const removed = originalCount - this.messages.length;

    let result = this.themeManager.success(`Compacted conversation: removed ${removed} messages`);
    if (focus) {
      result += `\n${this.themeManager.dim(`Focus: ${focus}`)}`;
    }
    return result;
  }

  private showStatus(): string {
    const config = loadConfig();
    const model = getCurrentModel() || config.defaultModel || 'unknown';
    const theme = config.theme || 'slate';
    const duration = Math.round((Date.now() - this.sessionStartTime.getTime()) / 1000);
    const minutes = Math.floor(duration / 60);

    let status = this.themeManager.primary('Canvas CLI Status\n\n');
    status += `  ${this.themeManager.dim('Version')}    3.0.0\n`;
    status += `  ${this.themeManager.dim('Model')}      ${this.themeManager.text(model)}\n`;
    status += `  ${this.themeManager.dim('Theme')}      ${this.themeManager.text(theme)}\n`;
    status += `  ${this.themeManager.dim('Session')}    ${minutes}m\n`;
    status += `  ${this.themeManager.dim('Messages')}   ${this.messages.length}\n`;
    status += `  ${this.themeManager.dim('Tokens')}     ${this.tokenUsage.total}\n`;

    return status;
  }

  private async resumeSession(args: string): Promise<string> {
    const checkpoints = await this.checkpointManager.listCheckpoints();

    if (checkpoints.length === 0) {
      return this.themeManager.warning('No saved sessions found. Use /chat save <name> first.');
    }

    if (args) {
      // Resume specific session
      const checkpoint = checkpoints.find(c => c.tag === args || c.id === args);
      if (checkpoint) {
        await this.checkpointManager.loadCheckpoint(checkpoint.id);
        return this.themeManager.success(`Resumed session: ${checkpoint.tag || checkpoint.id}`);
      }
      return this.themeManager.error(`Session not found: ${args}`);
    }

    // Show session picker
    const inquirer = await import('inquirer');
    const { session } = await inquirer.default.prompt({
      type: 'list',
      name: 'session',
      message: 'Select session to resume:',
      choices: checkpoints.map(c => ({
        name: `${c.tag || c.id} (${c.timestamp})`,
        value: c.id
      }))
    });

    await this.checkpointManager.loadCheckpoint(session);
    return this.themeManager.success(`Session resumed`);
  }

  private showContext(): string {
    const maxContext = 128000; // Typical context window
    const used = this.tokenUsage.total;
    const percentage = Math.round((used / maxContext) * 100);

    // Create visual bar
    const barWidth = 40;
    const filledWidth = Math.round((percentage / 100) * barWidth);
    const bar = this.themeManager.success('█'.repeat(filledWidth)) +
                this.themeManager.dim('░'.repeat(barWidth - filledWidth));

    let output = this.themeManager.primary('Context Usage\n\n');
    output += `  ${bar} ${percentage}%\n\n`;
    output += `  ${this.themeManager.dim('Used')}      ${used.toLocaleString()} tokens\n`;
    output += `  ${this.themeManager.dim('Available')} ${(maxContext - used).toLocaleString()} tokens\n`;
    output += `  ${this.themeManager.dim('Messages')}  ${this.messages.length}\n`;

    return output;
  }

  private showCost(): string {
    // Rough cost estimation (adjust rates as needed)
    const inputRate = 0.003 / 1000;  // $3 per 1M input tokens
    const outputRate = 0.015 / 1000; // $15 per 1M output tokens

    const inputCost = this.tokenUsage.input * inputRate;
    const outputCost = this.tokenUsage.output * outputRate;
    const totalCost = inputCost + outputCost;

    let output = this.themeManager.primary('Token Usage & Cost\n\n');
    output += `  ${this.themeManager.dim('Input')}   ${this.tokenUsage.input.toLocaleString()} tokens  $${inputCost.toFixed(4)}\n`;
    output += `  ${this.themeManager.dim('Output')}  ${this.tokenUsage.output.toLocaleString()} tokens  $${outputCost.toFixed(4)}\n`;
    output += `  ${this.themeManager.dim('Total')}   ${this.tokenUsage.total.toLocaleString()} tokens  $${totalCost.toFixed(4)}\n`;

    return output;
  }

  private showUsage(): string {
    // For local Ollama, usage is unlimited
    let output = this.themeManager.primary('Usage Limits\n\n');
    output += `  ${this.themeManager.success('Local Ollama - Unlimited')}\n\n`;
    output += `  ${this.themeManager.dim('Session tokens')} ${this.tokenUsage.total.toLocaleString()}\n`;
    output += `  ${this.themeManager.dim('Messages')}       ${this.messages.length}\n`;

    return output;
  }

  private showTodos(): string {
    let output = this.themeManager.primary('Current TODOs\n\n');

    if (this.todos.length === 0) {
      output += `  ${this.themeManager.dim('No todos. Use /todo add <text> to create one.')}\n`;
      return output;
    }

    const pending = this.todos.filter(t => t.status === 'pending');
    const inProgress = this.todos.filter(t => t.status === 'in_progress');
    const done = this.todos.filter(t => t.status === 'done');

    if (inProgress.length > 0) {
      output += this.themeManager.secondary('  In Progress\n');
      inProgress.forEach(t => {
        output += `    ${this.themeManager.warning('○')} ${t.text}\n`;
      });
      output += '\n';
    }

    if (pending.length > 0) {
      output += this.themeManager.secondary('  Pending\n');
      pending.forEach(t => {
        output += `    ${this.themeManager.dim('○')} ${t.text}\n`;
      });
      output += '\n';
    }

    if (done.length > 0) {
      output += this.themeManager.secondary('  Completed\n');
      done.forEach(t => {
        output += `    ${this.themeManager.success('●')} ${this.themeManager.dim(t.text)}\n`;
      });
    }

    return output;
  }

  private async manageTodos(args: string): Promise<string> {
    const parts = args.trim().split(' ');
    const action = parts[0];
    const rest = parts.slice(1).join(' ');

    switch (action) {
      case 'add':
        if (!rest) return this.themeManager.error('Usage: /todo add <text>');
        const newTodo: TodoItem = {
          id: `todo-${Date.now()}`,
          text: rest,
          status: 'pending',
          created: new Date()
        };
        this.todos.push(newTodo);
        return this.themeManager.success(`Added: ${rest}`);

      case 'done':
      case 'complete':
        const doneIndex = parseInt(rest) - 1;
        if (isNaN(doneIndex) || doneIndex < 0 || doneIndex >= this.todos.length) {
          return this.themeManager.error('Usage: /todo done <number>');
        }
        this.todos[doneIndex].status = 'done';
        return this.themeManager.success(`Completed: ${this.todos[doneIndex].text}`);

      case 'start':
        const startIndex = parseInt(rest) - 1;
        if (isNaN(startIndex) || startIndex < 0 || startIndex >= this.todos.length) {
          return this.themeManager.error('Usage: /todo start <number>');
        }
        this.todos[startIndex].status = 'in_progress';
        return this.themeManager.success(`Started: ${this.todos[startIndex].text}`);

      case 'remove':
      case 'rm':
        const rmIndex = parseInt(rest) - 1;
        if (isNaN(rmIndex) || rmIndex < 0 || rmIndex >= this.todos.length) {
          return this.themeManager.error('Usage: /todo remove <number>');
        }
        const removed = this.todos.splice(rmIndex, 1)[0];
        return this.themeManager.success(`Removed: ${removed.text}`);

      case 'clear':
        const count = this.todos.length;
        this.todos = [];
        return this.themeManager.success(`Cleared ${count} todos`);

      case 'list':
      default:
        return this.showTodos();
    }
  }

  private showBashes(): string {
    let output = this.themeManager.primary('Background Tasks\n\n');

    if (this.backgroundTasks.length === 0) {
      output += `  ${this.themeManager.dim('No background tasks running')}\n`;
      return output;
    }

    this.backgroundTasks.forEach((task, i) => {
      const duration = Math.round((Date.now() - task.startTime.getTime()) / 1000);
      const statusIcon = task.status === 'running' ? this.themeManager.warning('●') :
                        task.status === 'completed' ? this.themeManager.success('●') :
                        this.themeManager.error('●');
      output += `  ${statusIcon} [${i + 1}] ${task.command}\n`;
      output += `      ${this.themeManager.dim(`${task.status} · ${duration}s · PID: ${task.pid || 'N/A'}`)}\n`;
    });

    return output;
  }

  private async renameSession(args: string): Promise<string> {
    if (!args.trim()) {
      const inquirer = await import('inquirer');
      const { name } = await inquirer.default.prompt({
        type: 'input',
        name: 'name',
        message: 'Enter new session name:',
        default: this.sessionName
      });
      this.sessionName = name;
    } else {
      this.sessionName = args.trim();
    }

    return this.themeManager.success(`Session renamed to: ${this.sessionName}`);
  }

  private async rewindConversation(args: string): Promise<string> {
    const count = parseInt(args) || 1;

    if (this.messages.length === 0) {
      return this.themeManager.warning('No messages to rewind');
    }

    if (count > this.messages.length) {
      return this.themeManager.error(`Can only rewind up to ${this.messages.length} messages`);
    }

    // Show what will be removed
    const toRemove = this.messages.slice(-count);
    let preview = this.themeManager.primary(`Rewinding ${count} message(s):\n\n`);
    toRemove.forEach((msg, i) => {
      const content = msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '');
      preview += `  ${this.themeManager.dim(`${msg.role}:`)} ${content}\n`;
    });

    const inquirer = await import('inquirer');
    const { confirm } = await inquirer.default.prompt({
      type: 'confirm',
      name: 'confirm',
      message: 'Remove these messages?',
      default: true
    });

    if (confirm) {
      this.messages = this.messages.slice(0, -count);
      return this.themeManager.success(`Rewound ${count} message(s)`);
    }

    return this.themeManager.dim('Rewind cancelled');
  }

  private async exportConversation(args: string): Promise<string> {
    const filename = args.trim() || `canvas-export-${Date.now()}.md`;
    const exportPath = path.join(process.cwd(), filename);

    let content = `# Canvas CLI Conversation Export\n\n`;
    content += `**Session:** ${this.sessionName}\n`;
    content += `**Date:** ${new Date().toISOString()}\n`;
    content += `**Messages:** ${this.messages.length}\n`;
    content += `**Tokens:** ${this.tokenUsage.total}\n\n`;
    content += `---\n\n`;

    this.messages.forEach(msg => {
      const role = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '🤖 Assistant' : '⚙️ System';
      content += `## ${role}\n\n${msg.content}\n\n`;
    });

    await fs.writeFile(exportPath, content, 'utf-8');

    return this.themeManager.success(`Exported to: ${filename}`);
  }

  private async addDirectory(args: string): Promise<string> {
    if (!args.trim()) {
      // Show current directories
      let output = this.themeManager.primary('Working Directories\n\n');
      this.workingDirectories.forEach((dir, i) => {
        const isCurrent = dir === process.cwd();
        output += `  ${isCurrent ? this.themeManager.success('●') : this.themeManager.dim('○')} ${dir}\n`;
      });
      output += `\n${this.themeManager.dim('Use /add-dir <path> to add a directory')}\n`;
      return output;
    }

    const dirPath = path.resolve(args.trim());

    if (!await fs.pathExists(dirPath)) {
      return this.themeManager.error(`Directory not found: ${dirPath}`);
    }

    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      return this.themeManager.error(`Not a directory: ${dirPath}`);
    }

    if (this.workingDirectories.includes(dirPath)) {
      return this.themeManager.warning(`Already added: ${dirPath}`);
    }

    this.workingDirectories.push(dirPath);
    return this.themeManager.success(`Added directory: ${dirPath}`);
  }

  private async toggleSandbox(): Promise<string> {
    const config = loadConfig();
    const currentSandbox = config.sandbox?.enabled || false;

    config.sandbox = {
      ...config.sandbox,
      enabled: !currentSandbox,
      type: !currentSandbox ? 'docker' : 'none'
    };
    saveConfig(config);

    return this.themeManager.success(
      `Sandbox ${config.sandbox.enabled ? 'enabled (docker)' : 'disabled'}`
    );
  }

  /**
   * Run an agent task - /task <type> <prompt>
   */
  private async runTask(args: string): Promise<string> {
    const { AGENTS, getAgentManager, resetAgentManager } = await import('./agents/index.js');

    if (!args.trim()) {
      // Show available agents
      let help = this.themeManager.primary('Agent Types\n\n');
      for (const [type, config] of Object.entries(AGENTS)) {
        help += `  ${this.themeManager.info(type.padEnd(12))} ${this.themeManager.dim(config.description)}\n`;
      }
      help += `\n  ${this.themeManager.dim('Usage: /task <type> <prompt>')}\n`;
      help += `  ${this.themeManager.dim('Example: /task explore find all API endpoints')}\n`;
      return help;
    }

    const parts = args.trim().split(/\s+/);
    const agentType = parts[0].toLowerCase();
    const prompt = parts.slice(1).join(' ');

    if (!AGENTS[agentType as keyof typeof AGENTS]) {
      return this.themeManager.error(`Unknown agent type: ${agentType}. Use /task to see available types.`);
    }

    if (!prompt) {
      return this.themeManager.error(`Usage: /task ${agentType} <prompt>`);
    }

    try {
      resetAgentManager();
      const manager = getAgentManager(this.themeManager, this.toolRegistry);
      const task = manager.createTask(agentType as any, prompt);
      const result = await manager.runTask(task.id);
      return result;
    } catch (error: any) {
      return this.themeManager.error(`Task failed: ${error.message}`);
    }
  }

  /**
   * List agent tasks - /tasks
   */
  private async listAgentTasks(): Promise<string> {
    const { getAgentManager } = await import('./agents/index.js');

    try {
      const manager = getAgentManager(this.themeManager, this.toolRegistry);
      const tasks = manager.listTasks();

      if (tasks.length === 0) {
        return this.themeManager.dim('No agent tasks. Use /task <type> <prompt> to start one.');
      }

      const statusIcon: Record<string, string> = {
        pending: this.themeManager.dim('○'),
        running: this.themeManager.info('◐'),
        completed: this.themeManager.success('●'),
        failed: this.themeManager.error('✗')
      };

      let output = this.themeManager.primary('Agent Tasks\n\n');
      tasks.forEach(task => {
        const icon = statusIcon[task.status];
        const bg = task.background ? this.themeManager.dim(' (bg)') : '';
        output += `  ${icon} ${this.themeManager.dim(task.id.slice(0, 12))} [${task.type}] ${task.status}${bg}\n`;
      });

      return output;
    } catch {
      return this.themeManager.dim('No agent tasks.');
    }
  }

  private async handleVoiceInput(args: string): Promise<string> {
    const { VoiceInputTool } = await import('./tools/voice.js');
    const voiceTool = new VoiceInputTool();

    // Parse args for duration
    const durationMatch = args.match(/(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1]) : 10;

    console.log(this.themeManager.dim(`  voice ${duration}s`));

    try {
      const result = await voiceTool.execute({ duration });
      return this.themeManager.text(result);
    } catch (error: any) {
      return this.themeManager.error(`error: ${error.message}`);
    }
  }

  private async handleTextToSpeech(args: string): Promise<string> {
    if (!args.trim()) {
      return this.themeManager.warning('Usage: /speak <text to speak>');
    }

    const { TextToSpeechTool } = await import('./tools/voice.js');
    const ttsTool = new TextToSpeechTool();

    try {
      const result = await ttsTool.execute({ text: args });
      return this.themeManager.text(result);
    } catch (error: any) {
      return this.themeManager.error(`TTS failed: ${error.message}`);
    }
  }
}