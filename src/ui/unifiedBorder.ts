/**
 * Unified Border Component for Canvas CLI
 * Replaces 16 duplicate border implementations with a single configurable component
 */

import chalk from 'chalk';
import readline from 'readline';
import inquirer from 'inquirer';

export interface BorderConfig {
  style?: 'single' | 'double' | 'rounded' | 'bold' | 'ascii';
  color?: string;
  width?: number;
  showHelp?: boolean;
  showMode?: boolean;
  clearScreen?: boolean;
  title?: string;
}

interface BorderChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

const BORDER_STYLES: Record<string, BorderChars> = {
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│'
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║'
  },
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│'
  },
  bold: {
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    horizontal: '━',
    vertical: '┃'
  },
  ascii: {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|'
  }
};

export class UnifiedBorder {
  private config: Required<BorderConfig>;
  private chars: BorderChars;

  constructor(config: BorderConfig = {}) {
    this.config = {
      style: config.style || 'double',
      color: config.color || '#00ff88',
      width: config.width || 78,
      showHelp: config.showHelp !== false,
      showMode: config.showMode !== false,
      clearScreen: config.clearScreen !== false,
      title: config.title || ''
    };
    this.chars = BORDER_STYLES[this.config.style];
  }

  /**
   * Get bordered input from user
   */
  async getBorderedInput(prompt: string = '>', executionMode: boolean = true): Promise<string> {
    if (this.config.clearScreen) {
      console.clear();
    }

    this.drawBox(3, executionMode);
    
    // Position cursor inside the box
    readline.moveCursor(process.stdout, 0, -2);
    readline.cursorTo(process.stdout, 4);

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.hex(this.config.color)(prompt + ' ')
      });

      rl.prompt();

      rl.on('line', (input) => {
        rl.close();
        readline.moveCursor(process.stdout, 0, 2);
        resolve(input.trim());
      });
    });
  }

  /**
   * Get multi-line bordered input
   */
  async getMultiLineInput(prompt: string = '>', maxLines: number = 10): Promise<string> {
    if (this.config.clearScreen) {
      console.clear();
    }

    this.drawBox(maxLines + 2);
    
    const lines: string[] = [];
    let currentLine = 0;

    readline.moveCursor(process.stdout, 0, -(maxLines + 1));
    readline.cursorTo(process.stdout, 4);

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.hex(this.config.color)(prompt + ' ')
      });

      rl.prompt();

      rl.on('line', (input) => {
        if (input === '' && currentLine > 0) {
          rl.close();
          readline.moveCursor(process.stdout, 0, maxLines - currentLine + 2);
          resolve(lines.join('\n'));
        } else {
          lines.push(input);
          currentLine++;
          if (currentLine >= maxLines) {
            rl.close();
            readline.moveCursor(process.stdout, 0, 2);
            resolve(lines.join('\n'));
          } else {
            rl.prompt();
          }
        }
      });
    });
  }

  /**
   * Draw the border box
   */
  private drawBox(height: number = 3, executionMode?: boolean): void {
    const color = chalk.hex(this.config.color);
    const width = this.config.width;
    const chars = this.chars;

    // Top border
    let topLine = `  ${chars.topLeft}${chars.horizontal.repeat(width)}${chars.topRight}`;
    if (this.config.title) {
      const titleStr = ` ${this.config.title} `;
      const titlePos = Math.floor((width - titleStr.length) / 2);
      topLine = `  ${chars.topLeft}${chars.horizontal.repeat(titlePos)}${titleStr}${chars.horizontal.repeat(width - titlePos - titleStr.length)}${chars.topRight}`;
    }
    console.log(color(topLine));

    // Middle lines
    for (let i = 0; i < height - 2; i++) {
      console.log(color(`  ${chars.vertical}${' '.repeat(width)}${chars.vertical}`));
    }

    // Bottom border
    console.log(color(`  ${chars.bottomLeft}${chars.horizontal.repeat(width)}${chars.bottomRight}`));

    // Help text
    if (this.config.showHelp) {
      console.log(chalk.dim('  Type /help for commands • /tools for available tools • exit to quit'));
    }

    // Mode indicator
    if (this.config.showMode && executionMode !== undefined) {
      const mode = executionMode ? 'execution' : 'planning';
      const modeColor = executionMode ? '#ff6b6b' : '#4a9eff';
      console.log(chalk.hex('#404040')('  mode: ') + chalk.hex(modeColor)(mode));
    }
  }

  /**
   * Show a message in a bordered box
   */
  showMessage(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const colors = {
      info: '#00ff88',
      success: '#00ff00',
      warning: '#ffaa00',
      error: '#ff0000'
    };

    const tempConfig = { ...this.config, color: colors[type] };
    const tempBorder = new UnifiedBorder(tempConfig);
    
    const lines = message.split('\n');
    const maxLength = Math.max(...lines.map(l => l.length));
    const width = Math.max(maxLength + 4, 40);

    const color = chalk.hex(colors[type]);
    const chars = this.chars;

    console.log(color(`  ${chars.topLeft}${chars.horizontal.repeat(width)}${chars.topRight}`));
    
    lines.forEach(line => {
      const padding = width - line.length - 2;
      console.log(color(`  ${chars.vertical} ${line}${' '.repeat(padding)} ${chars.vertical}`));
    });
    
    console.log(color(`  ${chars.bottomLeft}${chars.horizontal.repeat(width)}${chars.bottomRight}`));
  }
}

// Export convenience functions for backward compatibility
export async function getBorderedInput(executionMode: boolean = true, config?: BorderConfig): Promise<string> {
  const border = new UnifiedBorder(config);
  return border.getBorderedInput('>', executionMode);
}

export async function getStableBorderedInput(prompt: string = '>', config?: BorderConfig): Promise<string> {
  const border = new UnifiedBorder({ ...config, style: 'double' });
  return border.getBorderedInput(prompt, true);
}

export async function getSimpleBorderedInput(prompt: string = '>', config?: BorderConfig): Promise<string> {
  const border = new UnifiedBorder({ ...config, style: 'single' });
  return border.getBorderedInput(prompt, true);
}

// Default export
export default UnifiedBorder;