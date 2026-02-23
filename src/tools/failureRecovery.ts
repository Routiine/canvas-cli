/**
 * Automatic Failure Recovery - Detect errors and auto-recover
 * Similar to Kilo Code's automatic failure recovery
 */

import { Tool } from '../types.js';
import { exec, spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fsPromises } from 'fs';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

interface RecoveryAttempt {
  id: string;
  error: string;
  action: string;
  result: 'success' | 'failed' | 'pending';
  timestamp: Date;
}

// Recovery history
const recoveryHistory: RecoveryAttempt[] = [];

// Common error patterns and recovery actions
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  recovery: (match: RegExpMatchArray, context: any) => Promise<string>;
}> = [
  // Missing dependencies
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/,
    type: 'missing_module',
    recovery: async (match) => {
      const moduleName = match[1];
      // Check if it's a local import or npm package
      if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
        return `Missing local file: ${moduleName}. Check the import path.`;
      }
      // Validate npm package name
      const validPkgName = /^[@a-zA-Z0-9_\-\/\.]+$/;
      if (!validPkgName.test(moduleName)) {
        throw new Error(`Invalid npm package name: ${moduleName}`);
      }
      await execFileAsync('npm', ['install', moduleName]);
      return `Installed missing module: ${moduleName}`;
    }
  },
  // TypeScript errors
  {
    pattern: /error TS(\d+):/,
    type: 'typescript_error',
    recovery: async () => {
      await execAsync('npm run build 2>&1 || true');
      return 'Attempted TypeScript rebuild';
    }
  },
  // Port already in use
  {
    pattern: /EADDRINUSE.*:(\d+)/,
    type: 'port_in_use',
    recovery: async (match) => {
      const port = match[1];
      try {
        await execAsync(`lsof -ti:${port} | xargs kill -9`);
        return `Killed process on port ${port}`;
      } catch {
        return `Could not free port ${port}. Kill the process manually.`;
      }
    }
  },
  // Permission denied
  {
    pattern: /EACCES|Permission denied/i,
    type: 'permission_error',
    recovery: async (_, context) => {
      if (context.file) {
        await fsPromises.chmod(context.file, 0o644);
        return `Fixed permissions on ${context.file}`;
      }
      return 'Permission error. Try running with elevated privileges.';
    }
  },
  // File not found
  {
    pattern: /ENOENT.*['"]([^'"]+)['"]/,
    type: 'file_not_found',
    recovery: async (match) => {
      const filePath = match[1];
      const dir = path.dirname(filePath);
      if (!await fs.pathExists(dir)) {
        await fs.ensureDir(dir);
        return `Created missing directory: ${dir}`;
      }
      return `File not found: ${filePath}. Check if it needs to be created.`;
    }
  },
  // Out of memory
  {
    pattern: /JavaScript heap out of memory|ENOMEM/,
    type: 'out_of_memory',
    recovery: async () => {
      return 'Out of memory. Try: NODE_OPTIONS="--max-old-space-size=4096" npm run <command>';
    }
  },
  // Git conflicts
  {
    pattern: /CONFLICT \(content\)/,
    type: 'git_conflict',
    recovery: async () => {
      const { stdout } = await execAsync('git diff --name-only --diff-filter=U');
      return `Git conflicts in:\n${stdout}\nResolve manually or use: git checkout --theirs/--ours <file>`;
    }
  },
  // Network errors
  {
    pattern: /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,
    type: 'network_error',
    recovery: async () => {
      return 'Network error. Check your internet connection or the server status.';
    }
  },
  // npm/yarn errors
  {
    pattern: /npm ERR!|yarn error/i,
    type: 'package_manager_error',
    recovery: async () => {
      await execAsync('rm -rf node_modules package-lock.json yarn.lock');
      await execAsync('npm install');
      return 'Cleared node_modules and reinstalled dependencies';
    }
  },
  // Syntax errors
  {
    pattern: /SyntaxError: (.+) at (.+):(\d+):(\d+)/,
    type: 'syntax_error',
    recovery: async (match) => {
      return `Syntax error: ${match[1]}\nFile: ${match[2]}:${match[3]}:${match[4]}\nFix the syntax manually.`;
    }
  }
];

/**
 * Auto Recover Tool
 */
export class AutoRecoverTool implements Tool {
  name = 'auto_recover';
  description = 'Automatically detect and recover from common errors';
  parameters = {
    error: {
      type: 'string',
      description: 'Error message or output to analyze',
      optional: false
    },
    auto_fix: {
      type: 'boolean',
      description: 'Automatically apply fixes (default: true)',
      optional: true
    },
    context: {
      type: 'object',
      description: 'Additional context (file path, command, etc.)',
      optional: true
    }
  };

  async execute(params: { error: string; auto_fix?: boolean; context?: any }): Promise<string> {
    const autoFix = params.auto_fix !== false;
    const results: string[] = [];
    let recovered = false;

    for (const { pattern, type, recovery } of ERROR_PATTERNS) {
      const match = params.error.match(pattern);
      if (match) {
        results.push(`Detected: ${type}`);

        if (autoFix) {
          const attempt: RecoveryAttempt = {
            id: `recovery-${Date.now()}`,
            error: params.error.substring(0, 200),
            action: type,
            result: 'pending',
            timestamp: new Date()
          };

          try {
            const recoveryResult = await recovery(match, params.context || {});
            attempt.result = 'success';
            results.push(`Recovery: ${recoveryResult}`);
            recovered = true;
          } catch (error: any) {
            attempt.result = 'failed';
            results.push(`Recovery failed: ${error.message}`);
          }

          recoveryHistory.push(attempt);
        } else {
          results.push(`Suggested fix: Run auto_recover with auto_fix: true`);
        }
      }
    }

    if (results.length === 0) {
      return 'No known error patterns detected. Manual investigation required.';
    }

    return results.join('\n') + (recovered ? '\n\n✓ Recovery attempted' : '');
  }
}

/**
 * Retry With Recovery Tool
 */
export class RetryWithRecoveryTool implements Tool {
  name = 'retry_with_recovery';
  description = 'Run a command with automatic retry and error recovery';
  parameters = {
    command: {
      type: 'string',
      description: 'Command to run',
      optional: false
    },
    max_retries: {
      type: 'number',
      description: 'Maximum retry attempts (default: 3)',
      optional: true
    },
    delay: {
      type: 'number',
      description: 'Delay between retries in ms (default: 1000)',
      optional: true
    }
  };

  async execute(params: { command: string; max_retries?: number; delay?: number }): Promise<string> {
    const maxRetries = params.max_retries || 3;
    const delay = params.delay || 1000;
    let lastError = '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const args = params.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        if (args.length === 0) throw new Error('Empty command');
        const [cmd, ...cmdArgs] = args.map((a: string) => a.replace(/^['"]|['"]$/g, ''));
        const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, { timeout: 300000 });
        return `Success (attempt ${attempt}/${maxRetries}):\n${stdout}${stderr ? '\nStderr: ' + stderr : ''}`;
      } catch (error: any) {
        lastError = error.stderr || error.stdout || error.message;

        if (attempt < maxRetries) {
          // Try to recover
          for (const { pattern, recovery } of ERROR_PATTERNS) {
            const match = lastError.match(pattern);
            if (match) {
              try {
                await recovery(match, {});
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, delay));
                break;
              } catch {
                // Recovery failed, continue to next attempt
              }
            }
          }
        }
      }
    }

    return `Failed after ${maxRetries} attempts. Last error:\n${lastError}`;
  }
}

/**
 * Watch And Recover Tool
 */
export class WatchAndRecoverTool implements Tool {
  name = 'watch_and_recover';
  description = 'Monitor a process and auto-recover on failures';
  parameters = {
    command: {
      type: 'string',
      description: 'Command to run and monitor',
      optional: false
    },
    restart_on_fail: {
      type: 'boolean',
      description: 'Restart on failure (default: true)',
      optional: true
    },
    max_restarts: {
      type: 'number',
      description: 'Maximum restarts (default: 5)',
      optional: true
    }
  };

  async execute(params: { command: string; restart_on_fail?: boolean; max_restarts?: number }): Promise<string> {
    const restartOnFail = params.restart_on_fail !== false;
    const maxRestarts = params.max_restarts || 5;
    let restartCount = 0;

    const runProcess = (): Promise<string> => {
      return new Promise((resolve) => {
        const args = params.command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        if (args.length === 0) {
          resolve('Error: empty command');
          return;
        }
        const [cmd, ...cmdArgs] = args.map((a: string) => a.replace(/^['"]|['"]$/g, ''));
        const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
        let output = '';

        child.stdout?.on('data', (data) => {
          output += data;
          process.stdout.write(data);
        });

        child.stderr?.on('data', (data) => {
          output += data;
          process.stderr.write(data);
        });

        child.on('exit', async (code) => {
          if (code !== 0 && restartOnFail && restartCount < maxRestarts) {
            restartCount++;
            console.log(`\nProcess exited with code ${code}. Restarting (${restartCount}/${maxRestarts})...\n`);

            // Try recovery before restart
            for (const { pattern, recovery } of ERROR_PATTERNS) {
              const match = output.match(pattern);
              if (match) {
                try {
                  await recovery(match, {});
                } catch {
                  // Continue anyway
                }
                break;
              }
            }

            // Restart after delay
            setTimeout(() => {
              runProcess().then(resolve);
            }, 2000);
          } else {
            resolve(`Process exited with code ${code}. Restarts: ${restartCount}`);
          }
        });
      });
    };

    return await runProcess();
  }
}

/**
 * Recovery History Tool
 */
export class RecoveryHistoryTool implements Tool {
  name = 'recovery_history';
  description = 'View history of automatic recovery attempts';
  parameters = {
    limit: {
      type: 'number',
      description: 'Number of entries to show (default: 20)',
      optional: true
    }
  };

  async execute(params: { limit?: number }): Promise<string> {
    const limit = params.limit || 20;
    const entries = recoveryHistory.slice(-limit).reverse();

    if (entries.length === 0) {
      return 'No recovery attempts recorded';
    }

    const statusEmoji: Record<string, string> = {
      success: '✓',
      failed: '✗',
      pending: '○'
    };

    let output = 'Recovery History\n' + '='.repeat(40) + '\n\n';

    for (const entry of entries) {
      const emoji = statusEmoji[entry.result];
      const time = entry.timestamp.toLocaleTimeString();
      output += `${emoji} [${time}] ${entry.action}\n`;
      output += `  Error: ${entry.error.substring(0, 80)}...\n`;
      output += `  Result: ${entry.result}\n\n`;
    }

    return output;
  }
}
