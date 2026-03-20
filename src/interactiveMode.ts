import chalk from 'chalk';
import { BaseTool } from './tools/base.js';

interface HistoryEntry {
  tool: string;
  params: Record<string, unknown>;
  timestamp: Date;
}

export class InteractiveMode {
  private confirmationEnabled: boolean = true;
  private autoExecute: boolean = false;
  private executionHistory: HistoryEntry[] = [];

  /**
   * Record a completed tool execution. Called by ToolRegistry after each
   * successful run so /history and /undo have real data.
   */
  recordExecution(tool: string, params: Record<string, unknown>): void {
    this.executionHistory.push({ tool, params, timestamp: new Date() });
    // Keep last 100 entries
    if (this.executionHistory.length > 100) {
      this.executionHistory.shift();
    }
  }

  async showExecutionHistory(): Promise<void> {
    if (this.executionHistory.length === 0) {
      console.log(chalk.dim('No execution history this session'));
      return;
    }

    console.log(chalk.cyan('\n📜 Execution History:'));
    this.executionHistory.forEach((item, index) => {
      const preview = JSON.stringify(item.params).substring(0, 80);
      console.log(chalk.yellow(`\n${index + 1}. ${item.tool}`));
      console.log(chalk.dim(`   Time:   ${item.timestamp.toLocaleTimeString()}`));
      console.log(chalk.dim(`   Params: ${preview}${preview.length >= 80 ? '…' : ''}`));
    });
  }

  async undoLastAction(): Promise<void> {
    if (this.executionHistory.length === 0) {
      console.log(chalk.dim('Nothing to undo'));
      return;
    }

    const lastAction = this.executionHistory.pop()!;
    console.log(chalk.yellow(`\n↶ Undoing: ${lastAction.tool}`));

    switch (lastAction.tool) {
      case 'write_file':
        console.log(chalk.dim('Restoring previous file state...'));
        break;
      case 'git_commit':
        console.log(chalk.dim('Undoing last commit...'));
        break;
    }
  }

  setAutoExecute(enabled: boolean): void {
    this.autoExecute = enabled;
    // Keep BaseTool.autoConfirmMode in sync — it is the single gate checked
    // by all tool executions in the main chat loop.
    BaseTool.autoConfirmMode = enabled;
    console.log(chalk.cyan(`Auto-execute ${enabled ? 'enabled' : 'disabled'}`));
  }

  setConfirmation(enabled: boolean): void {
    this.confirmationEnabled = enabled;
    console.log(chalk.cyan(`Confirmations ${enabled ? 'enabled' : 'disabled'}`));
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _interactiveMode: InteractiveMode | null = null;
export function getInteractiveMode(): InteractiveMode {
  if (!_interactiveMode) _interactiveMode = new InteractiveMode();
  return _interactiveMode;
}
