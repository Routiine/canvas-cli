/**
 * Sandboxed Code Execution via e2b
 * Runs AI-generated code in isolated cloud microVMs instead of the host process.
 * Falls back gracefully when E2B_API_KEY is not configured.
 */
import { Sandbox } from '@e2b/code-interpreter';
import { BaseTool } from './base.js';
import chalk from 'chalk';

export interface SandboxExecOptions {
  language?: 'python' | 'javascript' | 'typescript' | 'bash';
  timeout?: number; // ms
  files?: Array<{ path: string; content: string }>; // files to upload before exec
  envVars?: Record<string, string>;
}

export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  sandboxed: boolean;
  artifacts?: Array<{ name: string; content: string }>;
}

/**
 * Returns true when E2B_API_KEY is present in the environment.
 */
export function isSandboxAvailable(): boolean {
  return !!process.env.E2B_API_KEY;
}

/**
 * Execute arbitrary code inside an isolated e2b microVM.
 * The sandbox is created fresh per call and killed in the finally block.
 */
export async function executeSandboxed(
  code: string,
  opts: SandboxExecOptions = {}
): Promise<SandboxExecResult> {
  if (!isSandboxAvailable()) {
    return {
      stdout: '',
      stderr: 'E2B_API_KEY not configured',
      exitCode: 1,
      sandboxed: false,
    };
  }

  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY,
  });

  try {
    // Upload any files the caller wants available before execution
    if (opts.files && opts.files.length > 0) {
      for (const file of opts.files) {
        await sandbox.files.write([{ path: file.path, data: file.content }]);
      }
    }

    const execution = await sandbox.runCode(code, {
      language: opts.language ?? 'python',
      timeoutMs: opts.timeout ?? 30000,
      envs: opts.envVars,
    });

    return {
      stdout: execution.logs.stdout.join('\n'),
      stderr: execution.logs.stderr.join('\n'),
      exitCode: execution.error ? 1 : 0,
      sandboxed: true,
      artifacts: execution.results.map((r, idx) => ({
        name: r.formats()[0] ?? `result-${idx}`,
        content: JSON.stringify(r),
      })),
    };
  } finally {
    await sandbox.kill();
  }
}

/**
 * Execute a bash command in an e2b sandbox — drop-in companion to shell.ts.
 */
export async function execBashSandboxed(
  cmd: string,
  opts: Omit<SandboxExecOptions, 'language'> = {}
): Promise<SandboxExecResult> {
  return executeSandboxed(cmd, { ...opts, language: 'bash' });
}

// ---------------------------------------------------------------------------
// Tool classes
// ---------------------------------------------------------------------------

/**
 * SandboxedShellTool — always routes execution through the e2b sandbox.
 * Intended for AI agent use where running code on the host is unacceptable.
 * Requires E2B_API_KEY to be set; fails fast when it is absent.
 */
export class SandboxedShellTool extends BaseTool {
  name = 'sandboxed_shell';
  description =
    'Execute code in an isolated e2b cloud microVM. Safe for AI-generated code. ' +
    'Requires E2B_API_KEY. Supports python, javascript, typescript, and bash.';
  parameters = {
    code: {
      type: 'string',
      description: 'Code or shell command to execute in the sandbox',
    },
    language: {
      type: 'string',
      description: 'Language to run: python (default), javascript, typescript, bash',
      optional: true,
    },
    timeout: {
      type: 'number',
      description: 'Execution timeout in milliseconds (default: 30000)',
      optional: true,
    },
    files: {
      type: 'array',
      description: 'Files to upload before execution, each with path and content fields',
      optional: true,
    },
    envVars: {
      type: 'object',
      description: 'Environment variables to pass into the sandbox',
      optional: true,
    },
  };
  requiresConfirmation = false;

  async execute(params: {
    code: string;
    language?: 'python' | 'javascript' | 'typescript' | 'bash';
    timeout?: number;
    files?: Array<{ path: string; content: string }>;
    envVars?: Record<string, string>;
  }): Promise<string> {
    if (!isSandboxAvailable()) {
      console.log(
        chalk.red('\n[sandboxed_shell] E2B_API_KEY is not set. Cannot run in sandbox.')
      );
      return JSON.stringify({
        stdout: '',
        stderr: 'E2B_API_KEY not configured — sandbox unavailable',
        exitCode: 1,
        sandboxed: false,
      });
    }

    console.log(chalk.blue(`\n[sandbox] executing ${params.language ?? 'python'} code in e2b microVM`));

    const result = await executeSandboxed(params.code, {
      language: params.language,
      timeout: params.timeout,
      files: params.files,
      envVars: params.envVars,
    });

    if (result.exitCode === 0) {
      console.log(chalk.green('\n[sandbox] execution completed'));
    } else {
      console.log(chalk.yellow(`\n[sandbox] execution exited with code ${result.exitCode}`));
    }

    return JSON.stringify(result, null, 2);
  }
}
