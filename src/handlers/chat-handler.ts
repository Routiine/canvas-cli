/**
 * Chat handler - Chat and checkpoint command handling
 */

import type { ThemeManager } from '../themes.js';
import type { CheckpointManager } from '../checkpoint.js';
import type { Message } from '../types.js';

export class ChatHandler {
  constructor(
    private themeManager: ThemeManager,
    private checkpointManager: CheckpointManager,
    private messages: Message[]
  ) {}

  async handleCommand(args: string): Promise<string> {
    const [subCommand, ...rest] = args.split(' ');
    const tag = rest.join(' ');

    switch (subCommand) {
      case 'save':
        if (!tag) return this.themeManager.error('Please provide a tag name');
        await this.checkpointManager.saveCheckpoint(this.messages, tag);
        return this.themeManager.success(`Conversation saved as: ${tag}`);

      case 'resume':
        if (!tag) return this.themeManager.error('Please provide a tag name');
        const checkpoint = await this.checkpointManager.loadCheckpoint(tag);
        if (checkpoint) {
          this.messages.length = 0;
          this.messages.push(...checkpoint.messages);
          return this.themeManager.success(`Resumed conversation: ${tag}`);
        }
        return this.themeManager.error(`Checkpoint not found: ${tag}`);

      case 'list':
        const checkpoints = await this.checkpointManager.listCheckpoints();
        if (checkpoints.length === 0) {
          return this.themeManager.dim('No saved checkpoints');
        }
        let output = this.themeManager.primary('Saved Checkpoints:\n');
        for (const cp of checkpoints) {
          output += `  ${this.themeManager.secondary(cp.id)} - ${this.themeManager.dim(cp.timestamp.toString())}\n`;
        }
        return output;

      case 'delete':
        if (!tag) return this.themeManager.error('Please provide a tag name');
        const deleted = await this.checkpointManager.deleteCheckpoint(tag);
        return deleted
          ? this.themeManager.success(`Deleted checkpoint: ${tag}`)
          : this.themeManager.error(`Checkpoint not found: ${tag}`);

      default:
        return this.themeManager.error('Usage: /chat [save|resume|list|delete] <tag>');
    }
  }
}