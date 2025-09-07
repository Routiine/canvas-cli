/**
 * Clean Box UI - Now uses UnifiedBorder for consistency
 * @deprecated Use UnifiedBorder.getCleanInput() instead
 */

import { UnifiedBorder } from './unifiedBorder.js';
import chalk from 'chalk';

export async function getCleanBoxInput(executionMode: boolean): Promise<string> {
  // Use UnifiedBorder's clean input method
  return await UnifiedBorder.getCleanInput(executionMode);
}

export function showCleanHelp(executionMode: boolean): void {
  console.log('');
  console.log(chalk.hex('#404040')('  commands: help • exit • /execute • /clear'));
  console.log(chalk.hex('#404040')('  mode: ' + (executionMode ? chalk.hex('#ff6b6b')('execution') : chalk.hex('#888888')('planning'))));
}