import { BaseTool } from './base.js';
import { spawn } from 'cross-spawn';
import chalk from 'chalk';
import os from 'os';

export class ShellCommandTool extends BaseTool {
  name = 'run_shell_command';
  description = 'Execute a shell command';
  parameters = {
    command: { type: 'string', description: 'Command to execute' },
    cwd: { type: 'string', description: 'Working directory', optional: true },
    timeout: { type: 'number', description: 'Timeout in milliseconds', default: 30000 }
  };
  requiresConfirmation = true;

  async execute(params: { command: string; cwd?: string; timeout?: number }): Promise<string> {
    return new Promise((resolve, reject) => {
      const isWindows = os.platform() === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['/c', params.command] : ['-c', params.command];
      
      console.log(chalk.blue(`\n$ ${params.command}`));
      
      const child = spawn(shell, shellArgs, {
        cwd: params.cwd || process.cwd(),
        env: process.env,
        shell: false
      });

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${params.timeout}ms`));
      }, params.timeout || 30000);

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(chalk.dim(text));
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(chalk.red(text));
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(chalk.green(`\n✓ Command completed successfully`));
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with exit code ${code}\n${stderr}`));
        }
      });
    });
  }
}

export class EnvironmentTool extends BaseTool {
  name = 'get_environment';
  description = 'Get environment information';
  parameters = {
    variables: { type: 'array', description: 'Specific variables to get (optional)' }
  };

  async execute(params: { variables?: string[] }): Promise<any> {
    if (params.variables) {
      const result: Record<string, string | undefined> = {};
      for (const varName of params.variables) {
        result[varName] = process.env[varName];
      }
      return result;
    } else {
      return {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cwd: process.cwd(),
        home: os.homedir(),
        user: os.userInfo().username
      };
    }
  }
}