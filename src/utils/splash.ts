import chalk from 'chalk';
import { ThemeManager, themes } from '../themes.js';

function centerText(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

// Get current theme from config or use default
let currentTheme: ThemeManager = new ThemeManager('slate');

export function setTheme(themeName: string): void {
  currentTheme = new ThemeManager(themeName);
}

export function displaySplash(themeName?: string): void {
  // Use provided theme or current
  const theme = themeName ? new ThemeManager(themeName) : currentTheme;

  // Clear for clean presentation
  console.clear();

  // Get terminal width for centering
  const termWidth = process.stdout.columns || 80;

  // CANVAS ASCII art (with proper internal letter alignment)
  const logoLines = [
    ' ██████   █████  ███    ██ ██    ██  █████  ███████',
    '██       ██   ██ ████   ██ ██    ██ ██   ██ ██     ',
    '██       ███████ ██ ██  ██ ██    ██ ███████ ███████',
    '██       ██   ██ ██  ██ ██  ██  ██  ██   ██      ██',
    ' ██████  ██   ██ ██   ████   ████   ██   ██ ███████'
  ];

  console.log('\n');

  // Center and display logo with theme color
  for (const line of logoLines) {
    console.log(theme.primary(centerText(line, termWidth)));
  }

  console.log('');
  console.log(theme.dim(centerText('command line interface', termWidth)));
  console.log(theme.dim(centerText('v3.0', termWidth)));

  console.log('');
}

export function displayCompactLogo(): string {
  return currentTheme.primary('canvas cli');
}

export function displayWelcome(themeName?: string): void {
  displaySplash(themeName);
  // No extra spacing - input box appears right after logo
}
