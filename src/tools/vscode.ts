import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import os from 'os';
import { logger } from '../utils/logger.js';

interface VSCodeWorkspace {
  folders?: Array<{ path: string; name?: string }>;
  settings?: Record<string, any>;
  launch?: any;
  tasks?: any;
  extensions?: any;
}

interface VSCodeSettings {
  [key: string]: any;
}

export class VSCodeWorkspaceTool extends BaseTool {
  name = 'read_vscode_workspace';
  description = 'Read and analyze VSCode workspace configuration';
  parameters = {
    workspace_file: { type: 'string', description: 'Path to .code-workspace file', optional: true },
    include_settings: { type: 'boolean', description: 'Include workspace settings', optional: true },
    include_extensions: { type: 'boolean', description: 'Include recommended extensions', optional: true }
  };

  async execute(params: { 
    workspace_file?: string; 
    include_settings?: boolean; 
    include_extensions?: boolean 
  }): Promise<any> {
    let workspacePath = params.workspace_file;
    
    // Auto-detect workspace file if not provided
    if (!workspacePath) {
      const workspaceFiles = await glob('*.code-workspace', { cwd: process.cwd() });
      if (workspaceFiles.length > 0) {
        workspacePath = workspaceFiles[0];
        console.log(chalk.blue(`Found workspace: ${workspacePath}`));
      } else {
        return { error: 'No VSCode workspace file found' };
      }
    }

    const workspace: VSCodeWorkspace = await fs.readJSON(workspacePath);
    const result: any = {
      name: path.basename(workspacePath, '.code-workspace'),
      folders: workspace.folders || [],
      path: workspacePath
    };

    if (params.include_settings && workspace.settings) {
      result.settings = workspace.settings;
    }

    if (params.include_extensions && workspace.extensions) {
      result.extensions = workspace.extensions;
    }

    if (workspace.launch) {
      result.launch = workspace.launch;
    }

    if (workspace.tasks) {
      result.tasks = workspace.tasks;
    }

    console.log(chalk.green(`✓ Loaded VSCode workspace: ${result.name}`));
    return result;
  }
}

export class VSCodeSettingsTool extends BaseTool {
  name = 'read_vscode_settings';
  description = 'Read VSCode settings from workspace or user configuration';
  parameters = {
    scope: { type: 'string', description: 'Settings scope: workspace, user, or auto', optional: true },
    filter: { type: 'string', description: 'Filter settings by key pattern', optional: true }
  };

  async execute(params: { scope?: string; filter?: string }): Promise<any> {
    const scope = params.scope || 'auto';
    const settings: VSCodeSettings = {};
    const result: any = { settings: {}, sources: [] };

    // Check workspace settings (.vscode/settings.json)
    if (scope === 'workspace' || scope === 'auto') {
      const workspaceSettingsPath = path.join(process.cwd(), '.vscode', 'settings.json');
      if (await fs.pathExists(workspaceSettingsPath)) {
        try {
          const workspaceSettings = await fs.readJSON(workspaceSettingsPath);
          Object.assign(settings, workspaceSettings);
          result.sources.push('workspace');
          console.log(chalk.green('✓ Loaded workspace settings'));
        } catch (error) {
          console.log(chalk.yellow('⚠ Could not parse workspace settings'));
        }
      }
    }

    // Check user settings
    if (scope === 'user' || scope === 'auto') {
      const userSettingsPath = this.getUserSettingsPath();
      if (await fs.pathExists(userSettingsPath)) {
        try {
          const userSettings = await fs.readJSON(userSettingsPath);
          Object.assign(settings, userSettings);
          result.sources.push('user');
          console.log(chalk.green('✓ Loaded user settings'));
        } catch (error) {
          console.log(chalk.yellow('⚠ Could not parse user settings'));
        }
      }
    }

    // Apply filter if provided
    if (params.filter) {
      const filtered: VSCodeSettings = {};
      const pattern = new RegExp(params.filter, 'i');
      for (const [key, value] of Object.entries(settings)) {
        if (pattern.test(key)) {
          filtered[key] = value;
        }
      }
      result.settings = filtered;
      result.filtered = true;
      result.filterPattern = params.filter;
    } else {
      result.settings = settings;
    }

    result.count = Object.keys(result.settings).length;
    return result;
  }

  private getUserSettingsPath(): string {
    const platform = os.platform();
    const homeDir = os.homedir();
    
    switch (platform) {
      case 'win32':
        return path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
      case 'darwin':
        return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
      default: // Linux
        return path.join(homeDir, '.config', 'Code', 'User', 'settings.json');
    }
  }
}

export class VSCodeExtensionsTool extends BaseTool {
  name = 'read_vscode_extensions';
  description = 'Read installed and recommended VSCode extensions';
  parameters = {
    include_installed: { type: 'boolean', description: 'Include installed extensions', optional: true },
    include_recommended: { type: 'boolean', description: 'Include workspace recommendations', optional: true }
  };

  async execute(params: { 
    include_installed?: boolean; 
    include_recommended?: boolean 
  }): Promise<any> {
    const result: any = {};

    // Read recommended extensions
    if (params.include_recommended !== false) {
      const recommendedPath = path.join(process.cwd(), '.vscode', 'extensions.json');
      if (await fs.pathExists(recommendedPath)) {
        try {
          const extensionsFile = await fs.readJSON(recommendedPath);
          result.recommended = extensionsFile.recommendations || [];
          result.unwanted = extensionsFile.unwantedRecommendations || [];
          console.log(chalk.green(`✓ Found ${result.recommended.length} recommended extensions`));
        } catch (error) {
          console.log(chalk.yellow('⚠ Could not parse extensions.json'));
        }
      }
    }

    // Read installed extensions (from VSCode CLI if available)
    if (params.include_installed) {
      try {
        const { execSync } = await import('child_process');
        const output = execSync('code --list-extensions', { encoding: 'utf-8' });
        result.installed = output.trim().split('\n').filter(Boolean);
        console.log(chalk.green(`✓ Found ${result.installed.length} installed extensions`));
      } catch (error) {
        result.installed = [];
        result.note = 'Could not retrieve installed extensions (VSCode CLI not available)';
      }
    }

    return result;
  }
}

export class VSCodeTasksTool extends BaseTool {
  name = 'read_vscode_tasks';
  description = 'Read VSCode tasks configuration';
  parameters = {
    include_scripts: { type: 'boolean', description: 'Include package.json scripts', optional: true }
  };

  async execute(params: { include_scripts?: boolean }): Promise<any> {
    const result: any = { tasks: [] };

    // Read tasks.json
    const tasksPath = path.join(process.cwd(), '.vscode', 'tasks.json');
    if (await fs.pathExists(tasksPath)) {
      try {
        const tasksFile = await fs.readJSON(tasksPath);
        result.tasks = tasksFile.tasks || [];
        result.version = tasksFile.version;
        console.log(chalk.green(`✓ Found ${result.tasks.length} VSCode tasks`));
      } catch (error) {
        console.log(chalk.yellow('⚠ Could not parse tasks.json'));
      }
    }

    // Include package.json scripts if requested
    if (params.include_scripts) {
      const packagePath = path.join(process.cwd(), 'package.json');
      if (await fs.pathExists(packagePath)) {
        try {
          const packageJson = await fs.readJSON(packagePath);
          if (packageJson.scripts) {
            result.npmScripts = packageJson.scripts;
            console.log(chalk.green(`✓ Found ${Object.keys(packageJson.scripts).length} npm scripts`));
          }
        } catch (error) {
          console.log(chalk.yellow('⚠ Could not parse package.json'));
        }
      }
    }

    return result;
  }
}

export class VSCodeLaunchTool extends BaseTool {
  name = 'read_vscode_launch';
  description = 'Read VSCode launch/debug configuration';
  parameters = {};

  async execute(params: any): Promise<any> {
    const launchPath = path.join(process.cwd(), '.vscode', 'launch.json');
    
    if (!await fs.pathExists(launchPath)) {
      return { error: 'No launch.json file found' };
    }

    try {
      const launchFile = await fs.readJSON(launchPath);
      const result = {
        version: launchFile.version,
        configurations: launchFile.configurations || [],
        compounds: launchFile.compounds || []
      };
      
      console.log(chalk.green(`✓ Found ${result.configurations.length} launch configurations`));
      return result;
    } catch (error) {
      return { error: 'Could not parse launch.json' };
    }
  }
}

export class VSCodeSnippetsTool extends BaseTool {
  name = 'read_vscode_snippets';
  description = 'Read VSCode snippets from workspace or user configuration';
  parameters = {
    language: { type: 'string', description: 'Filter snippets by language', optional: true }
  };

  async execute(params: { language?: string }): Promise<any> {
    const result: any = { snippets: {}, sources: [] };

    // Check workspace snippets
    const workspaceSnippetsPath = path.join(process.cwd(), '.vscode');
    if (await fs.pathExists(workspaceSnippetsPath)) {
      const snippetFiles = await glob('*.code-snippets', { cwd: workspaceSnippetsPath });
      
      for (const file of snippetFiles) {
        try {
          const snippets = await fs.readJSON(path.join(workspaceSnippetsPath, file));
          Object.assign(result.snippets, snippets);
          result.sources.push(`workspace/${file}`);
        } catch (error) {
          console.log(chalk.yellow(`⚠ Could not parse ${file}`));
        }
      }
    }

    // Filter by language if specified
    if (params.language) {
      const filtered: any = {};
      for (const [key, snippet] of Object.entries(result.snippets)) {
        const s = snippet as any;
        if (!s.scope || s.scope.includes(params.language)) {
          filtered[key] = snippet;
        }
      }
      result.snippets = filtered;
      result.filteredBy = params.language;
    }

    result.count = Object.keys(result.snippets).length;
    console.log(chalk.green(`✓ Found ${result.count} snippets`));
    return result;
  }
}

export class VSCodeProjectContextTool extends BaseTool {
  name = 'analyze_vscode_project';
  description = 'Comprehensive analysis of VSCode project configuration';
  parameters = {};

  async execute(params: any): Promise<any> {
    const result: any = {
      workspace: null,
      settings: {},
      extensions: {},
      tasks: [],
      launch: {},
      snippets: {},
      gitignore: [],
      editorconfig: null,
      prettier: null,
      eslint: null,
      tsconfig: null,
      packageJson: null
    };

    // Check for workspace
    const workspaceFiles = await glob('*.code-workspace', { cwd: process.cwd() });
    if (workspaceFiles.length > 0) {
      result.workspace = await fs.readJSON(workspaceFiles[0]);
    }

    // Check .vscode directory
    const vscodePath = path.join(process.cwd(), '.vscode');
    if (await fs.pathExists(vscodePath)) {
      // Settings
      const settingsPath = path.join(vscodePath, 'settings.json');
      if (await fs.pathExists(settingsPath)) {
        try {
          result.settings = await fs.readJSON(settingsPath);
        } catch (e) { logger.catch('Failed to parse config', e); }
      }

      // Extensions
      const extensionsPath = path.join(vscodePath, 'extensions.json');
      if (await fs.pathExists(extensionsPath)) {
        try {
          result.extensions = await fs.readJSON(extensionsPath);
        } catch (e) { logger.catch('Failed to parse config', e); }
      }

      // Tasks
      const tasksPath = path.join(vscodePath, 'tasks.json');
      if (await fs.pathExists(tasksPath)) {
        try {
          const tasks = await fs.readJSON(tasksPath);
          result.tasks = tasks.tasks || [];
        } catch (e) { logger.catch('Failed to parse config', e); }
      }

      // Launch
      const launchPath = path.join(vscodePath, 'launch.json');
      if (await fs.pathExists(launchPath)) {
        try {
          result.launch = await fs.readJSON(launchPath);
        } catch (e) { logger.catch('Failed to parse config', e); }
      }
    }

    // Check for other config files
    const configFiles = [
      { name: 'gitignore', path: '.gitignore', parser: 'text' },
      { name: 'editorconfig', path: '.editorconfig', parser: 'text' },
      { name: 'prettier', path: '.prettierrc', parser: 'json' },
      { name: 'eslint', path: '.eslintrc.json', parser: 'json' },
      { name: 'tsconfig', path: 'tsconfig.json', parser: 'json' },
      { name: 'packageJson', path: 'package.json', parser: 'json' }
    ];

    for (const config of configFiles) {
      const configPath = path.join(process.cwd(), config.path);
      if (await fs.pathExists(configPath)) {
        try {
          if (config.parser === 'json') {
            result[config.name] = await fs.readJSON(configPath);
          } else {
            const content = await fs.readFile(configPath, 'utf-8');
            result[config.name] = config.name === 'gitignore' 
              ? content.split('\n').filter(Boolean)
              : content;
          }
        } catch (e) { logger.catch('Failed to parse config', e); }
      }
    }

    // Analyze project type
    result.projectType = this.detectProjectType(result);
    result.framework = this.detectFramework(result);
    result.language = this.detectLanguage(result);

    console.log(chalk.green(`✓ Project analysis complete: ${result.projectType} (${result.framework})`));
    return result;
  }

  private detectProjectType(context: any): string {
    if (context.packageJson) {
      if (context.packageJson.dependencies?.react || context.packageJson.devDependencies?.react) {
        return 'React Application';
      }
      if (context.packageJson.dependencies?.vue || context.packageJson.devDependencies?.vue) {
        return 'Vue Application';
      }
      if (context.packageJson.dependencies?.angular || context.packageJson.devDependencies?.angular) {
        return 'Angular Application';
      }
      if (context.packageJson.dependencies?.express) {
        return 'Node.js Server';
      }
      if (context.packageJson.dependencies?.next) {
        return 'Next.js Application';
      }
      return 'Node.js Project';
    }
    if (context.tsconfig) {
      return 'TypeScript Project';
    }
    return 'Unknown Project Type';
  }

  private detectFramework(context: any): string {
    if (!context.packageJson) return 'None';
    
    const deps = { ...context.packageJson.dependencies, ...context.packageJson.devDependencies };
    
    if (deps.react) return 'React';
    if (deps.vue) return 'Vue';
    if (deps.angular) return 'Angular';
    if (deps.svelte) return 'Svelte';
    if (deps.next) return 'Next.js';
    if (deps.nuxt) return 'Nuxt';
    if (deps.gatsby) return 'Gatsby';
    if (deps.express) return 'Express';
    if (deps.fastify) return 'Fastify';
    if (deps.nestjs) return 'NestJS';
    
    return 'None';
  }

  private detectLanguage(context: any): string {
    if (context.tsconfig) return 'TypeScript';
    if (context.packageJson) return 'JavaScript';
    if (context.workspace?.folders?.[0]?.path?.includes('.py')) return 'Python';
    if (context.workspace?.folders?.[0]?.path?.includes('.go')) return 'Go';
    if (context.workspace?.folders?.[0]?.path?.includes('.rs')) return 'Rust';
    return 'Unknown';
  }
}

// Tool to automatically detect and load VSCode configuration
export class VSCodeAutoDetectTool extends BaseTool {
  name = 'detect_vscode';
  description = 'Automatically detect and load VSCode project configuration';
  parameters = {};

  async execute(params: {}): Promise<any> {
    const result: any = {
      detected: false,
      workspace: null,
      folders: [],
      settings: {},
      extensions: [],
      tasks: [],
      launch: []
    };

    // Check for .vscode directory
    const vscodePath = path.join(process.cwd(), '.vscode');
    const workspacePath = path.join(process.cwd(), '*.code-workspace');
    
    // Look for workspace file
    const workspaceFiles = await glob(workspacePath);
    if (workspaceFiles.length > 0) {
      result.detected = true;
      const workspaceTool = new VSCodeWorkspaceTool();
      const workspaceData = await workspaceTool.execute({ workspace_file: workspaceFiles[0] });
      result.workspace = workspaceData;
      result.folders = workspaceData.folders || [];
    }
    
    // Check for .vscode folder
    if (await fs.pathExists(vscodePath)) {
      result.detected = true;
      
      // Load settings
      const settingsPath = path.join(vscodePath, 'settings.json');
      if (await fs.pathExists(settingsPath)) {
        try {
          result.settings = await fs.readJSON(settingsPath);
        } catch (e) { logger.catch('Failed to parse config', e); }
      }
      
      // Load tasks
      const tasksPath = path.join(vscodePath, 'tasks.json');
      if (await fs.pathExists(tasksPath)) {
        try {
          const tasksData = await fs.readJSON(tasksPath);
          result.tasks = tasksData.tasks || [];
        } catch (e) { logger.catch('Failed to parse config', e); }
      }
      
      // Load launch configurations
      const launchPath = path.join(vscodePath, 'launch.json');
      if (await fs.pathExists(launchPath)) {
        try {
          const launchData = await fs.readJSON(launchPath);
          result.launch = launchData.configurations || [];
        } catch (e) { logger.catch('Failed to parse config', e); }
      }
    }
    
    // Load extensions if available
    const extensionsPath = path.join(vscodePath, 'extensions.json');
    if (await fs.pathExists(extensionsPath)) {
      try {
        const extData = await fs.readJSON(extensionsPath);
        result.extensions = extData.recommendations || [];
      } catch (e) {}
    }
    
    return result;
  }
}

// Tool to sync Canvas CLI with VSCode settings
export class VSCodeSyncTool extends BaseTool {
  name = 'sync_vscode_settings';
  description = 'Sync Canvas CLI configuration with VSCode settings';
  parameters = {
    direction: { type: 'string', description: 'Sync direction: from_vscode or to_vscode', optional: true }
  };

  async execute(params: { direction?: string }): Promise<any> {
    const direction = params.direction || 'from_vscode';
    
    if (direction === 'from_vscode') {
      // Read VSCode settings and apply to Canvas CLI
      const vscodePath = path.join(process.cwd(), '.vscode', 'settings.json');
      if (await fs.pathExists(vscodePath)) {
        const vscodeSettings = await fs.readJSON(vscodePath);
        
        // Map relevant VSCode settings to Canvas CLI
        const canvasConfig: any = {};
        
        if (vscodeSettings['terminal.integrated.fontSize']) {
          canvasConfig.fontSize = vscodeSettings['terminal.integrated.fontSize'];
        }
        
        if (vscodeSettings['workbench.colorTheme']) {
          const theme = vscodeSettings['workbench.colorTheme'].toLowerCase();
          if (theme.includes('dark')) canvasConfig.theme = 'dracula';
          else if (theme.includes('light')) canvasConfig.theme = 'github';
        }
        
        // Save to Canvas CLI config
        const canvasConfigPath = path.join(os.homedir(), '.canvas-cli', 'config.json');
        await fs.ensureDir(path.dirname(canvasConfigPath));
        
        const existingConfig = await fs.pathExists(canvasConfigPath) 
          ? await fs.readJSON(canvasConfigPath) 
          : {};
        
        const merged = { ...existingConfig, ...canvasConfig };
        await fs.writeJSON(canvasConfigPath, merged, { spaces: 2 });
        
        console.log(chalk.green('✓ Synced settings from VSCode to Canvas CLI'));
        return { synced: canvasConfig, direction: 'from_vscode' };
      }
    } else {
      // TODO: Implement syncing from Canvas CLI to VSCode
      return { message: 'Syncing to VSCode not yet implemented' };
    }
  }
}