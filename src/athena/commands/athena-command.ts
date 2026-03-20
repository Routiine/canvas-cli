/**
 * Athena command — canvas athena <goal>
 * Autonomous business execution engine powered by canvas-cli internals.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { AthenaAgent } from '../AthenaAgent.js';
import { AthenaApiClient, type ExecutionEvent } from '../AthenaApiClient.js';
import { loadConfig, saveConfig } from '../../config.js';
import { BusinessMemory } from '../BusinessMemory.js';
import { getBuiltInRecipes } from '../recipes.js';
import { getProviderStatus } from '../AthenaProviderBridge.js';

// ---------------------------------------------------------------------------
// Header / Help
// ---------------------------------------------------------------------------

function printAthenaHeader(goal?: string): void {
  console.log(chalk.bold('\n' + chalk.hex('#6366f1')('ATHENA AI') + ' — Autonomous Business Engine'));
  console.log(chalk.gray('─'.repeat(60)));
  if (goal) {
    console.log(chalk.white('Goal: ') + chalk.italic(goal));
    console.log(chalk.gray('─'.repeat(60)) + '\n');
  }
}

function showAthenaHelp(): void {
  printAthenaHeader();
  console.log(chalk.white('Usage:'));
  console.log(`  ${chalk.hex('#6366f1')('canvas athena')} ${chalk.italic('<goal>')}     ${chalk.gray('Run an autonomous business goal')}`);
  console.log(`  ${chalk.hex('#6366f1')('canvas athena plan')} ${chalk.italic('<goal>')}  ${chalk.gray('Show execution plan without running')}`);
  console.log(`  ${chalk.hex('#6366f1')('canvas athena memory')}         ${chalk.gray('Manage business memory')}`);
  console.log(`  ${chalk.hex('#6366f1')('canvas athena recipes')}        ${chalk.gray('List available automation recipes')}`);
  console.log(`  ${chalk.hex('#6366f1')('canvas athena providers')}      ${chalk.gray('Show AI provider status')}`);
  console.log(`  ${chalk.hex('#6366f1')('canvas athena connect')} ${chalk.italic('<url>')} ${chalk.gray('Connect to remote Athena API')}`);
  console.log(`  ${chalk.hex('#6366f1')('canvas athena status')}         ${chalk.gray('Show Athena system status')}`);
  console.log();
  console.log(chalk.white('Examples:'));
  console.log(`  canvas athena "grow my organic traffic to 5000/month"`);
  console.log(`  canvas athena "research top 3 competitors and write a comparison"`);
  console.log(`  canvas athena --plan "build a content calendar for Q2"`);
  console.log();
}

// ---------------------------------------------------------------------------
// Local execution
// ---------------------------------------------------------------------------

async function runLocal(
  goal: string,
  options: { verbose?: boolean; plan?: boolean }
): Promise<void> {
  printAthenaHeader(goal);

  let stepCount = 0;
  const spinner = ora({ text: 'Initializing autonomous engine...', color: 'magenta' }).start();

  const agent = new AthenaAgent();

  agent.on('thinking', () => {
    spinner.text = chalk.hex('#6366f1')('Thinking...');
  });

  agent.on('progress', (event: { message: string }) => {
    spinner.text = chalk.hex('#6366f1')(event.message);
  });

  agent.on('step', (event: { message: string }) => {
    stepCount++;
    spinner.succeed(chalk.hex('#6366f1')(`  Step ${stepCount}: `) + chalk.white(event.message));
    spinner.start(chalk.hex('#6366f1')(`Step ${stepCount + 1} — working...`));
  });

  agent.on('error', (event: { message: string }) => {
    spinner.fail(chalk.red('  Error: ') + chalk.gray(event.message));
    spinner.start('Attempting recovery...');
  });

  try {
    const result = await agent.run(goal, {
      verbose: options.verbose,
      onEvent: (event) => {
        if (options.verbose && event.type === 'tool_use') {
          console.log(chalk.gray(`    [tool] ${event.message}`));
        }
      },
    });

    spinner.succeed(chalk.green('Execution complete'));

    console.log('\n' + chalk.bold('Result:'));
    console.log(chalk.white(result));
    console.log('\n' + chalk.gray('─'.repeat(60)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red('Execution failed: ') + message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Remote execution (devproject-2 API)
// ---------------------------------------------------------------------------

async function runRemote(
  goal: string,
  remoteUrl: string,
  options: { verbose?: boolean }
): Promise<void> {
  printAthenaHeader(goal);

  const client = new AthenaApiClient(remoteUrl);
  const spinner = ora({ text: 'Connecting to Athena API...', color: 'magenta' }).start();

  let stepNum = 0;

  try {
    spinner.succeed('Connected');
    spinner.start(chalk.hex('#6366f1')('Streaming execution...'));

    for await (const event of client.executeStream(goal)) {
      await handleRemoteEvent(event, spinner, () => ++stepNum, options.verbose ?? false, client);
    }

    spinner.stop();
    console.log('\n' + chalk.gray('─'.repeat(60)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(chalk.red('Remote execution failed: ') + message);
    process.exit(1);
  }
}

async function handleRemoteEvent(
  event: ExecutionEvent,
  spinner: ReturnType<typeof ora>,
  nextStep: () => number,
  verbose: boolean,
  client: AthenaApiClient
): Promise<void> {
  switch (event.type) {
    case 'step_started': {
      const n = nextStep();
      spinner.succeed(chalk.hex('#6366f1')(`  Step ${n}: `) + chalk.white(event.message));
      spinner.start(chalk.hex('#6366f1')(`Step ${n + 1} — working...`));
      break;
    }

    case 'step_completed':
      spinner.succeed(chalk.green('  done: ') + chalk.gray(event.message));
      spinner.start(chalk.hex('#6366f1')('Next step...'));
      break;

    case 'step_failed':
      spinner.fail(chalk.red('  failed: ') + chalk.gray(event.message));
      spinner.start('Attempting correction...');
      break;

    case 'awaiting_approval': {
      spinner.stop();
      console.log(chalk.yellow('  AWAITING APPROVAL: ') + event.message);
      const approved = await promptApproval('Approve this action? [y/N] ');
      await client.approve(event.executionId, approved);
      spinner.start(chalk.hex('#6366f1')('Continuing...'));
      break;
    }

    case 'task_completed':
      spinner.succeed(chalk.green('Task completed'));
      console.log('\n' + chalk.bold('Result:'));
      console.log(chalk.white(event.message));
      break;

    case 'task_failed':
      spinner.fail(chalk.red('Task failed: ') + event.message);
      break;

    default:
      if (verbose) {
        console.log(chalk.gray(`    [${event.type}] ${event.message}`));
      } else {
        spinner.text = chalk.hex('#6366f1')(event.message || event.type);
      }
  }
}

function promptApproval(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Show plan
// ---------------------------------------------------------------------------

async function showPlan(goal: string): Promise<void> {
  printAthenaHeader(goal);

  const config = loadConfig();
  const remoteUrl = config.athena?.apiUrl;

  if (remoteUrl) {
    const spinner = ora('Fetching execution plan...').start();
    const client = new AthenaApiClient(remoteUrl);
    try {
      const plan = await client.plan(goal);
      spinner.succeed('Plan received');
      console.log('\n' + chalk.bold('Execution Plan:'));
      console.log(chalk.white(JSON.stringify(plan, null, 2)));
    } catch {
      spinner.fail('Failed to fetch plan');
    }
    return;
  }

  // Local plan preview: use the recipes heuristic
  console.log(chalk.dim('Local plan preview (no remote API connected):'));
  const recipes = getBuiltInRecipes();
  const lower = goal.toLowerCase();
  const match = recipes.find((r) =>
    r.tags.some((t) => lower.includes(t)) ||
    r.name.toLowerCase().split(' ').some((w) => lower.includes(w))
  );

  if (match) {
    console.log(`\n${chalk.hex('#6366f1')('Matched recipe:')} ${chalk.bold(match.name)}`);
    console.log(chalk.gray(match.description));
    console.log('\n' + chalk.white('Steps:'));
    match.steps.forEach((step, i) => {
      console.log(`  ${chalk.hex('#6366f1')(String(i + 1) + '.')} ${step}`);
    });
  } else {
    console.log(chalk.dim('No recipe matched. Athena will reason about this goal autonomously.'));
    console.log(chalk.dim('Run without --plan to execute.'));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerAthenaCommands(program: Command): void {
  const athena = program
    .command('athena')
    .description('Athena AI — autonomous business execution engine');

  // canvas athena [goal...]
  athena
    .argument('[goal...]', 'Business goal to execute')
    .option('--plan', 'Show execution plan before running')
    .option('--local', 'Force local execution (skip remote API)')
    .option('-v, --verbose', 'Verbose output')
    .action(async (goalParts: string[], options: { plan?: boolean; local?: boolean; verbose?: boolean }) => {
      const goal = goalParts.join(' ').trim();

      if (!goal) {
        showAthenaHelp();
        return;
      }

      if (options.plan) {
        await showPlan(goal);
        return;
      }

      const config = loadConfig();
      const remoteUrl = config.athena?.apiUrl;

      if (remoteUrl && !options.local) {
        await runRemote(goal, remoteUrl, options);
      } else {
        await runLocal(goal, options);
      }
    });

  // canvas athena plan <goal...>
  athena
    .command('plan')
    .argument('<goal...>', 'Goal to plan')
    .description('Show execution plan without running')
    .action(async (goalParts: string[]) => {
      await showPlan(goalParts.join(' ').trim());
    });

  // canvas athena memory
  const memoryCmd = athena
    .command('memory')
    .description('Manage Athena business memory')
    .action(() => {
      // Default action for `canvas athena memory` — show recent entries with module/category
      const memory = new BusinessMemory();
      const entries = memory.list({ limit: 20 });

      console.log(chalk.bold('\nAthena Business Memory — Recent Entries\n'));
      console.log(chalk.gray('─'.repeat(70)));

      if (entries.length === 0) {
        console.log(chalk.dim('  No memories stored yet. Run a goal to start building context.'));
        console.log();
        return;
      }

      const catW = 12;
      const ageW = 10;

      console.log(
        chalk.bold('  ' + 'Category'.padEnd(catW)) +
        chalk.bold('Age'.padEnd(ageW)) +
        chalk.bold('Memory')
      );
      console.log(chalk.gray('  ' + '─'.repeat(60)));

      for (const e of entries) {
        const ageMs = Date.now() - e.created_at;
        const ageDays = Math.floor(ageMs / 86400000);
        const ageHours = Math.floor(ageMs / 3600000);
        const ageLabel = ageDays === 0
          ? (ageHours === 0 ? 'just now' : `${ageHours}h ago`)
          : `${ageDays}d ago`;

        // Extract the bracketed category prefix that BusinessMemory.storeFact injects
        const catMatch = e.content.match(/^\[(\w+)\]/);
        const categoryLabel = catMatch ? catMatch[1] : e.category;
        const contentText = catMatch
          ? e.content.slice(catMatch[0].length).trim()
          : e.content;

        console.log(
          `  ${chalk.cyan(categoryLabel.padEnd(catW))}` +
          `${chalk.gray(ageLabel.padEnd(ageW))}` +
          `${chalk.white(contentText.slice(0, 60))}`
        );
      }

      console.log();
      console.log(chalk.dim(`Showing ${entries.length} most recent. Run: canvas athena memory list for full list.`));
      console.log();
    });

  memoryCmd
    .command('list')
    .description('List stored business memories')
    .action(() => {
      const memory = new BusinessMemory();
      const entries = memory.list({ limit: 50 });

      if (entries.length === 0) {
        console.log(chalk.dim('No memories stored yet.'));
        return;
      }

      console.log(chalk.bold(`\nBusiness Memory (${entries.length} entries)\n`));
      console.log(chalk.gray('─'.repeat(70)));

      const catW = 12;
      const ageW = 10;
      const impW = 6;

      console.log(
        chalk.bold('  ' + 'Category'.padEnd(catW)) +
        chalk.bold('Age'.padEnd(ageW)) +
        chalk.bold('Imp'.padEnd(impW)) +
        chalk.bold('Content')
      );
      console.log(chalk.gray('  ' + '─'.repeat(60)));

      for (const e of entries) {
        const ageMs = Date.now() - e.created_at;
        const ageDays = Math.floor(ageMs / 86400000);
        const ageHours = Math.floor(ageMs / 3600000);
        const ageLabel = ageDays === 0
          ? (ageHours === 0 ? 'just now' : `${ageHours}h ago`)
          : `${ageDays}d ago`;

        const catMatch = e.content.match(/^\[(\w+)\]/);
        const categoryLabel = catMatch ? catMatch[1] : e.category;
        const contentText = catMatch
          ? e.content.slice(catMatch[0].length).trim()
          : e.content;

        const impStr = (e.importance * 10).toFixed(0) + '/10';
        console.log(
          `  ${chalk.cyan(categoryLabel.padEnd(catW))}` +
          `${chalk.gray(ageLabel.padEnd(ageW))}` +
          `${chalk.dim(impStr.padEnd(impW))}` +
          `${chalk.white(contentText.slice(0, 60))}`
        );
      }
      console.log();
    });

  memoryCmd
    .command('store')
    .argument('<text...>', 'Fact to store')
    .description('Store a business fact')
    .option('-c, --category <cat>', 'Category (brand/competitor/keyword/insight/decision)', 'insight')
    .action(async (textParts: string[], opts: { category: string }) => {
      const memory = new BusinessMemory();
      const validCategories = ['brand', 'competitor', 'keyword', 'insight', 'decision'] as const;
      const category = validCategories.includes(opts.category as typeof validCategories[number])
        ? (opts.category as typeof validCategories[number])
        : 'insight';
      await memory.storeFact(textParts.join(' '), category);
      console.log(chalk.green('Stored'));
    });

  memoryCmd
    .command('search')
    .argument('<query...>', 'Search query')
    .description('Search business memories')
    .action(async (queryParts: string[]) => {
      const memory = new BusinessMemory();
      const results = await memory.recallRelevant(queryParts.join(' '), 10);

      if (results.length === 0) {
        console.log(chalk.dim('No matching memories.'));
        return;
      }

      console.log(chalk.bold(`\nSearch Results (${results.length})\n`));
      for (const e of results) {
        console.log(`  ${chalk.hex('#6366f1')('•')} ${chalk.white(e.content)}`);
      }
      console.log();
    });

  // canvas athena recipes
  athena
    .command('recipes')
    .description('List available Athena automation recipes')
    .action(() => {
      const recipes = getBuiltInRecipes();
      console.log(chalk.bold('\nAthena Built-in Recipes\n'));

      // Column widths
      const nameW = 28;
      const catW = 14;
      const durW = 10;

      const header =
        chalk.bold('  ' + 'Name'.padEnd(nameW)) +
        chalk.bold('Category'.padEnd(catW)) +
        chalk.bold('Duration'.padEnd(durW));
      console.log(header);
      console.log(chalk.gray('  ' + '─'.repeat(nameW + catW + durW)));

      for (const r of recipes) {
        const primaryTag = r.tags[0] ?? '';
        const name = chalk.hex('#6366f1')(r.name.padEnd(nameW));
        const cat = chalk.cyan(primaryTag.padEnd(catW));
        const dur = chalk.white(r.estimatedDuration.padEnd(durW));
        console.log(`  ${name}${cat}${dur}`);
        console.log(`  ${chalk.gray(' '.repeat(nameW) + r.description)}`);
        console.log(`  ${chalk.dim(' '.repeat(nameW) + 'tags: ' + r.tags.join(', '))}`);
        console.log();
      }

      console.log(chalk.dim('Run: canvas athena "<recipe name>" to execute a recipe by name'));
      console.log(chalk.dim('Run: canvas athena plan "<goal>" to preview steps before executing'));
      console.log();
    });

  // canvas athena providers
  athena
    .command('providers')
    .description('Show available AI providers and status')
    .action(() => {
      const statuses = getProviderStatus();
      console.log(chalk.bold('\nAI Provider Status\n'));
      console.log(chalk.gray('─'.repeat(60)));
      for (const p of statuses) {
        const status = p.available
          ? chalk.green('available')
          : chalk.red('unavailable');
        console.log(
          `  ${chalk.white(p.name.padEnd(12))} ${status.padEnd(20)} ${chalk.gray(p.defaultModel)}`
        );
      }
      console.log();
      console.log(chalk.dim('Set GROQ_API_KEY or MISTRAL_API_KEY env vars to enable additional providers'));
      console.log();
    });

  // canvas athena connect <url>
  athena
    .command('connect')
    .argument('<url>', 'Remote Athena API URL')
    .description('Connect to a remote Athena API (devproject-2)')
    .action(async (url: string) => {
      const client = new AthenaApiClient(url);
      const spinner = ora('Testing connection...').start();
      try {
        const ok = await client.testConnection();
        if (ok) {
          const config = loadConfig();
          const next = { ...config, athena: { ...(config.athena ?? {}), apiUrl: url } };
          saveConfig(next);
          spinner.succeed(chalk.green(`Connected to Athena at ${url}`));
          console.log(chalk.dim('  Config saved. canvas athena will use this endpoint by default.'));
        } else {
          spinner.fail(chalk.red('Connection test failed — server did not respond to /health'));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        spinner.fail(chalk.red('Connection failed: ') + msg);
      }
    });

  // canvas athena status
  athena
    .command('status')
    .description('Show Athena system status')
    .action(async () => {
      const config = loadConfig();
      const memory = new BusinessMemory();
      const localEntries = memory.list({ limit: 5 });
      const statuses = getProviderStatus();
      const available = statuses.filter((p) => p.available);
      const remoteUrl = config.athena?.apiUrl;

      console.log(chalk.bold('\nAthena AI — System Status\n'));
      console.log(chalk.gray('─'.repeat(60)));

      // Remote API line
      console.log(
        chalk.white('Remote API:   ') +
        (remoteUrl
          ? chalk.green(remoteUrl)
          : chalk.dim('not connected  (run: canvas athena connect <url>)'))
      );

      // If remote is configured, ping it and fetch live data
      if (remoteUrl) {
        const spinner = ora({ text: 'Fetching remote stats...', color: 'magenta' }).start();
        const client = new AthenaApiClient(remoteUrl);
        try {
          const isAlive = await client.testConnection();
          if (isAlive) {
            spinner.stop();
            console.log(chalk.white('API Health:    ') + chalk.green('online'));

            // Cost summary
            try {
              const costData = await client.getCost() as Record<string, unknown>;
              const totalCost = costData?.total_cost ?? costData?.totalCost ?? costData?.cost;
              const tokenCount = costData?.total_tokens ?? costData?.tokens;
              if (totalCost !== undefined) {
                console.log(
                  chalk.white('Cost (session):') +
                  chalk.yellow(` $${Number(totalCost).toFixed(4)}`) +
                  (tokenCount ? chalk.gray(` (${Number(tokenCount).toLocaleString()} tokens)`) : '')
                );
              }
            } catch {
              // Cost endpoint optional — skip silently
            }

            // Remote memory count
            try {
              const remoteMemory = await client.getMemory();
              console.log(
                chalk.white('Remote Memory: ') +
                chalk.cyan(`${remoteMemory.length} entries`)
              );
            } catch {
              // Memory endpoint optional — skip silently
            }
          } else {
            spinner.stop();
            console.log(chalk.white('API Health:    ') + chalk.red('unreachable'));
          }
        } catch {
          spinner.stop();
          console.log(chalk.white('API Health:    ') + chalk.red('connection error'));
        }
      }

      // Local providers
      console.log(
        chalk.white('Providers:    ') +
        (available.length > 0
          ? chalk.green(available.map((p) => `${p.name} (${p.defaultModel})`).join(', '))
          : chalk.red('none configured  (set ANTHROPIC_API_KEY, GROQ_API_KEY, or MISTRAL_API_KEY)'))
      );

      // Local memory
      const totalLocal = memory.list({ limit: 1000 }).length;
      console.log(
        chalk.white('Local Memory:  ') +
        chalk.cyan(`${totalLocal} entries`) +
        (localEntries.length > 0 ? chalk.gray(' — recent:') : '')
      );

      if (localEntries.length > 0) {
        for (const e of localEntries) {
          const catMatch = e.content.match(/^\[(\w+)\]/);
          const label = catMatch ? catMatch[1] : e.category;
          const text = catMatch ? e.content.slice(catMatch[0].length).trim() : e.content;
          console.log(
            chalk.gray(`    [${label}] `) + chalk.dim(text.slice(0, 60))
          );
        }
      }

      console.log();
    });
}
