/**
 * A/B Testing CLI Commands
 * canvas ab create|run|status|list|winner|compare|delete|export
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { getABTestEngine } from './ab-testing.js';
import type { ABStats } from './ab-testing.js';

export function registerABCommands(program: Command): void {
  const ab = program.command('ab').description('A/B testing for models and prompts');

  // ── canvas ab create ──
  ab
    .command('create')
    .description('Create a new A/B test')
    .requiredOption('--name <name>', 'Test name')
    .requiredOption('--type <type>', 'Test type: model, prompt, or combined')
    .requiredOption('--variants <json>', 'Variants as JSON array (see docs)')
    .option('--split <split>', 'Traffic split (comma-separated, e.g. "50,50")')
    .option('--metrics <metrics>', 'Eval metrics (comma-separated: quality,speed,cost,length)', 'quality,speed,cost')
    .action((opts: {
      name: string;
      type: string;
      variants: string;
      split?: string;
      metrics?: string;
    }) => {
      const engine = getABTestEngine();

      let variants;
      try {
        variants = JSON.parse(opts.variants);
      } catch {
        console.error(chalk.red('Error: --variants must be valid JSON array'));
        console.error(chalk.gray('Example: --variants \'[{"name":"Claude","provider":"claude","model":"claude-sonnet-4-6"},{"name":"GPT-4o","provider":"openai","model":"gpt-4o"}]\''));
        return;
      }

      if (!Array.isArray(variants) || variants.length < 2) {
        console.error(chalk.red('Error: Need at least 2 variants'));
        return;
      }

      const trafficSplit = opts.split
        ? opts.split.split(',').map(Number)
        : undefined;

      const metrics = (opts.metrics || 'quality,speed,cost').split(',') as any[];

      const test = engine.createTest({
        name: opts.name,
        type: opts.type as any,
        variants,
        trafficSplit,
        evalCriteria: { autoScore: true, userRating: false, metrics },
      });

      console.log(chalk.green(`\nA/B test created: ${test.id}`));
      console.log(`  Name: ${test.name}`);
      console.log(`  Type: ${test.type}`);
      console.log(`  Variants: ${test.variants.map(v => v.name).join(' vs ')}`);
      console.log(`  Split: ${test.trafficSplit.join('/')}%`);
      console.log(`\nRun with: ${chalk.cyan(`canvas ab run ${test.id} --prompt "your prompt"`)}`);
    });

  // ── canvas ab run ──
  ab
    .command('run <test-id>')
    .description('Run a prompt through all variants')
    .option('--prompt <text>', 'Single prompt to test')
    .option('--prompts <file>', 'File with one prompt per line')
    .action(async (testId: string, opts: { prompt?: string; prompts?: string }) => {
      const engine = getABTestEngine();

      let prompts: string[] = [];
      if (opts.prompt) {
        prompts = [opts.prompt];
      } else if (opts.prompts) {
        const fs = await import('fs');
        const content = fs.readFileSync(opts.prompts, 'utf-8');
        prompts = content.split('\n').map(l => l.trim()).filter(Boolean);
      } else {
        console.error(chalk.red('Error: Provide --prompt or --prompts'));
        return;
      }

      console.log(chalk.cyan(`\nRunning ${prompts.length} prompt(s) through test "${testId}"...\n`));

      for (const prompt of prompts) {
        console.log(chalk.gray(`Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`));

        const results = await engine.runSingle(testId, prompt);

        for (const r of results) {
          const scoreColor = r.score >= 70 ? chalk.green : r.score >= 50 ? chalk.yellow : chalk.red;
          console.log(
            `  ${chalk.bold(r.variantName.padEnd(20))} ` +
            `score: ${scoreColor(r.score.toFixed(1).padStart(5))}  ` +
            `latency: ${formatMs(r.latencyMs).padStart(7)}  ` +
            `cost: $${r.costUsd.toFixed(4)}`
          );
        }
        console.log();
      }

      console.log(chalk.gray(`View stats: canvas ab status ${testId}`));
    });

  // ── canvas ab status ──
  ab
    .command('status <test-id>')
    .description('Show test statistics')
    .action((testId: string) => {
      const engine = getABTestEngine();
      const test = engine.getTest(testId);
      if (!test) {
        console.error(chalk.red(`Test "${testId}" not found`));
        return;
      }

      const stats = engine.getStats(testId);

      console.log(chalk.bold(`\nA/B Test: ${test.name}`));
      console.log(`Status: ${statusBadge(test.status)}  Type: ${test.type}  ID: ${test.id}`);
      if (test.winnerId) {
        const winner = test.variants.find(v => v.id === test.winnerId);
        console.log(chalk.green(`Winner: ${winner?.name || test.winnerId}`));
      }
      console.log();

      // Stats table
      printStatsTable(stats);
    });

  // ── canvas ab list ──
  ab
    .command('list')
    .description('List all A/B tests')
    .option('--status <status>', 'Filter by status: active, paused, completed')
    .action((opts: { status?: string }) => {
      const engine = getABTestEngine();
      const tests = engine.listTests(opts.status);

      if (tests.length === 0) {
        console.log(chalk.gray('No A/B tests found.'));
        return;
      }

      console.log(chalk.bold(`\nA/B Tests (${tests.length}):\n`));
      for (const test of tests) {
        const variants = test.variants.map(v => v.name).join(' vs ');
        console.log(
          `  ${chalk.cyan(test.id.padEnd(14))} ${statusBadge(test.status)} ` +
          `${test.name.padEnd(30)} ${chalk.gray(variants)}`
        );
      }
    });

  // ── canvas ab winner ──
  ab
    .command('winner <test-id>')
    .description('Declare winner based on statistics')
    .action((testId: string) => {
      const engine = getABTestEngine();
      const winner = engine.declareWinner(testId);

      if (!winner) {
        console.error(chalk.red('No results to determine winner'));
        return;
      }

      const stats = engine.getStats(testId);
      console.log(chalk.bold('\nResults:\n'));
      printStatsTable(stats);

      console.log(chalk.green.bold(`\nWinner: ${winner.variantName}`));
      console.log(
        `  Avg score: ${winner.avgScore.toFixed(1)}  ` +
        `Win rate: ${(winner.winRate * 100).toFixed(0)}%  ` +
        `Confidence: ${(winner.confidence * 100).toFixed(0)}%`
      );

      if (winner.confidence < 0.95) {
        console.log(chalk.yellow('\n  Note: Confidence < 95%. Run more tests for statistical significance.'));
      }
    });

  // ── canvas ab compare ──
  ab
    .command('compare <test-id>')
    .description('Side-by-side output comparison')
    .action((testId: string) => {
      const engine = getABTestEngine();
      const comparison = engine.getLastComparison(testId);

      if (comparison.length === 0) {
        console.error(chalk.red('No results to compare. Run the test first.'));
        return;
      }

      console.log(chalk.bold('\nSide-by-Side Comparison (last run):\n'));

      for (const entry of comparison) {
        const scoreColor = entry.score >= 70 ? chalk.green : entry.score >= 50 ? chalk.yellow : chalk.red;
        console.log(chalk.cyan.bold(`── ${entry.variantName} `) + scoreColor(`(score: ${entry.score.toFixed(1)}) `) + chalk.cyan('─'.repeat(50)));
        console.log(entry.response.slice(0, 500));
        if (entry.response.length > 500) console.log(chalk.gray(`... (${entry.response.length} chars total)`));
        console.log();
      }
    });

  // ── canvas ab delete ──
  ab
    .command('delete <test-id>')
    .description('Delete a test and its results')
    .action((testId: string) => {
      const engine = getABTestEngine();
      engine.deleteTest(testId);
      console.log(chalk.green(`Deleted test "${testId}"`));
    });

  // ── canvas ab export ──
  ab
    .command('export <test-id>')
    .description('Export test results as JSON')
    .option('-o, --output <file>', 'Output file path')
    .action(async (testId: string, opts: { output?: string }) => {
      const engine = getABTestEngine();
      const data = engine.exportResults(testId);

      if (!data) {
        console.error(chalk.red(`Test "${testId}" not found`));
        return;
      }

      const json = JSON.stringify(data, null, 2);

      if (opts.output) {
        const fs = await import('fs');
        fs.writeFileSync(opts.output, json, 'utf-8');
        console.log(chalk.green(`Exported to ${opts.output}`));
      } else {
        console.log(json);
      }
    });
}

// ── Helpers ──

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusBadge(status: string): string {
  switch (status) {
    case 'active': return chalk.green('[active]');
    case 'paused': return chalk.yellow('[paused]');
    case 'completed': return chalk.blue('[done]');
    default: return chalk.gray(`[${status}]`);
  }
}

function printStatsTable(stats: ABStats[]): void {
  const header =
    padRight('Variant', 22) +
    padRight('Runs', 6) +
    padRight('Avg Score', 11) +
    padRight('Avg Latency', 13) +
    padRight('Avg Cost', 10) +
    padRight('Win Rate', 10) +
    'Confidence';

  console.log(chalk.gray('─'.repeat(85)));
  console.log(chalk.bold(header));
  console.log(chalk.gray('─'.repeat(85)));

  for (const s of stats) {
    const best = stats.every(os => s.avgScore >= os.avgScore);
    const nameStr = best ? chalk.green.bold(s.variantName) : s.variantName;

    console.log(
      padRight(nameStr, 22 + (best ? 20 : 0)) + // chalk adds invisible chars
      padRight(String(s.runs), 6) +
      padRight(s.avgScore.toFixed(1), 11) +
      padRight(formatMs(s.avgLatencyMs), 13) +
      padRight(`$${s.avgCostUsd.toFixed(4)}`, 10) +
      padRight(`${(s.winRate * 100).toFixed(0)}%`, 10) +
      `${(s.confidence * 100).toFixed(0)}%`
    );
  }

  console.log(chalk.gray('─'.repeat(85)));
}

function padRight(str: string, len: number): string {
  // Strip ANSI for length calculation
  const stripped = str.replace(/\u001b\[[0-9;]*m/g, '');
  const pad = Math.max(0, len - stripped.length);
  return str + ' '.repeat(pad);
}
