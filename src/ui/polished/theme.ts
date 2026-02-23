/**
 * Polished Theme System - Unique muted tone color schemes
 * Four distinctive palettes: Sage, Mauve, Slate, Bronze
 * Subtle, professional colors with excellent readability
 */

import chalk from 'chalk';

export interface PolishedColors {
  // Primary UI colors
  accent: string;        // Main accent color
  accentDim: string;     // Dimmed accent
  text: string;          // Primary text
  textDim: string;       // Secondary/dim text
  textMuted: string;     // Very dim text

  // Semantic colors
  success: string;
  error: string;
  warning: string;
  info: string;

  // Background hints (for borders, separators)
  border: string;
  borderDim: string;

  // Special
  highlight: string;
  code: string;
}

export const polishedThemes: Record<string, PolishedColors> = {
  // Dusty Sage - muted green-gray, calming and natural
  sage: {
    accent: '#8a9a7c',      // Dusty sage green
    accentDim: '#6b7a60',
    text: '#e2e5de',
    textDim: '#9ca396',
    textMuted: '#5c6358',
    success: '#92a882',
    error: '#b87c7c',
    warning: '#c4a86c',
    info: '#7c9aa0',
    border: '#3d423a',
    borderDim: '#2d312b',
    highlight: '#a8b89a',
    code: '#9cb89a'
  },

  // Soft Mauve - dusty rose-purple, subtle and refined
  mauve: {
    accent: '#a88a9a',      // Dusty mauve/rose
    accentDim: '#8a6c7c',
    text: '#e8e2e5',
    textDim: '#a89aa0',
    textMuted: '#685c62',
    success: '#8aa882',
    error: '#b88080',
    warning: '#c4a878',
    info: '#8a9ab0',
    border: '#423a3e',
    borderDim: '#322a2e',
    highlight: '#c0a0b0',
    code: '#b0a0b8'
  },

  // Slate Blue - cool gray-blue, professional and calm
  slate: {
    accent: '#7a8a9c',      // Cool slate blue
    accentDim: '#5c6a7c',
    text: '#e0e4e8',
    textDim: '#94a0ac',
    textMuted: '#586068',
    success: '#7c9a88',
    error: '#a88080',
    warning: '#b8a878',
    info: '#88a0b8',
    border: '#383e44',
    borderDim: '#282e34',
    highlight: '#98a8b8',
    code: '#90a8b0'
  },

  // Warm Bronze - desaturated copper, earthy and grounded
  bronze: {
    accent: '#a08a78',      // Warm bronze/copper
    accentDim: '#7c6a5c',
    text: '#e8e4e0',
    textDim: '#a89c94',
    textMuted: '#68605a',
    success: '#8a9c7c',
    error: '#b08078',
    warning: '#c0a070',
    info: '#8898a8',
    border: '#403a36',
    borderDim: '#302a26',
    highlight: '#c0a890',
    code: '#a8a090'
  }
};

export class PolishedTheme {
  private colors: PolishedColors;

  constructor(themeName: string = 'slate') {
    this.colors = polishedThemes[themeName] || polishedThemes.slate;
  }

  // Core text styling
  accent(text: string): string {
    return chalk.hex(this.colors.accent)(text);
  }

  accentDim(text: string): string {
    return chalk.hex(this.colors.accentDim)(text);
  }

  text(text: string): string {
    return chalk.hex(this.colors.text)(text);
  }

  dim(text: string): string {
    return chalk.hex(this.colors.textDim)(text);
  }

  muted(text: string): string {
    return chalk.hex(this.colors.textMuted)(text);
  }

  // Semantic styling
  success(text: string): string {
    return chalk.hex(this.colors.success)(text);
  }

  error(text: string): string {
    return chalk.hex(this.colors.error)(text);
  }

  warning(text: string): string {
    return chalk.hex(this.colors.warning)(text);
  }

  info(text: string): string {
    return chalk.hex(this.colors.info)(text);
  }

  code(text: string): string {
    return chalk.hex(this.colors.code)(text);
  }

  highlight(text: string): string {
    return chalk.hex(this.colors.highlight).bold(text);
  }

  // Border/separator
  border(text: string): string {
    return chalk.hex(this.colors.border)(text);
  }

  borderDim(text: string): string {
    return chalk.hex(this.colors.borderDim)(text);
  }

  // Compound styles
  label(label: string, value: string): string {
    return `${this.dim(label)} ${this.text(value)}`;
  }

  keyValue(key: string, value: string): string {
    return `${this.muted(key + ':')} ${this.text(value)}`;
  }

  // Icons with colors
  successIcon(): string {
    return this.success('✓');
  }

  errorIcon(): string {
    return this.error('✗');
  }

  warningIcon(): string {
    return this.warning('!');
  }

  infoIcon(): string {
    return this.info('i');
  }

  // Get raw colors for external use
  getColors(): PolishedColors {
    return this.colors;
  }

  // Set theme
  setTheme(themeName: string): void {
    this.colors = polishedThemes[themeName] || polishedThemes.slate;
  }

  // List available themes
  static listThemes(): string[] {
    return Object.keys(polishedThemes);
  }
}

// Default instance (slate is the default)
export const theme = new PolishedTheme('slate');