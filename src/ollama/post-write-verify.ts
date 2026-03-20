/**
 * Post-Write Verification
 *
 * After the model writes or edits source files, run a quick syntax/type check
 * and return any errors so they can be fed back into the tool loop.
 *
 * This is how Claude Code catches its own mistakes — it doesn't wait for the
 * user to report "it doesn't compile." It checks immediately.
 *
 * Supported checks:
 *   TypeScript (.ts, .tsx) → tsc --noEmit (uses project tsconfig if present)
 *   JavaScript (.js, .mjs) → node --check (syntax only, fast)
 *   JSON (.json)           → JSON.parse (in-process, zero cost)
 *
 * Returns null if all checks pass, or an error string to inject into context.
 */

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';

export interface VerifyResult {
  passed: boolean;
  errors: string | null;
  checkedFiles: string[];
}

/**
 * Verify a list of written file paths.
 * Returns a concise error summary or null if everything looks clean.
 */
export async function verifyWrittenFiles(filePaths: string[]): Promise<VerifyResult> {
  if (filePaths.length === 0) return { passed: true, errors: null, checkedFiles: [] };

  const tsFiles  = filePaths.filter(f => /\.(ts|tsx)$/.test(f) && existsSync(f));
  const jsFiles  = filePaths.filter(f => /\.(js|mjs)$/.test(f) && existsSync(f));
  const jsonFiles = filePaths.filter(f => f.endsWith('.json') && existsSync(f));

  const errors: string[] = [];
  const checked: string[] = [];

  // ── JSON check (in-process, free) ──────────────────────────────────────────
  for (const file of jsonFiles) {
    try {
      JSON.parse(readFileSync(file, 'utf-8'));
      checked.push(file);
    } catch (e: unknown) {
      const msg = e instanceof SyntaxError ? e.message : String(e);
      errors.push(`JSON syntax error in ${file}:\n  ${msg}`);
    }
  }

  // ── TypeScript check ───────────────────────────────────────────────────────
  if (tsFiles.length > 0) {
    const tscResult = runTsc(tsFiles);
    if (tscResult) {
      errors.push(tscResult);
    } else {
      checked.push(...tsFiles);
    }
  }

  // ── JavaScript syntax check ────────────────────────────────────────────────
  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], {
        encoding: 'utf-8',
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 5000,
      });
      checked.push(file);
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err);
      errors.push(`JS syntax error in ${file}:\n${stderr.slice(0, 500)}`);
    }
  }

  if (errors.length === 0) {
    return { passed: true, errors: null, checkedFiles: checked };
  }

  return {
    passed: false,
    errors: errors.join('\n\n'),
    checkedFiles: checked,
  };
}

/**
 * Run tsc in check-only mode.
 * Prefers the project's own tsconfig.json; falls back to --strict --noEmit.
 * Returns error output or null on success.
 */
function runTsc(files: string[]): string | null {
  const cwd = process.cwd();
  const hasTsConfig = existsSync(join(cwd, 'tsconfig.json'));

  // Find tsc: project-local first, then PATH
  const localTsc = join(cwd, 'node_modules', '.bin', 'tsc');
  const tsc = existsSync(localTsc) ? localTsc : 'tsc';

  // With tsconfig: just type-check the whole project (most accurate)
  // Without tsconfig: check only the specific files written
  const args = hasTsConfig
    ? ['--noEmit', '--incremental', 'false']
    : ['--noEmit', '--strict', '--target', 'ESNext', '--moduleResolution', 'bundler', ...files];

  const result = spawnSync(tsc, args, {
    cwd,
    encoding: 'utf-8',
    timeout: 15_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status === 0) return null;

  const output = (result.stdout + result.stderr).trim();
  if (!output) return null;

  // Trim to the most useful lines (first 20 errors)
  const lines = output.split('\n');
  const trimmed = lines.slice(0, 40).join('\n');
  const note = lines.length > 40 ? `\n... and ${lines.length - 40} more lines` : '';
  return trimmed + note;
}

/**
 * Extract file paths written during a tool execution round.
 * Scans tool call records for write_file / edit_file operations.
 */
export function extractWrittenFiles(
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
): string[] {
  const files: string[] = [];
  for (const call of toolCalls) {
    if (call.name === 'write_file' || call.name === 'edit_file') {
      const path = call.arguments.path ?? call.arguments.file_path;
      if (typeof path === 'string') files.push(path);
    }
  }
  return files;
}
