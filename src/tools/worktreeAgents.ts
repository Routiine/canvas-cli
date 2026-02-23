/**
 * Git Worktree Parallel Agents - Run agents in parallel using git worktrees
 * Similar to Kilo Code's parallel agent capabilities
 */

import { Tool } from '../types.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

interface WorktreeAgent {
  id: string;
  worktree: string;
  branch: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  result?: string;
  error?: string;
  pid?: number;
}

// Active worktree agents
const worktreeAgents: Map<string, WorktreeAgent> = new Map();

/**
 * Check if git worktree is available
 */
async function isGitWorktreeAvailable(): Promise<boolean> {
  try {
    await execAsync('git worktree list');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git root directory
 */
async function getGitRoot(): Promise<string> {
  const { stdout } = await execAsync('git rev-parse --show-toplevel');
  return stdout.trim();
}

/**
 * Create unique branch name
 */
function generateBranchName(prefix: string = 'agent'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Worktree Create Tool
 */
export class WorktreeCreateTool implements Tool {
  name = 'worktree_create';
  description = 'Create a new git worktree for parallel work';
  parameters = {
    name: {
      type: 'string',
      description: 'Name for the worktree/branch',
      optional: true
    },
    base: {
      type: 'string',
      description: 'Base branch to create from (default: current branch)',
      optional: true
    },
    path: {
      type: 'string',
      description: 'Custom path for worktree (default: ../worktrees/<name>)',
      optional: true
    }
  };

  async execute(params: { name?: string; base?: string; path?: string }): Promise<string> {
    if (!await isGitWorktreeAvailable()) {
      return 'Git worktree not available. Make sure you are in a git repository.';
    }

    const gitRoot = await getGitRoot();
    const branchName = params.name || generateBranchName();
    const worktreePath = params.path || path.join(path.dirname(gitRoot), 'worktrees', branchName);

    try {
      // Ensure parent directory exists
      await fs.ensureDir(path.dirname(worktreePath));

      // Create worktree with new branch
      const baseRef = params.base || 'HEAD';
      await execAsync(`git worktree add -b ${branchName} "${worktreePath}" ${baseRef}`);

      return `Created worktree:\n  Branch: ${branchName}\n  Path: ${worktreePath}`;
    } catch (error: any) {
      return `Failed to create worktree: ${error.message}`;
    }
  }
}

/**
 * Worktree List Tool
 */
export class WorktreeListTool implements Tool {
  name = 'worktree_list';
  description = 'List all git worktrees';
  parameters = {};

  async execute(): Promise<string> {
    if (!await isGitWorktreeAvailable()) {
      return 'Not in a git repository';
    }

    try {
      const { stdout } = await execAsync('git worktree list --porcelain');
      const lines = stdout.split('\n');
      const worktrees: Array<{ path: string; head: string; branch: string }> = [];

      let current: any = {};
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current);
          current = { path: line.substring(9) };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.substring(5, 12);
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring(7).replace('refs/heads/', '');
        }
      }
      if (current.path) worktrees.push(current);

      if (worktrees.length === 0) {
        return 'No worktrees found';
      }

      let output = 'Git Worktrees\n' + '='.repeat(40) + '\n\n';
      for (const wt of worktrees) {
        output += `📁 ${wt.branch || '(detached)'}\n`;
        output += `   ${wt.path}\n`;
        output += `   ${wt.head}\n\n`;
      }

      return output;
    } catch (error: any) {
      return `Error listing worktrees: ${error.message}`;
    }
  }
}

/**
 * Worktree Remove Tool
 */
export class WorktreeRemoveTool implements Tool {
  name = 'worktree_remove';
  description = 'Remove a git worktree';
  parameters = {
    path: {
      type: 'string',
      description: 'Path to the worktree to remove',
      optional: false
    },
    force: {
      type: 'boolean',
      description: 'Force removal even with uncommitted changes',
      optional: true
    },
    delete_branch: {
      type: 'boolean',
      description: 'Also delete the associated branch (default: false)',
      optional: true
    }
  };

  async execute(params: { path: string; force?: boolean; delete_branch?: boolean }): Promise<string> {
    try {
      const forceFlag = params.force ? '--force' : '';
      await execAsync(`git worktree remove ${forceFlag} "${params.path}"`);

      let result = `Removed worktree: ${params.path}`;

      if (params.delete_branch) {
        // Get branch name from worktree
        const branchName = path.basename(params.path);
        try {
          await execAsync(`git branch -d ${branchName}`);
          result += `\nDeleted branch: ${branchName}`;
        } catch {
          // Branch might not exist or have unmerged changes
        }
      }

      return result;
    } catch (error: any) {
      return `Failed to remove worktree: ${error.message}`;
    }
  }
}

/**
 * Parallel Agent Tool - Run task in worktree
 */
export class ParallelAgentTool implements Tool {
  name = 'parallel_agent';
  description = 'Launch a parallel agent in a git worktree';
  parameters = {
    task: {
      type: 'string',
      description: 'Task/command to execute in the worktree',
      optional: false
    },
    branch: {
      type: 'string',
      description: 'Branch name for the agent (auto-generated if not provided)',
      optional: true
    },
    base: {
      type: 'string',
      description: 'Base branch to create from',
      optional: true
    }
  };

  async execute(params: { task: string; branch?: string; base?: string }): Promise<string> {
    if (!await isGitWorktreeAvailable()) {
      return 'Git worktree not available';
    }

    const gitRoot = await getGitRoot();
    const branchName = params.branch || generateBranchName('agent');
    const worktreePath = path.join(path.dirname(gitRoot), 'worktrees', branchName);
    const agentId = `wt-${Date.now().toString(36)}`;

    try {
      // Create worktree
      await fs.ensureDir(path.dirname(worktreePath));
      const baseRef = params.base || 'HEAD';
      await execAsync(`git worktree add -b ${branchName} "${worktreePath}" ${baseRef}`);

      // Create agent record
      const agent: WorktreeAgent = {
        id: agentId,
        worktree: worktreePath,
        branch: branchName,
        task: params.task,
        status: 'running',
        startTime: new Date()
      };
      worktreeAgents.set(agentId, agent);

      // Run task in worktree (background)
      const child = spawn('sh', ['-c', params.task], {
        cwd: worktreePath,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      agent.pid = child.pid;
      let output = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        agent.endTime = new Date();
        if (code === 0) {
          agent.status = 'completed';
          agent.result = output;
        } else {
          agent.status = 'failed';
          agent.error = output || `Exit code: ${code}`;
        }
      });

      child.unref();

      return `Parallel agent launched:\n  ID: ${agentId}\n  Branch: ${branchName}\n  Worktree: ${worktreePath}\n  Task: ${params.task}`;
    } catch (error: any) {
      return `Failed to launch parallel agent: ${error.message}`;
    }
  }
}

/**
 * Parallel Agents Status Tool
 */
export class ParallelAgentsStatusTool implements Tool {
  name = 'parallel_agents_status';
  description = 'Check status of parallel worktree agents';
  parameters = {
    id: {
      type: 'string',
      description: 'Specific agent ID (optional, shows all if not provided)',
      optional: true
    }
  };

  async execute(params: { id?: string }): Promise<string> {
    if (params.id) {
      const agent = worktreeAgents.get(params.id);
      if (!agent) {
        return `Agent not found: ${params.id}`;
      }

      const duration = agent.endTime
        ? ((agent.endTime.getTime() - agent.startTime.getTime()) / 1000).toFixed(1)
        : ((Date.now() - agent.startTime.getTime()) / 1000).toFixed(1);

      let output = `Agent: ${agent.id}\n`;
      output += `Branch: ${agent.branch}\n`;
      output += `Worktree: ${agent.worktree}\n`;
      output += `Status: ${agent.status}\n`;
      output += `Duration: ${duration}s\n`;
      output += `Task: ${agent.task}\n`;

      if (agent.result) output += `\nResult:\n${agent.result}`;
      if (agent.error) output += `\nError:\n${agent.error}`;

      return output;
    }

    // List all agents
    const agents = Array.from(worktreeAgents.values());

    if (agents.length === 0) {
      return 'No parallel agents running';
    }

    const statusEmoji: Record<string, string> = {
      pending: '○',
      running: '◐',
      completed: '●',
      failed: '✗'
    };

    let output = 'Parallel Worktree Agents\n' + '='.repeat(40) + '\n\n';

    for (const agent of agents) {
      const emoji = statusEmoji[agent.status];
      const duration = agent.endTime
        ? ((agent.endTime.getTime() - agent.startTime.getTime()) / 1000).toFixed(1)
        : ((Date.now() - agent.startTime.getTime()) / 1000).toFixed(1);

      output += `${emoji} ${agent.id} [${agent.branch}]\n`;
      output += `  Status: ${agent.status} (${duration}s)\n`;
      output += `  Task: ${agent.task.substring(0, 50)}${agent.task.length > 50 ? '...' : ''}\n\n`;
    }

    return output;
  }
}

/**
 * Merge Worktree Tool
 */
export class MergeWorktreeTool implements Tool {
  name = 'merge_worktree';
  description = 'Merge a worktree branch back to main branch';
  parameters = {
    branch: {
      type: 'string',
      description: 'Branch to merge',
      optional: false
    },
    target: {
      type: 'string',
      description: 'Target branch to merge into (default: main)',
      optional: true
    },
    delete_after: {
      type: 'boolean',
      description: 'Delete worktree and branch after merge (default: true)',
      optional: true
    }
  };

  async execute(params: { branch: string; target?: string; delete_after?: boolean }): Promise<string> {
    const target = params.target || 'main';
    const deleteAfter = params.delete_after !== false;

    try {
      // Switch to target branch
      await execAsync(`git checkout ${target}`);

      // Merge
      const { stdout } = await execAsync(`git merge ${params.branch}`);

      let result = `Merged ${params.branch} into ${target}\n${stdout}`;

      // Clean up if requested
      if (deleteAfter) {
        // Find and remove worktree
        const { stdout: wtList } = await execAsync('git worktree list --porcelain');
        const lines = wtList.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(`branch refs/heads/${params.branch}`)) {
            // Get worktree path from previous line
            const pathLine = lines.slice(0, i).reverse().find(l => l.startsWith('worktree '));
            if (pathLine) {
              const wtPath = pathLine.substring(9);
              await execAsync(`git worktree remove "${wtPath}"`);
              result += `\nRemoved worktree: ${wtPath}`;
            }
          }
        }

        // Delete branch
        await execAsync(`git branch -d ${params.branch}`);
        result += `\nDeleted branch: ${params.branch}`;

        // Remove from agents map
        for (const [id, agent] of worktreeAgents) {
          if (agent.branch === params.branch) {
            worktreeAgents.delete(id);
          }
        }
      }

      return result;
    } catch (error: any) {
      return `Merge failed: ${error.message}`;
    }
  }
}

/**
 * Cleanup Worktrees Tool
 */
export class CleanupWorktreesTool implements Tool {
  name = 'cleanup_worktrees';
  description = 'Clean up completed/failed worktree agents';
  parameters = {
    status: {
      type: 'string',
      description: 'Only clean agents with this status: completed, failed, all',
      optional: true
    }
  };

  async execute(params: { status?: string }): Promise<string> {
    const targetStatus = params.status || 'completed';
    const results: string[] = [];

    for (const [id, agent] of worktreeAgents) {
      const shouldClean = targetStatus === 'all' ||
        agent.status === targetStatus ||
        (targetStatus === 'completed' && agent.status === 'completed');

      if (shouldClean && (agent.status === 'completed' || agent.status === 'failed')) {
        try {
          // Remove worktree
          await execAsync(`git worktree remove --force "${agent.worktree}"`);
          // Delete branch
          await execAsync(`git branch -D ${agent.branch}`);
          // Remove from map
          worktreeAgents.delete(id);
          results.push(`Cleaned: ${id} (${agent.branch})`);
        } catch (error: any) {
          results.push(`Failed to clean ${id}: ${error.message}`);
        }
      }
    }

    if (results.length === 0) {
      return 'No worktrees to clean up';
    }

    return results.join('\n');
  }
}
