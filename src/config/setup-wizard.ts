import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

export interface CanvasConfig {
  ollama: {
    baseUrl: string;
    models: string[];
    defaultModel: string;
    timeout: number;
    maxRetries: number;
  };
  openai?: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
  anthropic?: {
    apiKey: string;
    model: string;
  };
  google?: {
    apiKey: string;
    model: string;
  };
  ui: {
    theme: string;
    vimMode: boolean;
    autoComplete: boolean;
    syntaxHighlighting: boolean;
    showLineNumbers: boolean;
  };
  features: {
    autoExecute: boolean;
    confirmBeforeExecute: boolean;
    saveHistory: boolean;
    maxHistorySize: number;
    enableTelemetry: boolean;
  };
  paths: {
    workspaceRoot: string;
    sessionsDir: string;
    logsDir: string;
    cacheDir: string;
    templatesDir: string;
  };
  advanced: {
    debugMode: boolean;
    verboseLogging: boolean;
    experimentalFeatures: boolean;
    parallelExecution: boolean;
    maxConcurrentTasks: number;
  };
  version: string;
  firstRun: boolean;
}

export class ConfigSetupWizard {
  private configPath: string;
  private config: CanvasConfig;

  constructor() {
    this.configPath = path.join(os.homedir(), '.canvas-cli', 'config.json');
    this.config = this.loadExistingConfig();
  }

  private loadExistingConfig(): CanvasConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        return fs.readJsonSync(this.configPath);
      }
    } catch (error) {
      logger.warn('Failed to load existing config, using defaults');
    }

    return this.getDefaultConfig();
  }

  private getDefaultConfig(): CanvasConfig {
    const homeDir = os.homedir();
    const canvasDir = path.join(homeDir, '.canvas-cli');

    return {
      ollama: {
        baseUrl: 'http://localhost:11434',
        models: [],
        defaultModel: 'llama3.2:latest',
        timeout: 120000,
        maxRetries: 3
      },
      ui: {
        theme: 'default',
        vimMode: false,
        autoComplete: true,
        syntaxHighlighting: true,
        showLineNumbers: false
      },
      features: {
        autoExecute: false,
        confirmBeforeExecute: true,
        saveHistory: true,
        maxHistorySize: 1000,
        enableTelemetry: false
      },
      paths: {
        workspaceRoot: process.cwd(),
        sessionsDir: path.join(canvasDir, 'sessions'),
        logsDir: path.join(canvasDir, 'logs'),
        cacheDir: path.join(canvasDir, 'cache'),
        templatesDir: path.join(canvasDir, 'templates')
      },
      advanced: {
        debugMode: false,
        verboseLogging: false,
        experimentalFeatures: false,
        parallelExecution: true,
        maxConcurrentTasks: 5
      },
      version: '2.0.0',
      firstRun: true
    };
  }

  public async runSetupWizard(): Promise<CanvasConfig> {
    console.clear();
    console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                  🎨 Canvas CLI Setup Wizard                  ║
║                                                              ║
║         Configure your AI-powered development environment    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`));

    const setupChoice = await inquirer.prompt([
      {
        type: 'list',
        name: 'setupType',
        message: 'How would you like to configure Canvas CLI?',
        choices: [
          { name: '🚀 Quick Setup (Recommended)', value: 'quick' },
          { name: '⚙️  Advanced Setup (All Options)', value: 'advanced' },
          { name: '📝 Edit Config File Directly', value: 'edit' },
          { name: '🔄 Reset to Defaults', value: 'reset' },
          { name: '⏭️  Skip Setup', value: 'skip' }
        ]
      }
    ]);

    switch (setupChoice.setupType) {
      case 'quick':
        await this.quickSetup();
        break;
      case 'advanced':
        await this.advancedSetup();
        break;
      case 'edit':
        await this.editConfigFile();
        break;
      case 'reset':
        this.config = this.getDefaultConfig();
        await this.saveConfig();
        console.log(chalk.green('✅ Configuration reset to defaults'));
        break;
      case 'skip':
        console.log(chalk.yellow('⚠️  Skipping setup. You can run /config setup later.'));
        break;
    }

    this.config.firstRun = false;
    await this.saveConfig();
    return this.config;
  }

  private async quickSetup(): Promise<void> {
    console.log(chalk.blue('\n📋 Quick Setup - Essential Configuration\n'));

    // Ollama Configuration
    const ollamaConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Ollama API URL:',
        default: this.config.ollama.baseUrl,
        validate: (input) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        }
      },
      {
        type: 'confirm',
        name: 'testConnection',
        message: 'Test Ollama connection now?',
        default: true
      }
    ]);

    this.config.ollama.baseUrl = ollamaConfig.baseUrl;

    if (ollamaConfig.testConnection) {
      await this.testOllamaConnection();
    }

    // Model Selection
    const models = await this.fetchAvailableModels();
    if (models.length > 0) {
      const modelChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'defaultModel',
          message: 'Select default model:',
          choices: models.map(m => ({ name: m, value: m }))
        }
      ]);
      this.config.ollama.defaultModel = modelChoice.defaultModel;
      this.config.ollama.models = models;
    }

    // UI Preferences
    const uiConfig = await inquirer.prompt([
      {
        type: 'list',
        name: 'theme',
        message: 'Select UI theme:',
        choices: [
          { name: '🌙 Dark', value: 'dark' },
          { name: '☀️  Light', value: 'light' },
          { name: '🎨 Canvas (Custom)', value: 'canvas' },
          { name: '📺 Matrix', value: 'matrix' },
          { name: '🌊 Ocean', value: 'ocean' }
        ],
        default: this.config.ui.theme
      },
      {
        type: 'confirm',
        name: 'vimMode',
        message: 'Enable Vim keybindings?',
        default: this.config.ui.vimMode
      }
    ]);

    this.config.ui.theme = uiConfig.theme;
    this.config.ui.vimMode = uiConfig.vimMode;

    console.log(chalk.green('\n✅ Quick setup complete!'));
  }

  private async advancedSetup(): Promise<void> {
    console.log(chalk.blue('\n⚙️  Advanced Setup - Complete Configuration\n'));

    // Ollama Settings
    console.log(chalk.yellow('\n🤖 Ollama Configuration'));
    const ollamaConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Ollama API URL:',
        default: this.config.ollama.baseUrl
      },
      {
        type: 'number',
        name: 'timeout',
        message: 'Request timeout (ms):',
        default: this.config.ollama.timeout
      },
      {
        type: 'number',
        name: 'maxRetries',
        message: 'Max retry attempts:',
        default: this.config.ollama.maxRetries
      }
    ]);

    Object.assign(this.config.ollama, ollamaConfig);

    // Optional API Keys
    console.log(chalk.yellow('\n🔑 API Providers (Optional)'));
    const apiProviders = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configureOpenAI',
        message: 'Configure OpenAI?',
        default: false
      },
      {
        type: 'confirm',
        name: 'configureAnthropic',
        message: 'Configure Anthropic (Claude)?',
        default: false
      },
      {
        type: 'confirm',
        name: 'configureGoogle',
        message: 'Configure Google AI?',
        default: false
      }
    ]);

    if (apiProviders.configureOpenAI) {
      const openaiConfig = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'OpenAI API Key:',
          mask: '*'
        },
        {
          type: 'input',
          name: 'model',
          message: 'Default model:',
          default: 'gpt-4-turbo-preview'
        }
      ]);
      this.config.openai = openaiConfig;
    }

    if (apiProviders.configureAnthropic) {
      const anthropicConfig = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Anthropic API Key:',
          mask: '*'
        },
        {
          type: 'input',
          name: 'model',
          message: 'Default model:',
          default: 'claude-3-opus-20240229'
        }
      ]);
      this.config.anthropic = anthropicConfig;
    }

    if (apiProviders.configureGoogle) {
      const googleConfig = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Google AI API Key:',
          mask: '*'
        },
        {
          type: 'input',
          name: 'model',
          message: 'Default model:',
          default: 'gemini-pro'
        }
      ]);
      this.config.google = googleConfig;
    }

    // UI Configuration
    console.log(chalk.yellow('\n🎨 UI Configuration'));
    const uiConfig = await inquirer.prompt([
      {
        type: 'list',
        name: 'theme',
        message: 'UI Theme:',
        choices: ['default', 'dark', 'light', 'canvas', 'matrix', 'ocean', 'forest'],
        default: this.config.ui.theme
      },
      {
        type: 'confirm',
        name: 'vimMode',
        message: 'Enable Vim mode?',
        default: this.config.ui.vimMode
      },
      {
        type: 'confirm',
        name: 'autoComplete',
        message: 'Enable auto-completion?',
        default: this.config.ui.autoComplete
      },
      {
        type: 'confirm',
        name: 'syntaxHighlighting',
        message: 'Enable syntax highlighting?',
        default: this.config.ui.syntaxHighlighting
      },
      {
        type: 'confirm',
        name: 'showLineNumbers',
        message: 'Show line numbers in code?',
        default: this.config.ui.showLineNumbers
      }
    ]);

    Object.assign(this.config.ui, uiConfig);

    // Features Configuration
    console.log(chalk.yellow('\n⚡ Features Configuration'));
    const featuresConfig = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'autoExecute',
        message: 'Auto-execute commands?',
        default: this.config.features.autoExecute
      },
      {
        type: 'confirm',
        name: 'confirmBeforeExecute',
        message: 'Confirm before executing?',
        default: this.config.features.confirmBeforeExecute
      },
      {
        type: 'confirm',
        name: 'saveHistory',
        message: 'Save command history?',
        default: this.config.features.saveHistory
      },
      {
        type: 'number',
        name: 'maxHistorySize',
        message: 'Max history entries:',
        default: this.config.features.maxHistorySize
      }
    ]);

    Object.assign(this.config.features, featuresConfig);

    // Advanced Settings
    console.log(chalk.yellow('\n🔧 Advanced Settings'));
    const advancedConfig = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'debugMode',
        message: 'Enable debug mode?',
        default: this.config.advanced.debugMode
      },
      {
        type: 'confirm',
        name: 'verboseLogging',
        message: 'Enable verbose logging?',
        default: this.config.advanced.verboseLogging
      },
      {
        type: 'confirm',
        name: 'experimentalFeatures',
        message: 'Enable experimental features?',
        default: this.config.advanced.experimentalFeatures
      },
      {
        type: 'confirm',
        name: 'parallelExecution',
        message: 'Enable parallel task execution?',
        default: this.config.advanced.parallelExecution
      },
      {
        type: 'number',
        name: 'maxConcurrentTasks',
        message: 'Max concurrent tasks:',
        default: this.config.advanced.maxConcurrentTasks,
        when: (answers) => answers.parallelExecution
      }
    ]);

    Object.assign(this.config.advanced, advancedConfig);

    console.log(chalk.green('\n✅ Advanced setup complete!'));
  }

  private async testOllamaConnection(): Promise<boolean> {
    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    
    const interval = setInterval(() => {
      process.stdout.write(`\r${spinner[i]} Testing Ollama connection...`);
      i = (i + 1) % spinner.length;
    }, 100);

    try {
      const response = await fetch(`${this.config.ollama.baseUrl}/api/tags`);
      clearInterval(interval);
      
      if (response.ok) {
        console.log('\r✅ Ollama connection successful!    ');
        return true;
      } else {
        console.log('\r❌ Ollama connection failed!        ');
        return false;
      }
    } catch (error) {
      clearInterval(interval);
      console.log('\r❌ Could not connect to Ollama     ');
      console.log(chalk.yellow('\n⚠️  Make sure Ollama is running: ollama serve'));
      return false;
    }
  }

  private async fetchAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.ollama.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        return data.models?.map((m: any) => m.name) || [];
      }
    } catch (error) {
      logger.error('Failed to fetch models', error);
    }
    return [];
  }

  private async editConfigFile(): Promise<void> {
    await this.saveConfig();
    
    const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
    
    console.log(chalk.blue(`\n📝 Opening config file in ${editor}...`));
    console.log(chalk.gray(`Path: ${this.configPath}`));
    
    const child = spawn(editor, [this.configPath], { stdio: 'inherit' });
    
    return new Promise((resolve) => {
      child.on('exit', () => {
        this.config = this.loadExistingConfig();
        console.log(chalk.green('✅ Configuration updated'));
        resolve();
      });
    });
  }

  private async saveConfig(): Promise<void> {
    await fs.ensureDir(path.dirname(this.configPath));
    await fs.writeJson(this.configPath, this.config, { spaces: 2 });
  }

  public async interactiveConfig(): Promise<void> {
    console.clear();
    
    const configMenu = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Canvas CLI Configuration',
        choices: [
          { name: '📋 View Current Configuration', value: 'view' },
          { name: '🔧 Modify Settings', value: 'modify' },
          { name: '🤖 Configure Ollama', value: 'ollama' },
          { name: '🔑 Configure API Providers', value: 'api' },
          { name: '🎨 UI Preferences', value: 'ui' },
          { name: '⚡ Feature Toggles', value: 'features' },
          { name: '📁 Path Settings', value: 'paths' },
          { name: '🔬 Advanced Options', value: 'advanced' },
          { name: '🔄 Reset to Defaults', value: 'reset' },
          { name: '💾 Save and Exit', value: 'save' },
          { name: '❌ Cancel', value: 'cancel' }
        ]
      }
    ]);

    switch (configMenu.action) {
      case 'view':
        this.displayConfig();
        await this.interactiveConfig();
        break;
      case 'modify':
        await this.modifySettings();
        break;
      case 'ollama':
        await this.configureOllama();
        break;
      case 'api':
        await this.configureAPIProviders();
        break;
      case 'ui':
        await this.configureUI();
        break;
      case 'features':
        await this.configureFeatures();
        break;
      case 'paths':
        await this.configurePaths();
        break;
      case 'advanced':
        await this.configureAdvanced();
        break;
      case 'reset':
        this.config = this.getDefaultConfig();
        await this.saveConfig();
        console.log(chalk.green('✅ Configuration reset to defaults'));
        break;
      case 'save':
        await this.saveConfig();
        console.log(chalk.green('✅ Configuration saved'));
        break;
      case 'cancel':
        console.log(chalk.yellow('Configuration changes discarded'));
        break;
    }
  }

  private displayConfig(): void {
    console.log(chalk.cyan.bold('\n📋 Current Configuration:\n'));
    console.log(JSON.stringify(this.config, null, 2));
    console.log('\nPress Enter to continue...');
  }

  private async modifySettings(): Promise<void> {
    await this.runSetupWizard();
  }

  private async configureOllama(): Promise<void> {
    const ollamaConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Ollama API URL:',
        default: this.config.ollama.baseUrl
      },
      {
        type: 'input',
        name: 'defaultModel',
        message: 'Default model:',
        default: this.config.ollama.defaultModel
      },
      {
        type: 'number',
        name: 'timeout',
        message: 'Timeout (ms):',
        default: this.config.ollama.timeout
      },
      {
        type: 'confirm',
        name: 'test',
        message: 'Test connection?',
        default: true
      }
    ]);

    Object.assign(this.config.ollama, ollamaConfig);
    
    if (ollamaConfig.test) {
      await this.testOllamaConnection();
    }

    await this.saveConfig();
    await this.interactiveConfig();
  }

  private async configureAPIProviders(): Promise<void> {
    // Implementation for API provider configuration
    console.log(chalk.yellow('API Provider configuration...'));
    await this.interactiveConfig();
  }

  private async configureUI(): Promise<void> {
    const uiConfig = await inquirer.prompt([
      {
        type: 'list',
        name: 'theme',
        message: 'Select theme:',
        choices: ['default', 'dark', 'light', 'canvas', 'matrix', 'ocean'],
        default: this.config.ui.theme
      },
      {
        type: 'confirm',
        name: 'vimMode',
        message: 'Enable Vim mode?',
        default: this.config.ui.vimMode
      },
      {
        type: 'confirm',
        name: 'syntaxHighlighting',
        message: 'Enable syntax highlighting?',
        default: this.config.ui.syntaxHighlighting
      }
    ]);

    Object.assign(this.config.ui, uiConfig);
    await this.saveConfig();
    await this.interactiveConfig();
  }

  private async configureFeatures(): Promise<void> {
    const featuresConfig = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'autoExecute',
        message: 'Auto-execute commands?',
        default: this.config.features.autoExecute
      },
      {
        type: 'confirm',
        name: 'confirmBeforeExecute',
        message: 'Confirm before execute?',
        default: this.config.features.confirmBeforeExecute
      },
      {
        type: 'confirm',
        name: 'saveHistory',
        message: 'Save history?',
        default: this.config.features.saveHistory
      }
    ]);

    Object.assign(this.config.features, featuresConfig);
    await this.saveConfig();
    await this.interactiveConfig();
  }

  private async configurePaths(): Promise<void> {
    const pathsConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'workspaceRoot',
        message: 'Workspace root:',
        default: this.config.paths.workspaceRoot
      },
      {
        type: 'input',
        name: 'sessionsDir',
        message: 'Sessions directory:',
        default: this.config.paths.sessionsDir
      },
      {
        type: 'input',
        name: 'logsDir',
        message: 'Logs directory:',
        default: this.config.paths.logsDir
      }
    ]);

    Object.assign(this.config.paths, pathsConfig);
    await this.saveConfig();
    await this.interactiveConfig();
  }

  private async configureAdvanced(): Promise<void> {
    const advancedConfig = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'debugMode',
        message: 'Enable debug mode?',
        default: this.config.advanced.debugMode
      },
      {
        type: 'confirm',
        name: 'experimentalFeatures',
        message: 'Enable experimental features?',
        default: this.config.advanced.experimentalFeatures
      },
      {
        type: 'number',
        name: 'maxConcurrentTasks',
        message: 'Max concurrent tasks:',
        default: this.config.advanced.maxConcurrentTasks
      }
    ]);

    Object.assign(this.config.advanced, advancedConfig);
    await this.saveConfig();
    await this.interactiveConfig();
  }

  public getConfig(): CanvasConfig {
    return this.config;
  }
}

// Export singleton instance
export const configWizard = new ConfigSetupWizard();