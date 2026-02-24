/**
 * Multi-Agent Runner
 * Spawns N agents (optionally in worktrees) for parallel task execution.
 * Builds on existing OrchestratorAgent and WorktreeCreateTool.
 */

import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';

export interface AgentTask {
  id: string;
  prompt: string;
  worktree?: boolean;
  model?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  pid?: number;
}

export interface MultiAgentConfig {
  maxParallel: number;
  useWorktrees: boolean;
  model?: string;
  timeout?: number;
}

export class MultiAgentRunner extends EventEmitter {
  private tasks: Map<string, AgentTask> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private config: MultiAgentConfig;
  private taskCounter = 0;

  constructor(config?: Partial<MultiAgentConfig>) {
    super();
    this.config = {
      maxParallel: config?.maxParallel || 3,
      useWorktrees: config?.useWorktrees ?? true,
      model: config?.model,
      timeout: config?.timeout || 300000,
    };
  }

  /**
   * Submit a task for execution
   */
  submit(prompt: string, options?: { worktree?: boolean; model?: string }): string {
    const id = `agent-${++this.taskCounter}-${Date.now()}`;
    const task: AgentTask = {
      id,
      prompt,
      worktree: options?.worktree ?? this.config.useWorktrees,
      model: options?.model || this.config.model,
      status: 'pending',
    };

    this.tasks.set(id, task);
    this.emit('task-submitted', task);
    this.processQueue();
    return id;
  }

  /**
   * Get task status
   */
  getTask(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get running count
   */
  getRunningCount(): number {
    return Array.from(this.tasks.values()).filter(t => t.status === 'running').length;
  }

  /**
   * Cancel a running task
   */
  cancel(id: string): boolean {
    const proc = this.processes.get(id);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(id);
      const task = this.tasks.get(id);
      if (task) {
        task.status = 'failed';
        task.error = 'Cancelled by user';
        task.completedAt = new Date();
      }
      this.emit('task-cancelled', id);
      return true;
    }
    return false;
  }

  /**
   * Cancel all running tasks
   */
  cancelAll(): void {
    for (const id of this.processes.keys()) {
      this.cancel(id);
    }
  }

  /**
   * Wait for a specific task to complete
   */
  async waitFor(id: string): Promise<AgentTask> {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    if (task.status === 'completed' || task.status === 'failed') return task;

    return new Promise((resolve) => {
      const onComplete = (completedId: string) => {
        if (completedId === id) {
          this.removeListener('task-completed', onComplete);
          this.removeListener('task-failed', onComplete);
          resolve(this.tasks.get(id)!);
        }
      };
      this.on('task-completed', onComplete);
      this.on('task-failed', onComplete);
    });
  }

  /**
   * Wait for all tasks to complete
   */
  async waitForAll(): Promise<AgentTask[]> {
    const running = this.getAllTasks().filter(t => t.status === 'pending' || t.status === 'running');
    await Promise.all(running.map(t => this.waitFor(t.id)));
    return this.getAllTasks();
  }

  // Internal

  private processQueue(): void {
    const pending = Array.from(this.tasks.values()).filter(t => t.status === 'pending');
    const runningCount = this.getRunningCount();
    const slotsAvailable = this.config.maxParallel - runningCount;

    for (let i = 0; i < Math.min(slotsAvailable, pending.length); i++) {
      this.runTask(pending[i]);
    }
  }

  private runTask(task: AgentTask): void {
    task.status = 'running';
    task.startedAt = new Date();
    this.emit('task-started', task);

    // Spawn a canvas CLI subprocess for the task
    const args = ['-p', task.prompt, '--output-format', 'text', '--auto-approve'];
    if (task.model) args.push('-m', task.model);

    const canvasPath = path.join(process.cwd(), 'dist', 'index.js');
    const proc = spawn('node', [canvasPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    task.pid = proc.pid;
    this.processes.set(task.id, proc);

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => { stdout += data.toString(); });
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      task.status = 'failed';
      task.error = 'Timeout exceeded';
      task.completedAt = new Date();
      this.processes.delete(task.id);
      this.emit('task-failed', task.id);
      this.processQueue();
    }, this.config.timeout);

    proc.on('exit', (code) => {
      clearTimeout(timeout);
      this.processes.delete(task.id);

      if (code === 0) {
        task.status = 'completed';
        task.result = stdout;
      } else {
        task.status = 'failed';
        task.error = stderr || `Exit code ${code}`;
      }
      task.completedAt = new Date();

      this.emit(task.status === 'completed' ? 'task-completed' : 'task-failed', task.id);
      this.processQueue();
    });
  }
}
