/**
 * Plugin system for Canvas CLI.
 *
 * Users drop JS or compiled JS files into ~/.canvas/plugins/.
 * Each plugin exports:
 *   { name, description, execute(args: string): Promise<string> | string }
 *
 * Plugins register as top-level `canvas <name>` commands automatically.
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const PLUGIN_DIR = path.join(os.homedir(), '.canvas', 'plugins');
const _require = createRequire(import.meta.url);

// ─── Plugin interface ─────────────────────────────────────────────────────────

export interface CanvasPlugin {
  name: string;
  description: string;
  version?: string;
  author?: string;
  /** Called when user runs `canvas <name> [args...]` */
  execute(args: string): Promise<string | void> | string | void;
  /** Optional: called once when the plugin is first loaded */
  onLoad?(): Promise<void> | void;
}

function isPlugin(obj: unknown): obj is CanvasPlugin {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    typeof (obj as Record<string, unknown>).description === 'string' &&
    typeof (obj as Record<string, unknown>).execute === 'function'
  );
}

// ─── Loader ───────────────────────────────────────────────────────────────────

interface LoadedPlugin {
  plugin: CanvasPlugin;
  filePath: string;
}

let _plugins: LoadedPlugin[] = [];

export async function loadPlugins(verbose = false): Promise<LoadedPlugin[]> {
  _plugins = [];
  await fs.ensureDir(PLUGIN_DIR);

  const entries = await fs.readdir(PLUGIN_DIR);
  const pluginFiles = entries.filter(e => e.endsWith('.js') && !e.startsWith('_'));

  for (const file of pluginFiles) {
    const filePath = path.join(PLUGIN_DIR, file);
    try {
      // Dynamic require (CJS plugins) — ESM plugins would need import()
      const mod = _require(filePath) as unknown;
      const raw = mod && typeof mod === 'object' && 'default' in mod
        ? (mod as { default: unknown }).default
        : mod;

      if (!isPlugin(raw)) {
        if (verbose) {
          console.log(chalk.yellow(`Plugin ${file} skipped — missing required fields (name, description, execute)`));
        }
        continue;
      }

      if (raw.onLoad) {
        await raw.onLoad();
      }

      _plugins.push({ plugin: raw, filePath });
      if (verbose) {
        console.log(chalk.dim(`  Loaded plugin: ${raw.name} (${file})`));
      }
    } catch (err: unknown) {
      if (verbose) {
        console.log(chalk.yellow(`Plugin ${file} failed to load: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  }

  return _plugins;
}

export function getLoadedPlugins(): LoadedPlugin[] {
  return _plugins;
}

/**
 * Register all loaded plugins as Commander subcommands.
 * Call this after loadPlugins().
 */
export function registerPluginCommands(program: Command): void {
  for (const { plugin, filePath } of _plugins) {
    // Skip if a command with this name already exists
    if (program.commands.some(cmd => cmd.name() === plugin.name)) {
      console.log(chalk.yellow(`Plugin '${plugin.name}' skipped — command name conflicts with a built-in.`));
      continue;
    }

    const cmd = program
      .command(plugin.name)
      .description(`[plugin] ${plugin.description}`)
      .allowUnknownOption()
      .argument('[args...]', 'Arguments passed to the plugin')
      .action(async (...commandArgs: unknown[]) => {
        // Commander passes (arg1, arg2, ..., options, command) — collect args
        const rawArgs = commandArgs.slice(0, -2) as string[][];
        const argString = rawArgs.flat().join(' ');

        try {
          const result = await plugin.execute(argString);
          if (result) console.log(result);
        } catch (err: unknown) {
          console.error(chalk.red(`Plugin '${plugin.name}' error: ${err instanceof Error ? err.message : String(err)}`));
          if (err instanceof Error && err.stack) {
            console.error(chalk.dim(err.stack.split('\n').slice(1, 4).join('\n')));
          }
        }
      });

    if (plugin.version) {
      cmd.version(plugin.version);
    }

    void filePath; // tracked for debugging
  }
}

/**
 * Show installed plugins.
 */
export function listPlugins(): void {
  if (_plugins.length === 0) {
    console.log(chalk.dim(`No plugins installed. Add .js files to ${PLUGIN_DIR}`));
    console.log(chalk.dim('\nPlugin template:'));
    console.log(chalk.gray(`
// ~/.canvas/plugins/hello.js
module.exports = {
  name: 'hello',
  description: 'Say hello',
  execute(args) {
    return \`Hello, \${args || 'world'}!\`;
  }
};`));
    return;
  }

  console.log(chalk.cyan.bold(`\n  Installed Plugins (${_plugins.length})\n`));
  for (const { plugin, filePath } of _plugins) {
    console.log(`  ${chalk.bold(plugin.name)}${plugin.version ? chalk.dim(` v${plugin.version}`) : ''}`);
    console.log(`    ${plugin.description}`);
    if (plugin.author) console.log(chalk.dim(`    by ${plugin.author}`));
    console.log(chalk.dim(`    ${filePath}`));
    console.log();
  }
}
