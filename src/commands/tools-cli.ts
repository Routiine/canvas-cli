/**
 * Tools command - Manage and list Canvas CLI tools
 */

import { Command } from 'commander';
import { CommandHandler } from '../commands.js';

export function createToolsCommand(): Command {
  const toolsCommand = new Command('tools')
    .description('Manage and list Canvas CLI tools')
    .argument('[action]', 'Action to perform (list, enable, disable, create)')
    .argument('[tool]', 'Tool name for enable/disable actions')
    .action(async (action: string = 'list', tool?: string) => {
      const commandHandler = new CommandHandler();
      const toolRegistry = commandHandler.getToolRegistry();
      const theme = commandHandler.getThemeManager();

      switch (action) {
        case 'list':
          const tools = toolRegistry.listEnabled();
          console.log(theme.primary('🛠️  Available Tools:'));
          tools.forEach((t: any) => {
            const status = toolRegistry.isEnabled(t.name) ? '✅' : '❌';
            console.log(`  ${status} ${t.name}: ${t.description}`);
          });
          break;

        case 'enable':
          if (tool) {
            toolRegistry.enable(tool);
            console.log(theme.success(`✅ Enabled tool: ${tool}`));
          }
          break;

        case 'disable':
          if (tool) {
            toolRegistry.disable(tool);
            console.log(theme.warning(`❌ Disabled tool: ${tool}`));
          }
          break;

        case 'create':
          console.log(theme.primary('🔨 Creating new tool...'));
          console.log(theme.dim('Use the chat command to create custom tools with AI assistance'));
          break;

        default:
          console.log(theme.warning('Usage: canvas tools [list|enable|disable|create] [tool]'));
      }
    });

  return toolsCommand;
}
