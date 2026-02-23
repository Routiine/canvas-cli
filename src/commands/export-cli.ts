/**
 * Export command - Export conversations and sessions
 */

import { Command } from 'commander';
import fs from 'fs-extra';
import { CommandHandler } from '../commands.js';

export function createExportCommand(): Command {
  const exportCommand = new Command('export')
    .description('Export conversations and sessions')
    .option('-f, --format <format>', 'Export format (md, json, html)', 'md')
    .option('-o, --output <file>', 'Output file path', 'export.md')
    .action(async (options: { format: string; output: string }) => {
      const commandHandler = new CommandHandler();
      const checkpointManager = commandHandler.getCheckpointManager();
      const theme = commandHandler.getThemeManager();

      const session = await checkpointManager.loadAutoSave();

      if (!session) {
        console.log(theme.warning('No session to export'));
        return;
      }

      let content = '';

      switch (options.format) {
        case 'md':
          content = '# Canvas CLI Session\n\n';
          session.messages.forEach((msg: any) => {
            content += `## ${msg.role === 'user' ? '👤 User' : '🤖 Canvas CLI'}\n`;
            content += `*${msg.timestamp}*\n\n`;
            content += `${msg.content}\n\n---\n\n`;
          });
          break;

        case 'json':
          content = JSON.stringify(session, null, 2);
          break;

        case 'html':
          content = `<!DOCTYPE html>
<html>
<head>
  <title>Canvas CLI Session</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
    .user { background: #e3f2fd; }
    .assistant { background: #f3e5f5; }
    .timestamp { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Canvas CLI Session</h1>
  ${session.messages.map((msg: any) => `
    <div class="message ${msg.role}">
      <strong>${msg.role === 'user' ? '👤 User' : '🤖 Canvas CLI'}</strong>
      <div class="timestamp">${msg.timestamp}</div>
      <div>${msg.content}</div>
    </div>
  `).join('')}
</body>
</html>`;
          break;
      }

      await fs.writeFile(options.output, content);
      console.log(theme.success(`📄 Session exported to ${options.output}`));
    });

  return exportCommand;
}