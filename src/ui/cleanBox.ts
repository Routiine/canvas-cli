import chalk from 'chalk';
import readline from 'readline';

export async function getCleanBoxInput(executionMode: boolean): Promise<string> {
  // Get terminal width for full-width box
  const terminalWidth = process.stdout.columns || 80;
  const boxWidth = Math.min(terminalWidth - 4, 120);
  
  // Draw a decorative box that shows the input area
  console.log(chalk.hex('#606060')('  ┌' + '─'.repeat(boxWidth) + '┐'));
  console.log(chalk.hex('#606060')('  │' + chalk.hex('#404040')('  Input Area') + ' '.repeat(boxWidth - 12) + '│'));
  console.log(chalk.hex('#606060')('  └' + '─'.repeat(boxWidth) + '┘'));
  console.log(''); // Space after box
  
  // Create readline interface for clean input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Set the prompt
  const promptSymbol = executionMode 
    ? chalk.hex('#ff6b6b')('  > ') 
    : chalk.hex('#888888')('  > ');
  
  return new Promise((resolve) => {
    rl.question(promptSymbol, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function showCleanHelp(executionMode: boolean): void {
  console.log('');
  console.log(chalk.hex('#404040')('  commands: help • exit • /execute • /clear'));
  console.log(chalk.hex('#404040')('  mode: ' + (executionMode ? chalk.hex('#ff6b6b')('execution') : chalk.hex('#888888')('planning'))));
}