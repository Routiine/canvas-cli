/**
 * Background Agent
 * Detached agents that run after the CLI exits.
 * Tracks PIDs and stores results for later retrieval.
 */

import { spawn } from 'child_process';
import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const AGENT_DIR = path.join(os.homedir(), '.canvas', 'agents');
const RESULTS_DIR = path.join(AGENT_DIR, 'results');

export interface BackgroundAgentInfo {
  id: string;
  prompt: string;
  model?: string;
  pid: number;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  resultFile?: string;
}

function ensureDirs(): void {
  fs.ensureDirSync(AGENT_DIR);
  fs.ensureDirSync(RESULTS_DIR);
}

function getAgentFile(id: string): string {
  return path.join(AGENT_DIR, `${id}.json`);
}

/**
 * Launch a background agent that runs detached from the terminal.
 */
export function launchBackgroundAgent(prompt: string, options?: { model?: string }): BackgroundAgentInfo {
  ensureDirs();

  const id = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const resultFile = path.join(RESULTS_DIR, `${id}.txt`);

  const canvasPath = path.join(process.cwd(), 'dist', 'index.js');
  const args = [canvasPath, '-p', prompt, '--output-format', 'text', '--auto-approve'];
  if (options?.model) args.push('-m', options.model);

  // Open a file for stdout capture
  const outFd = fs.openSync(resultFile, 'w');

  const proc = spawn('node', args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', outFd, outFd],
    detached: true,
  });

  proc.unref();

  const info: BackgroundAgentInfo = {
    id,
    prompt,
    model: options?.model,
    pid: proc.pid!,
    status: 'running',
    startedAt: new Date().toISOString(),
    resultFile,
  };

  fs.writeJsonSync(getAgentFile(id), info, { spaces: 2 });

  // Watch for process exit (best effort)
  proc.on('exit', (code) => {
    try {
      const current = fs.readJsonSync(getAgentFile(id));
      current.status = code === 0 ? 'completed' : 'failed';
      current.completedAt = new Date().toISOString();
      fs.writeJsonSync(getAgentFile(id), current, { spaces: 2 });
    } catch {
      // Agent file may have been cleaned up
    }
  });

  return info;
}

/**
 * List all background agents
 */
export function listBackgroundAgents(): BackgroundAgentInfo[] {
  ensureDirs();
  const agents: BackgroundAgentInfo[] = [];

  try {
    const files = fs.readdirSync(AGENT_DIR).filter(f => f.endsWith('.json') && f !== 'registry.json');
    for (const file of files) {
      try {
        const info = fs.readJsonSync(path.join(AGENT_DIR, file));
        // Check if process is still running
        if (info.status === 'running') {
          try {
            process.kill(info.pid, 0); // Check if alive
          } catch {
            info.status = 'completed'; // Assume completed if process gone
            fs.writeJsonSync(path.join(AGENT_DIR, file), info, { spaces: 2 });
          }
        }
        agents.push(info);
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Return empty
  }

  return agents.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * Get a specific agent's info and result
 */
export function getAgentResult(id: string): { info: BackgroundAgentInfo; result?: string } | null {
  const agentFile = getAgentFile(id);
  if (!fs.existsSync(agentFile)) return null;

  const info: BackgroundAgentInfo = fs.readJsonSync(agentFile);
  let result: string | undefined;

  if (info.resultFile && fs.existsSync(info.resultFile)) {
    result = fs.readFileSync(info.resultFile, 'utf8');
  }

  return { info, result };
}

/**
 * Clean up completed agents older than maxAge (ms)
 */
export function cleanupAgents(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
  ensureDirs();
  let cleaned = 0;
  const now = Date.now();

  const files = fs.readdirSync(AGENT_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const info = fs.readJsonSync(path.join(AGENT_DIR, file));
      if (info.status !== 'running' && info.startedAt) {
        const age = now - new Date(info.startedAt).getTime();
        if (age > maxAge) {
          fs.removeSync(path.join(AGENT_DIR, file));
          if (info.resultFile) fs.removeSync(info.resultFile);
          cleaned++;
        }
      }
    } catch {
      // Skip
    }
  }

  return cleaned;
}
