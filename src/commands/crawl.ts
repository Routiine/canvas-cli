/**
 * Crawl command - Crawl and index documentation from a website
 */

import { Command } from 'commander';
import { CommandHandler } from '../commands.js';

export function createCrawlCommand(): Command {
  const crawlCommand = new Command('crawl')
    .description('Crawl and index documentation from a website')
    .argument('<url>', 'URL to start crawling from')
    .option('-d, --depth <depth>', 'Maximum crawl depth', '3')
    .option('-m, --max <pages>', 'Maximum pages to crawl', '50')
    .option('-i, --include <patterns>', 'Include URL patterns (comma-separated)')
    .option('-e, --exclude <patterns>', 'Exclude URL patterns (comma-separated)')
    .action(async (url: string, options: any) => {
      const commandHandler = new CommandHandler();
      const toolRegistry = commandHandler.getToolRegistry();
      const theme = commandHandler.getThemeManager();

      console.log(theme.primary(`🕷️  Starting web crawler for ${url}`));

      const crawlOptions = {
        url,
        maxDepth: parseInt(options.depth),
        maxPages: parseInt(options.max),
        includePatterns: options.include ? options.include.split(',') : undefined,
        excludePatterns: options.exclude ? options.exclude.split(',') : undefined
      };

      try {
        const result = await toolRegistry.execute('web_crawler', crawlOptions);
        console.log(theme.success(`✅ Crawled ${result.pagesCount} pages`));
        if (result.knowledgeDir) {
          console.log(theme.dim(`📁 Knowledge saved to ${result.knowledgeDir}/`));
        }
      } catch (error: any) {
        console.log(theme.error(`❌ Crawl failed: ${error.message}`));
      }
    });

  return crawlCommand;
}