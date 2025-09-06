import chalk from 'chalk';
import gradient from 'gradient-string';

export function displaySplash(): void {
  // Clear for clean presentation
  console.clear();
  
  // Subtle gradient - lighter grays to make it stand out
  const canvasGradient = gradient(['#909090', '#a0a0a0', '#b0b0b0', '#a0a0a0', '#909090']);
  
  console.log('\n');  // Reduced from \n\n
  
  // CANVAS in clean, prominent block letters
  console.log(canvasGradient('     ██████   █████  ███    ██ ██    ██  █████  ███████'));
  console.log(canvasGradient('    ██       ██   ██ ████   ██ ██    ██ ██   ██ ██     '));
  console.log(canvasGradient('    ██       ███████ ██ ██  ██ ██    ██ ███████ ███████'));
  console.log(canvasGradient('    ██       ██   ██ ██  ██ ██  ██  ██  ██   ██      ██'));
  console.log(canvasGradient('     ██████  ██   ██ ██   ████   ████   ██   ██ ███████'));
  console.log('');
  console.log(chalk.hex('#606060')('                    command line interface'));
  console.log(chalk.hex('#404040')('                            v2.0'));
  
  console.log('');  // Reduced from \n
}

export function displayCompactLogo(): string {
  // Subtle, minimal
  return chalk.hex('#808080')('canvas cli');
}

export function displayWelcome(): void {
  displaySplash();
  // No extra spacing - input box appears right after logo
}