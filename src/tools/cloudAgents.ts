/**
 * Cloud Agents - Remote execution without consuming local resources
 * Similar to Kilo Code's cloud agent capabilities
 */

import { Tool } from '../types.js';
import { exec, spawn, execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const execFile = promisify(execFileCallback);

interface CloudAgent {
  id: string;
  type: 'docker' | 'ssh' | 'local';
  status: 'pending' | 'running' | 'completed' | 'failed';
  task: string;
  startTime: Date;
  endTime?: Date;
  result?: string;
  error?: string;
  containerId?: string;
  host?: string;
}

// In-memory cloud agent registry
const cloudAgents: Map<string, CloudAgent> = new Map();

/**
 * Generate unique agent ID
 */
function generateAgentId(): string {
  return `cloud-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Check if Docker is available
 */
async function isDockerAvailable(): Promise<boolean> {
  try {
    await execAsync('docker info', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Cloud Agent Launch Tool
 */
export class CloudAgentLaunchTool implements Tool {
  name = 'cloud_agent_launch';
  description = 'Launch a cloud agent to run tasks remotely (via Docker or SSH)';
  parameters = {
    task: {
      type: 'string',
      description: 'Task description or command to execute',
      optional: false
    },
    type: {
      type: 'string',
      description: 'Agent type: docker (default), ssh, local',
      optional: true
    },
    image: {
      type: 'string',
      description: 'Docker image to use (default: node:20-alpine)',
      optional: true
    },
    host: {
      type: 'string',
      description: 'SSH host for remote execution',
      optional: true
    },
    workdir: {
      type: 'string',
      description: 'Working directory to mount/use',
      optional: true
    },
    env: {
      type: 'object',
      description: 'Environment variables to set',
      optional: true
    }
  };

  async execute(params: {
    task: string;
    type?: string;
    image?: string;
    host?: string;
    workdir?: string;
    env?: Record<string, string>;
  }): Promise<string> {
    // Validate task
    if (!params.task || typeof params.task !== 'string' || !params.task.trim()) {
      return 'Error: Task description is required';
    }

    // Validate agent type
    const validTypes = ['docker', 'ssh', 'local'];
    const agentType = (params.type || 'docker') as CloudAgent['type'];
    if (!validTypes.includes(agentType)) {
      return `Error: Invalid agent type. Use: ${validTypes.join(', ')}`;
    }

    // Validate image name (basic check to prevent injection)
    if (params.image && !/^[a-zA-Z0-9._\/-]+:[a-zA-Z0-9._-]+$|^[a-zA-Z0-9._\/-]+$/.test(params.image)) {
      return 'Error: Invalid Docker image name';
    }

    const agentId = generateAgentId();

    const agent: CloudAgent = {
      id: agentId,
      type: agentType,
      status: 'pending',
      task: params.task,
      startTime: new Date()
    };

    cloudAgents.set(agentId, agent);

    try {
      switch (agentType) {
        case 'docker':
          return await this.launchDockerAgent(agent, params);
        case 'ssh':
          return await this.launchSSHAgent(agent, params);
        case 'local':
          return await this.launchLocalAgent(agent, params);
        default:
          throw new Error(`Unknown agent type: ${agentType}`);
      }
    } catch (error: any) {
      agent.status = 'failed';
      agent.error = error.message;
      agent.endTime = new Date();
      return `Cloud agent ${agentId} failed: ${error.message}`;
    }
  }

  private async launchDockerAgent(agent: CloudAgent, params: any): Promise<string> {
    if (!await isDockerAvailable()) {
      throw new Error('Docker is not available. Install Docker or use type: local');
    }

    const image = params.image || 'node:20-alpine';
    const workdir = params.workdir || process.cwd();

    // Build environment variable args array with sanitization
    const envArgs: string[] = [];
    if (params.env && typeof params.env === 'object') {
      for (const [key, value] of Object.entries(params.env)) {
        // Validate env var key (alphanumeric and underscore only)
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          throw new Error(`Invalid environment variable name: ${key}`);
        }
        envArgs.push('-e', `${key}=${String(value)}`);
      }
    }

    // Pass task via env variable; execute via $CANVAS_TASK to avoid shell injection
    agent.status = 'running';
    const { stdout } = await execFile('docker', [
      'run', '-d', '--rm',
      '-v', `${workdir}:/app`,
      '-w', '/app',
      '-e', `CANVAS_TASK=${params.task}`,
      ...envArgs,
      image,
      'sh', '-c', '$CANVAS_TASK'
    ]);
    const containerId = stdout.trim().substring(0, 12);
    agent.containerId = containerId;

    return `Cloud agent ${agent.id} launched\nContainer: ${containerId}\nImage: ${image}\nTask: ${params.task}`;
  }

  private async launchSSHAgent(agent: CloudAgent, params: any): Promise<string> {
    if (!params.host) {
      throw new Error('SSH host is required for type: ssh');
    }

    // Validate host against strict hostname regex
    const hostRegex = /^[a-zA-Z0-9._@-]+$/;
    if (!hostRegex.test(params.host)) {
      throw new Error(`Invalid SSH host: '${params.host}'. Only alphanumeric, dots, hyphens, underscores and @ are allowed.`);
    }

    agent.host = params.host;
    agent.status = 'running';

    // Use spawn with array args to prevent shell injection
    const sshProcess = spawn('ssh', [params.host, '--', params.task], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    sshProcess.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    sshProcess.stderr?.on('data', (data: Buffer) => { output += data.toString(); });

    sshProcess.on('close', (code: number) => {
      agent.status = code === 0 ? 'completed' : 'failed';
      agent.result = output;
      agent.endTime = new Date();
      cloudAgents.set(agent.id, agent);
    });

    return `Cloud agent ${agent.id} launched via SSH\nHost: ${params.host}\nTask: ${params.task}`;
  }

  private async launchLocalAgent(agent: CloudAgent, params: any): Promise<string> {
    agent.status = 'running';

    // Parse command safely — split on whitespace respecting quotes
    const args = params.task.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    if (args.length === 0) {
      throw new Error('Empty task command');
    }
    const [cmd, ...cmdArgs] = args.map((a: string) => a.replace(/^['"]|['"]$/g, ''));

    const localProcess = spawn(cmd, cmdArgs, {
      cwd: params.workdir || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    });

    let output = '';
    localProcess.stdout?.on('data', (data: Buffer) => { output += data.toString(); });
    localProcess.stderr?.on('data', (data: Buffer) => { output += data.toString(); });

    localProcess.on('close', (code: number) => {
      agent.status = code === 0 ? 'completed' : 'failed';
      agent.result = output;
      agent.endTime = new Date();
      cloudAgents.set(agent.id, agent);
    });

    return `Cloud agent ${agent.id} launched locally\nTask: ${params.task}`;
  }
}

/**
 * Cloud Agent Status Tool
 */
export class CloudAgentStatusTool implements Tool {
  name = 'cloud_agent_status';
  description = 'Check status of a cloud agent';
  parameters = {
    id: {
      type: 'string',
      description: 'Agent ID to check',
      optional: false
    }
  };

  async execute(params: { id: string }): Promise<string> {
    const agent = cloudAgents.get(params.id);

    if (!agent) {
      return `Agent not found: ${params.id}`;
    }

    // If Docker agent, check container status
    if (agent.type === 'docker' && agent.containerId && agent.status === 'running') {
      try {
        const { stdout } = await execAsync(`docker inspect ${agent.containerId} --format '{{.State.Status}}'`);
        const containerStatus = stdout.trim();

        if (containerStatus === 'exited') {
          // Get logs
          const { stdout: logs } = await execAsync(`docker logs ${agent.containerId}`);
          agent.status = 'completed';
          agent.result = logs;
          agent.endTime = new Date();
        }
      } catch {
        // Container may have been removed
        agent.status = 'completed';
        agent.endTime = new Date();
      }
    }

    const duration = agent.endTime
      ? ((agent.endTime.getTime() - agent.startTime.getTime()) / 1000).toFixed(1)
      : ((Date.now() - agent.startTime.getTime()) / 1000).toFixed(1);

    let output = `Agent: ${agent.id}\n`;
    output += `Type: ${agent.type}\n`;
    output += `Status: ${agent.status}\n`;
    output += `Duration: ${duration}s\n`;
    output += `Task: ${agent.task}\n`;

    if (agent.containerId) output += `Container: ${agent.containerId}\n`;
    if (agent.host) output += `Host: ${agent.host}\n`;
    if (agent.result) output += `\nResult:\n${agent.result}`;
    if (agent.error) output += `\nError: ${agent.error}`;

    return output;
  }
}

/**
 * Cloud Agent List Tool
 */
export class CloudAgentListTool implements Tool {
  name = 'cloud_agent_list';
  description = 'List all cloud agents';
  parameters = {
    status: {
      type: 'string',
      description: 'Filter by status: pending, running, completed, failed',
      optional: true
    }
  };

  async execute(params: { status?: string }): Promise<string> {
    let agents = Array.from(cloudAgents.values());

    if (params.status) {
      agents = agents.filter(a => a.status === params.status);
    }

    if (agents.length === 0) {
      return 'No cloud agents';
    }

    const statusEmoji: Record<string, string> = {
      pending: '○',
      running: '◐',
      completed: '●',
      failed: '✗'
    };

    let output = 'Cloud Agents\n' + '='.repeat(40) + '\n\n';

    for (const agent of agents) {
      const emoji = statusEmoji[agent.status];
      const duration = agent.endTime
        ? ((agent.endTime.getTime() - agent.startTime.getTime()) / 1000).toFixed(1)
        : ((Date.now() - agent.startTime.getTime()) / 1000).toFixed(1);

      output += `${emoji} ${agent.id} [${agent.type}] ${agent.status} (${duration}s)\n`;
      output += `  ${agent.task.substring(0, 50)}${agent.task.length > 50 ? '...' : ''}\n`;
    }

    return output;
  }
}

/**
 * Cloud Agent Logs Tool
 */
export class CloudAgentLogsTool implements Tool {
  name = 'cloud_agent_logs';
  description = 'Get logs from a cloud agent (Docker container)';
  parameters = {
    id: {
      type: 'string',
      description: 'Agent ID',
      optional: false
    },
    tail: {
      type: 'number',
      description: 'Number of lines to show (default: 100)',
      optional: true
    }
  };

  async execute(params: { id: string; tail?: number }): Promise<string> {
    const agent = cloudAgents.get(params.id);

    if (!agent) {
      return `Agent not found: ${params.id}`;
    }

    if (agent.type !== 'docker' || !agent.containerId) {
      // Return cached result for non-Docker agents
      return agent.result || agent.error || 'No logs available';
    }

    try {
      const tailLines = params.tail || 100;
      const { stdout } = await execAsync(`docker logs --tail ${tailLines} ${agent.containerId}`);
      return stdout || 'No logs';
    } catch (error: any) {
      return `Error getting logs: ${error.message}`;
    }
  }
}

/**
 * Cloud Agent Stop Tool
 */
export class CloudAgentStopTool implements Tool {
  name = 'cloud_agent_stop';
  description = 'Stop a running cloud agent';
  parameters = {
    id: {
      type: 'string',
      description: 'Agent ID to stop',
      optional: false
    }
  };

  async execute(params: { id: string }): Promise<string> {
    const agent = cloudAgents.get(params.id);

    if (!agent) {
      return `Agent not found: ${params.id}`;
    }

    if (agent.status !== 'running') {
      return `Agent ${params.id} is not running (status: ${agent.status})`;
    }

    if (agent.type === 'docker' && agent.containerId) {
      try {
        await execAsync(`docker stop ${agent.containerId}`);
        agent.status = 'completed';
        agent.endTime = new Date();
        return `Agent ${params.id} stopped`;
      } catch (error: any) {
        return `Error stopping agent: ${error.message}`;
      }
    }

    // For other types, just mark as completed
    agent.status = 'completed';
    agent.endTime = new Date();
    return `Agent ${params.id} marked as stopped`;
  }
}
