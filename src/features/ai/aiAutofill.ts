import { EventEmitter } from 'events';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// AI Autofill for Commands
export interface AutofillSuggestion {
  id: string;
  command: string;
  completion: string;
  confidence: number;
  source: 'history' | 'ai' | 'pattern' | 'context' | 'git' | 'npm';
  description: string;
  parameters?: AutofillParameter[];
  category: string;
  usage: number;
  lastUsed?: Date;
  aiGenerated: boolean;
}

export interface AutofillParameter {
  name: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'path' | 'option';
  required: boolean;
  description: string;
  suggestions?: string[];
}

export interface AutofillContext {
  currentDirectory: string;
  gitRepository: boolean;
  gitBranch?: string;
  gitStatus?: string;
  packageJson: boolean;
  nodeModules: boolean;
  files: string[];
  directories: string[];
  recentCommands: string[];
  environmentVariables: Record<string, string>;
  shellHistory: string[];
}

export interface AutofillConfig {
  enabled: boolean;
  aiEnabled: boolean;
  maxSuggestions: number;
  minConfidence: number;
  learnFromHistory: boolean;
  contextAware: boolean;
  fuzzyMatching: boolean;
  realTimeAnalysis: boolean;
  cacheExpiry: number;
  preloadSuggestions: boolean;
  keyboardShortcuts: boolean;
}

export interface CommandPattern {
  pattern: RegExp;
  template: string;
  parameters: string[];
  category: string;
  description: string;
  examples: string[];
}

export interface LearningData {
  commandSequences: Map<string, string[]>;
  parameterPatterns: Map<string, string[]>;
  contextPatterns: Map<string, AutofillContext>;
  userPreferences: Map<string, any>;
  successfulCompletions: Map<string, number>;
}

export class AIAutofillSystem extends EventEmitter {
  private suggestions: Map<string, AutofillSuggestion[]> = new Map();
  private context: AutofillContext | null = null;
  private patterns: CommandPattern[] = [];
  private learningData: LearningData;
  private config: AutofillConfig;
  private storageDir: string;
  private cache: Map<string, { suggestions: AutofillSuggestion[], timestamp: number }> = new Map();
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'autofill');
    fs.ensureDirSync(this.storageDir);

    this.learningData = {
      commandSequences: new Map(),
      parameterPatterns: new Map(),
      contextPatterns: new Map(),
      userPreferences: new Map(),
      successfulCompletions: new Map()
    };

    this.config = {
      enabled: true,
      aiEnabled: true,
      maxSuggestions: 10,
      minConfidence: 0.3,
      learnFromHistory: true,
      contextAware: true,
      fuzzyMatching: true,
      realTimeAnalysis: true,
      cacheExpiry: 300000, // 5 minutes
      preloadSuggestions: true,
      keyboardShortcuts: true
    };

    void this.loadConfig();
    this.setupCommandPatterns();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log(chalk.blue('🤖 Initializing AI Autofill System...'));
    
    await this.loadLearningData();
    await this.updateContext();
    
    if (this.config.preloadSuggestions) {
      await this.preloadCommonSuggestions();
    }

    this.isInitialized = true;
    console.log(chalk.green('✅ AI Autofill System initialized'));
    this.emit('initialized');
  }

  private setupCommandPatterns(): void {
    this.patterns = [
      // Git patterns
      {
        pattern: /^git\s+(\w+)?$/,
        template: 'git {subcommand}',
        parameters: ['subcommand'],
        category: 'git',
        description: 'Git subcommands',
        examples: ['git add', 'git commit', 'git push', 'git pull', 'git status']
      },
      {
        pattern: /^git\s+add\s+(.*)$/,
        template: 'git add {files}',
        parameters: ['files'],
        category: 'git',
        description: 'Add files to git staging',
        examples: ['git add .', 'git add -A', 'git add file.txt']
      },
      {
        pattern: /^git\s+commit\s+(.*)$/,
        template: 'git commit {options}',
        parameters: ['options'],
        category: 'git',
        description: 'Commit changes',
        examples: ['git commit -m "message"', 'git commit -am "message"']
      },
      {
        pattern: /^git\s+checkout\s+(.*)$/,
        template: 'git checkout {branch_or_file}',
        parameters: ['branch_or_file'],
        category: 'git',
        description: 'Checkout branch or restore files',
        examples: ['git checkout main', 'git checkout -b feature/new']
      },

      // NPM patterns
      {
        pattern: /^npm\s+(\w+)?$/,
        template: 'npm {command}',
        parameters: ['command'],
        category: 'npm',
        description: 'NPM commands',
        examples: ['npm install', 'npm run', 'npm test', 'npm build']
      },
      {
        pattern: /^npm\s+install\s+(.*)$/,
        template: 'npm install {package}',
        parameters: ['package'],
        category: 'npm',
        description: 'Install NPM packages',
        examples: ['npm install express', 'npm install --save-dev typescript']
      },
      {
        pattern: /^npm\s+run\s+(.*)$/,
        template: 'npm run {script}',
        parameters: ['script'],
        category: 'npm',
        description: 'Run NPM scripts',
        examples: ['npm run dev', 'npm run build', 'npm run test']
      },

      // File operations
      {
        pattern: /^ls\s+(.*)$/,
        template: 'ls {options_and_path}',
        parameters: ['options_and_path'],
        category: 'file',
        description: 'List directory contents',
        examples: ['ls -la', 'ls -lh', 'ls *.txt']
      },
      {
        pattern: /^cd\s+(.*)$/,
        template: 'cd {path}',
        parameters: ['path'],
        category: 'file',
        description: 'Change directory',
        examples: ['cd ..', 'cd ~/Documents', 'cd /usr/local']
      },
      {
        pattern: /^mkdir\s+(.*)$/,
        template: 'mkdir {directory}',
        parameters: ['directory'],
        category: 'file',
        description: 'Create directory',
        examples: ['mkdir new-folder', 'mkdir -p nested/folder']
      },
      {
        pattern: /^cp\s+(.*)$/,
        template: 'cp {source} {destination}',
        parameters: ['source', 'destination'],
        category: 'file',
        description: 'Copy files or directories',
        examples: ['cp file.txt backup.txt', 'cp -r folder/ backup/']
      },

      // Docker patterns
      {
        pattern: /^docker\s+(\w+)?$/,
        template: 'docker {command}',
        parameters: ['command'],
        category: 'docker',
        description: 'Docker commands',
        examples: ['docker run', 'docker build', 'docker ps', 'docker images']
      },
      {
        pattern: /^docker\s+run\s+(.*)$/,
        template: 'docker run {options} {image}',
        parameters: ['options', 'image'],
        category: 'docker',
        description: 'Run Docker container',
        examples: ['docker run -it ubuntu', 'docker run -d -p 8080:80 nginx']
      },

      // System commands
      {
        pattern: /^ps\s+(.*)$/,
        template: 'ps {options}',
        parameters: ['options'],
        category: 'system',
        description: 'Process status',
        examples: ['ps aux', 'ps -ef', 'ps -u username']
      },
      {
        pattern: /^kill\s+(.*)$/,
        template: 'kill {signal} {pid}',
        parameters: ['signal', 'pid'],
        category: 'system',
        description: 'Terminate processes',
        examples: ['kill 1234', 'kill -9 1234', 'kill -TERM 1234']
      }
    ];
  }

  async getSuggestions(input: string): Promise<AutofillSuggestion[]> {
    if (!this.config.enabled || !this.isInitialized) {
      return [];
    }

    // Check cache first
    const cached = this.cache.get(input);
    if (cached && Date.now() - cached.timestamp < this.config.cacheExpiry) {
      return cached.suggestions.slice(0, this.config.maxSuggestions);
    }

    const suggestions: AutofillSuggestion[] = [];

    // Get context if needed
    if (this.config.contextAware && !this.context) {
      await this.updateContext();
    }

    // Generate suggestions from different sources
    suggestions.push(...this.getHistorySuggestions(input));
    suggestions.push(...this.getPatternSuggestions(input));
    suggestions.push(...this.getContextSuggestions(input));
    suggestions.push(...this.getAISuggestions(input));

    // Sort by confidence and filter
    const filteredSuggestions = suggestions
      .filter(s => s.confidence >= this.config.minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxSuggestions);

    // Cache the results
    this.cache.set(input, {
      suggestions: filteredSuggestions,
      timestamp: Date.now()
    });

    this.emit('suggestions-generated', { input, suggestions: filteredSuggestions });
    return filteredSuggestions;
  }

  private getHistorySuggestions(input: string): AutofillSuggestion[] {
    const suggestions: AutofillSuggestion[] = [];
    
    if (!this.config.learnFromHistory) return suggestions;

    // Get from command sequences
    for (const [sequence, nextCommands] of this.learningData.commandSequences) {
      if (sequence.endsWith(input.trim())) {
        for (const nextCommand of nextCommands) {
          const usage = this.learningData.successfulCompletions.get(nextCommand) || 0;
          suggestions.push({
            id: uuidv4(),
            command: input,
            completion: nextCommand,
            confidence: Math.min(0.9, usage / 10), // Max 0.9 confidence
            source: 'history',
            description: `Often used after "${sequence}"`,
            category: 'sequence',
            usage,
            aiGenerated: false
          });
        }
      }
    }

    // Fuzzy matching with shell history
    if (this.context?.shellHistory) {
      for (const historyCommand of this.context.shellHistory) {
        if (this.config.fuzzyMatching) {
          const similarity = this.calculateSimilarity(input, historyCommand);
          if (similarity > 0.6) {
            suggestions.push({
              id: uuidv4(),
              command: input,
              completion: historyCommand,
              confidence: similarity * 0.8,
              source: 'history',
              description: 'From shell history',
              category: 'history',
              usage: 1,
              aiGenerated: false
            });
          }
        } else if (historyCommand.startsWith(input)) {
          suggestions.push({
            id: uuidv4(),
            command: input,
            completion: historyCommand,
            confidence: 0.7,
            source: 'history',
            description: 'From shell history',
            category: 'history',
            usage: 1,
            aiGenerated: false
          });
        }
      }
    }

    return suggestions;
  }

  private getPatternSuggestions(input: string): AutofillSuggestion[] {
    const suggestions: AutofillSuggestion[] = [];

    for (const pattern of this.patterns) {
      if (pattern.pattern.test(input) || input.startsWith(pattern.template.split(' ')[0])) {
        for (const example of pattern.examples) {
          if (example.startsWith(input) || this.calculateSimilarity(input, example) > 0.5) {
            suggestions.push({
              id: uuidv4(),
              command: input,
              completion: example,
              confidence: 0.8,
              source: 'pattern',
              description: pattern.description,
              category: pattern.category,
              usage: 0,
              aiGenerated: false
            });
          }
        }
      }
    }

    return suggestions;
  }

  private getContextSuggestions(input: string): AutofillSuggestion[] {
    const suggestions: AutofillSuggestion[] = [];

    if (!this.context) return suggestions;

    // Git-specific suggestions
    if (this.context.gitRepository && input.startsWith('git')) {
      const gitParts = input.split(' ');
      
      if (gitParts.length === 1 || (gitParts.length === 2 && gitParts[1] === '')) {
        const gitCommands = ['add', 'commit', 'push', 'pull', 'status', 'checkout', 'branch', 'merge'];
        for (const cmd of gitCommands) {
          suggestions.push({
            id: uuidv4(),
            command: input,
            completion: `git ${cmd}`,
            confidence: 0.9,
            source: 'context',
            description: `Git command in repository`,
            category: 'git',
            usage: 0,
            aiGenerated: false
          });
        }
      } else if (gitParts[1] === 'checkout' && gitParts.length === 2) {
        // Suggest branches for git checkout
        suggestions.push({
          id: uuidv4(),
          command: input,
          completion: 'git checkout main',
          confidence: 0.8,
          source: 'context',
          description: 'Checkout main branch',
          category: 'git',
          usage: 0,
          aiGenerated: false
        });
      }
    }

    // NPM-specific suggestions
    if (this.context.packageJson && input.startsWith('npm')) {
      const npmParts = input.split(' ');
      
      if (npmParts[1] === 'run') {
        // Read package.json for scripts
        try {
          const packagePath = path.join(this.context.currentDirectory, 'package.json');
          if (fs.existsSync(packagePath)) {
            const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            if (pkg.scripts) {
              for (const script of Object.keys(pkg.scripts)) {
                if (npmParts.length === 2 || script.startsWith(npmParts[2] || '')) {
                  suggestions.push({
                    id: uuidv4(),
                    command: input,
                    completion: `npm run ${script}`,
                    confidence: 0.9,
                    source: 'context',
                    description: `Run script: ${pkg.scripts[script]}`,
                    category: 'npm',
                    usage: 0,
                    aiGenerated: false
                  });
                }
              }
            }
          }
        } catch (error) {
          // Ignore errors reading package.json
        }
      }
    }

    // File and directory suggestions
    if (['cd', 'ls', 'cp', 'mv', 'rm'].some(cmd => input.startsWith(cmd))) {
      const parts = input.split(' ');
      const lastPart = parts[parts.length - 1];
      
      for (const dir of this.context.directories) {
        if (dir.startsWith(lastPart)) {
          const newCommand = parts.slice(0, -1).join(' ') + ' ' + dir;
          suggestions.push({
            id: uuidv4(),
            command: input,
            completion: newCommand,
            confidence: 0.7,
            source: 'context',
            description: `Directory: ${dir}`,
            category: 'file',
            usage: 0,
            aiGenerated: false
          });
        }
      }

      for (const file of this.context.files) {
        if (file.startsWith(lastPart)) {
          const newCommand = parts.slice(0, -1).join(' ') + ' ' + file;
          suggestions.push({
            id: uuidv4(),
            command: input,
            completion: newCommand,
            confidence: 0.6,
            source: 'context',
            description: `File: ${file}`,
            category: 'file',
            usage: 0,
            aiGenerated: false
          });
        }
      }
    }

    return suggestions;
  }

  private getAISuggestions(input: string): AutofillSuggestion[] {
    const suggestions: AutofillSuggestion[] = [];

    if (!this.config.aiEnabled) return suggestions;

    // AI-powered suggestions would integrate with an AI service here
    // For now, we'll generate intelligent suggestions based on patterns and context

    const inputLower = input.toLowerCase();
    const words = input.split(' ');

    // Common command completions
    const commonCompletions: Record<string, string[]> = {
      'git': ['git status', 'git add .', 'git commit -m ""', 'git push', 'git pull'],
      'npm': ['npm install', 'npm run dev', 'npm run build', 'npm test', 'npm start'],
      'docker': ['docker ps', 'docker images', 'docker run', 'docker build', 'docker stop'],
      'kubectl': ['kubectl get pods', 'kubectl get services', 'kubectl describe', 'kubectl logs'],
      'systemctl': ['systemctl status', 'systemctl start', 'systemctl stop', 'systemctl restart']
    };

    if (words.length === 1 && commonCompletions[inputLower]) {
      for (const completion of commonCompletions[inputLower]) {
        if (completion.startsWith(input)) {
          suggestions.push({
            id: uuidv4(),
            command: input,
            completion,
            confidence: 0.85,
            source: 'ai',
            description: 'AI-suggested common usage',
            category: 'ai',
            usage: 0,
            aiGenerated: true
          });
        }
      }
    }

    // Intent-based suggestions
    if (inputLower.includes('install') || inputLower.includes('add')) {
      suggestions.push({
        id: uuidv4(),
        command: input,
        completion: input.includes('npm') ? 'npm install --save' : input + ' package-name',
        confidence: 0.7,
        source: 'ai',
        description: 'AI-detected installation intent',
        category: 'ai',
        usage: 0,
        aiGenerated: true
      });
    }

    if (inputLower.includes('build') || inputLower.includes('compile')) {
      const buildSuggestions = ['npm run build', 'make', 'cargo build', 'mvn compile'];
      for (const suggestion of buildSuggestions) {
        if (suggestion.toLowerCase().includes(inputLower)) {
          suggestions.push({
            id: uuidv4(),
            command: input,
            completion: suggestion,
            confidence: 0.75,
            source: 'ai',
            description: 'AI-detected build intent',
            category: 'ai',
            usage: 0,
            aiGenerated: true
          });
        }
      }
    }

    return suggestions;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  async learnFromCommand(command: string, wasSuccessful: boolean, context?: Partial<AutofillContext>): Promise<void> {
    if (!this.config.learnFromHistory) return;

    // Track successful completions
    if (wasSuccessful) {
      const currentCount = this.learningData.successfulCompletions.get(command) || 0;
      this.learningData.successfulCompletions.set(command, currentCount + 1);
    }

    // Learn command sequences
    if (this.context?.recentCommands && this.context.recentCommands.length > 0) {
      const lastCommand = this.context.recentCommands[this.context.recentCommands.length - 1];
      const sequence = `${lastCommand} -> ${command}`;
      
      const existingSequence = this.learningData.commandSequences.get(lastCommand) || [];
      if (!existingSequence.includes(command)) {
        existingSequence.push(command);
        this.learningData.commandSequences.set(lastCommand, existingSequence);
      }
    }

    // Learn parameter patterns
    const parts = command.split(' ');
    if (parts.length > 1) {
      const baseCommand = parts[0];
      const params = parts.slice(1);
      
      const existingParams = this.learningData.parameterPatterns.get(baseCommand) || [];
      for (const param of params) {
        if (!existingParams.includes(param)) {
          existingParams.push(param);
        }
      }
      this.learningData.parameterPatterns.set(baseCommand, existingParams);
    }

    // Save learning data
    await this.saveLearningData();
    this.emit('learned', { command, wasSuccessful, context });
  }

  private async updateContext(): Promise<void> {
    try {
      const currentDir = process.cwd();
      const items = await fs.readdir(currentDir, { withFileTypes: true });
      
      const files = items.filter(item => item.isFile()).map(item => item.name);
      const directories = items.filter(item => item.isDirectory()).map(item => item.name);
      
      const hasGit = directories.includes('.git');
      const hasPackageJson = files.includes('package.json');
      const hasNodeModules = directories.includes('node_modules');

      this.context = {
        currentDirectory: currentDir,
        gitRepository: hasGit,
        packageJson: hasPackageJson,
        nodeModules: hasNodeModules,
        files: files.slice(0, 50), // Limit for performance
        directories: directories.slice(0, 50),
        recentCommands: [],
        environmentVariables: process.env as Record<string, string>,
        shellHistory: []
      };

      // Get git branch if in git repo
      if (hasGit) {
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          const { stdout } = await execAsync('git branch --show-current');
          this.context.gitBranch = stdout.trim();
        } catch (error) {
          // Ignore git errors
        }
      }

      this.emit('context-updated', this.context);
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not update context: ${error}`));
    }
  }

  private async preloadCommonSuggestions(): Promise<void> {
    const commonInputs = ['git', 'npm', 'cd', 'ls', 'docker', 'kubectl'];
    
    for (const input of commonInputs) {
      await this.getSuggestions(input);
    }
  }

  clearCache(): void {
    this.cache.clear();
    console.log(chalk.blue('🧹 Autofill cache cleared'));
    this.emit('cache-cleared');
  }

  getStats(): any {
    return {
      totalSuggestions: Array.from(this.suggestions.values()).reduce((sum, arr) => sum + arr.length, 0),
      cacheSize: this.cache.size,
      learningDataSize: {
        commandSequences: this.learningData.commandSequences.size,
        parameterPatterns: this.learningData.parameterPatterns.size,
        successfulCompletions: this.learningData.successfulCompletions.size
      },
      patterns: this.patterns.length,
      contextCurrent: !!this.context,
      config: this.config
    };
  }

  updateConfig(updates: Partial<AutofillConfig>): void {
    this.config = { ...this.config, ...updates };
    void this.saveConfig();
    console.log(chalk.green('✅ Autofill configuration updated'));
    this.emit('config-updated', this.config);
  }

  private async loadConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'autofill-config.json');
    if (await fs.pathExists(configPath)) {
      const saved = await fs.readJson(configPath);
      this.config = { ...this.config, ...saved };
    }
  }

  private async saveConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'autofill-config.json');
    await fs.writeJson(configPath, this.config, { spaces: 2 });
  }

  private async loadLearningData(): Promise<void> {
    const dataPath = path.join(this.storageDir, 'learning-data.json');
    if (await fs.pathExists(dataPath)) {
      const data = await fs.readJson(dataPath);
      
      // Convert objects back to Maps
      if (data.commandSequences) {
        this.learningData.commandSequences = new Map(Object.entries(data.commandSequences));
      }
      if (data.parameterPatterns) {
        this.learningData.parameterPatterns = new Map(Object.entries(data.parameterPatterns));
      }
      if (data.contextPatterns) {
        this.learningData.contextPatterns = new Map(Object.entries(data.contextPatterns));
      }
      if (data.userPreferences) {
        this.learningData.userPreferences = new Map(Object.entries(data.userPreferences));
      }
      if (data.successfulCompletions) {
        this.learningData.successfulCompletions = new Map(Object.entries(data.successfulCompletions));
      }
    }
  }

  private async saveLearningData(): Promise<void> {
    const dataPath = path.join(this.storageDir, 'learning-data.json');
    
    // Convert Maps to objects for JSON serialization
    const data = {
      commandSequences: Object.fromEntries(this.learningData.commandSequences),
      parameterPatterns: Object.fromEntries(this.learningData.parameterPatterns),
      contextPatterns: Object.fromEntries(this.learningData.contextPatterns),
      userPreferences: Object.fromEntries(this.learningData.userPreferences),
      successfulCompletions: Object.fromEntries(this.learningData.successfulCompletions)
    };
    
    await fs.writeJson(dataPath, data, { spaces: 2 });
  }
}

// Singleton instance
let autofillInstance: AIAutofillSystem | null = null;

export function getAIAutofillSystem(): AIAutofillSystem {
  if (!autofillInstance) {
    autofillInstance = new AIAutofillSystem();
  }
  return autofillInstance;
}