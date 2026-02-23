/**
 * Init command - Initialize a new project with Canvas CLI templates
 */

import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { CommandHandler } from '../commands.js';
import { generateResponseWithTools } from '../ollama/response-generator.js';

export function createInitCommand(): Command {
  const initCommand = new Command('init')
    .description('Initialize a new project with Canvas CLI templates')
    .argument('[type]', 'Project type (webapp, api, cli, library)', 'webapp')
    .option('-n, --name <name>', 'Project name')
    .option('-t, --template <template>', 'Template to use')
    .action(async (type: string, options: { name?: string; template?: string }) => {
      const config = loadConfig();
      const commandHandler = new CommandHandler();
      const theme = commandHandler.getThemeManager();

      console.log(theme.primary(`🚀 Initializing new ${type} project...`));

      const prompt = `Create a complete project structure for a ${type} project named "${options.name || 'my-project'}".
      Include all necessary files, folders, configurations, and boilerplate code.
      ${options.template ? `Use the ${options.template} template style.` : ''}`;

      await generateResponseWithTools(prompt, config.defaultModel || 'llama3.2:1b', commandHandler, true);
    });

  return initCommand;
}
