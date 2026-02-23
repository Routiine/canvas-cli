/**
 * Task Tool - Launch specialized agents like Claude Code's Task tool
 */

import type { Tool } from '../types.js';
import type { AgentType} from '../agents/index.js';
import { AGENTS, getAgentManager } from '../agents/index.js';
import type { ThemeManager } from '../themes.js';
import type { ToolRegistry } from './registry.js';

export class TaskTool implements Tool {
  name = 'task';
  description = 'Launch a specialized agent to handle complex tasks. Agent types: explore, plan, code, shell, git, research, refactor, test, review, general';
  parameters = {
    agent_type: {
      type: 'string',
      description: 'Type of agent: explore, plan, code, shell, git, research, refactor, test, review, general',
      optional: false
    },
    prompt: {
      type: 'string',
      description: 'The task for the agent to perform',
      optional: false
    },
    background: {
      type: 'boolean',
      description: 'Run in background (default: false)',
      optional: true
    }
  };

  private theme: ThemeManager;
  private toolRegistry: ToolRegistry;

  constructor(theme: ThemeManager, toolRegistry: ToolRegistry) {
    this.theme = theme;
    this.toolRegistry = toolRegistry;
  }

  async execute(params: { agent_type: string; prompt: string; background?: boolean }): Promise<string> {
    const { agent_type, prompt, background = false } = params;

    // Validate inputs
    if (!agent_type || typeof agent_type !== 'string') {
      return 'Error: agent_type is required';
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return 'Error: prompt is required';
    }

    // Validate agent type
    if (!AGENTS[agent_type as AgentType]) {
      const validTypes = Object.keys(AGENTS).join(', ');
      return `Unknown agent type: ${agent_type}. Valid types: ${validTypes}`;
    }

    const manager = getAgentManager(this.theme, this.toolRegistry);
    const task = manager.createTask(agent_type as AgentType, prompt, background);

    if (background) {
      // Run in background
      manager.runTask(task.id).catch(err => {
        console.log(this.theme.error(`Background task ${task.id} failed: ${err.message}`));
      });
      return `Started background task: ${task.id}`;
    }

    // Run synchronously
    return await manager.runTask(task.id);
  }
}

/**
 * Task Output Tool - Get output from running/completed tasks
 */
export class TaskOutputTool implements Tool {
  name = 'task_output';
  description = 'Get output from a running or completed agent task';
  parameters = {
    task_id: {
      type: 'string',
      description: 'The task ID to get output from',
      optional: false
    }
  };

  private theme: ThemeManager;
  private toolRegistry: ToolRegistry;

  constructor(theme: ThemeManager, toolRegistry: ToolRegistry) {
    this.theme = theme;
    this.toolRegistry = toolRegistry;
  }

  async execute(params: { task_id: string }): Promise<string> {
    if (!params.task_id || typeof params.task_id !== 'string' || !params.task_id.trim()) {
      return 'Error: task_id is required';
    }

    const manager = getAgentManager(this.theme, this.toolRegistry);
    const task = manager.getTask(params.task_id);

    if (!task) {
      return `Task not found: ${params.task_id}`;
    }

    const statusEmoji = {
      pending: '○',
      running: '◐',
      completed: '●',
      failed: '✗'
    }[task.status];

    let output = `Task: ${task.id}\n`;
    output += `Status: ${statusEmoji} ${task.status}\n`;
    output += `Type: ${task.type}\n`;

    if (task.startTime) {
      output += `Started: ${task.startTime.toISOString()}\n`;
    }
    if (task.endTime) {
      const elapsed = (task.endTime.getTime() - task.startTime!.getTime()) / 1000;
      output += `Duration: ${elapsed.toFixed(1)}s\n`;
    }
    if (task.result) {
      output += `\nResult:\n${task.result}`;
    }
    if (task.error) {
      output += `\nError: ${task.error}`;
    }

    return output;
  }
}

/**
 * List Tasks Tool - List all agent tasks
 */
export class ListTasksTool implements Tool {
  name = 'list_tasks';
  description = 'List all agent tasks and their status';
  parameters = {
    status: {
      type: 'string',
      description: 'Filter by status: pending, running, completed, failed (optional)',
      optional: true
    }
  };

  private theme: ThemeManager;
  private toolRegistry: ToolRegistry;

  constructor(theme: ThemeManager, toolRegistry: ToolRegistry) {
    this.theme = theme;
    this.toolRegistry = toolRegistry;
  }

  async execute(params: { status?: string }): Promise<string> {
    const manager = getAgentManager(this.theme, this.toolRegistry);
    let tasks = manager.listTasks();

    if (params.status) {
      tasks = tasks.filter(t => t.status === params.status);
    }

    if (tasks.length === 0) {
      return 'No tasks found';
    }

    const statusEmoji = {
      pending: '○',
      running: '◐',
      completed: '●',
      failed: '✗'
    };

    return tasks.map(task => {
      const emoji = statusEmoji[task.status];
      const bg = task.background ? ' (background)' : '';
      return `${emoji} ${task.id} [${task.type}] ${task.status}${bg}`;
    }).join('\n');
  }
}
