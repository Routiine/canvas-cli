/**
 * Self-Verification Tools - Run tests and verify changes automatically
 * Similar to Kilo Code's self-verification capabilities
 */

import type { Tool } from '../types.js';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

interface VerificationResult {
  success: boolean;
  output: string;
  errors: string[];
  warnings: string[];
  duration: number;
}

/**
 * Detect test framework and configuration
 */
async function detectTestFramework(cwd: string): Promise<{
  framework: string;
  command: string;
  configFile?: string;
} | null> {
  const packageJsonPath = path.join(cwd, 'package.json');

  if (await fs.pathExists(packageJsonPath)) {
    const pkg = await fs.readJson(packageJsonPath);
    const scripts = pkg.scripts || {};
    const devDeps = { ...pkg.devDependencies, ...pkg.dependencies };

    // Check for test script
    if (scripts.test && scripts.test !== 'echo "Error: no test specified" && exit 1') {
      // Detect specific framework
      if (devDeps.vitest || scripts.test.includes('vitest')) {
        return { framework: 'vitest', command: 'npm run test', configFile: 'vitest.config.ts' };
      }
      if (devDeps.jest || scripts.test.includes('jest')) {
        return { framework: 'jest', command: 'npm run test', configFile: 'jest.config.js' };
      }
      if (devDeps.mocha || scripts.test.includes('mocha')) {
        return { framework: 'mocha', command: 'npm run test', configFile: '.mocharc.json' };
      }
      if (devDeps.ava || scripts.test.includes('ava')) {
        return { framework: 'ava', command: 'npm run test' };
      }
      if (devDeps.tap || scripts.test.includes('tap')) {
        return { framework: 'tap', command: 'npm run test' };
      }
      // Generic npm test
      return { framework: 'npm', command: 'npm run test' };
    }

    // Check for type checking
    if (devDeps.typescript) {
      return { framework: 'typescript', command: 'npx tsc --noEmit', configFile: 'tsconfig.json' };
    }
  }

  // Python
  if (await fs.pathExists(path.join(cwd, 'pytest.ini')) ||
      await fs.pathExists(path.join(cwd, 'pyproject.toml'))) {
    return { framework: 'pytest', command: 'pytest' };
  }

  // Go
  if (await fs.pathExists(path.join(cwd, 'go.mod'))) {
    return { framework: 'go', command: 'go test ./...' };
  }

  // Rust
  if (await fs.pathExists(path.join(cwd, 'Cargo.toml'))) {
    return { framework: 'cargo', command: 'cargo test' };
  }

  return null;
}

/**
 * Run Tests Tool
 */
export class RunTestsTool implements Tool {
  name = 'run_tests';
  description = 'Run project tests and return results. Auto-detects test framework.';
  parameters = {
    path: {
      type: 'string',
      description: 'Project directory (default: current directory)',
      optional: true
    },
    filter: {
      type: 'string',
      description: 'Test name or pattern to filter',
      optional: true
    },
    watch: {
      type: 'boolean',
      description: 'Run in watch mode (default: false)',
      optional: true
    }
  };

  async execute(params: { path?: string; filter?: string; watch?: boolean }): Promise<string> {
    const cwd = params.path || process.cwd();
    const framework = await detectTestFramework(cwd);

    if (!framework) {
      return 'No test framework detected. Supported: jest, vitest, mocha, pytest, go test, cargo test';
    }

    let command = framework.command;

    // Add filter if provided
    if (params.filter) {
      switch (framework.framework) {
        case 'jest':
        case 'vitest':
          command += ` -- -t "${params.filter}"`;
          break;
        case 'pytest':
          command += ` -k "${params.filter}"`;
          break;
        case 'go':
          command += ` -run "${params.filter}"`;
          break;
      }
    }

    // Add watch mode if requested
    if (params.watch) {
      switch (framework.framework) {
        case 'jest':
          command += ' --watch';
          break;
        case 'vitest':
          command += ' --watch';
          break;
      }
    }

    try {
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      let output = `Framework: ${framework.framework}\n`;
      output += `Duration: ${duration}s\n\n`;
      output += stdout;

      if (stderr && !stderr.includes('npm WARN')) {
        output += `\nStderr:\n${stderr}`;
      }

      return output;
    } catch (error: any) {
      const duration = ((Date.now() - Date.now()) / 1000).toFixed(1);
      let output = `Framework: ${framework.framework}\n`;
      output += `Status: FAILED\n\n`;

      if (error.stdout) output += error.stdout;
      if (error.stderr) output += `\nErrors:\n${error.stderr}`;
      if (error.message && !error.stdout) output += error.message;

      return output;
    }
  }
}

/**
 * Type Check Tool
 */
export class TypeCheckTool implements Tool {
  name = 'type_check';
  description = 'Run TypeScript type checking without emitting files';
  parameters = {
    path: {
      type: 'string',
      description: 'Project directory (default: current directory)',
      optional: true
    },
    strict: {
      type: 'boolean',
      description: 'Use strict mode (default: false)',
      optional: true
    }
  };

  async execute(params: { path?: string; strict?: boolean }): Promise<string> {
    const cwd = params.path || process.cwd();
    const tsconfigPath = path.join(cwd, 'tsconfig.json');

    if (!await fs.pathExists(tsconfigPath)) {
      return 'No tsconfig.json found';
    }

    let command = 'npx tsc --noEmit';
    if (params.strict) {
      command += ' --strict';
    }

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout: 120000 });
      return stdout || 'Type check passed - no errors';
    } catch (error: any) {
      return `Type errors found:\n${error.stdout || error.stderr || error.message}`;
    }
  }
}

/**
 * Lint Tool
 */
export class LintTool implements Tool {
  name = 'lint';
  description = 'Run linter on the codebase. Auto-detects ESLint, Prettier, etc.';
  parameters = {
    path: {
      type: 'string',
      description: 'Path to lint (default: current directory)',
      optional: true
    },
    fix: {
      type: 'boolean',
      description: 'Auto-fix issues (default: false)',
      optional: true
    }
  };

  async execute(params: { path?: string; fix?: boolean }): Promise<string> {
    const cwd = params.path || process.cwd();
    const packageJsonPath = path.join(cwd, 'package.json');

    let command = '';

    if (await fs.pathExists(packageJsonPath)) {
      const pkg = await fs.readJson(packageJsonPath);
      const devDeps = { ...pkg.devDependencies, ...pkg.dependencies };

      if (devDeps.eslint) {
        command = 'npx eslint .';
        if (params.fix) command += ' --fix';
      } else if (devDeps.biome) {
        command = 'npx biome check .';
        if (params.fix) command += ' --apply';
      } else if (pkg.scripts?.lint) {
        command = 'npm run lint';
      }
    }

    if (!command) {
      return 'No linter detected. Supported: ESLint, Biome';
    }

    try {
      const { stdout, stderr } = await execAsync(command, { cwd, timeout: 120000 });
      return stdout || 'Lint passed - no issues';
    } catch (error: any) {
      return `Lint issues:\n${error.stdout || error.stderr || error.message}`;
    }
  }
}

/**
 * Build Tool
 */
export class BuildTool implements Tool {
  name = 'build';
  description = 'Run project build command';
  parameters = {
    path: {
      type: 'string',
      description: 'Project directory (default: current directory)',
      optional: true
    }
  };

  async execute(params: { path?: string }): Promise<string> {
    const cwd = params.path || process.cwd();
    const packageJsonPath = path.join(cwd, 'package.json');

    let command = '';

    if (await fs.pathExists(packageJsonPath)) {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.scripts?.build) {
        command = 'npm run build';
      }
    }

    // Check for other build systems
    if (!command) {
      if (await fs.pathExists(path.join(cwd, 'Makefile'))) {
        command = 'make';
      } else if (await fs.pathExists(path.join(cwd, 'Cargo.toml'))) {
        command = 'cargo build';
      } else if (await fs.pathExists(path.join(cwd, 'go.mod'))) {
        command = 'go build ./...';
      }
    }

    if (!command) {
      return 'No build command detected';
    }

    try {
      const startTime = Date.now();
      const { stdout, stderr } = await execAsync(command, { cwd, timeout: 300000 });
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      let output = `Build completed in ${duration}s\n`;
      if (stdout) output += stdout;

      return output;
    } catch (error: any) {
      return `Build failed:\n${error.stdout || error.stderr || error.message}`;
    }
  }
}

/**
 * Verify Changes Tool - Comprehensive verification
 */
export class VerifyChangesTool implements Tool {
  name = 'verify_changes';
  description = 'Run full verification: type check, lint, tests, build';
  parameters = {
    path: {
      type: 'string',
      description: 'Project directory (default: current directory)',
      optional: true
    },
    quick: {
      type: 'boolean',
      description: 'Quick mode - skip full test suite (default: false)',
      optional: true
    }
  };

  async execute(params: { path?: string; quick?: boolean }): Promise<string> {
    const cwd = params.path || process.cwd();
    const results: string[] = [];
    let hasErrors = false;

    results.push('Verification Report');
    results.push('='.repeat(50));

    // Type check (TypeScript projects)
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    if (await fs.pathExists(tsconfigPath)) {
      results.push('\n[1/4] Type Check');
      try {
        await execAsync('npx tsc --noEmit', { cwd, timeout: 120000 });
        results.push('  ✓ Passed');
      } catch (error: any) {
        results.push('  ✗ Failed');
        results.push(`  ${error.stdout?.split('\n').slice(0, 5).join('\n  ') || error.message}`);
        hasErrors = true;
      }
    } else {
      results.push('\n[1/4] Type Check - Skipped (no tsconfig.json)');
    }

    // Lint
    const packageJsonPath = path.join(cwd, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.devDependencies?.eslint || pkg.scripts?.lint) {
        results.push('\n[2/4] Lint');
        try {
          await execAsync(pkg.scripts?.lint ? 'npm run lint' : 'npx eslint . --max-warnings=0', { cwd, timeout: 120000 });
          results.push('  ✓ Passed');
        } catch (error: any) {
          results.push('  ✗ Failed');
          results.push(`  ${error.stdout?.split('\n').slice(0, 5).join('\n  ') || ''}`);
          hasErrors = true;
        }
      } else {
        results.push('\n[2/4] Lint - Skipped (no linter configured)');
      }
    }

    // Tests
    if (!params.quick) {
      const framework = await detectTestFramework(cwd);
      if (framework) {
        results.push('\n[3/4] Tests');
        try {
          await execAsync(framework.command, { cwd, timeout: 300000 });
          results.push('  ✓ Passed');
        } catch (error: any) {
          results.push('  ✗ Failed');
          const output = error.stdout || error.stderr || error.message;
          results.push(`  ${output.split('\n').slice(-10).join('\n  ')}`);
          hasErrors = true;
        }
      } else {
        results.push('\n[3/4] Tests - Skipped (no test framework)');
      }
    } else {
      results.push('\n[3/4] Tests - Skipped (quick mode)');
    }

    // Build
    if (await fs.pathExists(packageJsonPath)) {
      const pkg = await fs.readJson(packageJsonPath);
      if (pkg.scripts?.build) {
        results.push('\n[4/4] Build');
        try {
          await execAsync('npm run build', { cwd, timeout: 300000 });
          results.push('  ✓ Passed');
        } catch (error: any) {
          results.push('  ✗ Failed');
          results.push(`  ${error.stdout?.split('\n').slice(0, 5).join('\n  ') || error.message}`);
          hasErrors = true;
        }
      } else {
        results.push('\n[4/4] Build - Skipped (no build script)');
      }
    }

    results.push('\n' + '='.repeat(50));
    results.push(hasErrors ? '❌ Verification FAILED' : '✅ Verification PASSED');

    return results.join('\n');
  }
}
