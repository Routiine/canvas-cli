/**
 * Search command - Search through crawled knowledge base
 */

import { Command } from 'commander';
import { CommandHandler } from '../commands.js';

export function createSearchCommand(): Command {
  const searchCommand = new Command('search')
    .description('Search through crawled knowledge base')
    .argument('<query>', 'Search query')
    .option('-l, --limit <limit>', 'Maximum results to show', '10')
    .option('-c, --code', 'Include code examples in results')
    .option('-f, --fuzzy', 'Enable fuzzy matching')
    .action(async (query: string, options: any) => {
      const commandHandler = new CommandHandler();
      const toolRegistry = commandHandler.getToolRegistry();
      const theme = commandHandler.getThemeManager();

      const searchOptions = {
        query,
        limit: parseInt(options.limit),
        includeCode: options.code || false,
        fuzzy: options.fuzzy || false
      };

      try {
        const result = await toolRegistry.execute('knowledge_search', searchOptions);
        if (result.totalResults === 0) {
          console.log(theme.warning('No results found. Try crawling some documentation first with "canvas crawl <url>"'));
        }
      } catch (error: any) {
        console.log(theme.error(`❌ Search failed: ${error.message}`));
      }
    });

  return searchCommand;
}