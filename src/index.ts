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
import { getModelManager } from './models/model-manager.js';
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
import { createShellCommand } from './commands/shell-command.js';

// Import feature commands
import { createFeatureCommands } from './commands/feature-commands.js';

// Strategic system commands (Priorities 1-5)
import { registerMemoryCommands } from './memory/memory-commands.js';
import { registerFinetuneCommands } from './finetune/finetune-commands.js';

// MCP server management
import { createMCPCommand } from './mcp/mcp-manager.js';

// Headless mode
import { registerHeadlessCommands, executeHeadless } from './modes/headless.js';

// Athena AI
import { registerAthenaCommands } from './athena/commands/athena-command.js';

// Plugin system
import { loadPlugins, registerPluginCommands, listPlugins } from './plugins/plugin-loader.js';

import { createRequire } from 'module';
const _require = createRequire(import.meta.url);
const pkg = _require('../package.json');
const VERSION: string = pkg.version;

// Recommended Ollama models for agentic work — shown during setup
const RECOMMENDED_OLLAMA_MODELS = [
  { name: 'qwen2.5:14b        ★ Best for agents  — tool calling, planning, code (14B)', value: 'qwen2.5:14b' },
  { name: 'mistral-nemo:12b   ★ Recommended      — fast, strong reasoning (12B)',       value: 'mistral-nemo:12b' },
  { name: 'llama3.1:8b        ★ Recommended      — reliable tool-use, low RAM (8B)',    value: 'llama3.1:8b' },
  { name: 'qwen2.5:7b            Lightweight      — good quality, minimal resources (7B)', value: 'qwen2.5:7b' },
  { name: 'llama3.2:3b            Smallest       — fastest, basic tasks only (3B)',       value: 'llama3.2:3b' },
  { name: '[ Enter model name manually ]', value: '__manual__' },
];

async function fetchLocalOllamaModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json() as { models?: { name: string }[] };
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

async function setupInitialConfig(): Promise<boolean> {
  const config = loadConfig();

  // Only skip if already configured AND not a first-run scenario
  const hasAnyProvider = !!(
    config.ollamaUrl || config.ollama?.baseUrl ||
    process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY || config.groqApiKey
  );
  const isFirstRun = !config.setupComplete;

  if (hasAnyProvider && !isFirstRun) {
    return false;
  }

  welcome.standard(VERSION);

  if (hasAnyProvider) {
    console.log(fmt.info('Canvas CLI is configured. You can update providers below.'));
  } else {
    console.log(fmt.info('No configuration found. Let\'s set up Canvas CLI.'));
  }
  console.log(uiTheme.dim('Canvas works with Ollama (local), Groq (fast cloud), Claude, or OpenAI.\n'));

  const inquirer = await import('inquirer');
  const { setupNow } = await inquirer.default.prompt([{
    type: 'confirm', name: 'setupNow',
    message: 'Would you like to configure Canvas CLI now?', default: true
  }]);

  if (!setupNow) {
    console.log(uiTheme.dim('Skipped. Run "canvas config" to configure at any time.\n'));
    saveConfig({ ...config, setupComplete: true });
    return false;
  }

  const { provider } = await inquirer.default.prompt([{
    type: 'list', name: 'provider',
    message: 'Choose your primary AI provider:',
    choices: [
      { name: 'Ollama (local, free, private)                  — best for agents', value: 'ollama' },
      { name: 'Groq  (cloud, fast inference, free tier)       — great for testing', value: 'groq' },
      { name: 'Claude by Anthropic (claude-sonnet-4-6)        — top quality', value: 'anthropic' },
      { name: 'OpenAI (GPT-4o)                                — widely supported', value: 'openai' },
      { name: 'Skip for now', value: 'skip' },
    ]
  }]);

  if (provider === 'skip') {
    console.log(uiTheme.dim('Skipped. Run "canvas config" to configure at any time.\n'));
    saveConfig({ ...config, setupComplete: true });
    return false;
  }

  let newConfig = { ...config };

  if (provider === 'ollama') {
    const { ollamaUrl } = await inquirer.default.prompt([{
      type: 'input', name: 'ollamaUrl', message: 'Ollama URL:',
      default: config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434',
      validate: (input: string) => {
        try { new URL(input); return true; } catch { return 'Please enter a valid URL'; }
      }
    }]);

    // Fetch locally installed models to mark which are already pulled
    console.log(uiTheme.dim('  Checking locally available models...'));
    const localModels = await fetchLocalOllamaModels(ollamaUrl);
    const modelChoices = RECOMMENDED_OLLAMA_MODELS.map(m => {
      if (m.value === '__manual__') return m;
      const installed = localModels.includes(m.value) ? ' [installed]' : '';
      return { ...m, name: m.name + installed };
    });

    const { selectedModel } = await inquirer.default.prompt([{
      type: 'list', name: 'selectedModel',
      message: 'Choose your default model (★ = recommended for agentic tasks):',
      choices: modelChoices,
      default: localModels.includes('qwen2.5:14b') ? 'qwen2.5:14b'
        : localModels.includes('mistral-nemo:12b') ? 'mistral-nemo:12b'
        : localModels.includes('llama3.1:8b') ? 'llama3.1:8b'
        : modelChoices[0].value,
    }]);

    let defaultModel = selectedModel;
    if (selectedModel === '__manual__') {
      const { manualModel } = await inquirer.default.prompt([{
        type: 'input', name: 'manualModel', message: 'Enter model name (e.g. llama3.2:latest):',
        validate: (v: string) => v.trim().length > 0 ? true : 'Model name required'
      }]);
      defaultModel = manualModel.trim();
    }

    if (!localModels.includes(defaultModel) && defaultModel !== '__manual__') {
      console.log(uiTheme.dim(`  Model "${defaultModel}" not found locally. Pull it with: ollama pull ${defaultModel}`));
    }

    newConfig = { ...newConfig, ollamaUrl, defaultModel, ollama: { baseUrl: ollamaUrl, defaultModel, timeout: 120000, maxRetries: 3 } };

  } else if (provider === 'groq') {
    // Only use an existing key as the default if it actually looks like a Groq key.
    // Guards against PATH or other env vars accidentally being used as the default.
    const envKey    = process.env.GROQ_API_KEY ?? '';
    const savedKey  = config.groqApiKey ?? '';
    const validKey  = (k: string) => k.startsWith('gsk_') && k.length > 20;
    const existingKey = validKey(envKey) ? envKey : validKey(savedKey) ? savedKey : '';
    const { apiKey } = await inquirer.default.prompt([{
      type: 'password', name: 'apiKey',
      message: 'Groq API key (gsk_...):',
      default: existingKey,
      validate: (input: string) => input.trim().startsWith('gsk_') ? true : 'Key should start with gsk_'
    }]);
    const key = apiKey.trim();
    newConfig = { ...newConfig, groqApiKey: key };
    process.env.GROQ_API_KEY = key;
    console.log(uiTheme.dim('  Default model: llama-3.3-70b-versatile (best for agentic tasks on Groq)'));

  } else if (provider === 'anthropic') {
    const { apiKey } = await inquirer.default.prompt([{
      type: 'password', name: 'apiKey', message: 'Anthropic API key (sk-ant-...):',
      validate: (input: string) => input.startsWith('sk-') ? true : 'Key should start with sk-'
    }]);
    newConfig = { ...newConfig, anthropicApiKey: apiKey };
    process.env.ANTHROPIC_API_KEY = apiKey;

  } else if (provider === 'openai') {
    const { apiKey } = await inquirer.default.prompt([{
      type: 'password', name: 'apiKey', message: 'OpenAI API key (sk-...):',
      validate: (input: string) => input.startsWith('sk-') ? true : 'Key should start with sk-'
    }]);
    newConfig = { ...newConfig, openaiApiKey: apiKey };
    process.env.OPENAI_API_KEY = apiKey;
  }

  saveConfig({ ...newConfig, setupComplete: true });
  console.log(fmt.success('Configuration saved.'));
  console.log(uiTheme.dim('Run "canvas config" anytime to add more providers or change settings.\n'));
  return true;
}

async function initializeSystems(): Promise<void> {
  const config = loadConfig();

  // Register default model alias
  const defaultModel = config.defaultModel || config.ollama?.defaultModel;
  if (defaultModel) {
    getModelManager().registerDefaultAliasFromConfig(defaultModel);
  }

  // Initialize skills (optional — non-fatal)
  try {
    await initializeSkillSystem();
  } catch {
    // Skills are optional
  }
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
      const { getConfigCommand } = await import('./commands/config-command.js');
      let args = '';
      if (action) {
        args = action;
        if (key) args += ` ${key}`;
        if (value) args += ` ${value}`;
      }
      const result = await getConfigCommand().execute(args);
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
      const { getRecipeCommand } = await import('./commands/recipe-command.js');
      let args = '';
      if (options?.list) args = 'list';
      else if (name) args = `run ${name} ${options?.variables || ''}`;
      const result = await getRecipeCommand().execute(args.trim());
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

  // canvas shell "describe it" — natural language to shell command
  program.addCommand(createShellCommand());

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

  skillsCmd
    .command('export')
    .description('Export skills to another tool format')
    .option('-f, --format <format>', 'Target format: claude-code, opencode, gemini-cli', 'claude-code')
    .option('-o, --out <dir>', 'Output directory', './skills-export')
    .action(async (opts: { format: string; out: string }) => {
      const { getSkillRegistry } = await import('./skills/skill-registry.js');
      const fs = await import('fs-extra');
      const path = await import('path');
      const registry = getSkillRegistry();
      const skills = registry.getEnabled();
      if (skills.length === 0) { console.log('No enabled skills to export.'); return; }
      await fs.default.ensureDir(opts.out);
      for (const skill of skills) {
        const content = await fs.default.readFile(skill.filePath, 'utf8').catch(() => null);
        if (!content) continue;
        const fname = opts.format === 'opencode'
          ? `${skill.name}.skill.md`
          : `${skill.name}.md`;
        await fs.default.writeFile(path.default.join(opts.out, fname), content);
        console.log(`  exported: ${skill.name}`);
      }
      console.log(chalk.green(`\nExported ${skills.length} skill(s) to ${opts.out}/`));
      if (opts.format === 'claude-code') {
        console.log(chalk.dim('  Copy to ~/.claude/commands/ to use in Claude Code'));
      }
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
      const { generateChatResponseWithHistory } = await import('./ollama/response-generator.js');
      const fsExtra = await import('fs-extra');

      const watcher = new WatchMode({ root: opts.root });
      const config = loadConfig();
      const model = config.defaultModel || config.model || 'llama3.2:1b';

      watcher.on('trigger', async (trigger: { type: string; filePath: string; line: number; comment: string }) => {
        try {
          const content = await fsExtra.default.readFile(trigger.filePath, 'utf8');
          const lines = content.split('\n');

          // Build a context window of ~30 lines around the trigger
          const ctxStart = Math.max(0, trigger.line - 15);
          const ctxEnd = Math.min(lines.length, trigger.line + 15);
          const context = lines.slice(ctxStart, ctxEnd).join('\n');

          if (trigger.type === 'question') {
            console.log(chalk.yellow(`\n  ? ${trigger.filePath}:${trigger.line} — ${trigger.comment}`));
            const answer = await generateChatResponseWithHistory(
              `In this code:\n\`\`\`\n${context}\n\`\`\`\n\nAnswer this question: ${trigger.comment}`,
              model,
              []
            );
            console.log(chalk.cyan(answer));
          } else {
            // edit — ask the AI to implement the instruction and rewrite the section
            console.log(chalk.yellow(`\n  ✎ ${trigger.filePath}:${trigger.line} — ${trigger.comment}`));
            const editPrompt =
              `You are editing source code. The following is the relevant code section (lines ${ctxStart + 1}–${ctxEnd}):\n\n` +
              `\`\`\`\n${context}\n\`\`\`\n\n` +
              `Instruction on line ${trigger.line}: ${trigger.comment || '(no comment — infer from context)'}\n\n` +
              `Respond with ONLY the corrected code for this section. Remove the "// AI!" comment. No explanations.`;

            const aiResponse = await generateChatResponseWithHistory(editPrompt, model, []);

            // Strip markdown fences if the model wrapped the output
            const edited = aiResponse
              .replace(/^```[\w]*\n/, '')
              .replace(/\n```$/, '')
              .trimEnd();

            // Splice the edited section back into the file
            const newContent = [
              lines.slice(0, ctxStart).join('\n'),
              edited,
              lines.slice(ctxEnd).join('\n'),
            ].filter((s) => s.length > 0).join('\n');

            await fsExtra.default.writeFile(trigger.filePath, newContent, 'utf8');
            console.log(chalk.green(`  ✓ Applied AI edit to ${trigger.filePath}:${trigger.line}`));
          }
        } catch (err: unknown) {
          console.error(chalk.red(`  ✗ watch action failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      });

      console.log(`Watching for AI comments in ${opts.root}...`);
      console.log('  // AI! <instruction>  — apply edit in-place');
      console.log('  // AI? <question>     — print AI answer\n');
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

// registerFeatureCommands removed: palette, notebook, share, voice, monitor, incident,
// workspace, and knowledge commands were stubs that required featureManager which is
// null on fresh install and provided no real functionality.

async function main(): Promise<void> {
  // Fast path: skip heavy initialization for --help and --version
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args.includes('--version') || args.includes('-V')) {
    const program = new Command();
    program
      .name('canvas')
      .description('Canvas CLI - Production-ready AI assistant with advanced tools (defaults to chat mode)')
      .version(VERSION);
    // Register all command stubs for help output
    program.command('chat').description('Start interactive AI chat (default)');
    program.command('shell').description('Natural language to shell command');
    program.command('ask').description('Semantic codebase search');
    program.command('edit').description('AI-powered file editing with diff review');
    program.command('undo').description('Restore file from pre-edit snapshot');
    program.command('test').description('Generate and run tests for a file');
    program.command('review-pr').description('AI code review for pull requests');
    program.command('models').description('List and manage AI models');
    program.command('config').description('Configure Canvas CLI settings interactively');
    program.command('init').description('Initialize Canvas CLI in current project');
    program.command('agent').description('Run autonomous AI agents');
    program.command('tools').description('List and manage available tools');
    program.command('memory').description('Manage persistent memory');
    program.command('index').description('Build and query codebase index');
    program.command('daemon').description('Background analysis daemon (commit-watcher, perf monitor)');
    program.command('mcp').description('MCP server management');
    program.command('skills').description('Skill system management (list, install, enable, disable)');
    program.command('watch').description('Watch files for AI comment triggers (// AI!)');
    program.command('audit').description('Show audit log of all canvas operations');
    program.command('plugins').description('List installed plugins');
    program.command('recipe').description('Recipe marketplace (browse, install, run)');
    program.command('finetune').description('Fine-tuning data pipeline');
    program.command('leaderboard').description('Model performance leaderboard');
    program.command('ab').description('A/B testing framework for models and prompts');
    program.command('pr').description('Link and manage pull requests');
    program.command('completion').description('Generate shell completion scripts (bash, zsh, fish)');
    await program.parseAsync();
    return;
  }

  // Setup initial config if needed
  await setupInitialConfig();

  // Load config and initialize systems
  const config = loadConfig();
  await initializeSystems();

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
  registerBuiltinCommands(program);

  // Headless mode flags (-p, --headless, --auto-approve, --output-format, etc.)
  registerHeadlessCommands(program);

  // Load and register plugins from ~/.canvas/plugins/
  await loadPlugins();
  registerPluginCommands(program);

  // Athena AI commands
  registerAthenaCommands(program);

  // Priority 3: Load session memory context at startup (non-blocking)
  import('./memory/session-bridge.js').then(({ SessionBridge }) => {
    const bridge = new SessionBridge('canvas-main', process.cwd());
    bridge.loadContext().then((ctx) => {
      if (ctx.systemPromptAddition) {
        process.env.CANVAS_SESSION_CONTEXT = ctx.systemPromptAddition.slice(0, 2000);
      }
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.debug(`[session-bridge] context load failed: ${msg}`);
    });
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.debug(`[session-bridge] module load failed: ${msg}`);
  });

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