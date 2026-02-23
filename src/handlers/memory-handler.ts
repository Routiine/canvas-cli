/**
 * Memory handler - Memory and context command handling
 */

import { ThemeManager } from '../themes.js';
import { ToolRegistry } from '../tools/registry.js';
import { ContextLoader } from '../tools/memory.js';

export class MemoryHandler {
  constructor(
    private themeManager: ThemeManager,
    private toolRegistry: ToolRegistry,
    private contextLoader: ContextLoader
  ) {}

  async handleCommand(args: string): Promise<string> {
    const [subCommand, ...rest] = args.split(' ');
    const content = rest.join(' ');

    switch (subCommand) {
      case 'add':
        if (!content) return this.themeManager.error('Please provide content to remember');
        await this.toolRegistry.execute('save_memory', {
          key: `memory-${Date.now()}`,
          value: content,
          scope: 'session'
        });
        return this.themeManager.success('Added to memory');

      case 'show':
        const context = await this.contextLoader.loadContext();
        let output = this.themeManager.primary('Memory Context:\n');
        if (context.global.length > 0) {
          output += this.themeManager.secondary('\nGlobal:\n') + context.global.join('\n');
        }
        if (context.project.length > 0) {
          output += this.themeManager.secondary('\nProject:\n') + context.project.join('\n');
        }
        return output || this.themeManager.dim('No memory context loaded');

      case 'refresh':
        await this.contextLoader.loadContext();
        return this.themeManager.success('Memory context refreshed');

      default:
        return this.themeManager.error('Usage: /memory [add|show|refresh]');
    }
  }
}