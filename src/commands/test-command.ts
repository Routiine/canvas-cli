/**
 * canvas test <file> [--function <name>]
 *
 * Generates unit tests for a file or specific function via AI,
 * writes them to tests/generated/, runs them, and iterates to fix failures.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { getProviderRegistry } from '../intelligence/provider-registry.js';

const MAX_ITERATIONS = 5;

// ─── Test runner ──────────────────────────────────────────────────────────────

interface TestResult {
  passed: boolean;
  output: string;
  failureDetails: string;
}

function runTests(testFile: string): TestResult {
  try {
    const output = execSync(
      `npx jest --testPathPattern="${path.basename(testFile)}" --no-coverage --passWithNoTests 2>&1`,
      { encoding: 'utf-8', timeout: 60_000 }
    );
    return { passed: true, output, failureDetails: '' };
  } catch (err: unknown) {
    const stdout = err && typeof err === 'object' && 'stdout' in err
      ? String((err as { stdout: unknown }).stdout)
      : String(err);
    const failureLines = stdout
      .split('\n')
      .filter(l => l.includes('FAIL') || l.includes('●') || l.includes('expect(') || l.includes('Error:'))
      .join('\n');
    return { passed: false, output: stdout, failureDetails: failureLines };
  }
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

async function generateTests(
  sourceFile: string,
  sourceContent: string,
  functionName: string | undefined
): Promise<string> {
  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();
  if (!provider) {
    throw new Error('No AI provider available. Set ANTHROPIC_API_KEY or ensure Ollama is running.');
  }

  const ext = path.extname(sourceFile).slice(1);
  const target = functionName ? `the \`${functionName}\` function` : 'all exported functions and classes';

  const messages = [
    {
      role: 'system' as const,
      content: `You are an expert TypeScript test writer using Jest.
Write comprehensive unit tests with:
- Descriptive describe/it blocks
- Edge cases: empty inputs, null/undefined, boundary values, error paths
- Proper mocking of external dependencies (fs, fetch, database calls)
- TypeScript types throughout
Return ONLY the test file content. No markdown fences. No explanation.
The test file should use ES module imports (import ... from '...')`
    },
    {
      role: 'user' as const,
      content: `Write Jest unit tests for ${target} in this ${ext} file:

File: ${sourceFile}

\`\`\`${ext}
${sourceContent}
\`\`\`

Import path from source: '../../${sourceFile.replace(/\\/g, '/')}'
Test file should be placed in tests/generated/ directory.`
    }
  ];

  const chunks: string[] = [];
  for await (const chunk of provider.completeStream(messages, { temperature: 0.2 })) {
    chunks.push(chunk);
  }

  let result = chunks.join('');
  // Strip markdown fences if present
  result = result.replace(/^```[\w]*\n/, '').replace(/\n```\s*$/, '');
  return result;
}

async function fixTests(
  sourceFile: string,
  sourceContent: string,
  testContent: string,
  failureDetails: string,
  iteration: number
): Promise<string> {
  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();
  if (!provider) throw new Error('No AI provider available.');

  const messages = [
    {
      role: 'system' as const,
      content: 'You are an expert TypeScript test fixer. Fix only what is broken. Return ONLY the complete fixed test file. No markdown fences.'
    },
    {
      role: 'user' as const,
      content: `Iteration ${iteration}: Fix these test failures.

SOURCE FILE (${sourceFile}):
\`\`\`typescript
${sourceContent}
\`\`\`

CURRENT TESTS:
\`\`\`typescript
${testContent}
\`\`\`

FAILURE OUTPUT:
${failureDetails}

Return the fixed test file.`
    }
  ];

  const chunks: string[] = [];
  for await (const chunk of provider.completeStream(messages, { temperature: 0.1 })) {
    chunks.push(chunk);
  }

  let result = chunks.join('');
  result = result.replace(/^```[\w]*\n/, '').replace(/\n```\s*$/, '');
  return result;
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function createTestCommand(): Command {
  return new Command('test')
    .description('Generate and iterate unit tests for a file')
    .argument('<file>', 'Source file to test')
    .option('-f, --function <name>', 'Generate tests for a specific function only')
    .option('-o, --output <path>', 'Output test file path (default: tests/generated/<basename>.test.ts)')
    .option('--no-run', 'Generate tests without running them')
    .action(async (file: string, opts: { function?: string; output?: string; run: boolean }) => {
      const absSource = path.resolve(file);
      if (!await fs.pathExists(absSource)) {
        console.error(chalk.red(`File not found: ${absSource}`));
        process.exit(1);
      }

      const basename = path.basename(absSource, path.extname(absSource));
      const outputPath = opts.output
        ? path.resolve(opts.output)
        : path.resolve('tests', 'generated', `${basename}.test.ts`);

      await fs.ensureDir(path.dirname(outputPath));

      console.log(chalk.cyan(`\nGenerating tests for ${chalk.bold(file)}`));
      if (opts.function) console.log(chalk.dim(`  Function: ${opts.function}`));
      console.log();

      const sourceContent = await fs.readFile(absSource, 'utf-8');

      // Generate initial tests
      process.stdout.write(chalk.dim('Generating initial tests...'));
      let testContent = await generateTests(absSource, sourceContent, opts.function);
      await fs.writeFile(outputPath, testContent);
      console.log(chalk.green(` Done → ${path.relative(process.cwd(), outputPath)}`));

      if (!opts.run) {
        console.log(chalk.dim(`\nTest file written. Run manually: npx jest ${path.basename(outputPath)}`));
        return;
      }

      // Iterate: run → fix → run
      let passed = false;
      for (let i = 1; i <= MAX_ITERATIONS; i++) {
        process.stdout.write(chalk.dim(`\nRunning tests (iteration ${i}/${MAX_ITERATIONS})...`));
        const result = runTests(outputPath);

        if (result.passed) {
          passed = true;
          console.log(chalk.green(' PASS'));
          break;
        }

        console.log(chalk.red(' FAIL'));
        // Show a snippet of failures
        const preview = result.failureDetails.split('\n').slice(0, 8).join('\n');
        console.log(chalk.dim(preview));

        if (i < MAX_ITERATIONS) {
          process.stdout.write(chalk.dim('Fixing...'));
          testContent = await fixTests(
            file,
            sourceContent,
            testContent,
            result.failureDetails,
            i
          );
          await fs.writeFile(outputPath, testContent);
          console.log(chalk.yellow(' Updated'));
        }
      }

      if (passed) {
        console.log(chalk.green(`\n✓ Tests passing → ${path.relative(process.cwd(), outputPath)}`));
      } else {
        console.log(chalk.yellow(`\n⚠ Could not fix all failures after ${MAX_ITERATIONS} iterations.`));
        console.log(chalk.dim(`  Test file written: ${path.relative(process.cwd(), outputPath)}`));
        console.log(chalk.dim('  Review and edit manually.'));
      }
    });
}
