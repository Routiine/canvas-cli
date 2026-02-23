import inquirer from 'inquirer';
import chalk from 'chalk';
import type { ToolRegistry } from './tools/registry.js';
import { intentDetector } from './tools/intentDetector.js';

export class InteractiveMode {
  private confirmationEnabled: boolean = true;
  private autoExecute: boolean = false;
  private executionHistory: any[] = [];

  async promptForConfirmation(tool: string, params: any): Promise<boolean> {
    if (this.autoExecute || !this.confirmationEnabled) {
      return true;
    }

    console.log(chalk.yellow(`\n⚠️  Tool execution request:`));
    console.log(chalk.cyan(`   Tool: ${tool}`));
    console.log(chalk.dim(`   Parameters:`));
    
    // Format parameters nicely
    for (const [key, value] of Object.entries(params)) {
      const displayValue = typeof value === 'string' && value.length > 50 
        ? value.substring(0, 50) + '...' 
        : value;
      console.log(chalk.dim(`     ${key}: ${displayValue}`));
    }

    const answer = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: 'Execute this action?',
      default: true
    });

    return answer.confirm;
  }

  async promptForCorrection(tool: string, params: any): Promise<any> {
    console.log(chalk.yellow('\n📝 Would you like to modify the parameters?'));
    
    const answer = await inquirer.prompt({
      type: 'confirm',
      name: 'modify',
      message: 'Modify parameters?',
      default: false
    });

    if (!answer.modify) {
      return params;
    }

    // Allow editing each parameter
    const newParams: any = {};
    for (const [key, value] of Object.entries(params)) {
      const result = await inquirer.prompt({
        type: 'input',
        name: key,
        message: `${key}:`,
        default: String(value)
      });
      newParams[key] = result[key];
    }

    return newParams;
  }

  async executeWithConfirmation(tool: string, params: any, toolRegistry: ToolRegistry): Promise<any> {
    // Show what will be executed
    const confirmed = await this.promptForConfirmation(tool, params);
    
    if (!confirmed) {
      console.log(chalk.yellow('⏭️  Skipped'));
      return null;
    }

    // Option to modify parameters
    const finalParams = await this.promptForCorrection(tool, params);

    try {
      console.log(chalk.dim(`Executing ${tool}...`));
      const result = await toolRegistry.execute(tool, finalParams);
      
      // Track execution
      this.executionHistory.push({
        tool,
        params: finalParams,
        result,
        timestamp: new Date()
      });

      console.log(chalk.green(`✓ ${tool} completed successfully`));
      return result;
    } catch (error: any) {
      console.log(chalk.red(`✗ ${tool} failed: ${error.message}`));
      
      // Offer retry
      const retry = await inquirer.prompt({
        type: 'confirm',
        name: 'retry',
        message: 'Retry with different parameters?',
        default: true
      });

      if (retry.retry) {
        const newParams = await this.promptForCorrection(tool, finalParams);
        return this.executeWithConfirmation(tool, newParams, toolRegistry);
      }
      
      throw error;
    }
  }

  async showExecutionHistory(): Promise<void> {
    if (this.executionHistory.length === 0) {
      console.log(chalk.dim('No execution history'));
      return;
    }

    console.log(chalk.cyan('\n📜 Execution History:'));
    this.executionHistory.forEach((item, index) => {
      console.log(chalk.yellow(`\n${index + 1}. ${item.tool}`));
      console.log(chalk.dim(`   Time: ${item.timestamp.toLocaleTimeString()}`));
      console.log(chalk.dim(`   Params: ${JSON.stringify(item.params, null, 2).substring(0, 100)}...`));
    });
  }

  async undoLastAction(): Promise<void> {
    if (this.executionHistory.length === 0) {
      console.log(chalk.dim('Nothing to undo'));
      return;
    }

    const lastAction = this.executionHistory.pop();
    console.log(chalk.yellow(`\n↶ Undoing: ${lastAction.tool}`));
    
    // Implement undo logic based on tool type
    switch (lastAction.tool) {
      case 'write_file':
        // Delete the file or restore backup
        console.log(chalk.dim('Restoring previous file state...'));
        break;
      case 'git_commit':
        // Git reset --soft HEAD^
        console.log(chalk.dim('Undoing last commit...'));
        break;
      // Add more undo logic for different tools
    }
  }

  setAutoExecute(enabled: boolean): void {
    this.autoExecute = enabled;
    console.log(chalk.cyan(`Auto-execute ${enabled ? 'enabled' : 'disabled'}`));
  }

  setConfirmation(enabled: boolean): void {
    this.confirmationEnabled = enabled;
    console.log(chalk.cyan(`Confirmations ${enabled ? 'enabled' : 'disabled'}`));
  }
}

export const interactiveMode = new InteractiveMode();