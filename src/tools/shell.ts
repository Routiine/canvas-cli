import { BaseTool } from './base.js';
import { spawn } from 'cross-spawn';
import { spawnSync, execSync } from 'child_process';
import * as pty from 'node-pty';
import chalk from 'chalk';
import os from 'os';
import path from 'path';
import { loadConfig } from '../config.js';

/**
 * Dangerous command patterns that are blocked by default
 */
const BLOCKED_PATTERNS = [
  // Extremely destructive
  /rm\s+(-rf?|--recursive)\s+[\/~]/i,  // rm -rf / or ~
  /rm\s+-rf?\s*\/\s*$/i,               // rm -rf /
  /mkfs\./i,                            // Formatting filesystems
  /dd\s+.*of=\/dev\//i,                // Writing to raw devices
  /:(){ :\|:& };:/,                     // Fork bomb

  // System modification
  /chmod\s+(-R\s+)?777\s+\//i,         // chmod 777 /
  /chown\s+-R\s+.*\s+\//i,             // chown -R on root

  // Network attacks
  /curl.*\|\s*(ba)?sh/i,               // curl | bash (pipe to shell)
  /wget.*\|\s*(ba)?sh/i,               // wget | bash

  // Credential theft
  /cat\s+.*\/etc\/shadow/i,            // Reading shadow file
  /cat\s+.*\.ssh\/id_/i,               // Reading SSH keys

  // Sudo destructive ops
  /sudo\s+rm\s+(-rf?|--recursive)/i,    // sudo rm -rf
  /rm\s+(-rf?|--recursive)\s+~\s*$/i,  // rm -rf ~ (home dir)

  // Code execution disguised as data
  new RegExp('eval\\s*\\(', 'i'),                                   // eval(...)
  new RegExp('exec\\s*\\(', 'i'),                                   // exec(...)
  /python[23]?\s+-c\s+.*os\.(system|popen)/i,                      // python -c "os.system(...)"
  /node\s+-e\s+.*require.*child_process/i,                         // node -e with child_process
];

/**
 * Patterns that trigger extra warning but are allowed
 */
const WARNING_PATTERNS = [
  { pattern: /rm\s+-rf?/i, message: 'Recursive delete detected' },
  { pattern: /sudo/i, message: 'Sudo command detected - requires elevated privileges' },
  { pattern: /\|\s*sh\b/i, message: 'Piping to shell detected' },
  { pattern: />\s*\/etc\//i, message: 'Writing to /etc detected' },
  { pattern: /git\s+push\s+.*--force/i, message: 'Force push detected' },
  { pattern: /git\s+reset\s+--hard/i, message: 'Hard reset detected' },
  { pattern: /npm\s+publish/i, message: 'Publishing package detected' },
  { pattern: /docker\s+rm/i, message: 'Docker container removal detected' },
  { pattern: /\$\(.*\)/, message: 'Command substitution detected: $(...)' },
  { pattern: /`[^`]+`/, message: 'Backtick command substitution detected' },
  { pattern: /\|\s*(bash|sh|zsh|fish|dash)\b/i, message: 'Piping to shell detected' },
];

/**
 * Environment variables to filter out for security
 */
const FILTERED_ENV_VARS = [
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'NPM_TOKEN',
  'DATABASE_URL',
  'DB_PASSWORD',
  'API_KEY',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GROQ_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'GOOGLE_API_KEY',
  'CANVAS_ENCRYPTION_KEY',
  'JWT_SECRET',
  'HUGGINGFACE_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_API_KEY',
];

/**
 * Filter sensitive environment variables (module-level for use by all tools)
 */
function getFilteredEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const varName of FILTERED_ENV_VARS) {
    if (env[varName]) {
      env[varName] = '[FILTERED]';
    }
  }
  // Also filter anything with common secret patterns
  for (const key of Object.keys(env)) {
    if (/secret|password|token|key|credential/i.test(key)) {
      env[key] = '[FILTERED]';
    }
  }
  return env;
}



export interface ShellSafetyConfig {
  enabled: boolean;
  blockDangerous: boolean;
  allowedPaths?: string[];
  blockedCommands?: string[];
  maxTimeout?: number;
  filterEnv?: boolean;
}

// Patterns that indicate the command is waiting for user input
const PROMPT_PATTERNS = [
  /\?\s*$/,                           // Ends with ?
  /\(y\/n\)/i,                        // (y/n) prompt
  /\[y\/N\]/i,                        // [y/N] prompt
  /\[Y\/n\]/i,                        // [Y/n] prompt
  /press enter/i,                     // Press enter to continue
  /continue\?/i,                      // Continue?
  /proceed\?/i,                       // Proceed?
  /○|●|◆|◇/,                         // Selection indicators (nuxi, etc.)
  />\s*$/,                            // Ends with >
  /:\s*$/,                            // Ends with : (input prompt)
  /\[\d+\/\d+\]/,                     // Step indicators like [1/3]
];

export class ShellCommandTool extends BaseTool {
  name = 'run_shell_command';
  description = 'Execute a shell command with interactive support and auto-default timeout';
  parameters = {
    command: { type: 'string', description: 'Command to execute' },
    cwd: { type: 'string', description: 'Working directory', optional: true },
    timeout: { type: 'number', description: 'Overall timeout in milliseconds', default: 300000 },
    inputTimeout: { type: 'number', description: 'Timeout for auto-selecting default (ms)', default: 15000 },
    interactive: { type: 'boolean', description: 'Enable interactive mode', default: true },
    bypassSafety: { type: 'boolean', description: 'Bypass safety checks (requires confirmation)', optional: true }
  };
  requiresConfirmation = true;

  private getSafetyConfig(): ShellSafetyConfig {
    const config = loadConfig();
    return {
      enabled: config.sandbox?.enabled ?? true,
      blockDangerous: true,
      allowedPaths: config.sandbox?.allowedPaths,
      blockedCommands: config.sandbox?.blockedCommands,
      maxTimeout: 600000, // 10 minute max for complex installs
      filterEnv: true
    };
  }

  /**
   * Check if output indicates waiting for user input
   */
  private isWaitingForInput(output: string): boolean {
    const lastLines = output.split('\n').slice(-5).join('\n');
    return PROMPT_PATTERNS.some(pattern => pattern.test(lastLines));
  }

  /**
   * Detect what type of input is expected and return appropriate default
   */
  private getDefaultInput(output: string): string {
    const lastLines = output.split('\n').slice(-10).join('\n').toLowerCase();

    // Yes/No prompts - usually yes is default
    if (/\[y\/n\]/i.test(lastLines) || /\(y\/n\)/i.test(lastLines)) {
      return 'y\n';
    }

    // Selection with ● (recommended) - just press Enter
    if (/●/.test(output)) {
      return '\n';
    }

    // Numbered selection - pick first or default
    if (/\d+\.\s/.test(lastLines) || /○/.test(output)) {
      return '\n'; // Enter selects default/highlighted option
    }

    // Default: just press Enter
    return '\n';
  }

  /**
   * Public safety check — used by shell-command.ts to validate LLM-generated commands
   */
  validateCommand(command: string): { blocked: boolean; reason?: string; warning?: string } {
    const danger = this.checkDangerousCommand(command);
    if (danger.blocked) return danger;
    const warnings = this.checkWarnings(command);
    return { blocked: false, warning: warnings.length > 0 ? warnings[0] : undefined };
  }

  /**
   * Check if command is dangerous
   */
  private checkDangerousCommand(command: string): { blocked: boolean; reason?: string } {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return {
          blocked: true,
          reason: `Command matches dangerous pattern: ${pattern.toString()}`
        };
      }
    }
    return { blocked: false };
  }

  /**
   * Check for warning-worthy patterns
   */
  private checkWarnings(command: string): string[] {
    const warnings: string[] = [];
    for (const { pattern, message } of WARNING_PATTERNS) {
      if (pattern.test(command)) {
        warnings.push(message);
      }
    }
    return warnings;
  }

  // getFilteredEnv is the module-level function defined above

  /**
   * Validate working directory
   */
  private validateWorkingDir(cwd: string, allowedPaths?: string[]): boolean {
    if (!allowedPaths || allowedPaths.length === 0) {
      return true; // No restrictions
    }
    const resolvedCwd = path.resolve(cwd);
    return allowedPaths.some(allowed => resolvedCwd.startsWith(path.resolve(allowed)));
  }

  async execute(params: {
    command: string;
    cwd?: string;
    timeout?: number;
    inputTimeout?: number;
    interactive?: boolean;
    bypassSafety?: boolean
  }): Promise<string> {
    // Validate command is not undefined/null/invalid
    if (!params.command || params.command === 'undefined' || params.command === 'null' || params.command.trim() === '') {
      throw new Error('No valid command provided');
    }

    const safety = this.getSafetyConfig();
    const interactive = params.interactive !== false; // Default true
    const inputTimeout = params.inputTimeout || 30000; // 30 seconds for auto-default

    // Safety checks (unless bypassed with explicit confirmation)
    if (safety.enabled && !params.bypassSafety) {
      const dangerCheck = this.checkDangerousCommand(params.command);
      if (dangerCheck.blocked) {
        console.log(chalk.red(`\n🚫 BLOCKED: ${dangerCheck.reason}`));
        throw new Error(`Command blocked for safety: ${dangerCheck.reason}`);
      }

      const warnings = this.checkWarnings(params.command);
      if (warnings.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Warnings:`));
        warnings.forEach(w => console.log(chalk.yellow(`   - ${w}`)));
      }

      if (params.cwd && !this.validateWorkingDir(params.cwd, safety.allowedPaths)) {
        throw new Error(`Working directory not in allowed paths: ${params.cwd}`);
      }
    }

    const effectiveTimeout = Math.min(params.timeout || 300000, safety.maxTimeout || 600000);
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', params.command] : ['-c', params.command];

    console.log(chalk.blue(`\n$ ${params.command}`));

    // Check if this command needs interactive mode
    // Look for interactive commands ANYWHERE in the command (to handle cd && npx nuxi)
    const forceInteractive = /(nuxi|npx\s+(nuxi|create)|npm\s+(create|init)|yarn\s+create|pnpm\s+create)/;
    const matchesInteractive = forceInteractive.test(params.command);
    const actuallyInteractive = interactive && matchesInteractive;

    // Verbose debug (only when CANVAS_DEBUG env var is set)
    if (process.env.CANVAS_DEBUG) {
      console.log(chalk.dim(`   [interactive=${interactive}, matches=${matchesInteractive}, using=${actuallyInteractive ? 'PTY' : 'spawn'}]`));
    }

    // For interactive commands, use PTY to auto-complete prompts with defaults
    // User can type to override - input is forwarded directly to PTY
    if (actuallyInteractive) {
      console.log(chalk.dim(`   (Interactive - type to override, auto-selects in 1.5s)\n`));

      return new Promise((resolve, reject) => {
        let output = '';
        let lastOutputTime = Date.now();
        let lastUserInputTime = 0;
        let resolved = false;

        const cols = (process.stdout as any).columns || 80;
        const rows = (process.stdout as any).rows || 24;

        let ptyProcess: pty.IPty;
        try {
          ptyProcess = pty.spawn('/bin/bash', ['-c', params.command], {
            name: 'xterm-256color',
            cols: cols,
            rows: rows,
            cwd: params.cwd || process.cwd(),
            env: {
              ...(safety.filterEnv ? getFilteredEnv() : process.env),
              TERM: 'xterm-256color'
            } as { [key: string]: string }
          });
        } catch (err: any) {
          console.log(chalk.red(`   PTY error: ${err.message}`));
          reject(err);
          return;
        }

        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;

        if (stdin.isTTY && stdin.setRawMode) {
          stdin.setRawMode(true);
        }
        stdin.resume();

        const onUserInput = (data: Buffer) => {
          const str = data.toString();

          // Ctrl+C to cancel
          if (str === '\x03') {
            ptyProcess.kill();
            return;
          }

          // Forward ALL input directly to PTY (arrow keys, enter, typing, etc.)
          ptyProcess.write(str);
          lastUserInputTime = Date.now();
          output = ''; // Reset auto-select when user types
        };

        stdin.on('data', onUserInput);

        const checkForPrompt = () => {
          const timeSinceOutput = Date.now() - lastOutputTime;
          const timeSinceUserInput = Date.now() - lastUserInputTime;

          // Auto-complete if no user activity for 1.5s and prompt detected
          if (timeSinceOutput > 400 && timeSinceUserInput > 1500 && output.length > 0) {
            const hasPrompt = /[○●◆◇►▸▶❯❮]/.test(output) ||
                             /\?\s*$/.test(output) ||
                             /\(y\/n\)/i.test(output) ||
                             /\[y\/N\]/i.test(output);

            if (hasPrompt) {
              const response = this.getDefaultInput(output);
              ptyProcess.write(response);
              output = '';
            }
          }
        };

        const promptChecker = setInterval(checkForPrompt, 500);

        ptyProcess.onData((data: string) => {
          output += data;
          lastOutputTime = Date.now();
          process.stdout.write(data);
        });

        const cleanup = () => {
          clearInterval(promptChecker);
          stdin.removeListener('data', onUserInput);
          if (stdin.isTTY && stdin.setRawMode && wasRaw !== undefined) {
            stdin.setRawMode(wasRaw);
          }
        };

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            ptyProcess.kill();
            reject(new Error(`Command timed out after ${effectiveTimeout}ms`));
          }
        }, effectiveTimeout);

        ptyProcess.onExit(({ exitCode }) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            clearTimeout(timeout);

            if (exitCode === 0) {
              console.log(chalk.green(`\n✓ Command completed successfully`));
              resolve('Command completed');
            } else {
              console.log(chalk.yellow(`\n⚠ Command exited with code ${exitCode}`));
              resolve('Command completed with warnings');
            }
          }
        });
      });
    }

    // Non-interactive mode - capture output
    return new Promise((resolve, reject) => {
      const child = spawn(shell, shellArgs, {
        cwd: params.cwd || process.cwd(),
        env: safety.filterEnv ? getFilteredEnv() : process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      const overallTimeout = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
        reject(new Error(`Command timed out after ${effectiveTimeout}ms`));
      }, effectiveTimeout);

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(chalk.red(text));
      });

      child.on('error', (error) => {
        clearTimeout(overallTimeout);
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(overallTimeout);
        if (code === 0) {
          console.log(chalk.green(`\n✓ Command completed successfully`));
          resolve(stdout);
        } else {
          if (stderr.includes('npm warn') && !stderr.includes('ERR!')) {
            console.log(chalk.green(`\n✓ Command completed with warnings`));
            resolve(stdout);
          } else {
            reject(new Error(`Command failed with exit code ${code}\n${stderr}`));
          }
        }
      });
    });
  }
}

/**
 * Safe shell wrapper that only allows specific commands
 */
export class SafeShellTool extends BaseTool {
  name = 'safe_shell';
  description = 'Execute whitelisted shell commands only';
  parameters = {
    command: { type: 'string', description: 'Command name', enum: [
      'ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'grep', 'find',
      'git', 'npm', 'node', 'python', 'python3', 'pip', 'pip3'
    ]},
    args: { type: 'array', description: 'Command arguments' }
  };

  async execute(params: { command: string; args?: string[] }): Promise<string> {
    const allowedCommands = [
      'ls', 'pwd', 'cat', 'head', 'tail', 'wc', 'grep', 'find',
      'git', 'npm', 'node', 'python', 'python3', 'pip', 'pip3'
    ];

    if (!allowedCommands.includes(params.command)) {
      throw new Error(`Command not in whitelist: ${params.command}`);
    }

    return new Promise((resolve, reject) => {
      const child = spawn(params.command, params.args || [], {
        cwd: process.cwd(),
        env: getFilteredEnv()
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${stderr}`));
        }
      });

      child.on('error', reject);
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