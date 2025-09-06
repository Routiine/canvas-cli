import { EventEmitter } from 'events';
import chalk from 'chalk';
import { getOrchestrator } from '../agents/orchestrator.js';
import { getHookSystem } from '../hooks/hookSystem.js';
import { getNotificationSystem } from '../hooks/notificationSystem.js';

export type Mode = 'ask' | 'code' | 'plan' | 'dev';

interface ModeConfig {
  name: Mode;
  description: string;
  color: string;
  icon: string;
  allowsExecution: boolean;
  enabledAgents: string[];
  enabledTools: string[];
  autoFeatures: string[];
}

interface ModeContext {
  previousMode: Mode | null;
  history: Array<{ mode: Mode; timestamp: Date; reason?: string }>;
  devModeAnalysis: {
    lastAnalysis: Date | null;
    suggestedMode: Mode | null;
    confidence: number;
  };
}

export class ModeManager extends EventEmitter {
  private currentMode: Mode = 'dev';
  private modeConfigs: Map<Mode, ModeConfig> = new Map();
  private context: ModeContext;
  private devModeActive: boolean = false;
  private autoSwitchEnabled: boolean = false;
  
  constructor() {
    super();
    this.initializeModes();
    this.context = {
      previousMode: null,
      history: [],
      devModeAnalysis: {
        lastAnalysis: null,
        suggestedMode: null,
        confidence: 0
      }
    };
  }
  
  private initializeModes(): void {
    // Ask Mode - Default conversational mode
    this.modeConfigs.set('ask', {
      name: 'ask',
      description: 'Conversational mode for questions and discussions',
      color: '#00ff88',
      icon: '💬',
      allowsExecution: false,
      enabledAgents: ['KnowledgeAgent', 'ResourceMonitorAgent'],
      enabledTools: ['tldr_pages', 'knowledge_search', 'web_search'],
      autoFeatures: ['smart_completion', 'context_injection']
    });
    
    // Code Mode - Active coding and execution
    this.modeConfigs.set('code', {
      name: 'code',
      description: 'Active coding mode with full execution capabilities',
      color: '#ff6b6b',
      icon: '⚡',
      allowsExecution: true,
      enabledAgents: [
        'AutomationAgent',
        'GitWorkflowAgent',
        'SessionManagerAgent',
        'FzfAgent'
      ],
      enabledTools: [
        'write_file',
        'edit_file',
        'run_shell_command',
        'git_*',
        'file_watcher',
        'just_runner'
      ],
      autoFeatures: [
        'auto_save',
        'auto_format',
        'auto_test',
        'error_detection'
      ]
    });
    
    // Plan Mode - Design and architecture
    this.modeConfigs.set('plan', {
      name: 'plan',
      description: 'Planning and design mode for architecture and workflows',
      color: '#4a9eff',
      icon: '📋',
      allowsExecution: false,
      enabledAgents: [
        'TaskManagementAgent',
        'KnowledgeAgent',
        'ResourceMonitorAgent'
      ],
      enabledTools: [
        'taskwarrior',
        'create_diagram',
        'write_file', // For documentation only
        'knowledge_search'
      ],
      autoFeatures: [
        'task_tracking',
        'workflow_generation',
        'documentation',
        'dependency_analysis'
      ]
    });
    
    // Dev Mode - Intelligent auto-switching
    this.modeConfigs.set('dev', {
      name: 'dev',
      description: 'Intelligent development mode that auto-switches based on context',
      color: '#ff00ff',
      icon: '🚀',
      allowsExecution: true,
      enabledAgents: [
        'ALL' // All agents available
      ],
      enabledTools: [
        'ALL' // All tools available
      ],
      autoFeatures: [
        'auto_mode_switching',
        'context_aware_execution',
        'intelligent_assistance',
        'workflow_automation'
      ]
    });
  }
  
  getCurrentMode(): Mode {
    return this.currentMode;
  }
  
  getModeConfig(mode?: Mode): ModeConfig | undefined {
    return this.modeConfigs.get(mode || this.currentMode);
  }
  
  async setMode(mode: Mode, reason?: string): Promise<void> {
    if (!this.modeConfigs.has(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }
    
    const previousMode = this.currentMode;
    this.context.previousMode = previousMode;
    this.currentMode = mode;
    
    // Track mode change
    this.context.history.push({
      mode,
      timestamp: new Date(),
      reason
    });
    
    // Special handling for dev mode
    if (mode === 'dev') {
      this.devModeActive = true;
      this.autoSwitchEnabled = true;
      console.log(chalk.magenta('🚀 Dev mode activated - Auto-switching enabled'));
    } else {
      this.devModeActive = false;
      this.autoSwitchEnabled = false;
    }
    
    // Configure environment for new mode
    await this.configureEnvironment(mode);
    
    // Emit mode change event
    this.emit('mode-changed', {
      from: previousMode,
      to: mode,
      reason
    });
    
    // Display mode change
    const config = this.modeConfigs.get(mode)!;
    console.log(chalk.hex(config.color)(
      `\n${config.icon} Mode: ${config.name.toUpperCase()}\n` +
      chalk.dim(`   ${config.description}`)
    ));
    
    // Notify about capabilities
    if (config.allowsExecution) {
      console.log(chalk.yellow('   ⚡ Execution enabled'));
    } else {
      console.log(chalk.gray('   💭 Planning/discussion only'));
    }
  }
  
  private async configureEnvironment(mode: Mode): Promise<void> {
    const config = this.modeConfigs.get(mode)!;
    const orchestrator = await getOrchestrator();
    const hookSystem = getHookSystem();
    
    // Configure agents
    if (config.enabledAgents.includes('ALL')) {
      // Enable all agents for dev mode
      const status = orchestrator.getStatus();
      for (const agentName of status.agents) {
        // Agent is already active in orchestrator
      }
    } else {
      // Enable specific agents for this mode
      const status = orchestrator.getStatus();
      for (const agentName of status.agents) {
        const shouldBeEnabled = config.enabledAgents.includes(agentName);
        // In future, could selectively enable/disable agents
      }
    }
    
    // Configure hooks based on mode
    if (config.allowsExecution) {
      hookSystem.enableHook('command-logger');
      hookSystem.enableHook('security-validator');
    } else {
      hookSystem.disableHook('security-validator'); // Less strict in planning
    }
    
    // Configure auto-features
    for (const feature of config.autoFeatures) {
      await this.enableAutoFeature(feature);
    }
  }
  
  private async enableAutoFeature(feature: string): Promise<void> {
    switch (feature) {
      case 'auto_mode_switching':
        this.autoSwitchEnabled = true;
        break;
      case 'smart_completion':
        // Already enabled through hooks
        break;
      case 'auto_save':
        // Enable auto-save for code
        break;
      case 'task_tracking':
        // Enable task tracking for planning
        break;
      // Add more features as needed
    }
  }
  
  async analyzeForModeSwitch(input: string): Promise<Mode | null> {
    if (!this.devModeActive || !this.autoSwitchEnabled) {
      return null;
    }
    
    const lowerInput = input.toLowerCase();
    
    // Analyze input patterns for mode detection
    const patterns = {
      ask: {
        keywords: ['what', 'why', 'how', 'explain', 'tell me', 'describe', 'help'],
        patterns: [/^(what|why|how|can you|could you|please explain)/i],
        weight: 1.0
      },
      code: {
        keywords: ['write', 'create', 'implement', 'fix', 'debug', 'build', 'compile', 'run'],
        patterns: [/^(write|create|implement|fix|debug|build|run|execute)/i],
        weight: 1.2
      },
      plan: {
        keywords: ['plan', 'design', 'architect', 'organize', 'structure', 'workflow', 'todo'],
        patterns: [/^(plan|design|architect|let's think|we should|todo|task)/i],
        weight: 1.1
      }
    };
    
    const scores: { [key: string]: number } = {
      ask: 0,
      code: 0,
      plan: 0
    };
    
    // Calculate scores for each mode
    for (const [mode, config] of Object.entries(patterns)) {
      // Check keywords
      for (const keyword of config.keywords) {
        if (lowerInput.includes(keyword)) {
          scores[mode] += config.weight;
        }
      }
      
      // Check patterns
      for (const pattern of config.patterns) {
        if (pattern.test(input)) {
          scores[mode] += config.weight * 1.5;
        }
      }
    }
    
    // Additional context-based scoring
    if (lowerInput.includes('file') || lowerInput.includes('.')) {
      scores.code += 0.5;
    }
    
    if (lowerInput.includes('?')) {
      scores.ask += 0.8;
    }
    
    if (lowerInput.includes('project') || lowerInput.includes('feature')) {
      scores.plan += 0.6;
    }
    
    // Find the best mode
    let bestMode: Mode | null = null;
    let bestScore = 0;
    
    for (const [mode, score] of Object.entries(scores)) {
      if (score > bestScore && score > 1.0) { // Minimum threshold
        bestMode = mode as Mode;
        bestScore = score;
      }
    }
    
    // Update analysis context
    this.context.devModeAnalysis = {
      lastAnalysis: new Date(),
      suggestedMode: bestMode,
      confidence: bestScore / 3.0 // Normalize confidence
    };
    
    // Only switch if confident enough and different from current
    if (bestMode && bestScore > 1.5 && bestMode !== this.currentMode) {
      return bestMode;
    }
    
    return null;
  }
  
  async handleDevMode(input: string): Promise<boolean> {
    if (!this.devModeActive) {
      return false;
    }
    
    // Analyze input for potential mode switch
    const suggestedMode = await this.analyzeForModeSwitch(input);
    
    if (suggestedMode && suggestedMode !== this.currentMode) {
      console.log(chalk.dim(`\n🔄 Auto-switching to ${suggestedMode} mode...`));
      await this.setMode(suggestedMode, 'Auto-detected from input');
      return true;
    }
    
    return false;
  }
  
  canExecute(): boolean {
    const config = this.getModeConfig();
    return config?.allowsExecution || false;
  }
  
  isAgentEnabled(agentName: string): boolean {
    const config = this.getModeConfig();
    if (!config) return false;
    
    return config.enabledAgents.includes('ALL') || 
           config.enabledAgents.includes(agentName);
  }
  
  isToolEnabled(toolName: string): boolean {
    const config = this.getModeConfig();
    if (!config) return false;
    
    if (config.enabledTools.includes('ALL')) return true;
    
    // Check exact match or pattern match
    return config.enabledTools.some(pattern => {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return toolName.startsWith(prefix);
      }
      return pattern === toolName;
    });
  }
  
  getModeHelp(): string {
    const lines: string[] = [];
    const current = this.currentMode;
    
    lines.push(chalk.bold('\n📖 Available Modes:\n'));
    
    for (const [mode, config] of this.modeConfigs) {
      const isCurrent = mode === current;
      const prefix = isCurrent ? '▶ ' : '  ';
      const color = chalk.hex(config.color);
      
      lines.push(color(
        `${prefix}${config.icon} /${mode} - ${config.description}`
      ));
      
      if (isCurrent) {
        lines.push(chalk.dim(`     Execution: ${config.allowsExecution ? 'Yes' : 'No'}`));
        lines.push(chalk.dim(`     Agents: ${config.enabledAgents.join(', ')}`));
      }
    }
    
    lines.push(chalk.dim('\nUse /[mode] to switch modes'));
    lines.push(chalk.dim('Use /dev for intelligent auto-switching\n'));
    
    return lines.join('\n');
  }
  
  getStatus(): any {
    const config = this.getModeConfig();
    
    return {
      currentMode: this.currentMode,
      description: config?.description,
      allowsExecution: config?.allowsExecution,
      devModeActive: this.devModeActive,
      autoSwitchEnabled: this.autoSwitchEnabled,
      enabledAgents: config?.enabledAgents,
      enabledTools: config?.enabledTools?.length,
      history: this.context.history.slice(-5),
      lastAnalysis: this.context.devModeAnalysis
    };
  }
  
  reset(): void {
    this.currentMode = 'dev';
    this.devModeActive = false;
    this.autoSwitchEnabled = false;
    this.context.previousMode = null;
    this.context.history = [];
  }
}

// Singleton instance
let modeManagerInstance: ModeManager | null = null;

export function getModeManager(): ModeManager {
  if (!modeManagerInstance) {
    modeManagerInstance = new ModeManager();
  }
  return modeManagerInstance;
}

// Helper functions
export async function setMode(mode: Mode, reason?: string): Promise<void> {
  const manager = getModeManager();
  await manager.setMode(mode, reason);
}

export function getCurrentMode(): Mode {
  const manager = getModeManager();
  return manager.getCurrentMode();
}

export function canExecute(): boolean {
  const manager = getModeManager();
  return manager.canExecute();
}

export async function handleDevModeInput(input: string): Promise<boolean> {
  const manager = getModeManager();
  return await manager.handleDevMode(input);
}