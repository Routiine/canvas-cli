/**
 * Context command - Manage conversation context and memory
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import { CommandHandler } from '../commands.js';
import { ContextLoader } from '../tools/memory.js';

export function createContextCommand(): Command {
  const contextCommand = new Command('context')
    .description('Manage conversation context and memory')
    .argument('[action]', 'Action to perform (show, clear, save, load)')
    .option('-f, --file <file>', 'File for save/load operations')
    .action(async (action: string = 'show', options: { file?: string }) => {
      const commandHandler = new CommandHandler();
      const contextLoader = new ContextLoader();
      const theme = commandHandler.getThemeManager();

      switch (action) {
        case 'show':
          const context = await contextLoader.loadContext();
          console.log(theme.primary('📚 Current Context:'));
          console.log(JSON.stringify(context, null, 2));
          break;

        case 'clear':
          const emptyContext = { files: [], memory: [] };
          await fs.writeFile('.canvas-context.json', JSON.stringify(emptyContext, null, 2));
          console.log(theme.success('✨ Context cleared'));
          break;

        case 'save':
          if (options.file) {
            const ctx = await contextLoader.loadContext();
            await fs.writeFile(options.file, JSON.stringify(ctx, null, 2));
            console.log(theme.success(`💾 Context saved to ${options.file}`));
          } else {
            console.log(theme.warning('Please specify a file with -f option'));
          }
          break;

        case 'load':
          if (options.file) {
            const data = await fs.readFile(options.file, 'utf-8');
            await fs.writeFile('.canvas-context.json', data);
            console.log(theme.success(`📥 Context loaded from ${options.file}`));
          } else {
            console.log(theme.warning('Please specify a file with -f option'));
          }
          break;

        default:
          console.log(theme.warning('Usage: canvas context [show|clear|save|load]'));
      }
    });

  return contextCommand;
}