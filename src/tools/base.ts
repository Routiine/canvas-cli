import { Tool } from '../types.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract parameters?: Record<string, any>;
  requiresConfirmation = false;
  static autoConfirmMode = false; // Global flag for auto-confirmation

  abstract execute(params: any): Promise<any>;

  async confirmExecution(params: any): Promise<boolean> {
    if (!this.requiresConfirmation) {
      return true;
    }

    // In execution mode or non-interactive mode, auto-confirm
    if (BaseTool.autoConfirmMode || !process.stdin.isTTY) {
      console.log(chalk.yellow(`⚡ Executing: ${this.name}`));
      return true;
    }

    console.log(chalk.yellow(`\n⚠️  Tool: ${this.name}`));
    console.log(chalk.dim('Parameters:'), JSON.stringify(params, null, 2));
    
    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: 'Do you want to execute this tool?',
      default: true
    });

    return confirm;
  }

  async run(params: any): Promise<any> {
    const confirmed = await this.confirmExecution(params);
    if (!confirmed) {
      throw new Error('Tool execution cancelled by user');
    }
    
    try {
      return await this.execute(params);
    } catch (error) {
      console.error(chalk.red(`Error in ${this.name}:`), error);
      throw error;
    }
  }
}