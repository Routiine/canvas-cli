/**
 * QUAL-007: CommandContext interface
 * Decouples response-generator.ts from the concrete CommandHandler class.
 * CommandHandler implements this interface; callers that only need a subset
 * of capabilities can pass a lighter object.
 */

import type { ThemeManager } from '../themes.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { Message, TokenUsage } from '../types.js';

export interface CommandContext {
  getThemeManager(): ThemeManager;
  getToolRegistry(): ToolRegistry;
  addMessage(message: Message): void;
  updateTokenUsage(usage: Partial<TokenUsage>): void;
}
