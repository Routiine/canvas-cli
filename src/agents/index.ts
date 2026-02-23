/**
 * Canvas CLI Agent System
 * Similar to Claude Code's Task agents - specialized agents for different tasks
 */

import { ThemeManager } from '../themes.js';
import { ToolRegistry } from '../tools/registry.js';
import { loadConfig } from '../config.js';

export type AgentType =
  | 'explore'      // Fast codebase exploration
  | 'plan'         // Software architect for planning
  | 'code'         // Code writing and editing
  | 'shell'        // Shell command execution
  | 'git'          // Git operations
  | 'research'     // Web research
  | 'refactor'     // Code refactoring
  | 'test'         // Test writing
  | 'review'       // Code review
  | 'general';     // General purpose

export interface AgentConfig {
  type: AgentType;
  description: string;
  tools: string[];
  systemPrompt: string;
  model?: string;  // Optional model override
}

export interface AgentTask {
  id: string;
  type: AgentType;
  prompt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  background?: boolean;
}

/**
 * Agent definitions
 */
export const AGENTS: Record<AgentType, AgentConfig> = {
  explore: {
    type: 'explore',
    description: 'Fast codebase exploration - find files, search code, understand structure',
    tools: ['read_file', 'list_directory', 'glob', 'grep', 'search_files'],
    systemPrompt: `You are a codebase exploration agent. Your job is to quickly find and understand code.
- Use glob to find files by pattern
- Use grep to search for code patterns
- Use read_file to examine specific files
- Provide concise summaries of what you find
- Focus on answering the specific question asked`
  },

  plan: {
    type: 'plan',
    description: 'Software architect - design implementation plans and strategies',
    tools: ['read_file', 'list_directory', 'glob', 'grep'],
    systemPrompt: `You are a software architect agent. Your job is to plan implementations.
- Analyze the codebase structure
- Identify critical files and patterns
- Design step-by-step implementation plans
- Consider architectural trade-offs
- Return actionable plans with specific file paths`
  },

  code: {
    type: 'code',
    description: 'Code writing - implement features, fix bugs, write new code',
    tools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'glob', 'grep'],
    systemPrompt: `You are a coding agent. Your job is to write and modify code.
- Read files before editing them
- Use edit_file for precise changes (old_string/new_string)
- Use write_file for new files
- Follow existing code patterns and style
- Keep changes minimal and focused`
  },

  shell: {
    type: 'shell',
    description: 'Shell operations - run commands, manage processes, system tasks',
    tools: ['run_shell_command', 'get_environment', 'list_directory'],
    systemPrompt: `You are a shell agent. Your job is to execute system commands.
- Run shell commands to accomplish tasks
- Check command results and handle errors
- Chain commands when needed
- Be careful with destructive commands (rm, etc.)`
  },

  git: {
    type: 'git',
    description: 'Git operations - commits, branches, diffs, PRs',
    tools: ['git_status', 'git_diff', 'git_add', 'git_commit', 'git_push', 'git_pull', 'git_branch', 'git_log', 'github_pr'],
    systemPrompt: `You are a git agent. Your job is to manage version control.
- Check status and diffs before committing
- Write clear, descriptive commit messages
- Handle branches and merges carefully
- Create PRs with good descriptions`
  },

  research: {
    type: 'research',
    description: 'Web research - search, fetch, and synthesize information',
    tools: ['web_search', 'web_fetch', 'api_request'],
    systemPrompt: `You are a research agent. Your job is to find and synthesize information.
- Use web_search to find relevant sources
- Use web_fetch to get page content
- Synthesize information into clear summaries
- Cite sources when possible`
  },

  refactor: {
    type: 'refactor',
    description: 'Code refactoring - improve code quality without changing behavior',
    tools: ['read_file', 'edit_file', 'glob', 'grep', 'multi_edit'],
    systemPrompt: `You are a refactoring agent. Your job is to improve code quality.
- Identify code smells and patterns to improve
- Make incremental, safe changes
- Preserve existing behavior
- Add comments only where logic is complex`
  },

  test: {
    type: 'test',
    description: 'Test writing - create unit tests, integration tests',
    tools: ['read_file', 'write_file', 'glob', 'grep', 'run_shell_command'],
    systemPrompt: `You are a testing agent. Your job is to write tests.
- Analyze code to identify what needs testing
- Write comprehensive but focused tests
- Follow existing test patterns in the codebase
- Run tests to verify they pass`
  },

  review: {
    type: 'review',
    description: 'Code review - analyze code for issues, suggest improvements',
    tools: ['read_file', 'glob', 'grep', 'git_diff'],
    systemPrompt: `You are a code review agent. Your job is to review code quality.
- Check for bugs, security issues, and code smells
- Suggest improvements with specific examples
- Be constructive and explain why changes help
- Focus on important issues, not nitpicks`
  },

  general: {
    type: 'general',
    description: 'General purpose - multi-step tasks, complex operations',
    tools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'glob', 'grep', 'run_shell_command', 'web_search', 'web_fetch'],
    systemPrompt: `You are a general purpose agent. You can handle complex multi-step tasks.
- Break down complex tasks into steps
- Use the right tool for each step
- Verify results as you go
- Handle errors gracefully`
  }
};

/**
 * Agent Manager - handles agent lifecycle
 */
export class AgentManager {
  private tasks: Map<string, AgentTask> = new Map();
  private theme: ThemeManager;
  private toolRegistry: ToolRegistry;

  constructor(theme: ThemeManager, toolRegistry: ToolRegistry) {
    this.theme = theme;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Create a new agent task
   */
  createTask(type: AgentType, prompt: string, background: boolean = false): AgentTask {
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const task: AgentTask = {
      id,
      type,
      prompt,
      status: 'pending',
      background
    };
    this.tasks.set(id, task);
    return task;
  }

  /**
   * Run an agent task
   */
  async runTask(taskId: string): Promise<string> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const agent = AGENTS[task.type];
    if (!agent) throw new Error(`Unknown agent type: ${task.type}`);

    task.status = 'running';
    task.startTime = new Date();

    console.log('');
    console.log(this.theme.dim(`  agent: ${task.type}`));
    console.log(this.theme.secondary(`  ${agent.description}`));
    console.log('');

    try {
      // Build the agent prompt
      const fullPrompt = this.buildAgentPrompt(agent, task.prompt);

      // Execute with available tools
      const result = await this.executeAgentLoop(agent, fullPrompt);

      task.status = 'completed';
      task.result = result;
      task.endTime = new Date();

      const elapsed = ((task.endTime.getTime() - task.startTime!.getTime()) / 1000).toFixed(1);
      console.log(this.theme.dim(`  completed (${elapsed}s)`));

      return result;
    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      task.endTime = new Date();

      console.log(this.theme.error(`  failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Build agent prompt with context
   */
  private buildAgentPrompt(agent: AgentConfig, userPrompt: string): string {
    const toolList = agent.tools
      .filter(t => this.toolRegistry.get(t))
      .map(t => {
        const tool = this.toolRegistry.get(t)!;
        return `- ${t}: ${tool.description}`;
      })
      .join('\n');

    return `${agent.systemPrompt}

AVAILABLE TOOLS:
${toolList}

TOOL FORMAT:
TOOL: tool_name PARAMS: {"param": "value"}

USER REQUEST:
${userPrompt}

Execute the task using the tools above. Be concise and focused.`;
  }

  /**
   * Execute agent loop (simplified - in production would call LLM)
   */
  private async executeAgentLoop(agent: AgentConfig, prompt: string): Promise<string> {
    // This is a placeholder - in production, this would:
    // 1. Call the LLM with the prompt
    // 2. Parse tool calls from response
    // 3. Execute tools
    // 4. Feed results back to LLM
    // 5. Repeat until done

    // For now, return the prompt as acknowledgment
    return `Agent ${agent.type} received task. Implementation pending LLM integration.`;
  }

  /**
   * Get task by ID
   */
  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * List all tasks
   */
  listTasks(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): AgentTask[] {
    return this.listTasks().filter(t => t.status === 'running');
  }

  /**
   * Get background tasks
   */
  getBackgroundTasks(): AgentTask[] {
    return this.listTasks().filter(t => t.background);
  }
}

// Singleton instance
let agentManager: AgentManager | null = null;

export function getAgentManager(theme?: ThemeManager, toolRegistry?: ToolRegistry): AgentManager {
  if (!agentManager && theme && toolRegistry) {
    agentManager = new AgentManager(theme, toolRegistry);
  }
  if (!agentManager) {
    throw new Error('AgentManager not initialized');
  }
  return agentManager;
}

export function resetAgentManager(): void {
  agentManager = null;
}
