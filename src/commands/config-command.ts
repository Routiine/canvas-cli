import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { loadConfig, saveConfig } from '../config.js';
import { logger } from '../utils/logger.js';

export class ConfigCommand {
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.canvas-cli', 'config.json');
  }

  async execute(args: string): Promise<string> {
    const parts = args.trim().split(' ').filter(Boolean);
    const subCommand = parts[0] || 'menu'; // Default to menu if no subcommand

    switch (subCommand) {
      case 'menu':
      case 'interactive':
      case '':
        await this.showInteractiveMenu();
        return '';
      
      case 'show':
      case 'list':
        return this.showConfig();
      
      case 'set':
        return await this.setConfig(parts.slice(1));
      
      case 'get':
        return this.getConfig(parts[1]);
      
      case 'ollama':
        await this.configureOllama();
        return '';
      
      case 'test':
        const testResult = await this.testOllama();
        return testResult;
      
      case 'reset':
        return await this.resetConfig();
      
      case 'edit':
        await this.editConfigFile();
        return '';
      
      case 'help':
        return this.showHelp();
      
      default:
        return this.showHelp();
    }
  }

  private async showInteractiveMenu(): Promise<void> {
    console.clear();
    console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                  🎨 Canvas CLI Configuration                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`));

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to configure?',
        choices: [
          new inquirer.Separator('── Ollama Settings ──'),
          { name: '🤖 Configure Ollama Connection', value: 'ollama' },
          { name: '🔍 Test Ollama Connection', value: 'test' },
          { name: '📦 Select Default Model', value: 'model' },
          new inquirer.Separator('── UI Settings ──'),
          { name: '🎨 Change Theme', value: 'theme' },
          { name: '⌨️  Toggle Vim Mode', value: 'vim' },
          { name: '✨ Syntax Highlighting', value: 'syntax' },
          new inquirer.Separator('── Configuration ──'),
          { name: '📋 View Current Config', value: 'view' },
          { name: '📝 Edit Config File', value: 'edit' },
          { name: '🔄 Reset to Defaults', value: 'reset' },
          new inquirer.Separator(),
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);

    switch (action) {
      case 'ollama':
        await this.configureOllama();
        await this.showInteractiveMenu();
        return;
      
      case 'test':
        const result = await this.testOllama();
        console.log(result);
        console.log('\nPress Enter to continue...');
        await this.waitForEnter();
        await this.showInteractiveMenu();
        return;
      
      case 'model':
        await this.selectModel();
        await this.showInteractiveMenu();
        return;
      
      case 'theme':
        await this.changeTheme();
        await this.showInteractiveMenu();
        return;
      
      case 'vim':
        await this.toggleVimMode();
        await this.showInteractiveMenu();
        return;
      
      case 'syntax':
        await this.toggleSyntaxHighlighting();
        await this.showInteractiveMenu();
        return;
      
      case 'view':
        console.log(this.showConfig());
        console.log('\nPress Enter to continue...');
        await this.waitForEnter();
        await this.showInteractiveMenu();
        return;
      
      case 'edit':
        await this.editConfigFile();
        await this.showInteractiveMenu();
        return;
      
      case 'reset':
        await this.resetConfig();
        await this.showInteractiveMenu();
        return;
      
      case 'exit':
        console.log(chalk.green('Configuration saved!'));
        return;
      
      default:
        console.log(chalk.yellow('Invalid option'));
        return;
    }
  }

  private async configureOllama(): Promise<void> {
    const config = loadConfig();
    
    console.log(chalk.cyan.bold('\n🤖 Ollama Configuration\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: 'Ollama API URL:',
        default: config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434',
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
        name: 'testNow',
        message: 'Test connection now?',
        default: true
      }
    ]);

    // Update config
    config.ollamaUrl = answers.url;
    if (!config.ollama) {
      config.ollama = {
        baseUrl: answers.url,
        defaultModel: config.model || config.defaultModel || 'llama3.2:latest'
      };
    } else {
      config.ollama.baseUrl = answers.url;
    }

    saveConfig(config);
    console.log(chalk.green('✅ Ollama URL updated'));

    if (answers.testNow) {
      const testResult = await this.testOllama();
      console.log(testResult);
    }
  }

  private async selectModel(): Promise<void> {
    const config = loadConfig();
    const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';

    console.log(chalk.cyan('Fetching available models...'));
    
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      if (!response.ok) {
        console.log(chalk.red('Failed to fetch models'));
        return;
      }

      const data = await response.json();
      const models = data.models || [];

      if (models.length === 0) {
        console.log(chalk.yellow('No models found. Please pull a model first:'));
        console.log(chalk.gray('  ollama pull llama3.2'));
        return;
      }

      const { selectedModel } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedModel',
          message: 'Select default model:',
          choices: models.map((m: any) => ({
            name: `${m.name} (${this.formatSize(m.size)})`,
            value: m.name
          }))
        }
      ]);

      config.model = selectedModel;
      config.defaultModel = selectedModel;
      if (!config.ollama) {
        config.ollama = {
          baseUrl: config.ollamaUrl || ollamaUrl,
          defaultModel: selectedModel
        };
      } else {
        config.ollama.defaultModel = selectedModel;
      }

      saveConfig(config);
      console.log(chalk.green(`✅ Default model set to: ${selectedModel}`));
    } catch (error: any) {
      console.log(chalk.red(`Failed to connect to Ollama: ${error.message}`));
    }
  }

  private async changeTheme(): Promise<void> {
    const config = loadConfig();

    const { theme } = await inquirer.prompt([
      {
        type: 'list',
        name: 'theme',
        message: 'Select theme:',
        choices: [
          { name: '🌙 Dark', value: 'dark' },
          { name: '☀️  Light', value: 'light' },
          { name: '🎨 Canvas', value: 'canvas' },
          { name: '📺 Matrix', value: 'matrix' },
          { name: '🌊 Ocean', value: 'ocean' },
          { name: '🌲 Forest', value: 'forest' },
          { name: '🌅 Sunset', value: 'sunset' },
          { name: '⚫ Minimal', value: 'minimal' }
        ],
        default: config.theme || 'default'
      }
    ]);

    config.theme = theme;
    if (!config.ui) {
      config.ui = {
        theme: theme,
        vimMode: config.vimMode || false
      };
    } else {
      config.ui.theme = theme;
    }

    saveConfig(config);
    console.log(chalk.green(`✅ Theme changed to: ${theme}`));
  }

  private async toggleVimMode(): Promise<void> {
    const config = loadConfig();
    const currentState = config.vimMode || config.ui?.vimMode || false;

    const { vimMode } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'vimMode',
        message: `Vim mode is currently ${currentState ? 'enabled' : 'disabled'}. Toggle?`,
        default: !currentState
      }
    ]);

    config.vimMode = vimMode;
    if (!config.ui) {
      config.ui = {
        theme: config.theme || 'default',
        vimMode: vimMode
      };
    } else {
      config.ui.vimMode = vimMode;
    }

    saveConfig(config);
    console.log(chalk.green(`✅ Vim mode ${vimMode ? 'enabled' : 'disabled'}`));
  }

  private async toggleSyntaxHighlighting(): Promise<void> {
    const config = loadConfig();
    const currentState = config.ui?.syntaxHighlighting !== false;

    const { syntaxHighlighting } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'syntaxHighlighting',
        message: `Syntax highlighting is currently ${currentState ? 'enabled' : 'disabled'}. Toggle?`,
        default: !currentState
      }
    ]);

    if (!config.ui) {
      config.ui = {
        theme: config.theme || 'default',
        vimMode: config.vimMode || false,
        syntaxHighlighting: syntaxHighlighting
      };
    } else {
      config.ui.syntaxHighlighting = syntaxHighlighting;
    }

    saveConfig(config);
    console.log(chalk.green(`✅ Syntax highlighting ${syntaxHighlighting ? 'enabled' : 'disabled'}`));
  }

  private showConfig(): string {
    const config = loadConfig();
    
    // Check if config is empty
    if (!config || Object.keys(config).length === 0) {
      return chalk.yellow('⚠️  No configuration found.\n') +
        chalk.gray('Run /config to set up Canvas CLI.\n');
    }
    
    let output = chalk.cyan.bold('📋 Current Configuration:\n\n');
    
    // Ollama Settings (only show if configured)
    if (config.ollamaUrl || config.ollama?.baseUrl) {
      output += chalk.yellow('🤖 Ollama Settings:\n');
      output += chalk.gray(`  URL: ${config.ollamaUrl || config.ollama?.baseUrl}\n`);
      if (config.model || config.ollama?.defaultModel) {
        output += chalk.gray(`  Model: ${config.model || config.ollama?.defaultModel}\n`);
      }
      if (config.ollama?.timeout) {
        output += chalk.gray(`  Timeout: ${config.ollama.timeout}ms\n`);
      }
    } else {
      output += chalk.yellow('🤖 Ollama: ') + chalk.red('Not configured\n');
    }
    
    // UI Settings (only show if configured)
    if (config.theme || config.ui?.theme || config.vimMode !== undefined || config.ui?.vimMode !== undefined) {
      output += chalk.yellow('\n🎨 UI Settings:\n');
      if (config.theme || config.ui?.theme) {
        output += chalk.gray(`  Theme: ${config.theme || config.ui?.theme}\n`);
      }
      if (config.vimMode !== undefined || config.ui?.vimMode !== undefined) {
        output += chalk.gray(`  Vim Mode: ${config.vimMode || config.ui?.vimMode ? 'enabled' : 'disabled'}\n`);
      }
      if (config.ui?.syntaxHighlighting !== undefined) {
        output += chalk.gray(`  Syntax Highlighting: ${config.ui.syntaxHighlighting ? 'enabled' : 'disabled'}\n`);
      }
    }
    
    // Features (only show if configured)
    if (config.autoExecute !== undefined || config.features?.autoExecute !== undefined || 
        config.features?.saveHistory !== undefined) {
      output += chalk.yellow('\n⚡ Features:\n');
      if (config.autoExecute !== undefined || config.features?.autoExecute !== undefined) {
        output += chalk.gray(`  Auto Execute: ${config.autoExecute || config.features?.autoExecute ? 'enabled' : 'disabled'}\n`);
      }
      if (config.features?.saveHistory !== undefined) {
        output += chalk.gray(`  Save History: ${config.features.saveHistory ? 'enabled' : 'disabled'}\n`);
      }
    }
    
    // Always show config file path
    output += chalk.yellow('\n📁 Config File:\n');
    output += chalk.gray(`  ${this.configPath}\n`);
    
    return output;
  }

  private async setConfig(args: string[]): Promise<string> {
    if (args.length < 2) {
      return chalk.red('Usage: /config set <key> <value>\n') +
        chalk.gray('Examples:\n') +
        chalk.gray('  /config set ollama.url http://localhost:11434\n') +
        chalk.gray('  /config set model llama3.2\n') +
        chalk.gray('  /config set theme dark\n');
    }

    const [key, ...values] = args;
    const value = values.join(' ');
    const config = loadConfig();

    // Handle nested keys
    const keys = key.split('.');
    let current: any = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    // Set the value
    const finalKey = keys[keys.length - 1];
    
    // Handle boolean values
    if (value === 'true' || value === 'false') {
      current[finalKey] = value === 'true';
    } else if (!isNaN(Number(value))) {
      current[finalKey] = Number(value);
    } else {
      current[finalKey] = value;
    }

    // Special handling for common keys
    if (key === 'ollamaUrl' || key === 'ollama.url') {
      config.ollamaUrl = value;
      if (!config.ollama) {
        config.ollama = {
          baseUrl: value,
          defaultModel: config.model || 'llama3.2:latest'
        };
      } else {
        config.ollama.baseUrl = value;
      }
    }
    
    if (key === 'model' || key === 'ollama.model') {
      config.model = value;
      config.defaultModel = value;
      if (!config.ollama) {
        config.ollama = {
          baseUrl: config.ollamaUrl || 'http://localhost:11434',
          defaultModel: value
        };
      } else {
        config.ollama.defaultModel = value;
      }
    }

    saveConfig(config);
    return chalk.green(`✅ Set ${key} = ${value}`);
  }

  private getConfig(key: string): string {
    if (!key) {
      return chalk.red('Usage: /config get <key>');
    }

    const config = loadConfig();
    const keys = key.split('.');
    let value: any = config;

    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }

    if (value !== undefined) {
      return chalk.green(`${key}: ${JSON.stringify(value, null, 2)}`);
    } else {
      return chalk.yellow(`Key not found: ${key}`);
    }
  }

  private async testOllama(): Promise<string> {
    const config = loadConfig();
    const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
    
    console.log(chalk.cyan(`Testing connection to Ollama at ${ollamaUrl}...`));
    
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`);
      
      if (!response.ok) {
        return chalk.red(`❌ Ollama responded with status: ${response.status}`);
      }

      const data = await response.json();
      const models = data.models || [];
      
      let output = chalk.green('✅ Ollama connection successful!\n');
      
      if (models.length > 0) {
        output += chalk.cyan('\nAvailable models:\n');
        models.forEach((model: any) => {
          const current = (model.name === config.model || model.name === config.ollama?.defaultModel) ? ' (current)' : '';
          output += chalk.gray(`  • ${model.name}${current} - ${this.formatSize(model.size)}\n`);
        });
      } else {
        output += chalk.yellow('\n⚠️  No models found. Pull a model first:\n');
        output += chalk.gray('  ollama pull llama3.2\n');
      }
      
      return output;
    } catch (error: any) {
      return chalk.red(`❌ Could not connect to Ollama: ${error.message}\n`) +
        chalk.gray('Make sure Ollama is running:\n') +
        chalk.gray('  ollama serve\n');
    }
  }

  private async resetConfig(): Promise<string> {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset to default configuration?',
        default: false
      }
    ]);

    if (confirm) {
      const defaultConfig = {
        ollamaUrl: 'http://localhost:11434',
        model: 'llama3.2:latest',
        theme: 'default',
        vimMode: false,
        autoExecute: false,
        ollama: {
          baseUrl: 'http://localhost:11434',
          defaultModel: 'llama3.2:latest',
          timeout: 120000
        },
        ui: {
          theme: 'default',
          vimMode: false,
          syntaxHighlighting: true
        },
        features: {
          autoExecute: false,
          saveHistory: true
        }
      };

      saveConfig(defaultConfig);
      return chalk.green('✅ Configuration reset to defaults');
    } else {
      return chalk.yellow('Reset cancelled');
    }
  }

  private async editConfigFile(): Promise<void> {
    const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'nano');
    
    console.log(chalk.cyan(`Opening config file in ${editor}...`));
    console.log(chalk.gray(`Path: ${this.configPath}`));
    
    const child = spawn(editor, [this.configPath], { stdio: 'inherit' });
    
    return new Promise((resolve) => {
      child.on('exit', () => {
        console.log(chalk.green('✅ Configuration file saved'));
        resolve();
      });
    });
  }

  private showHelp(): string {
    return chalk.cyan.bold('Canvas CLI Configuration Commands:\n\n') +
      chalk.yellow('Interactive:\n') +
      chalk.gray('  /config          - Open interactive configuration menu\n') +
      chalk.gray('  /config menu     - Same as above\n\n') +
      chalk.yellow('Quick Commands:\n') +
      chalk.gray('  /config show     - Display current configuration\n') +
      chalk.gray('  /config test     - Test Ollama connection\n') +
      chalk.gray('  /config ollama   - Configure Ollama settings\n') +
      chalk.gray('  /config edit     - Open config file in editor\n') +
      chalk.gray('  /config reset    - Reset to default configuration\n\n') +
      chalk.yellow('Set Values:\n') +
      chalk.gray('  /config set <key> <value>  - Set configuration value\n') +
      chalk.gray('  /config get <key>          - Get configuration value\n\n') +
      chalk.yellow('Examples:\n') +
      chalk.gray('  /config set ollama.url http://localhost:11434\n') +
      chalk.gray('  /config set model llama3.2:latest\n') +
      chalk.gray('  /config set theme dark\n') +
      chalk.gray('  /config set vimMode true\n');
  }

  private formatSize(bytes: number): string {
    if (!bytes) return 'unknown size';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  }

  private async waitForEnter(): Promise<void> {
    return new Promise((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }
}

export const configCommand = new ConfigCommand();