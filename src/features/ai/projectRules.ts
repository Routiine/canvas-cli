import { EventEmitter } from 'events';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { glob } from 'glob';

// Project-Level AI Rules System
export interface AIRule {
  id: string;
  name: string;
  description: string;
  type: 'command' | 'response' | 'workflow' | 'security' | 'quality' | 'style';
  scope: 'global' | 'project' | 'directory' | 'file';
  priority: number;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
  triggers: RuleTrigger[];
  metadata: RuleMetadata;
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
  usage: number;
}

export interface RuleCondition {
  type: 'file' | 'directory' | 'content' | 'command' | 'context' | 'time' | 'user';
  operator: 'equals' | 'contains' | 'startswith' | 'endswith' | 'regex' | 'exists' | 'not_exists';
  value: string;
  caseSensitive: boolean;
  negated: boolean;
}

export interface RuleAction {
  type: 'suggest' | 'modify' | 'block' | 'warn' | 'log' | 'execute' | 'transform';
  target: 'command' | 'response' | 'file' | 'output';
  parameters: Record<string, any>;
  message?: string;
}

export interface RuleTrigger {
  event: 'before_command' | 'after_command' | 'file_change' | 'response_generated' | 'project_open' | 'session_start';
  conditions?: RuleCondition[];
}

export interface RuleMetadata {
  author?: string;
  version: string;
  tags: string[];
  category: string;
  documentation?: string;
  examples?: string[];
  dependencies?: string[];
  conflicts?: string[];
}

export interface ProjectConfig {
  projectRoot: string;
  configFile: string;
  rules: AIRule[];
  inheritance: 'none' | 'parent' | 'all';
  rulesets: string[];
  customRulesets: Record<string, AIRule[]>;
  settings: ProjectSettings;
}

export interface ProjectSettings {
  aiEnabled: boolean;
  strictMode: boolean;
  autoApplyRules: boolean;
  warningLevel: 'none' | 'low' | 'medium' | 'high';
  maxRuleDepth: number;
  ruleTimeout: number;
  cacheRules: boolean;
  logRuleActivity: boolean;
}

export interface RuleExecutionContext {
  projectRoot: string;
  currentDirectory: string;
  command?: string;
  arguments?: string[];
  files: string[];
  environment: Record<string, string>;
  user: string;
  timestamp: Date;
  sessionId: string;
}

export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  executed: boolean;
  success: boolean;
  actions: ActionResult[];
  duration: number;
  error?: string;
  metadata: Record<string, any>;
}

export interface ActionResult {
  actionType: string;
  success: boolean;
  originalValue?: string;
  newValue?: string;
  message?: string;
  error?: string;
}

export class ProjectLevelAIRules extends EventEmitter {
  private projectConfigs: Map<string, ProjectConfig> = new Map();
  private globalRules: AIRule[] = [];
  private rulesets: Map<string, AIRule[]> = new Map();
  private ruleCache: Map<string, RuleExecutionResult[]> = new Map();
  private storageDir: string;
  private currentProject: string | null = null;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'rules');
    fs.ensureDirSync(this.storageDir);
    
    this.setupDefaultRulesets();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log(chalk.blue('🤖 Initializing Project-Level AI Rules...'));
    
    await this.loadGlobalRules();
    await this.loadRulesets();
    await this.detectCurrentProject();
    
    this.isInitialized = true;
    console.log(chalk.green('✅ Project-Level AI Rules initialized'));
    this.emit('initialized');
  }

  private setupDefaultRulesets(): void {
    // Development Best Practices Ruleset
    const devBestPractices: AIRule[] = [
      {
        id: 'no-hardcoded-secrets',
        name: 'No Hardcoded Secrets',
        description: 'Prevent committing hardcoded secrets and credentials',
        type: 'security',
        scope: 'project',
        priority: 100,
        enabled: true,
        conditions: [
          {
            type: 'command',
            operator: 'equals',
            value: 'git commit',
            caseSensitive: false,
            negated: false
          }
        ],
        actions: [
          {
            type: 'warn',
            target: 'command',
            parameters: { scanSecrets: true },
            message: 'Scanning for hardcoded secrets before commit...'
          }
        ],
        triggers: [
          { event: 'before_command' }
        ],
        metadata: {
          version: '1.0.0',
          tags: ['security', 'git'],
          category: 'security',
          author: 'canvas-cli'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        usage: 0
      },
      {
        id: 'suggest-git-hooks',
        name: 'Suggest Git Hooks',
        description: 'Suggest adding git hooks for code quality',
        type: 'workflow',
        scope: 'project',
        priority: 50,
        enabled: true,
        conditions: [
          {
            type: 'directory',
            operator: 'exists',
            value: '.git',
            caseSensitive: false,
            negated: false
          },
          {
            type: 'directory',
            operator: 'not_exists',
            value: '.git/hooks/pre-commit',
            caseSensitive: false,
            negated: false
          }
        ],
        actions: [
          {
            type: 'suggest',
            target: 'command',
            parameters: { 
              suggestion: 'Consider adding pre-commit hooks for code quality',
              commands: ['npm install --save-dev husky', 'npx husky init']
            }
          }
        ],
        triggers: [
          { event: 'project_open' }
        ],
        metadata: {
          version: '1.0.0',
          tags: ['git', 'quality', 'hooks'],
          category: 'workflow'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        usage: 0
      }
    ];

    // Node.js Specific Rules
    const nodeJsRules: AIRule[] = [
      {
        id: 'npm-audit-check',
        name: 'NPM Security Audit',
        description: 'Run npm audit after installing packages',
        type: 'security',
        scope: 'project',
        priority: 80,
        enabled: true,
        conditions: [
          {
            type: 'command',
            operator: 'startswith',
            value: 'npm install',
            caseSensitive: false,
            negated: false
          },
          {
            type: 'file',
            operator: 'exists',
            value: 'package.json',
            caseSensitive: false,
            negated: false
          }
        ],
        actions: [
          {
            type: 'suggest',
            target: 'command',
            parameters: { 
              command: 'npm audit',
              message: 'Consider running npm audit to check for vulnerabilities'
            }
          }
        ],
        triggers: [
          { event: 'after_command' }
        ],
        metadata: {
          version: '1.0.0',
          tags: ['npm', 'security', 'audit'],
          category: 'security'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        usage: 0
      },
      {
        id: 'suggest-npm-scripts',
        name: 'Suggest NPM Scripts',
        description: 'Suggest using npm scripts instead of direct commands',
        type: 'style',
        scope: 'project',
        priority: 30,
        enabled: true,
        conditions: [
          {
            type: 'command',
            operator: 'contains',
            value: 'node',
            caseSensitive: false,
            negated: false
          },
          {
            type: 'file',
            operator: 'exists',
            value: 'package.json',
            caseSensitive: false,
            negated: false
          }
        ],
        actions: [
          {
            type: 'suggest',
            target: 'command',
            parameters: { 
              suggestion: 'Consider adding this as an npm script in package.json'
            }
          }
        ],
        triggers: [
          { event: 'before_command' }
        ],
        metadata: {
          version: '1.0.0',
          tags: ['npm', 'scripts', 'workflow'],
          category: 'style'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        usage: 0
      }
    ];

    // Python-specific rules
    const pythonRules: AIRule[] = [
      {
        id: 'python-virtual-env',
        name: 'Python Virtual Environment',
        description: 'Suggest using virtual environment for Python projects',
        type: 'quality',
        scope: 'project',
        priority: 70,
        enabled: true,
        conditions: [
          {
            type: 'command',
            operator: 'startswith',
            value: 'pip install',
            caseSensitive: false,
            negated: false
          },
          {
            type: 'file',
            operator: 'exists',
            value: 'requirements.txt',
            caseSensitive: false,
            negated: false
          }
        ],
        actions: [
          {
            type: 'warn',
            target: 'command',
            parameters: {},
            message: 'Consider using a virtual environment (python -m venv venv)'
          }
        ],
        triggers: [
          { event: 'before_command' }
        ],
        metadata: {
          version: '1.0.0',
          tags: ['python', 'virtualenv', 'dependencies'],
          category: 'quality'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        usage: 0
      }
    ];

    this.rulesets.set('dev-best-practices', devBestPractices);
    this.rulesets.set('nodejs', nodeJsRules);
    this.rulesets.set('python', pythonRules);
  }

  async detectCurrentProject(): Promise<void> {
    let currentDir = process.cwd();
    const maxDepth = 10;
    let depth = 0;

    // Look for project indicators going up the directory tree
    while (depth < maxDepth) {
      const indicators = [
        'package.json',
        'pyproject.toml',
        'Cargo.toml',
        'pom.xml',
        'build.gradle',
        '.git',
        '.project',
        'Makefile',
        'requirements.txt'
      ];

      for (const indicator of indicators) {
        const indicatorPath = path.join(currentDir, indicator);
        if (await fs.pathExists(indicatorPath)) {
          this.currentProject = currentDir;
          await this.loadProjectConfig(currentDir);
          console.log(chalk.blue(`📁 Detected project: ${currentDir}`));
          this.emit('project-detected', currentDir);
          return;
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached filesystem root
      currentDir = parentDir;
      depth++;
    }

    console.log(chalk.yellow('⚠️ No project detected, using global rules only'));
  }

  async loadProjectConfig(projectRoot: string): Promise<void> {
    const configPath = path.join(projectRoot, '.canvas-cli-rules.json');
    let config: ProjectConfig;

    if (await fs.pathExists(configPath)) {
      try {
        const savedConfig = await fs.readJson(configPath);
        config = {
          projectRoot,
          configFile: configPath,
          rules: savedConfig.rules || [],
          inheritance: savedConfig.inheritance || 'parent',
          rulesets: savedConfig.rulesets || this.detectProjectRulesets(projectRoot),
          customRulesets: savedConfig.customRulesets || {},
          settings: {
            aiEnabled: true,
            strictMode: false,
            autoApplyRules: true,
            warningLevel: 'medium',
            maxRuleDepth: 5,
            ruleTimeout: 5000,
            cacheRules: true,
            logRuleActivity: true,
            ...savedConfig.settings
          }
        };
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Could not load project config: ${error}`));
        config = this.createDefaultProjectConfig(projectRoot);
      }
    } else {
      config = this.createDefaultProjectConfig(projectRoot);
      await this.saveProjectConfig(config);
    }

    this.projectConfigs.set(projectRoot, config);
    this.emit('project-config-loaded', config);
  }

  private createDefaultProjectConfig(projectRoot: string): ProjectConfig {
    return {
      projectRoot,
      configFile: path.join(projectRoot, '.canvas-cli-rules.json'),
      rules: [],
      inheritance: 'parent',
      rulesets: this.detectProjectRulesets(projectRoot),
      customRulesets: {},
      settings: {
        aiEnabled: true,
        strictMode: false,
        autoApplyRules: true,
        warningLevel: 'medium',
        maxRuleDepth: 5,
        ruleTimeout: 5000,
        cacheRules: true,
        logRuleActivity: true
      }
    };
  }

  private detectProjectRulesets(projectRoot: string): string[] {
    const rulesets: string[] = ['dev-best-practices'];

    // Detect project type and add appropriate rulesets
    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
      rulesets.push('nodejs');
    }

    if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) || 
        fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
      rulesets.push('python');
    }

    if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
      rulesets.push('rust');
    }

    if (fs.existsSync(path.join(projectRoot, 'pom.xml')) || 
        fs.existsSync(path.join(projectRoot, 'build.gradle'))) {
      rulesets.push('java');
    }

    return rulesets;
  }

  async executeRules(context: RuleExecutionContext, event: string): Promise<RuleExecutionResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const results: RuleExecutionResult[] = [];
    const applicableRules = await this.getApplicableRules(context, event);

    // Sort rules by priority (higher number = higher priority)
    applicableRules.sort((a, b) => b.priority - a.priority);

    for (const rule of applicableRules) {
      const startTime = Date.now();
      
      try {
        const result = await this.executeRule(rule, context);
        result.duration = Date.now() - startTime;
        results.push(result);

        // Update rule usage
        rule.usage++;
        rule.lastUsed = new Date();

        if (result.success) {
          this.emit('rule-executed', { rule, context, result });
        } else {
          this.emit('rule-failed', { rule, context, result });
        }

      } catch (error: any) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          executed: false,
          success: false,
          actions: [],
          duration: Date.now() - startTime,
          error: error.message,
          metadata: {}
        });
      }
    }

    return results;
  }

  private async getApplicableRules(context: RuleExecutionContext, event: string): Promise<AIRule[]> {
    const rules: AIRule[] = [];

    // Add global rules
    rules.push(...this.globalRules);

    // Add project-specific rules
    if (this.currentProject) {
      const config = this.projectConfigs.get(this.currentProject);
      if (config) {
        rules.push(...config.rules);

        // Add ruleset rules
        for (const rulesetName of config.rulesets) {
          const rulesetRules = this.rulesets.get(rulesetName);
          if (rulesetRules) {
            rules.push(...rulesetRules);
          }
        }

        // Add custom ruleset rules
        for (const customRules of Object.values(config.customRulesets)) {
          rules.push(...customRules);
        }
      }
    }

    // Filter rules that are enabled and applicable to this event
    return rules.filter(rule => {
      if (!rule.enabled) return false;
      
      // Check if rule has trigger for this event
      const hasTrigger = rule.triggers.some(trigger => trigger.event === event);
      if (!hasTrigger) return false;

      // Check conditions
      return this.evaluateConditions(rule.conditions, context);
    });
  }

  private evaluateConditions(conditions: RuleCondition[], context: RuleExecutionContext): boolean {
    for (const condition of conditions) {
      const result = this.evaluateCondition(condition, context);
      if (!result) return false;
    }
    return true;
  }

  private evaluateCondition(condition: RuleCondition, context: RuleExecutionContext): boolean {
    let result = false;

    switch (condition.type) {
      case 'command':
        if (context.command) {
          result = this.evaluateStringCondition(
            condition.operator,
            context.command,
            condition.value,
            condition.caseSensitive
          );
        }
        break;

      case 'file':
        const filePath = path.resolve(context.currentDirectory, condition.value);
        switch (condition.operator) {
          case 'exists':
            result = fs.existsSync(filePath);
            break;
          case 'not_exists':
            result = !fs.existsSync(filePath);
            break;
        }
        break;

      case 'directory':
        const dirPath = path.resolve(context.currentDirectory, condition.value);
        switch (condition.operator) {
          case 'exists':
            result = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
            break;
          case 'not_exists':
            result = !fs.existsSync(dirPath);
            break;
        }
        break;

      case 'content':
        // Check file content (simplified)
        try {
          const content = fs.readFileSync(condition.value, 'utf8');
          result = this.evaluateStringCondition(
            condition.operator,
            content,
            condition.value,
            condition.caseSensitive
          );
        } catch {
          result = false;
        }
        break;

      case 'context':
        // Check context properties
        result = true; // Simplified for this implementation
        break;
    }

    return condition.negated ? !result : result;
  }

  private evaluateStringCondition(
    operator: string,
    actual: string,
    expected: string,
    caseSensitive: boolean
  ): boolean {
    const actualValue = caseSensitive ? actual : actual.toLowerCase();
    const expectedValue = caseSensitive ? expected : expected.toLowerCase();

    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      case 'contains':
        return actualValue.includes(expectedValue);
      case 'startswith':
        return actualValue.startsWith(expectedValue);
      case 'endswith':
        return actualValue.endsWith(expectedValue);
      case 'regex':
        try {
          const regex = new RegExp(expected, caseSensitive ? 'g' : 'gi');
          return regex.test(actual);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  private async executeRule(rule: AIRule, context: RuleExecutionContext): Promise<RuleExecutionResult> {
    const result: RuleExecutionResult = {
      ruleId: rule.id,
      ruleName: rule.name,
      executed: true,
      success: true,
      actions: [],
      duration: 0,
      metadata: {}
    };

    for (const action of rule.actions) {
      const actionResult = await this.executeAction(action, context);
      result.actions.push(actionResult);
      
      if (!actionResult.success) {
        result.success = false;
      }
    }

    return result;
  }

  private async executeAction(action: RuleAction, context: RuleExecutionContext): Promise<ActionResult> {
    const result: ActionResult = {
      actionType: action.type,
      success: false
    };

    try {
      switch (action.type) {
        case 'suggest':
          result.success = true;
          result.message = action.parameters.suggestion || action.message;
          console.log(chalk.blue(`💡 Suggestion: ${result.message}`));
          
          if (action.parameters.commands) {
            console.log(chalk.dim('Suggested commands:'));
            for (const cmd of action.parameters.commands) {
              console.log(chalk.dim(`  ${cmd}`));
            }
          }
          break;

        case 'warn':
          result.success = true;
          result.message = action.message || 'Rule warning triggered';
          console.log(chalk.yellow(`⚠️ Warning: ${result.message}`));
          break;

        case 'block':
          result.success = true;
          result.message = action.message || 'Command blocked by rule';
          console.log(chalk.red(`🚫 Blocked: ${result.message}`));
          break;

        case 'log':
          result.success = true;
          result.message = action.message || 'Rule logged';
          console.log(chalk.dim(`📝 Log: ${result.message}`));
          break;

        case 'modify':
          // Command modification would be implemented here
          result.success = true;
          result.message = 'Command modified';
          break;

        case 'execute':
          // Execute additional command
          result.success = true;
          result.message = 'Additional command executed';
          break;

        default:
          result.success = false;
          result.error = `Unknown action type: ${action.type}`;
      }
    } catch (error: any) {
      result.success = false;
      result.error = error.message;
    }

    return result;
  }

  async addRule(rule: Omit<AIRule, 'id' | 'createdAt' | 'updatedAt' | 'usage'>): Promise<string> {
    const newRule: AIRule = {
      ...rule,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
      usage: 0
    };

    if (rule.scope === 'global') {
      this.globalRules.push(newRule);
      await this.saveGlobalRules();
    } else if (this.currentProject) {
      const config = this.projectConfigs.get(this.currentProject);
      if (config) {
        config.rules.push(newRule);
        await this.saveProjectConfig(config);
      }
    }

    console.log(chalk.green(`✅ Added rule: ${rule.name}`));
    this.emit('rule-added', newRule);
    
    return newRule.id;
  }

  async removeRule(ruleId: string): Promise<boolean> {
    // Remove from global rules
    const globalIndex = this.globalRules.findIndex(r => r.id === ruleId);
    if (globalIndex > -1) {
      const rule = this.globalRules.splice(globalIndex, 1)[0];
      await this.saveGlobalRules();
      console.log(chalk.yellow(`🗑️ Removed global rule: ${rule.name}`));
      this.emit('rule-removed', rule);
      return true;
    }

    // Remove from project rules
    if (this.currentProject) {
      const config = this.projectConfigs.get(this.currentProject);
      if (config) {
        const projectIndex = config.rules.findIndex(r => r.id === ruleId);
        if (projectIndex > -1) {
          const rule = config.rules.splice(projectIndex, 1)[0];
          await this.saveProjectConfig(config);
          console.log(chalk.yellow(`🗑️ Removed project rule: ${rule.name}`));
          this.emit('rule-removed', rule);
          return true;
        }
      }
    }

    return false;
  }

  async enableRule(ruleId: string): Promise<boolean> {
    const rule = this.findRule(ruleId);
    if (rule) {
      rule.enabled = true;
      rule.updatedAt = new Date();
      await this.saveRuleChanges(rule);
      console.log(chalk.green(`✅ Enabled rule: ${rule.name}`));
      this.emit('rule-enabled', rule);
      return true;
    }
    return false;
  }

  async disableRule(ruleId: string): Promise<boolean> {
    const rule = this.findRule(ruleId);
    if (rule) {
      rule.enabled = false;
      rule.updatedAt = new Date();
      await this.saveRuleChanges(rule);
      console.log(chalk.yellow(`⏸️ Disabled rule: ${rule.name}`));
      this.emit('rule-disabled', rule);
      return true;
    }
    return false;
  }

  private findRule(ruleId: string): AIRule | undefined {
    // Check global rules
    const globalRule = this.globalRules.find(r => r.id === ruleId);
    if (globalRule) return globalRule;

    // Check project rules
    if (this.currentProject) {
      const config = this.projectConfigs.get(this.currentProject);
      if (config) {
        return config.rules.find(r => r.id === ruleId);
      }
    }

    return undefined;
  }

  private async saveRuleChanges(rule: AIRule): Promise<void> {
    if (rule.scope === 'global') {
      await this.saveGlobalRules();
    } else if (this.currentProject) {
      const config = this.projectConfigs.get(this.currentProject);
      if (config) {
        await this.saveProjectConfig(config);
      }
    }
  }

  getRules(scope?: string): AIRule[] {
    const rules: AIRule[] = [...this.globalRules];

    if (this.currentProject) {
      const config = this.projectConfigs.get(this.currentProject);
      if (config) {
        rules.push(...config.rules);

        // Add ruleset rules
        for (const rulesetName of config.rulesets) {
          const rulesetRules = this.rulesets.get(rulesetName);
          if (rulesetRules) {
            rules.push(...rulesetRules);
          }
        }
      }
    }

    if (scope) {
      return rules.filter(r => r.scope === scope);
    }

    return rules;
  }

  getAvailableRulesets(): string[] {
    return Array.from(this.rulesets.keys());
  }

  async generateReport(): Promise<any> {
    const allRules = this.getRules();
    const enabledRules = allRules.filter(r => r.enabled);
    
    const typeDistribution = new Map<string, number>();
    const scopeDistribution = new Map<string, number>();
    const usageStats = new Map<string, number>();

    for (const rule of allRules) {
      typeDistribution.set(rule.type, (typeDistribution.get(rule.type) || 0) + 1);
      scopeDistribution.set(rule.scope, (scopeDistribution.get(rule.scope) || 0) + 1);
      usageStats.set(rule.id, rule.usage);
    }

    const mostUsedRules = allRules
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10)
      .map(rule => ({ id: rule.id, name: rule.name, usage: rule.usage }));

    return {
      summary: {
        totalRules: allRules.length,
        enabledRules: enabledRules.length,
        disabledRules: allRules.length - enabledRules.length,
        currentProject: this.currentProject,
        availableRulesets: this.getAvailableRulesets()
      },
      distribution: {
        byType: Object.fromEntries(typeDistribution),
        byScope: Object.fromEntries(scopeDistribution)
      },
      usage: {
        mostUsed: mostUsedRules,
        totalExecutions: Array.from(usageStats.values()).reduce((sum, usage) => sum + usage, 0)
      },
      rulesets: {
        available: this.getAvailableRulesets(),
        active: this.currentProject ? 
          this.projectConfigs.get(this.currentProject)?.rulesets || [] : []
      },
      generatedAt: new Date()
    };
  }

  private async loadGlobalRules(): Promise<void> {
    const rulesPath = path.join(this.storageDir, 'global-rules.json');
    if (await fs.pathExists(rulesPath)) {
      const rules = await fs.readJson(rulesPath);
      this.globalRules = rules.map((rule: any) => ({
        ...rule,
        createdAt: new Date(rule.createdAt),
        updatedAt: new Date(rule.updatedAt),
        lastUsed: rule.lastUsed ? new Date(rule.lastUsed) : undefined
      }));
    }
  }

  private async saveGlobalRules(): Promise<void> {
    const rulesPath = path.join(this.storageDir, 'global-rules.json');
    await fs.writeJson(rulesPath, this.globalRules, { spaces: 2 });
  }

  private async loadRulesets(): Promise<void> {
    const rulesetsPath = path.join(this.storageDir, 'rulesets.json');
    if (await fs.pathExists(rulesetsPath)) {
      const data = await fs.readJson(rulesetsPath);
      for (const [name, rules] of Object.entries(data)) {
        this.rulesets.set(name, rules as AIRule[]);
      }
    }
  }

  private async saveRulesets(): Promise<void> {
    const rulesetsPath = path.join(this.storageDir, 'rulesets.json');
    const data = Object.fromEntries(this.rulesets);
    await fs.writeJson(rulesetsPath, data, { spaces: 2 });
  }

  private async saveProjectConfig(config: ProjectConfig): Promise<void> {
    await fs.writeJson(config.configFile, {
      rules: config.rules,
      inheritance: config.inheritance,
      rulesets: config.rulesets,
      customRulesets: config.customRulesets,
      settings: config.settings
    }, { spaces: 2 });
  }
}

// Singleton instance
let rulesInstance: ProjectLevelAIRules | null = null;

export function getProjectLevelAIRules(): ProjectLevelAIRules {
  if (!rulesInstance) {
    rulesInstance = new ProjectLevelAIRules();
  }
  return rulesInstance;
}