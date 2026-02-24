#!/usr/bin/env node

// Set process title to 'canvas' instead of 'node'
process.title = 'canvas';

/**
 * Canvas CLI - Production-ready AI assistant with advanced tools
 * Entry point - delegates to specialized modules
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, saveConfig } from './config.js';
import { ModelManager } from './models/model-manager.js';
import { initializeCanvasFeatures, CanvasFeatures, type FeatureManager } from './features/index.js';
import { initializeSkillSystem } from './skills/skillSystem.js';

// Polished UI
import {
  PolishedTheme,
  Welcome,
  spinner,
  fmt
} from './ui/polished/index.js';

// Initialize polished theme (slate is default)
const uiTheme = new PolishedTheme('slate');
const welcome = new Welcome(uiTheme);

// Import CLI commands
import {
  createChatCommand,
  createModelsCommand,
  createContextCommand,
  createExportCommand,
  createCrawlCommand,
  createSearchCommand,
  createInitCommand,
  createToolsCommand,
  createAgentCommand,
  registerBuiltinCommands,
  createEditCommand,
  createUndoCommand,
  createTestCommand,
  createReviewPRCommand
} from './commands/index.js';
import { registerInkUICommand } from './commands/ink-ui.js';
import { createInstallCommand } from './commands/install.js';
import { createUpdateCommand } from './commands/update.js';

// Import feature commands
import { createFeatureCommands } from './commands/feature-commands.js';

// Strategic system commands (Priorities 1-5)
import { registerMemoryCommands } from './memory/memory-commands.js';
import { registerFinetuneCommands } from './finetune/finetune-commands.js';

// MCP server management
import { createMCPCommand } from './mcp/mcp-manager.js';

// Headless mode
import { registerHeadlessCommands, executeHeadless } from './modes/headless.js';

// Plugin system
import { loadPlugins, registerPluginCommands, listPlugins } from './plugins/plugin-loader.js';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const pkg = _require('../package.json');
const VERSION: string = pkg.version;

async function setupInitialConfig(): Promise<boolean> {
  const config = loadConfig();
  const needsConfig = !config.ollamaUrl && !config.ollama?.baseUrl;

  if (!needsConfig) {
    return false;
  }

  welcome.standard(VERSION);
  console.log(fmt.info('No configuration found. Let\'s set up Canvas CLI.'));
  console.log(uiTheme.dim('You can also run "canvas config" anytime to configure.\n'));

  const inquirer = await import('inquirer');
  const { setupNow } = await inquirer.default.prompt([
    {
      type: 'confirm',
      name: 'setupNow',
      message: 'Would you like to configure Canvas CLI now?',
      default: true
    }
  ]);

  if (setupNow) {
    const { ollamaUrl } = await inquirer.default.prompt([
      {
        type: 'input',
        name: 'ollamaUrl',
        message: 'Enter Ollama API URL:',
        default: 'http://localhost:11434',
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        }
      }
    ]);

    const newConfig = {
      ...config,
      ollamaUrl: ollamaUrl,
      ollama: {
        baseUrl: ollamaUrl,
        defaultModel: 'llama3.2:latest'
      }
    };
    saveConfig(newConfig);
    console.log(fmt.success('Basic configuration saved! Use /config to add more settings.'));
    console.log('');
    return true;
  }

  console.log(fmt.warning('No configuration set. Canvas CLI may not work properly.'));
  console.log(uiTheme.dim('Run /config to configure at any time.\n'));
  return false;
}

async function initializeSystems(): Promise<FeatureManager | null> {
  const config = loadConfig();

  // Register default model
  const defaultModel = config.defaultModel || config.ollama?.defaultModel;
  if (defaultModel) {
    ModelManager.registerDefaultAliasFromConfig(defaultModel);
  }

  // Initialize features (optional)
  let featureManager = null;
  const initSpinner = spinner(`Initializing Canvas CLI v${VERSION}`);
  initSpinner.start();

  try {
    featureManager = await initializeCanvasFeatures();
    initSpinner.succeed('Canvas CLI initialized');
  } catch (error) {
    initSpinner.warn('Initialized with limited features');
  }

  // Initialize skills (optional)
  try {
    await initializeSkillSystem();
  } catch (error) {
    // Skills are optional
  }

  return featureManager;
}

function registerCoreCommands(program: Command, config: ReturnType<typeof loadConfig>): void {
  // Chat (default command)
  program.addCommand(createChatCommand());

  // Models
  program.addCommand(createModelsCommand());

  // Config
  program
    .command('config')
    .description('Configure Canvas CLI settings interactively')
    .argument('[action]', 'Optional: show, set, test, reset, help')
    .argument('[key]', 'Config key (for set command)')
    .argument('[value]', 'Config value (for set command)')
    .action(async (action?: string, key?: string, value?: string) => {
      const { configCommand } = await import('./commands/config-command.js');
      let args = '';
      if (action) {
        args = action;
        if (key) args += ` ${key}`;
        if (value) args += ` ${value}`;
      }
      const result = await configCommand.execute(args);
      if (result) console.log(result);
    });

  // Init
  program.addCommand(createInitCommand());

  // Recipe
  program
    .command('recipe')
    .description('Run predefined workflow recipes')
    .argument('[name]', 'Recipe name to execute')
    .option('-l, --list', 'List available recipes')
    .option('-v, --variables <vars>', 'Variables for recipe (JSON format)')
    .action(async (name?: string, options?: { list?: boolean; variables?: string }) => {
      const { recipeCommand } = await import('./commands/recipe-command.js');
      let args = '';
      if (options?.list) args = 'list';
      else if (name) args = `run ${name} ${options?.variables || ''}`;
      const result = await recipeCommand.execute(args.trim());
      if (result) console.log(result);
    });

  // Agent
  program.addCommand(createAgentCommand());

  // Tools
  program.addCommand(createToolsCommand());

  // Context
  program.addCommand(createContextCommand());

  // Export
  program.addCommand(createExportCommand());

  // Ink UI
  registerInkUICommand(program);

  // Update & Install
  program.addCommand(createUpdateCommand());
  program.addCommand(createInstallCommand());

  // Knowledge commands
  program.addCommand(createCrawlCommand());
  program.addCommand(createSearchCommand());

  // Priority 3: Persistent memory commands
  registerMemoryCommands(program);

  // Priority 5: Fine-tuning commands
  registerFinetuneCommands(program);

  // MCP server management (canvas mcp list|add|remove|start|stop|tools|test|serve)
  createMCPCommand(program);

  // canvas edit <file> <instruction> — AI-powered file edit with diff review
  program.addCommand(createEditCommand());

  // canvas undo <file> — restore from pre-edit snapshot
  program.addCommand(createUndoCommand());

  // canvas test <file> — generate + iterate tests
  program.addCommand(createTestCommand());

  // canvas review-pr <number> — AI code review posted to GitHub
  program.addCommand(createReviewPRCommand());

  // canvas ask <query> — semantic search over codebase
  program
    .command('ask')
    .description('Semantic search over the codebase using embeddings')
    .argument('<query>', 'Natural language question about the codebase')
    .option('-k, --top-k <n>', 'Number of results to return', '5')
    .option('--context', 'Show full chunk text in results', false)
    .action(async (query: string, opts: { topK: string; context: boolean }) => {
      const { semanticSearch } = await import('./intelligence/semantic-search.js');
      try {
        const results = await semanticSearch(query, parseInt(opts.topK, 10));
        console.log(chalk.cyan.bold(`\nSemantic search: "${query}"\n`));
        for (const r of results) {
          const scoreBar = chalk.green('█'.repeat(Math.round(r.score * 20)));
          console.log(chalk.bold(`  ${r.filePath}`) + chalk.dim(` :${r.startLine}-${r.endLine}`) + `  ${scoreBar} ${(r.score * 100).toFixed(1)}%`);
          if (opts.context) {
            const preview = r.text.split('\n').slice(0, 6).join('\n');
            console.log(chalk.dim(preview.split('\n').map(l => `    ${l}`).join('\n')));
          }
          console.log();
        }
      } catch (err: unknown) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      }
    });

  // canvas plugins — manage plugins
  program
    .command('plugins')
    .description('List installed plugins from ~/.canvas/plugins/')
    .action(() => {
      listPlugins();
    });

  // Priority 2: Codebase index commands
  const indexCmd = program.command('index').description('Manage codebase semantic graph index');

  indexCmd
    .command('build')
    .description('Build semantic index of the codebase')
    .option('--root <dir>', 'Root directory to index', process.cwd())
    .option('--no-embeddings', 'Skip embedding files for semantic search')
    .action(async (opts: { root: string; embeddings: boolean }) => {
      const { buildIndex } = await import('./graph/codebase-graph.js');
      const indexedFiles = await buildIndex(opts.root, true);

      if (opts.embeddings !== false && indexedFiles && indexedFiles.length > 0) {
        const { embedFiles } = await import('./intelligence/semantic-search.js');
        console.log(chalk.dim('\nBuilding semantic embedding index...'));
        await embedFiles({ rootDir: opts.root, files: indexedFiles, verbose: true });
      }
    });

  indexCmd
    .command('query <symbol>')
    .description('Query the semantic index for a symbol')
    .action(async (symbol: string) => {
      const { querySymbol, getStats } = await import('./graph/codebase-graph.js');
      const results = querySymbol(symbol);
      if (results.length === 0) {
        console.log(chalk.gray(`No results for: ${symbol}`));
        return;
      }
      console.log(chalk.cyan.bold(`\n🔍 Symbol: ${symbol} (${results.length} results)\n`));
      for (const node of results.slice(0, 10)) {
        console.log(chalk.bold(`  ${node.symbol_name} [${node.node_type}]`));
        console.log(chalk.gray(`    ${node.file_path}:${node.line_start || '?'}`));
        if (node.signature) console.log(chalk.gray(`    ${node.signature}`));
        if (node.git_author) console.log(chalk.gray(`    Author: ${node.git_author}`));
        console.log();
      }
      const stats = getStats();
      console.log(chalk.gray(`Index: ${stats.nodeCount} nodes | ${stats.edgeCount} edges | ${stats.fileCount} files`));
    });

  indexCmd
    .command('dataflow <file>')
    .description('Analyze data flow in a file (sources → sinks)')
    .action(async (file: string) => {
      const { analyzeFileDataFlow, getDataFlowSummary } = await import('./graph/data-flow-analyzer.js');
      const result = await analyzeFileDataFlow(file);
      console.log(chalk.cyan.bold(`\n🔀 Data Flow: ${file}\n`));
      console.log(getDataFlowSummary(result));
      if (result.paths.length === 0) {
        console.log(chalk.gray('  No tainted data flows detected.'));
      }
      console.log();
    });

  // Priority 4: Daemon commands
  const daemonCmd = program.command('daemon').description('Manage background analysis daemon');

  daemonCmd
    .command('start')
    .description('Start the background daemon')
    .action(async () => {
      const { startDaemon } = await import('./daemon/daemon-manager.js');
      const result = await startDaemon();
      if (result.success) {
        console.log(chalk.green(`✓ ${result.message}`));
      } else {
        console.log(chalk.yellow(`⚠ ${result.message}`));
      }
    });

  daemonCmd
    .command('stop')
    .description('Stop the background daemon')
    .action(async () => {
      const { stopDaemon } = await import('./daemon/daemon-manager.js');
      const result = stopDaemon();
      if (result.success) {
        console.log(chalk.green(`✓ ${result.message}`));
      } else {
        console.log(chalk.yellow(`⚠ ${result.message}`));
      }
    });

  daemonCmd
    .command('status')
    .description('Show daemon status and recent findings')
    .action(async () => {
      const { getDaemonStatus, getFindings } = await import('./daemon/daemon-manager.js');
      const s = await getDaemonStatus();
      console.log(chalk.cyan.bold('\n🔮 Daemon Status\n'));
      console.log(`  Running: ${s.running ? chalk.green('yes') : chalk.red('no')}`);
      if (s.pid) console.log(`  PID: ${s.pid}`);
      console.log(`  Log: ${s.logFile}`);
      console.log(`  Findings (24h): ${s.recentFindings}`);
      console.log(`  Unresolved: ${s.unresolvedFindings}`);
      if (s.unresolvedFindings > 0) {
        console.log(chalk.cyan('\n  Recent findings:'));
        const findings = getFindings({ resolved: false, limit: 5 });
        for (const f of findings) {
          const sevFn = f.severity === 'error' ? chalk.red : f.severity === 'warning' ? chalk.yellow : chalk.gray;
          console.log(`    ${sevFn(f.severity.toUpperCase())} [${f.job_name}] ${f.message}`);
        }
      }
      console.log();
    });

  // Skills management (canvas skills list|install|enable|disable)
  const skillsCmd = program.command('skills').description('Manage AI skills');

  skillsCmd
    .command('list')
    .description('List installed skills')
    .action(async () => {
      const { getSkillRegistry } = await import('./skills/skill-registry.js');
      const registry = getSkillRegistry();
      const skills = registry.list();
      if (skills.length === 0) {
        console.log('No skills installed');
        return;
      }
      for (const s of skills) {
        const status = s.enabled ? chalk.green('[on]') : chalk.gray('[off]');
        console.log(`  ${status} ${s.name} — ${s.description}`);
      }
    });

  skillsCmd
    .command('install <path>')
    .description('Install a skill from a file')
    .action(async (filePath: string) => {
      const { getSkillRegistry } = await import('./skills/skill-registry.js');
      const manifest = getSkillRegistry().install(filePath);
      console.log(`Installed skill: ${manifest.name}`);
    });

  skillsCmd
    .command('enable <name>')
    .description('Enable a skill')
    .action(async (name: string) => {
      const { getSkillRegistry } = await import('./skills/skill-registry.js');
      getSkillRegistry().enable(name);
      console.log(`Enabled: ${name}`);
    });

  skillsCmd
    .command('disable <name>')
    .description('Disable a skill')
    .action(async (name: string) => {
      const { getSkillRegistry } = await import('./skills/skill-registry.js');
      getSkillRegistry().disable(name);
      console.log(`Disabled: ${name}`);
    });

  // Audit log (canvas audit show)
  program
    .command('audit')
    .description('Show audit log')
    .option('-n, --limit <n>', 'Number of entries', '20')
    .option('--since <date>', 'Show entries since date')
    .option('--type <type>', 'Filter by event type')
    .action(async (opts: { limit: string; since?: string; type?: string }) => {
      const { getAuditLogger } = await import('./enterprise/audit-logger.js');
      const logger = getAuditLogger();
      const entries = logger.query({
        limit: parseInt(opts.limit, 10),
        since: opts.since,
        eventType: opts.type,
      });
      if (entries.length === 0) {
        console.log('No audit entries found');
        return;
      }
      for (const e of entries) {
        console.log(`  [${e.timestamp}] ${e.event_type} ${e.action} → ${e.result || 'ok'}`);
      }
    });

  // Shell completion (canvas completion bash|zsh|fish)
  program
    .command('completion')
    .description('Generate shell completion script')
    .argument('<shell>', 'Shell type: bash, zsh, fish')
    .action(async (shell: string) => {
      const { getCompletionScript } = await import('./cli/tab-completion.js');
      console.log(getCompletionScript(shell as 'bash' | 'zsh' | 'fish'));
    });

  // Watch mode (canvas watch)
  program
    .command('watch')
    .description('Watch files for AI comments (// AI! and // AI?)')
    .option('--root <dir>', 'Root directory to watch', process.cwd())
    .action(async (opts: { root: string }) => {
      const { WatchMode } = await import('./modes/watch-mode.js');
      const watcher = new WatchMode({ root: opts.root });
      watcher.on('trigger', (trigger) => {
        console.log(`  [${trigger.type}] ${trigger.filePath}:${trigger.line} — ${trigger.comment}`);
      });
      console.log(`Watching for AI comments in ${opts.root}...`);
      console.log('Press Ctrl+C to stop.\n');
      await watcher.start();
    });

  // PR linking (canvas pr link <number>)
  const prCmd = program.command('pr').description('GitHub PR operations');
  prCmd
    .command('link <number>')
    .description('Link current session to a PR')
    .action(async (number: string) => {
      const { linkSessionToPR } = await import('./git/pr-linker.js');
      const sessionId = process.env.CANVAS_SESSION_ID || `session-${Date.now()}`;
      const ok = await linkSessionToPR(parseInt(number, 10), sessionId);
      if (ok) console.log(`Linked session to PR #${number}`);
      else console.error('Failed to link session to PR');
    });

  // Model leaderboard (canvas leaderboard)
  program
    .command('leaderboard')
    .description('Show model benchmark leaderboard')
    .option('--sort <by>', 'Sort by: swe-bench, humaneval, price, speed', 'swe-bench')
    .option('--provider <name>', 'Filter by provider name')
    .option('--limit <n>', 'Show top N models', parseInt)
    .action(async (opts: { sort?: string; provider?: string; limit?: number }) => {
      const { formatLeaderboard } = await import('./commands/model-leaderboard.js');
      console.log(formatLeaderboard({
        sortBy: opts.sort as 'swe-bench' | 'humaneval' | 'price' | 'speed',
        provider: opts.provider,
        limit: opts.limit,
      }));
    });

  // A/B Testing (canvas ab create|run|status|list|winner|compare|delete|export)
  const abCmd = program.command('ab').description('A/B testing for models and prompts');

  abCmd
    .command('create')
    .description('Create a new A/B test')
    .requiredOption('--name <name>', 'Test name')
    .requiredOption('--type <type>', 'Test type: model, prompt, or combined')
    .requiredOption('--variants <json>', 'Variants as JSON array')
    .option('--split <split>', 'Traffic split (comma-separated)')
    .option('--metrics <metrics>', 'Eval metrics', 'quality,speed,cost')
    .action(async (opts: any) => {
      const { getABTestEngine } = await import('./ab/ab-testing.js');
      const engine = getABTestEngine();
      const variants = JSON.parse(opts.variants);
      const trafficSplit = opts.split ? opts.split.split(',').map(Number) : undefined;
      const metrics = opts.metrics.split(',');
      const test = engine.createTest({ name: opts.name, type: opts.type, variants, trafficSplit, evalCriteria: { autoScore: true, userRating: false, metrics } });
      console.log(chalk.green(`A/B test created: ${test.id}`));
      console.log(`  Name: ${test.name} | Type: ${test.type} | Variants: ${test.variants.map((v: any) => v.name).join(' vs ')}`);
    });

  abCmd
    .command('run <test-id>')
    .description('Run prompt(s) through all variants')
    .option('--prompt <text>', 'Single prompt')
    .option('--prompts <file>', 'File with one prompt per line')
    .action(async (testId: string, opts: any) => {
      const { getABTestEngine } = await import('./ab/ab-testing.js');
      const engine = getABTestEngine();
      const prompts: string[] = [];
      if (opts.prompt) prompts.push(opts.prompt);
      else if (opts.prompts) {
        const fsMod = await import('fs');
        prompts.push(...fsMod.readFileSync(opts.prompts, 'utf-8').split('\n').filter(Boolean));
      } else { console.error('Provide --prompt or --prompts'); return; }
      for (const p of prompts) {
        console.log(chalk.gray(`Prompt: ${p.slice(0, 80)}...`));
        const results = await engine.runSingle(testId, p);
        for (const r of results) {
          console.log(`  ${r.variantName.padEnd(20)} score: ${r.score.toFixed(1).padStart(5)}  latency: ${r.latencyMs}ms  cost: $${r.costUsd.toFixed(4)}`);
        }
      }
    });

  abCmd.command('status <test-id>').description('Show test statistics').action(async (testId: string) => {
    const { getABTestEngine } = await import('./ab/ab-testing.js');
    const engine = getABTestEngine();
    const test = engine.getTest(testId);
    if (!test) { console.error('Test not found'); return; }
    const stats = engine.getStats(testId);
    console.log(chalk.bold(`\n${test.name} [${test.status}]`));
    for (const s of stats) console.log(`  ${s.variantName.padEnd(20)} runs:${s.runs} score:${s.avgScore.toFixed(1)} latency:${s.avgLatencyMs.toFixed(0)}ms cost:$${s.avgCostUsd.toFixed(4)} win:${(s.winRate*100).toFixed(0)}%`);
  });

  abCmd.command('list').description('List all A/B tests').action(async () => {
    const { getABTestEngine } = await import('./ab/ab-testing.js');
    const tests = getABTestEngine().listTests();
    if (!tests.length) { console.log('No A/B tests.'); return; }
    for (const t of tests) console.log(`  ${t.id.padEnd(14)} [${t.status}] ${t.name} — ${t.variants.map((v: any) => v.name).join(' vs ')}`);
  });

  abCmd.command('winner <test-id>').description('Declare winner').action(async (testId: string) => {
    const { getABTestEngine } = await import('./ab/ab-testing.js');
    const winner = getABTestEngine().declareWinner(testId);
    if (winner) console.log(chalk.green(`Winner: ${winner.variantName} (score: ${winner.avgScore.toFixed(1)}, confidence: ${(winner.confidence*100).toFixed(0)}%)`));
    else console.error('No results to determine winner');
  });

  abCmd.command('compare <test-id>').description('Side-by-side comparison').action(async (testId: string) => {
    const { getABTestEngine } = await import('./ab/ab-testing.js');
    const comp = getABTestEngine().getLastComparison(testId);
    for (const c of comp) {
      console.log(chalk.cyan.bold(`\n── ${c.variantName} (score: ${c.score.toFixed(1)}) ──`));
      console.log(c.response.slice(0, 500));
    }
  });

  abCmd.command('delete <test-id>').description('Delete test').action(async (testId: string) => {
    const { getABTestEngine } = await import('./ab/ab-testing.js');
    getABTestEngine().deleteTest(testId);
    console.log(chalk.green(`Deleted test "${testId}"`));
  });

  abCmd.command('export <test-id>').description('Export results as JSON').option('-o, --output <file>', 'Output file').action(async (testId: string, opts: any) => {
    const { getABTestEngine } = await import('./ab/ab-testing.js');
    const data = getABTestEngine().exportResults(testId);
    if (!data) { console.error('Test not found'); return; }
    const json = JSON.stringify(data, null, 2);
    if (opts.output) { const fsMod = await import('fs'); fsMod.writeFileSync(opts.output, json); console.log(`Exported to ${opts.output}`); }
    else console.log(json);
  });
}

function registerFeatureCommands(program: Command, featureManager: FeatureManager | null): void {
  if (!featureManager) return;

  program
    .command('palette')
    .description('Open smart command palette (Ctrl+P)')
    .action(async () => {
      const palette = CanvasFeatures.getProductivity().commandPalette;
      await palette.open();
    });

  program
    .command('notebook')
    .description('Manage interactive notebooks')
    .argument('[action]', 'Action: create, open, list, execute')
    .argument('[name]', 'Notebook name')
    .action(async (action?: string, name?: string) => {
      const notebooks = CanvasFeatures.getProductivity().notebooks;
      if (action === 'create' && name) {
        const nb = notebooks.createNotebook(name);
        console.log(uiTheme.dim(`Created notebook: ${nb.name}`));
      } else if (action === 'list') {
        const list = notebooks.listNotebooks();
        list.forEach((nb: { name: string; modified: Date | string }) => console.log(`- ${nb.name} (${nb.modified})`));
      } else {
        console.log('Usage: canvas notebook <create|open|list|execute> [name]');
      }
    });

  program
    .command('share')
    .description('Start live session sharing')
    .option('-n, --name <name>', 'Session name', 'Canvas Session')
    .action(async (options: { name: string }) => {
      const sharing = CanvasFeatures.getCollaboration().sessionSharing;
      const session = await sharing.startSharing(options.name);
      console.log(uiTheme.info(`Session ID: ${session.id}`));
    });

  program
    .command('voice')
    .description('Control voice commands')
    .argument('[action]', 'Action: start, stop, train')
    .action(async (action?: string) => {
      const voice = CanvasFeatures.getInterfaces().voiceCommand;
      if (action === 'start') await voice.startListening();
      else if (action === 'stop') await voice.stopListening();
      else console.log('Usage: canvas voice <start|stop|train>');
    });

  program
    .command('monitor')
    .description('Open performance monitoring dashboard')
    .action(async () => {
      const monitor = CanvasFeatures.getSecurity().performanceMonitor;
      await monitor.start();
      console.log(uiTheme.success('Performance monitoring started'));
    });

  program
    .command('incident')
    .description('Manage incident response mode')
    .argument('[action]', 'Action: activate, deactivate, status')
    .action(async (action?: string) => {
      const incident = CanvasFeatures.getSecurity().incidentResponse;
      if (action === 'activate') incident.activate();
      else if (action === 'deactivate') incident.deactivate();
      else if (action === 'status') console.log(uiTheme.info('Incident response mode status checked'));
      else console.log('Usage: canvas incident <activate|deactivate|status>');
    });

  program
    .command('workspace')
    .description('Manage persistent workspace state')
    .argument('[action]', 'Action: save, restore, list')
    .action(async (action?: string) => {
      const workspace = CanvasFeatures.getProductivity().workspaceState;
      if (action === 'save') {
        const ws = await workspace.createWorkspace('current');
        console.log(uiTheme.success(`Workspace saved: ${ws.id}`));
      } else if (action === 'restore') {
        const list = await workspace.listWorkspaces();
        if (list.length > 0) {
          await workspace.loadWorkspace(list[0].id);
          console.log(uiTheme.success('Workspace restored'));
        }
      } else if (action === 'list') {
        const list = await workspace.listWorkspaces();
        list.forEach((ws: { name: string }) => console.log(`- ${ws.name}`));
      } else {
        console.log('Usage: canvas workspace <save|restore|list>');
      }
    });

  program
    .command('knowledge')
    .description('Access team knowledge base')
    .argument('[action]', 'Action: search, add, list')
    .argument('[query]', 'Search query or content')
    .action(async (action?: string, query?: string) => {
      const kb = CanvasFeatures.getCollaboration().knowledgeBase;
      if (action === 'search' && query) {
        const results = await kb.search({ text: query, limit: 10 });
        results.forEach((r: { item?: { title?: string } }) => console.log(`- ${r.item?.title || 'Result'}`));
      } else if (action === 'list') {
        console.log('Knowledge base collections listed');
      } else {
        console.log('Usage: canvas knowledge <search|add|list> [query]');
      }
    });
}

async function main(): Promise<void> {
  // Setup initial config if needed
  await setupInitialConfig();

  // Load config and initialize systems
  const config = loadConfig();
  const featureManager = await initializeSystems();

  // Create program
  const program = new Command();

  program
    .name('canvas')
    .description('Canvas CLI - Production-ready AI assistant with advanced tools (defaults to chat mode)')
    .version(VERSION)
    .option('--sandbox <type>', 'Enable sandboxing (docker, podman, none)', 'none')
    .option('--no-tools', 'Disable all tools')
    .option('--checkpointing', 'Enable automatic checkpointing')
    .option('--web [port]', 'Start web UI server (default port: 3000)')
    .option('--plugins', 'Load plugins on startup')
    .option('--local-only', 'Use only local models, never call external APIs');

  // Register all commands
  registerCoreCommands(program, config);
  registerFeatureCommands(program, featureManager);
  registerBuiltinCommands(program);

  // Headless mode flags (-p, --headless, --auto-approve, --output-format, etc.)
  registerHeadlessCommands(program);

  // Load and register plugins from ~/.canvas/plugins/
  await loadPlugins();
  registerPluginCommands(program);

  // Priority 3: Load session memory context at startup (non-blocking)
  import('./memory/session-bridge.js').then(({ SessionBridge }) => {
    const bridge = new SessionBridge('canvas-main', process.cwd());
    bridge.loadContext().then((ctx) => {
      if (ctx.systemPromptAddition) {
        // Context is available for agents to use via SessionBridge
        process.env.CANVAS_SESSION_CONTEXT = ctx.systemPromptAddition.slice(0, 2000);
      }
    }).catch(() => { /* Non-critical */ });
  }).catch(() => { /* Non-critical */ });

  // Handle -p/--prompt flag for headless execution
  const promptIdx = process.argv.indexOf('-p');
  const promptLongIdx = process.argv.indexOf('--prompt');
  const headlessPromptIdx = promptIdx !== -1 ? promptIdx : promptLongIdx;

  if (headlessPromptIdx !== -1 && process.argv[headlessPromptIdx + 1]) {
    const prompt = process.argv[headlessPromptIdx + 1];
    const outputFormat = (process.argv.includes('--output-format')
      ? process.argv[process.argv.indexOf('--output-format') + 1]
      : 'text') as 'json' | 'text' | 'markdown';
    const autoApprove = process.argv.includes('--auto-approve');
    const verbose = process.argv.includes('--verbose');
    const result = await executeHeadless({ prompt, outputFormat, autoApprove, verbose });
    if (result.success && outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.success ? 0 : 1);
  }

  // Default to chat command when no command provided
  if (process.argv.length === 2) {
    process.argv.push('chat');
  }

  await program.parseAsync();
}

main().catch(console.error);