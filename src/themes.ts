/**
 * Canvas CLI Theme System - Muted Tone Color Schemes
 * Four distinctive palettes: Sage, Mauve, Slate, Bronze
 * Subtle, professional colors with excellent readability
 */

import chalk from 'chalk';
import type { Theme } from './types.js';

export const themes: Record<string, Theme> = {
  // Dusty Sage - muted green-gray, calming and natural
  sage: {
    name: 'Sage',
    colors: {
      primary: '#8a9a7c',      // Dusty sage green
      secondary: '#6b7a60',
      success: '#92a882',
      error: '#b87c7c',
      warning: '#c4a86c',
      info: '#7c9aa0',
      text: '#e2e5de',
      dim: '#5c6358'
    }
  },

  // Soft Mauve - dusty rose-purple, subtle and refined
  mauve: {
    name: 'Mauve',
    colors: {
      primary: '#a88a9a',      // Dusty mauve/rose
      secondary: '#8a6c7c',
      success: '#8aa882',
      error: '#b88080',
      warning: '#c4a878',
      info: '#8a9ab0',
      text: '#e8e2e5',
      dim: '#685c62'
    }
  },

  // Slate Blue - cool gray-blue, professional and calm (DEFAULT)
  slate: {
    name: 'Slate',
    colors: {
      primary: '#7a8a9c',      // Cool slate blue
      secondary: '#5c6a7c',
      success: '#7c9a88',
      error: '#a88080',
      warning: '#b8a878',
      info: '#88a0b8',
      text: '#e0e4e8',
      dim: '#586068'
    }
  },

  // Warm Bronze - desaturated copper, earthy and grounded
  bronze: {
    name: 'Bronze',
    colors: {
      primary: '#a08a78',      // Warm bronze/copper
      secondary: '#7c6a5c',
      success: '#8a9c7c',
      error: '#b08078',
      warning: '#c0a070',
      info: '#8898a8',
      text: '#e8e4e0',
      dim: '#68605a'
    }
  },

  // Default alias points to slate
  default: {
    name: 'Default',
    colors: {
      primary: '#7a8a9c',
      secondary: '#5c6a7c',
      success: '#7c9a88',
      error: '#a88080',
      warning: '#b8a878',
      info: '#88a0b8',
      text: '#e0e4e8',
      dim: '#586068'
    }
  }
};

export class ThemeManager {
  private currentTheme: Theme;

  constructor(themeName?: string) {
    this.currentTheme = themes[themeName || 'slate'] || themes.slate;
  }

  setTheme(themeName: string): void {
    if (themes[themeName]) {
      this.currentTheme = themes[themeName];
    } else {
      console.log(chalk.hex('#b8a878')(`Theme "${themeName}" not found. Using slate.`));
      this.currentTheme = themes.slate;
    }
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  listThemes(): string[] {
    return Object.keys(themes).filter(t => t !== 'default');
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
    return this.primary(`> ${text}`);
  }

  formatResponse(text: string): string {
    return this.text(text);
  }

  formatTool(name: string, status: 'running' | 'success' | 'error' = 'running'): string {
    const icon = status === 'running' ? '>' : status === 'success' ? '+' : 'x';
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
