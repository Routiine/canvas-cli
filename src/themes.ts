import chalk from 'chalk';
import { Theme } from './types.js';

export const themes: Record<string, Theme> = {
  default: {
    name: 'Default',
    colors: {
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#06b6d4',
      text: '#f3f4f6',
      dim: '#6b7280'
    }
  },
  dracula: {
    name: 'Dracula',
    colors: {
      primary: '#bd93f9',
      secondary: '#ff79c6',
      success: '#50fa7b',
      error: '#ff5555',
      warning: '#f1fa8c',
      info: '#8be9fd',
      text: '#f8f8f2',
      dim: '#6272a4'
    }
  },
  monokai: {
    name: 'Monokai',
    colors: {
      primary: '#66d9ef',
      secondary: '#ae81ff',
      success: '#a6e22e',
      error: '#f92672',
      warning: '#fd971f',
      info: '#66d9ef',
      text: '#f8f8f2',
      dim: '#75715e'
    }
  },
  github: {
    name: 'GitHub',
    colors: {
      primary: '#0969da',
      secondary: '#8250df',
      success: '#1a7f37',
      error: '#cf222e',
      warning: '#9a6700',
      info: '#0969da',
      text: '#1f2328',
      dim: '#656d76'
    }
  },
  nord: {
    name: 'Nord',
    colors: {
      primary: '#88c0d0',
      secondary: '#b48ead',
      success: '#a3be8c',
      error: '#bf616a',
      warning: '#ebcb8b',
      info: '#5e81ac',
      text: '#eceff4',
      dim: '#4c566a'
    }
  }
};

export class ThemeManager {
  private currentTheme: Theme;

  constructor(themeName?: string) {
    this.currentTheme = themes[themeName || 'default'] || themes.default;
  }

  setTheme(themeName: string): void {
    if (themes[themeName]) {
      this.currentTheme = themes[themeName];
    } else {
      console.log(chalk.yellow(`Theme "${themeName}" not found. Using default.`));
      this.currentTheme = themes.default;
    }
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  listThemes(): string[] {
    return Object.keys(themes);
  }

  // Color helper methods
  primary(text: string): string {
    return chalk.hex(this.currentTheme.colors.primary)(text);
  }

  secondary(text: string): string {
    return chalk.hex(this.currentTheme.colors.secondary)(text);
  }

  success(text: string): string {
    return chalk.hex(this.currentTheme.colors.success)(text);
  }

  error(text: string): string {
    return chalk.hex(this.currentTheme.colors.error)(text);
  }

  warning(text: string): string {
    return chalk.hex(this.currentTheme.colors.warning)(text);
  }

  info(text: string): string {
    return chalk.hex(this.currentTheme.colors.info)(text);
  }

  text(content: string): string {
    return chalk.hex(this.currentTheme.colors.text)(content);
  }

  dim(text: string): string {
    return chalk.hex(this.currentTheme.colors.dim)(text);
  }

  // Format helpers
  formatPrompt(text: string): string {
    return this.primary(`❯ ${text}`);
  }

  formatResponse(text: string): string {
    return this.text(text);
  }

  formatTool(name: string, status: 'running' | 'success' | 'error' = 'running'): string {
    const icon = status === 'running' ? '⚡' : status === 'success' ? '✓' : '✗';
    const color = status === 'running' ? this.info : status === 'success' ? this.success : this.error;
    return color(`${icon} ${name}`);
  }

  formatCommand(cmd: string): string {
    return this.secondary(`/${cmd}`);
  }

  formatStats(label: string, value: string | number): string {
    return `${this.dim(label + ':')} ${this.text(String(value))}`;
  }
}