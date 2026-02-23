#!/usr/bin/env node

// Set process title to 'canvas' instead of 'node'
process.title = 'canvas';

/**
 * Canvas CLI - Production-ready AI assistant with advanced tools
 * Entry point - delegates to specialized modules
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from './config.js';
import { ModelManager } from './models/model-manager.js';
import { initializeCanvasFeatures, CanvasFeatures } from './features/index.js';
import { initializeSkillSystem } from './skills/skillSystem.js';

// Polished UI
import {
  PolishedTheme,
  Welcome,
  spinner,
  fmt
} from './ui/polished/index.js';

// Initialize polished theme (slate is default)
const uiTheme = new PolishedTheme('slate');
const welcome = new Welcome(uiTheme);

// Import CLI commands
import {
  createChatCommand,
  createModelsCommand,
  createContextCommand,
  createExportCommand,
  createCrawlCommand,
  createSearchCommand,
  createInitCommand,
  createToolsCommand,
  createAgentCommand,
  registerBuiltinCommands
} from './commands/index.js';
import { registerInkUICommand } from './commands/ink-ui.js';
import { createInstallCommand } from './commands/install.js';
import { createUpdateCommand } from './commands/update.js';

// Import feature commands
import { createFeatureCommands } from './commands/feature-commands.js';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const pkg = _require('../package.json');
const VERSION: string = pkg.version;

async function setupInitialConfig(): Promise<boolean> {
  const config = loadConfig();
  const needsConfig = !config.ollamaUrl && !config.ollama?.baseUrl;

  if (!needsConfig) {
    return false;
  }

  welcome.standard(VERSION);
  console.log(fmt.info('No configuration found. Let\'s set up Canvas CLI.'));
  console.log(uiTheme.dim('You can also run "canvas config" anytime to configure.\n'));

  const inquirer = await import('inquirer');
  const { setupNow } = await inquirer.default.prompt([
    {
      type: 'confirm',
      name: 'setupNow',
      message: 'Would you like to configure Canvas CLI now?',
      default: true
    }
  ]);

  if (setupNow) {
    const { ollamaUrl } = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'ollamaUrl',
        message: 'Enter Ollama API URL:',
        default: 'http://localhost:11434',
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        }
      }
    ]);

    const newConfig = {
      ...config,
      ollamaUrl: ollamaUrl,
      ollama: {
        baseUrl: ollamaUrl,
        defaultModel: 'llama3.2:latest'
      }
    };
    saveConfig(newConfig);
    console.log(fmt.success('Basic configuration saved! Use /config to add more settings.'));
    console.log('');
    return true;
  }

  console.log(fmt.warning('No configuration set. Canvas CLI may not work properly.'));
  console.log(uiTheme.dim('Run /config to configure at any time.\n'));
  return false;
}

async function initializeSystems(): Promise<any> {
  const config = loadConfig();

  // Register default model
  const defaultModel = config.defaultModel || config.ollama?.defaultModel;
  if (defaultModel) {
    ModelManager.registerDefaultAliasFromConfig(defaultModel);
  }

  // Initialize features (optional)
  let featureManager = null;
  const initSpinner = spinner(`Initializing Canvas CLI v${VERSION}`);
  initSpinner.start();

  try {
    featureManager = await initializeCanvasFeatures();
    initSpinner.succeed('Canvas CLI initialized');
  } catch (error) {
    initSpinner.warn('Initialized with limited features');
  }

  // Initialize skills (optional)
  try {
    await initializeSkillSystem();
  } catch (error) {
    // Skills are optional
  }

  return featureManager;
}

function registerCoreCommands(program: Command, config: any): void {
  // Chat (default command)
  program.addCommand(createChatCommand());

  // Models
  program.addCommand(createModelsCommand());

  // Config
  program
    .command('config')
    .description('Configure Canvas CLI settings interactively')
    .argument('[action]', 'Optional: show, set, test, reset, help')
    .argument('[key]', 'Config key (for set command)')
    .argument('[value]', 'Config value (for set command)')
    .action(async (action?: string, key?: string, value?: string) => {
      const { configCommand } = await import('./commands/config-command.js');
      let args = '';
      if (action) {
        args = action;
        if (key) args += ` ${key}`;
        if (value) args += ` ${value}`;
      }
      const result = await configCommand.execute(args);
      if (result) console.log(result);
    });

  // Init
  program.addCommand(createInitCommand());

  // Recipe
  program
    .command('recipe')
    .description('Run predefined workflow recipes')
    .argument('[name]', 'Recipe name to execute')
    .option('-l, --list', 'List available recipes')
    .option('-v, --variables <vars>', 'Variables for recipe (JSON format)')
    .action(async (name?: string, options?: { list?: boolean; variables?: string }) => {
      const { recipeCommand } = await import('./commands/recipe-command.js');
      let args = '';
      if (options?.list) args = 'list';
      else if (name) args = `run ${name} ${options?.variables || ''}`;
      const result = await recipeCommand.execute(args.trim());
      if (result) console.log(result);
    });

  // Agent
  program.addCommand(createAgentCommand());

  // Tools
  program.addCommand(createToolsCommand());

  // Context
  program.addCommand(createContextCommand());

  // Export
  program.addCommand(createExportCommand());

  // Ink UI
  registerInkUICommand(program);

  // Update & Install
  program.addCommand(createUpdateCommand());
  program.addCommand(createInstallCommand());

  // Knowledge commands
  program.addCommand(createCrawlCommand());
  program.addCommand(createSearchCommand());
}

function registerFeatureCommands(program: Command, featureManager: any): void {
  if (!featureManager) return;

  program
    .command('palette')
    .description('Open smart command palette (Ctrl+P)')
    .action(async () => {
      const palette = CanvasFeatures.getProductivity().commandPalette;
      await palette.open();
    });

  program
    .command('notebook')
    .description('Manage interactive notebooks')
    .argument('[action]', 'Action: create, open, list, execute')
    .argument('[name]', 'Notebook name')
    .action(async (action?: string, name?: string) => {
      const notebooks = CanvasFeatures.getProductivity().notebooks;
      if (action === 'create' && name) {
        const nb = notebooks.createNotebook(name);
        console.log(uiTheme.dim(`Created notebook: ${nb.name}`));
      } else if (action === 'list') {
        const list = notebooks.listNotebooks();
        list.forEach((nb: any) => console.log(`- ${nb.name} (${nb.modified})`));
      } else {
        console.log('Usage: canvas notebook <create|open|list|execute> [name]');
      }
    });

  program
    .command('share')
    .description('Start live session sharing')
    .option('-n, --name <name>', 'Session name', 'Canvas Session')
    .action(async (options: { name: string }) => {
      const sharing = CanvasFeatures.getCollaboration().sessionSharing;
      const session = await sharing.startSharing(options.name);
      console.log(uiTheme.info(`Session ID: ${session.id}`));
    });

  program
    .command('voice')
    .description('Control voice commands')
    .argument('[action]', 'Action: start, stop, train')
    .action(async (action?: string) => {
      const voice = CanvasFeatures.getInterfaces().voiceCommand;
      if (action === 'start') await voice.startListening();
      else if (action === 'stop') await voice.stopListening();
      else console.log('Usage: canvas voice <start|stop|train>');
    });

  program
    .command('monitor')
    .description('Open performance monitoring dashboard')
    .action(async () => {
      const monitor = CanvasFeatures.getSecurity().performanceMonitor;
      await monitor.start();
      console.log(uiTheme.success('Performance monitoring started'));
    });

  program
    .command('incident')
    .description('Manage incident response mode')
    .argument('[action]', 'Action: activate, deactivate, status')
    .action(async (action?: string) => {
      const incident = CanvasFeatures.getSecurity().incidentResponse;
      if (action === 'activate') incident.activate();
      else if (action === 'deactivate') incident.deactivate();
      else if (action === 'status') console.log(uiTheme.info('Incident response mode status checked'));
      else console.log('Usage: canvas incident <activate|deactivate|status>');
    });

  program
    .command('workspace')
    .description('Manage persistent workspace state')
    .argument('[action]', 'Action: save, restore, list')
    .action(async (action?: string) => {
      const workspace = CanvasFeatures.getProductivity().workspaceState;
      if (action === 'save') {
        const ws = await workspace.createWorkspace('current');
        console.log(uiTheme.success(`Workspace saved: ${ws.id}`));
      } else if (action === 'restore') {
        const list = await workspace.listWorkspaces();
        if (list.length > 0) {
          await workspace.loadWorkspace(list[0].id);
          console.log(uiTheme.success('Workspace restored'));
        }
      } else if (action === 'list') {
        const list = await workspace.listWorkspaces();
        list.forEach((ws: any) => console.log(`- ${ws.name}`));
      } else {
        console.log('Usage: canvas workspace <save|restore|list>');
      }
    });

  program
    .command('knowledge')
    .description('Access team knowledge base')
    .argument('[action]', 'Action: search, add, list')
    .argument('[query]', 'Search query or content')
    .action(async (action?: string, query?: string) => {
      const kb = CanvasFeatures.getCollaboration().knowledgeBase;
      if (action === 'search' && query) {
        const results = await kb.search({ text: query, limit: 10 });
        results.forEach((r: any) => console.log(`- ${r.item?.title || 'Result'}`));
      } else if (action === 'list') {
        console.log('Knowledge base collections listed');
      } else {
        console.log('Usage: canvas knowledge <search|add|list> [query]');
      }
    });
}

async function main(): Promise<void> {
  // Setup initial config if needed
  await setupInitialConfig();

  // Load config and initialize systems
  const config = loadConfig();
  const featureManager = await initializeSystems();

  // Create program
  const program = new Command();

  program
    .name('canvas')
    .description('Canvas CLI - Production-ready AI assistant with advanced tools (defaults to chat mode)')
    .version(VERSION)
    .option('--sandbox <type>', 'Enable sandboxing (docker, podman, none)', 'none')
    .option('--no-tools', 'Disable all tools')
    .option('--checkpointing', 'Enable automatic checkpointing')
    .option('--web [port]', 'Start web UI server (default port: 3000)')
    .option('--plugins', 'Load plugins on startup');

  // Register all commands
  registerCoreCommands(program, config);
  registerFeatureCommands(program, featureManager);
  registerBuiltinCommands(program);

  // Default to chat command when no command provided
  if (process.argv.length === 2) {
    process.argv.push('chat');
  }

  await program.parseAsync();
}

main().catch(console.error);