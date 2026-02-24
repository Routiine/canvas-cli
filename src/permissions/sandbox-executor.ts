/**
 * Sandbox Executor
 * Routes shell commands through Docker/Podman containers for isolation.
 */

import { spawn } from 'child_process';

export interface SandboxConfig {
  enabled: boolean;
  runtime: 'docker' | 'podman' | 'none';
  image?: string;
  allowNetwork?: boolean;
  mountCwd?: boolean;
  timeout?: number;
}

const DEFAULT_CONFIG: SandboxConfig = {
  enabled: false,
  runtime: 'none',
  image: 'node:20-slim',
  allowNetwork: false,
  mountCwd: true,
  timeout: 60000,
};

export class SandboxExecutor {
  private config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  isEnabled(): boolean {
    return this.config.enabled && this.config.runtime !== 'none';
  }

  /**
   * Execute a command inside a sandbox container
   */
  async execute(command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.isEnabled()) {
      return this.executeNative(command, cwd);
    }

    const runtime = this.config.runtime;
    const args = this.buildContainerArgs(command, cwd);

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';

      const proc = spawn(runtime, args, {
        timeout: this.config.timeout,
      });

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('exit', (code) => {
        resolve({ stdout, stderr, exitCode: code || 0 });
      });

      proc.on('error', (err) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
  }

  /**
   * Check if the container runtime is available
   */
  async isRuntimeAvailable(): Promise<boolean> {
    if (this.config.runtime === 'none') return false;

    return new Promise((resolve) => {
      const proc = spawn(this.config.runtime, ['--version'], { timeout: 5000 });
      proc.on('exit', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  }

  getConfig(): SandboxConfig {
    return { ...this.config };
  }

  private buildContainerArgs(command: string, cwd?: string): string[] {
    const args = ['run', '--rm'];

    if (!this.config.allowNetwork) {
      args.push('--network', 'none');
    }

    if (this.config.mountCwd) {
      const mountDir = cwd || process.cwd();
      args.push('-v', `${mountDir}:/workspace`, '-w', '/workspace');
    }

    // Resource limits
    args.push('--memory', '512m', '--cpus', '1');

    args.push(this.config.image || 'node:20-slim');
    args.push('sh', '-c', command);

    return args;
  }

  private async executeNative(
    command: string,
    cwd?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn('sh', ['-c', command], {
        cwd: cwd || process.cwd(),
        timeout: this.config.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('exit', (code) => resolve({ stdout, stderr, exitCode: code || 0 }));
      proc.on('error', (err) => resolve({ stdout, stderr: err.message, exitCode: 1 }));
    });
  }
}
