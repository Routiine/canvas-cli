/**
 * Unified Border Component for Canvas CLI
 * Replaces 16 duplicate border implementations with a single configurable component
 */

import chalk from 'chalk';
import readline from 'readline';
import { loadConfig } from '../config.js';
import { ThemeManager } from '../themes.js';
import { getCurrentModel } from '../models/model-manager.js';

export interface BorderConfig {
  style?: 'single' | 'double' | 'rounded' | 'bold' | 'ascii' | 'minimal' | 'clean';
  color?: string;
  width?: number;
  showHelp?: boolean;
  showMode?: boolean;
  clearScreen?: boolean;
  title?: string;
  useTheme?: boolean;
  padding?: number;
  align?: 'left' | 'center' | 'right';
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
  },
  minimal: {
    topLeft: ' ',
    topRight: ' ',
    bottomLeft: ' ',
    bottomRight: ' ',
    horizontal: '─',
    vertical: ' '
  },
  clean: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│'
  }
};

export class UnifiedBorder {
  private config: Required<BorderConfig>;
  private chars: BorderChars;
  private themeManager: ThemeManager;

  constructor(config: BorderConfig = {}) {
    // Load theme from config
    const appConfig = loadConfig();
    const themeName = appConfig.theme || appConfig.ui?.theme || 'default';
    this.themeManager = new ThemeManager(themeName);
    
    // Get theme primary color if useTheme is enabled - default to grey
    const themeColor = config.useTheme !== false ?
      this.themeManager.getTheme().colors.primary :
      (config.color || '#808080');

    // Get terminal width dynamically - use full width minus margins
    const terminalWidth = process.stdout.columns || 80;
    // Leave space for margins (2 spaces on left + 2 for border chars)
    const defaultWidth = config.width || (terminalWidth - 4);

    this.config = {
      style: config.style || 'single',
      color: themeColor,
      width: defaultWidth,
      showHelp: config.showHelp !== false,
      showMode: config.showMode !== false,
      clearScreen: config.clearScreen !== false,
      title: config.title || '',
      useTheme: config.useTheme !== false,
      padding: config.padding || 0,
      align: config.align || 'left'
    };
    this.chars = BORDER_STYLES[this.config.style];
  }

  /**
   * Get bordered input from user with input INSIDE the box
   */
  async getBorderedInput(prompt: string = '>', executionMode: boolean = true): Promise<string> {
    if (this.config.clearScreen) {
      console.clear();
    }

    const color = this.config.useTheme ?
      (text: string) => this.themeManager.primary(text) :
      chalk.hex(this.config.color);
    const width = this.config.width;
    const chars = this.chars;

    // Draw a clean separator line
    const separator = chars.horizontal.repeat(width + 2);
    console.log('  ' + color(separator));

    // Show help and mode
    if (this.config.showHelp) {
      console.log(this.themeManager.dim('  Type /help for commands • /tools for available tools • exit to quit'));
    }

    if (this.config.showMode && executionMode !== undefined) {
      const model = getCurrentModel() || loadConfig().defaultModel || 'llama3.2';
      const mode = executionMode ? 'DEV' : 'ASK';
      const modeLabel = executionMode ? '(exec)' : '(plan)';
      const statusText = `  ${mode} ${modeLabel} · ${model}`;
      const modeText = executionMode ?
        this.themeManager.success(statusText) :
        this.themeManager.info(statusText);
      console.log(modeText);
    }

    console.log('');

    // Simple prompt - no cursor movement needed
    const promptText = this.config.useTheme ?
      this.themeManager.primary(prompt + ' ') :
      chalk.hex(this.config.color)(prompt + ' ');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '  ' + promptText
    });

    rl.prompt();

    return new Promise((resolve) => {
      rl.on('line', (input) => {
        rl.close();
        resolve(input.trim());
      });
    });
  }

  /**
   * Alternative method that draws complete box first then positions cursor inside
   */
  async getBorderedInputAlt(prompt: string = '>', executionMode: boolean = true): Promise<string> {
    if (this.config.clearScreen) {
      console.clear();
    }

    // Draw complete box
    this.drawBox(3, executionMode);
    
    // Move cursor up into the middle of the box
    // We need to go up past: mode line (if shown), help line (if shown), bottom border, and into middle line
    let linesToMoveUp = 2; // bottom border + middle line
    if (this.config.showHelp) linesToMoveUp++;
    if (this.config.showMode && executionMode !== undefined) linesToMoveUp++;
    
    // Move cursor up and to the right position
    readline.cursorTo(process.stdout, 4); // Move to column 4 (after "  |" )
    readline.moveCursor(process.stdout, 0, -linesToMoveUp); // Move up
    
    // Get input with styled prompt
    const promptColor = this.config.useTheme ? 
      this.themeManager.primary(prompt + ' ') : 
      chalk.hex(this.config.color)(prompt + ' ');
    
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: promptColor
      });

      rl.prompt();

      rl.on('line', (input) => {
        rl.close();
        // Move cursor back down below the box
        readline.moveCursor(process.stdout, 0, linesToMoveUp);
        resolve(input.trim());
      });
    });
  }

  /**
   * Draw the border box (for alternative method)
   */
  private drawBox(height: number = 3, executionMode?: boolean): void {
    const color = this.config.useTheme ? 
      (text: string) => this.themeManager.primary(text) :
      chalk.hex(this.config.color);
    const width = this.config.width;
    const chars = this.chars;

    // Top border
    let topLine = `${chars.topLeft}${chars.horizontal.repeat(width)}${chars.topRight}`;
    if (this.config.title) {
      const titleStr = ` ${this.config.title} `;
      const titlePos = Math.floor((width - titleStr.length) / 2);
      topLine = `${chars.topLeft}${chars.horizontal.repeat(titlePos)}${titleStr}${chars.horizontal.repeat(width - titlePos - titleStr.length)}${chars.topRight}`;
    }
    console.log('  ' + color(topLine));

    // Middle lines (empty space for input)
    for (let i = 0; i < height - 2; i++) {
      const middleLine = `${chars.vertical}${' '.repeat(width)}${chars.vertical}`;
      console.log('  ' + color(middleLine));
    }

    // Bottom border
    const bottomLine = `${chars.bottomLeft}${chars.horizontal.repeat(width)}${chars.bottomRight}`;
    console.log('  ' + color(bottomLine));

    // Help text below the box
    if (this.config.showHelp) {
      console.log(this.themeManager.dim('  Type /help for commands • /tools for available tools • exit to quit'));
    }

    // Mode indicator below the box
    if (this.config.showMode && executionMode !== undefined) {
      const model = getCurrentModel() || loadConfig().defaultModel || 'llama3.2';
      const mode = executionMode ? 'DEV' : 'ASK';
      const modeLabel = executionMode ? '(exec)' : '(plan)';
      const statusText = `  ${mode} ${modeLabel} · ${model}`;
      const modeText = executionMode ?
        this.themeManager.success(statusText) :
        this.themeManager.info(statusText);
      console.log(modeText);
    }
  }

  /**
   * Draw a simple border without input
   */
  drawSimpleBorder(content?: string[], title?: string): void {
    const color = this.config.useTheme ? 
      (text: string) => this.themeManager.primary(text) :
      chalk.hex(this.config.color);
    const width = this.config.width;
    const chars = this.chars;

    // Top border with optional title
    let topLine = chars.topLeft + chars.horizontal.repeat(width) + chars.topRight;
    if (title) {
      const titleStr = ` ${title} `;
      const titlePos = Math.floor((width - titleStr.length) / 2);
      topLine = chars.topLeft + chars.horizontal.repeat(titlePos) + titleStr + 
                chars.horizontal.repeat(width - titlePos - titleStr.length) + chars.topRight;
    }
    console.log('  ' + color(topLine));

    // Content lines
    if (content && content.length > 0) {
      for (const line of content) {
        const paddedLine = line.padEnd(width).substring(0, width);
        const contentLine = chars.vertical + paddedLine + chars.vertical;
        console.log('  ' + color(contentLine));
      }
    } else {
      // Empty line
      const emptyLine = chars.vertical + ' '.repeat(width) + chars.vertical;
      console.log('  ' + color(emptyLine));
    }

    // Bottom border
    const bottomLine = chars.bottomLeft + chars.horizontal.repeat(width) + chars.bottomRight;
    console.log('  ' + color(bottomLine));
  }

  /**
   * Update theme on the fly
   */
  updateTheme(themeName: string): void {
    this.themeManager.setTheme(themeName);
    if (this.config.useTheme) {
      this.config.color = this.themeManager.getTheme().colors.primary;
    }
  }

  /**
   * Static method to draw a quick box without instance
   */
  static drawBox(content: string | string[], options: BorderConfig = {}): string {
    const border = new UnifiedBorder(options);
    const lines = Array.isArray(content) ? content : content.split('\n');
    const width = options.width || Math.max(...lines.map(l => l.length)) + 4;
    const chars = BORDER_STYLES[options.style || 'single'];
    const color = options.color ? chalk.hex(options.color) : (text: string) => text;
    
    let output = '';
    
    // Top border
    output += color(`${chars.topLeft}${chars.horizontal.repeat(width)}${chars.topRight}\n`);
    
    // Content lines
    for (const line of lines) {
      const padding = ' '.repeat(Math.max(0, width - line.length));
      output += color(`${chars.vertical}${line}${padding}${chars.vertical}\n`);
    }
    
    // Bottom border
    output += color(`${chars.bottomLeft}${chars.horizontal.repeat(width)}${chars.bottomRight}\n`);
    
    return output;
  }

  /**
   * Static method for clean input box (replaces cleanBox.ts)
   */
  static async getCleanInput(executionMode: boolean = true): Promise<string> {
    const border = new UnifiedBorder({
      style: 'single',
      color: '#808080',
      showHelp: true,
      showMode: true
    });

    return await border.getBorderedInput('>', executionMode);
  }

  /**
   * Static method for status bar box
   */
  static drawStatusBar(status: string, mode: string, color: string = '#808080'): string {
    return UnifiedBorder.drawBox(`${status} | ${mode}`, {
      style: 'minimal',
      color,
      width: process.stdout.columns - 4
    });
  }

  /**
   * Static method for error box
   */
  static drawError(error: string): string {
    return UnifiedBorder.drawBox(error, {
      style: 'single',
      color: '#707070',
      width: Math.min(80, process.stdout.columns - 4)
    });
  }

  /**
   * Static method for performance dashboard box
   */
  static drawMetrics(metrics: Record<string, any>): string {
    const lines = Object.entries(metrics).map(([key, value]) =>
      `${key}: ${value}`
    );

    return UnifiedBorder.drawBox(lines, {
      style: 'single',
      color: '#808080'
    });
  }
}