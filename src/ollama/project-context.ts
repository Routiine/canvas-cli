/**
 * Project Context
 *
 * Reads the current working environment and injects it into the system prompt
 * so the model knows where it is and what project conventions to follow.
 *
 * Gathered in order of priority (highest last = appended latest in prompt):
 *   1. Working directory + git branch
 *   2. package.json metadata (project name, scripts, key deps)
 *   3. Global ~/.claude/CLAUDE.md (user-level instructions)
 *   4. Project-level CLAUDE.md (walk up from cwd, stop at home dir)
 *   5. .canvas/context.md (canvas-specific project notes)
 *
 * Results are cached for the process lifetime — the project doesn't change
 * mid-session. Cache is invalidated if cwd changes (rare but possible).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';

// ─── Workspace root ───────────────────────────────────────────────────────────

/**
 * The directory canvas was launched from.  Set once at process start so that
 * shell tools and file validation have a stable root even if the model or a
 * shell command changes process.cwd() mid-session.
 */
export const WORKSPACE_ROOT: string = resolve(process.cwd());

/** Resolve a path relative to the workspace root. */
export function workspacePath(...parts: string[]): string {
  return join(WORKSPACE_ROOT, ...parts);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectContext {
  cwd: string;
  gitBranch: string | null;
  projectName: string | null;
  packageScripts: string | null;  // condensed key scripts
  keyDependencies: string | null;
  globalClaudeMd: string | null;
  projectClaudeMd: string | null;
  canvasContext: string | null;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

let cache: ProjectContext | null = null;
let cachedCwd = '';

export function getProjectContext(): ProjectContext {
  // Always use the workspace root — ignore any runtime cwd changes.
  if (cache && cachedCwd === WORKSPACE_ROOT) return cache;

  cachedCwd = WORKSPACE_ROOT;
  cache = buildContext(WORKSPACE_ROOT);
  return cache;
}

/** Force cache clear — used in tests or after explicit directory changes. */
export function clearContextCache(): void {
  cache = null;
  cachedCwd = '';
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function buildContext(cwd: string): ProjectContext {
  return {
    cwd,
    gitBranch:       readGitBranch(cwd),
    projectName:     readPackageName(cwd),
    packageScripts:  readPackageScripts(cwd),
    keyDependencies: readKeyDeps(cwd),
    globalClaudeMd:  readFile(join(homedir(), '.claude', 'CLAUDE.md')),
    projectClaudeMd: findClaudeMd(cwd),
    canvasContext:   readFile(join(cwd, '.canvas', 'context.md')),
  };
}

// ─── Readers ──────────────────────────────────────────────────────────────────

function readFile(path: string, maxChars = 6000): string | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, 'utf-8').trim();
    if (!content) return null;
    return content.length > maxChars
      ? content.slice(0, maxChars) + '\n\n[...truncated...]'
      : content;
  } catch {
    return null;
  }
}

function readGitBranch(cwd: string): string | null {
  try {
    // execFileSync avoids shell injection since we pass args as array
    const branch = execFileSync('git', ['-C', cwd, 'branch', '--show-current'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return branch || null;
  } catch {
    return null;
  }
}

function readPackageName(cwd: string): string | null {
  try {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return (pkg.name as string) || null;
  } catch {
    return null;
  }
}

function readPackageScripts(cwd: string): string | null {
  try {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const scripts = pkg.scripts as Record<string, string> | undefined;
    if (!scripts || Object.keys(scripts).length === 0) return null;
    // Surface only the most useful scripts
    const PRIORITY = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'type-check', 'check'];
    const lines: string[] = [];
    for (const key of PRIORITY) {
      if (scripts[key]) lines.push(`  ${key}: ${scripts[key]}`);
    }
    // Add any remaining scripts up to 10 total
    for (const [k, v] of Object.entries(scripts)) {
      if (!PRIORITY.includes(k) && lines.length < 10) lines.push(`  ${k}: ${v}`);
    }
    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

function readKeyDeps(cwd: string): string | null {
  try {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) return null;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    } as Record<string, string>;
    const keys = Object.keys(deps);
    if (keys.length === 0) return null;
    // Only mention framework-level deps (the ones that shape architecture decisions)
    const NOTABLE = [
      'next', 'nuxt', 'react', 'vue', 'svelte', 'astro', 'remix', 'solid-js',
      'express', 'fastify', 'hono', 'nestjs', 'koa',
      'typescript', 'vite', 'webpack', 'turbopack',
      'prisma', 'drizzle-orm', 'mongoose', 'typeorm',
      'tailwindcss', 'shadcn-ui',
      'vitest', 'jest', 'playwright', 'cypress',
      '@anthropic-ai/sdk', 'openai', 'ai',
    ];
    const found = keys.filter(k => NOTABLE.some(n => k === n || k.startsWith(`@${n.split('/')[0]}`)));
    return found.length > 0 ? found.slice(0, 15).join(', ') : null;
  } catch {
    return null;
  }
}

/**
 * Walk up from cwd toward home dir looking for CLAUDE.md.
 * Stop at the home directory boundary (don't read /etc/CLAUDE.md etc.)
 */
function findClaudeMd(startDir: string): string | null {
  const home = homedir();
  let dir = startDir;

  while (dir.startsWith(home)) {
    const candidate = join(dir, 'CLAUDE.md');
    const content = readFile(candidate);
    if (content) return content;

    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  return null;
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Format the gathered context as a system prompt block.
 * Returns an empty string if nothing useful was found.
 */
export function formatContextBlock(ctx: ProjectContext): string {
  const lines: string[] = [];

  // Environment line — always present
  const envParts: string[] = [`cwd: ${ctx.cwd}`];
  if (ctx.gitBranch) envParts.push(`branch: ${ctx.gitBranch}`);
  if (ctx.projectName) envParts.push(`project: ${ctx.projectName}`);
  lines.push(`ENVIRONMENT: ${envParts.join(' | ')}`);

  if (ctx.packageScripts) {
    lines.push('\nAVAILABLE SCRIPTS:\n' + ctx.packageScripts);
  }

  if (ctx.keyDependencies) {
    lines.push('\nKEY DEPENDENCIES: ' + ctx.keyDependencies);
  }

  if (ctx.globalClaudeMd) {
    lines.push('\n--- GLOBAL INSTRUCTIONS (CLAUDE.md) ---\n' + ctx.globalClaudeMd + '\n---');
  }

  if (ctx.projectClaudeMd) {
    lines.push('\n--- PROJECT INSTRUCTIONS (CLAUDE.md) ---\n' + ctx.projectClaudeMd + '\n---');
  }

  if (ctx.canvasContext) {
    lines.push('\n--- CANVAS PROJECT NOTES ---\n' + ctx.canvasContext + '\n---');
  }

  return lines.join('\n');
}
