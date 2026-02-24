/**
 * Priority 5: Fine-tune CLI Commands
 * canvas finetune extract|run|eval|status
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { extractGitHistory } from './training-extractor.js';
import { extractPRReviews } from './pr-extractor.js';
import { runFineTune, getJobStatus } from './finetune-runner.js';
import { runEvalSuite } from './eval-suite.js';

export function registerFinetuneCommands(program: Command): void {
  const finetuneCmd = program.command('finetune')
    .description('Fine-tune a local model on your codebase history');

  finetuneCmd
    .command('extract')
    .description('Extract training data from git history and PR reviews')
    .option('--max-commits <n>', 'Max commits to process', '500')
    .action(async (opts) => {
      console.log(chalk.cyan('\n🔍 Extracting training data...\n'));

      // Git history
      process.stdout.write('  Extracting git history... ');
      const { written: gitWritten, outputFile: gitFile } = await extractGitHistory(
        parseInt(opts.maxCommits)
      );
      console.log(chalk.green(`✓ ${gitWritten} entries → ${gitFile}`));

      // PR reviews (optional, requires GITHUB_TOKEN)
      if (process.env.GITHUB_TOKEN) {
        process.stdout.write('  Extracting PR reviews... ');
        const { written: prWritten, outputFile: prFile } = await extractPRReviews();
        console.log(chalk.green(`✓ ${prWritten} entries → ${prFile}`));
      } else {
        console.log(chalk.gray('  PR reviews: skipped (set GITHUB_TOKEN to enable)'));
      }

      console.log(chalk.green('\n✓ Extraction complete'));
    });

  finetuneCmd
    .command('run')
    .description('Run fine-tuning on local model')
    .option('--base-model <model>', 'Base Ollama model', 'llama3.2:3b')
    .option('--output-model <name>', 'Output model name', 'canvas-custom')
    .option('--epochs <n>', 'Training epochs', '3')
    .action(async (opts) => {
      console.log(chalk.cyan('\n🏋️  Starting fine-tune...\n'));
      console.log(chalk.gray(`  Base model: ${opts.baseModel}`));
      console.log(chalk.gray(`  Output model: ${opts.outputModel}`));
      console.log(chalk.gray(`  Epochs: ${opts.epochs}`));

      try {
        const { jobId, message } = await runFineTune({
          baseModel: opts.baseModel,
          outputModel: opts.outputModel,
          epochs: parseInt(opts.epochs)
        });
        console.log(chalk.green(`\n✓ ${message}`));
        console.log(chalk.gray(`  Job ID: ${jobId}`));
      } catch (err) {
        console.error(chalk.red(`\n✗ ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  finetuneCmd
    .command('eval')
    .description('Evaluate base vs fine-tuned model')
    .option('--base-model <model>', 'Base model name', 'llama3.2:3b')
    .option('--tuned-model <name>', 'Fine-tuned model name', 'canvas-custom')
    .action(async (opts) => {
      console.log(chalk.cyan('\n📊 Running evaluation suite...\n'));
      console.log(chalk.gray(`  Prompts: 10 | Base: ${opts.baseModel} | Tuned: ${opts.tunedModel}\n`));

      const { results, outputFile } = await runEvalSuite(opts.baseModel, opts.tunedModel);

      const avgBase = results.reduce((s, r) => s + r.baseScore, 0) / results.length;
      const avgTuned = results.reduce((s, r) => s + r.tunedScore, 0) / results.length;
      const improvement = avgTuned - avgBase;

      console.log(chalk.bold('Results:'));
      console.log(`  Base model avg score:  ${avgBase.toFixed(1)}`);
      console.log(`  Tuned model avg score: ${avgTuned.toFixed(1)}`);
      const improvColor = improvement >= 0 ? chalk.green : chalk.red;
      console.log(`  Improvement:           ${improvColor(improvement >= 0 ? '+' : '')}${improvement.toFixed(1)}`);
      console.log(chalk.gray(`\n  Full results: ${outputFile}`));
    });

  finetuneCmd
    .command('status')
    .description('Show fine-tune job history')
    .action(async () => {
      const jobs = getJobStatus();

      if (jobs.length === 0) {
        console.log(chalk.gray('No fine-tune jobs found. Run "canvas finetune run" to start.'));
        return;
      }

      console.log(chalk.cyan.bold(`\n🏋️  Fine-tune Jobs (${jobs.length})\n`));
      for (const job of jobs) {
        const statusColor = job.status === 'completed' ? chalk.green
          : job.status === 'failed' ? chalk.red
          : job.status === 'running' ? chalk.yellow
          : chalk.gray;

        console.log(`${chalk.bold(job.id)} ${statusColor(job.status)}`);
        console.log(chalk.gray(`  Base: ${job.base_model} → Output: ${job.output_model}`));
        if (job.started_at) {
          console.log(chalk.gray(`  Started: ${new Date(job.started_at).toLocaleString()}`));
        }
        if (job.error) {
          console.log(chalk.red(`  Error: ${job.error}`));
        }
        console.log();
      }
    });
}
