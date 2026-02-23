import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { Tool } from '../types.js';
import chalk from 'chalk';
import axios from 'axios';
import spawn from 'cross-spawn';

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  repository?: string;
  tools?: Tool[];
  commands?: Record<string, string>;
  themes?: Record<string, any>;
  hooks?: {
    beforeCommand?: (cmd: string) => Promise<void>;
    afterCommand?: (cmd: string, result: any) => Promise<void>;
    beforeTool?: (tool: string, params: any) => Promise<void>;
    afterTool?: (tool: string, result: any) => Promise<void>;
  };
  dependencies?: Record<string, string>;
  main?: string;
  enabled?: boolean;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private pluginDir: string;
  private registryUrl = 'https://canvas-cli-registry.com/api'; // Future registry

  constructor() {
    this.pluginDir = path.join(os.homedir(), '.canvas-cli', 'plugins');
    fs.ensureDirSync(this.pluginDir);
    void this.loadPlugins();
  }

  private async loadPlugins(): Promise<void> {
    const pluginDirs = await fs.readdir(this.pluginDir);
    
    for (const dir of pluginDirs) {
      const pluginPath = path.join(this.pluginDir, dir);
      const manifestPath = path.join(pluginPath, 'plugin.json');
      
      if (await fs.pathExists(manifestPath)) {
        try {
          const manifest = await fs.readJSON(manifestPath);
          const plugin = await this.loadPlugin(pluginPath, manifest);
          this.plugins.set(plugin.name, plugin);
          console.log(chalk.green(`✓ Loaded plugin: ${plugin.name}`));
        } catch (error) {
          console.error(chalk.red(`Failed to load plugin from ${dir}:`), error);
        }
      }
    }
  }

  private async loadPlugin(pluginPath: string, manifest: any): Promise<Plugin> {
    const plugin: Plugin = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      repository: manifest.repository,
      dependencies: manifest.dependencies,
      enabled: manifest.enabled !== false
    };

    // Load main module if specified
    if (manifest.main) {
      const mainPath = path.join(pluginPath, manifest.main);
      try {
        const module = await import(mainPath);
        
        // Extract tools
        if (module.tools) {
          plugin.tools = module.tools;
        }
        
        // Extract commands
        if (module.commands) {
          plugin.commands = module.commands;
        }
        
        // Extract themes
        if (module.themes) {
          plugin.themes = module.themes;
        }
        
        // Extract hooks
        if (module.hooks) {
          plugin.hooks = module.hooks;
        }
      } catch (error) {
        console.error(chalk.yellow(`Warning: Could not load main module for ${plugin.name}`));
      }
    }

    return plugin;
  }

  async installPlugin(nameOrUrl: string): Promise<void> {
    console.log(chalk.blue(`Installing plugin: ${nameOrUrl}`));
    
    // Check if it's a local path
    if (await fs.pathExists(nameOrUrl)) {
      await this.installLocalPlugin(nameOrUrl);
      return;
    }
    
    // Check if it's a git URL
    if (nameOrUrl.startsWith('git@') || nameOrUrl.includes('.git')) {
      await this.installGitPlugin(nameOrUrl);
      return;
    }
    
    // Try to install from registry
    await this.installFromRegistry(nameOrUrl);
  }

  private async installLocalPlugin(pluginPath: string): Promise<void> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    
    if (!await fs.pathExists(manifestPath)) {
      throw new Error('Invalid plugin: plugin.json not found');
    }
    
    const manifest = await fs.readJSON(manifestPath);
    const targetPath = path.join(this.pluginDir, manifest.name);
    
    // Copy plugin to plugins directory
    await fs.copy(pluginPath, targetPath);
    
    // Install dependencies if needed
    if (manifest.dependencies) {
      await this.installDependencies(targetPath, manifest.dependencies);
    }
    
    // Load the plugin
    const plugin = await this.loadPlugin(targetPath, manifest);
    this.plugins.set(plugin.name, plugin);
    
    console.log(chalk.green(`✓ Installed plugin: ${plugin.name}`));
  }

  private async installGitPlugin(gitUrl: string): Promise<void> {
    const tempDir = path.join(os.tmpdir(), 'canvas-plugin-temp');
    await fs.ensureDir(tempDir);
    
    // Clone the repository
    const result = spawn.sync('git', ['clone', gitUrl, tempDir], {
      stdio: 'inherit'
    });
    
    if (result.status !== 0) {
      throw new Error('Failed to clone plugin repository');
    }
    
    // Install the plugin from the cloned repo
    await this.installLocalPlugin(tempDir);
    
    // Clean up
    await fs.remove(tempDir);
  }

  private async installFromRegistry(pluginName: string): Promise<void> {
    try {
      // Fetch plugin metadata from registry
      const response = await axios.get(`${this.registryUrl}/plugins/${pluginName}`);
      const metadata = response.data;
      
      // Download plugin archive
      const archiveResponse = await axios.get(metadata.downloadUrl, {
        responseType: 'arraybuffer'
      });
      
      // Extract and install
      const tempPath = path.join(os.tmpdir(), `canvas-plugin-${pluginName}`);
      await fs.writeFile(`${tempPath}.tar.gz`, archiveResponse.data);
      
      // Extract archive (would use tar or similar)
      // For now, this is a placeholder
      
      console.log(chalk.green(`✓ Downloaded plugin: ${pluginName}`));
    } catch (error) {
      console.error(chalk.red(`Failed to install from registry: ${pluginName}`));
      throw error;
    }
  }

  private async installDependencies(pluginPath: string, dependencies: Record<string, string>): Promise<void> {
    const deps = Object.entries(dependencies).map(([name, version]) => `${name}@${version}`);
    
    if (deps.length === 0) return;
    
    console.log(chalk.blue('Installing plugin dependencies...'));
    
    const result = spawn.sync('npm', ['install', ...deps], {
      cwd: pluginPath,
      stdio: 'inherit'
    });
    
    if (result.status !== 0) {
      throw new Error('Failed to install plugin dependencies');
    }
  }

  async uninstallPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    // Remove plugin directory
    const pluginPath = path.join(this.pluginDir, pluginName);
    await fs.remove(pluginPath);
    
    // Remove from loaded plugins
    this.plugins.delete(pluginName);
    
    console.log(chalk.green(`✓ Uninstalled plugin: ${pluginName}`));
  }

  async enablePlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    plugin.enabled = true;
    
    // Update manifest
    const manifestPath = path.join(this.pluginDir, pluginName, 'plugin.json');
    const manifest = await fs.readJSON(manifestPath);
    manifest.enabled = true;
    await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
    
    console.log(chalk.green(`✓ Enabled plugin: ${pluginName}`));
  }

  async disablePlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }
    
    plugin.enabled = false;
    
    // Update manifest
    const manifestPath = path.join(this.pluginDir, pluginName, 'plugin.json');
    const manifest = await fs.readJSON(manifestPath);
    manifest.enabled = false;
    await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
    
    console.log(chalk.yellow(`⚠ Disabled plugin: ${pluginName}`));
  }

  listPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getEnabledPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  // Get all tools from enabled plugins
  getPluginTools(): Tool[] {
    const tools: Tool[] = [];
    
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.tools) {
        tools.push(...plugin.tools);
      }
    }
    
    return tools;
  }

  // Get all commands from enabled plugins
  getPluginCommands(): Record<string, string> {
    const commands: Record<string, string> = {};
    
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.commands) {
        Object.assign(commands, plugin.commands);
      }
    }
    
    return commands;
  }

  // Execute plugin hooks
  async executeHook(hookName: string, ...args: any[]): Promise<void> {
    for (const plugin of this.getEnabledPlugins()) {
      if (plugin.hooks && plugin.hooks[hookName as keyof typeof plugin.hooks]) {
        try {
          const hook = plugin.hooks[hookName as keyof typeof plugin.hooks];
          if (hook) {
            await (hook as any)(...args);
          }
        } catch (error) {
          console.error(chalk.red(`Hook error in ${plugin.name}:`), error);
        }
      }
    }
  }

  // Create a new plugin template
  async createPlugin(name: string, outputPath?: string): Promise<void> {
    const pluginPath = outputPath || path.join(process.cwd(), name);
    
    await fs.ensureDir(pluginPath);
    
    // Create plugin manifest
    const manifest = {
      name,
      version: '1.0.0',
      description: `A Canvas CLI plugin`,
      main: 'index.js',
      author: '',
      repository: '',
      dependencies: {},
      enabled: true
    };
    
    await fs.writeJSON(path.join(pluginPath, 'plugin.json'), manifest, { spaces: 2 });
    
    // Create main module
    const mainModule = `// Canvas CLI Plugin: ${name}

export const tools = [];

export const commands = {};

export const themes = {};

export const hooks = {
  async beforeCommand(cmd) {
    // Called before any command execution
  },
  
  async afterCommand(cmd, result) {
    // Called after command execution
  },
  
  async beforeTool(tool, params) {
    // Called before tool execution
  },
  
  async afterTool(tool, result) {
    // Called after tool execution
  }
};
`;
    
    await fs.writeFile(path.join(pluginPath, 'index.js'), mainModule);
    
    // Create README
    const readme = `# ${name}

A plugin for Canvas CLI.

## Installation

\`\`\`bash
canvas plugin install ${name}
\`\`\`

## Features

- List your plugin features here

## Usage

Describe how to use your plugin.
`;
    
    await fs.writeFile(path.join(pluginPath, 'README.md'), readme);
    
    console.log(chalk.green(`✓ Created plugin template: ${name}`));
    console.log(chalk.dim(`  Location: ${pluginPath}`));
  }
}