import type { Command } from 'commander';
import { startInkUIFixed } from '../ui/ink/indexFixed.js';
import { render } from 'ink';
import React from 'react';
import DarkApp from '../ui/ink/DarkApp.js';
import { CommandHandler } from '../commands.js';
import { loadConfig } from '../config.js';

export function registerInkUICommand(program: Command) {
  program
    .command('ui')
    .description('Launch the beautiful dark-themed terminal UI')
    .option('-m, --model <model>', 'AI model to use')
    .option('--classic', 'Use classic UI instead of dark theme')
    .action(async (options) => {
      const config = await loadConfig();
      const commandHandler = new CommandHandler();
      
      console.log('Launching Canvas CLI with Ink UI...\n');
      
      // Create command processor
      const processCommand = async (input: string): Promise<string> => {
        try {
          // Handle special commands
          if (input.startsWith('/')) {
            const [cmd, ...args] = input.slice(1).split(' ');
            switch (cmd) {
              case 'help':
                return `Available commands:
• /help - Show this help
• /tools - List available tools
• /model <name> - Switch AI model
• /clear - Clear chat history
• /save <file> - Save conversation
• /load <file> - Load conversation`;
              
              case 'tools':
                return `Available tools:
🔧 File System: read, write, edit, delete, search
📦 Git: status, diff, commit, push, pull, branch
🌐 Web: fetch, search, api requests
🧠 AI: memory, context management
🎨 Builders: web, app, landing page creation
...and 40+ more tools!`;
              
              case 'clear':
                return 'Chat history cleared.';
              
              default:
                return `Unknown command: ${cmd}`;
            }
          }
          
          // Process with AI
          // This is a placeholder - integrate with actual AI processing
          return `Processing: "${input}"... Canvas CLI is ready to help!`;
          
        } catch (error: any) {
          return `Error: ${error.message}`;
        }
      };
      
      // Check if TTY is available
      if (!process.stdin.isTTY) {
        console.error('Error: UI mode requires an interactive terminal.');
        process.exit(1);
      }
      
      // Start the appropriate UI
      if (options.classic) {
        // Use classic fixed UI
        startInkUIFixed({
          model: options.model || config.defaultModel,
          onCommand: processCommand
        });
      } else {
        // Use new dark theme UI
        try {
          if (process.stdin.setRawMode) {
            process.stdin.setRawMode(true);
          }
          process.stdin.resume();
          
          const app = render(React.createElement(DarkApp, {
            model: options.model || config.defaultModel,
            onCommand: processCommand
          }));
          
          void app.waitUntilExit().then(() => {
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(false);
            }
            process.stdin.pause();
          });
        } catch (error: any) {
          console.error('Failed to start UI:', error.message);
          process.exit(1);
        }
      }
    });
}