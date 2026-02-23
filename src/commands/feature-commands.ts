/**
 * Feature commands - Commands that depend on the feature manager
 * These are registered when advanced features are available
 */

import { Command } from 'commander';

export function createFeatureCommands(featureManager: any): Command[] {
  const commands: Command[] = [];

  // Feature commands are registered inline in index.ts
  // This file can be expanded to move them here if desired

  return commands;
}