/**
 * Polished Status Line - Clean, informative, non-intrusive
 * Inspired by modern CLI tools like Claude Code
 */

import chalk from 'chalk';
import { PolishedTheme } from './theme.js';

export interface StatusLineConfig {
  mode?: 'dev' | 'plan' | 'chat';
  model?: string;
  tokens?: { used: number; limit?: number };
  cost?: number;
  duration?: number;
  showHelp?: boolean;
}

export class StatusLine {
  private theme: PolishedTheme;
  private config: StatusLineConfig;

  constructor(theme?: PolishedTheme) {
    this.theme = theme || new PolishedTheme('claude');
    this.config = {};
  }

  /**
   * Render a minimal status line
   */
  render(config: StatusLineConfig = {}): string {
    this.config = { ...this.config, ...config };
    const parts: string[] = [];

    // Mode indicator (subtle)
    if (this.config.mode) {
      const modeText = this.formatMode(this.config.mode);
      parts.push(modeText);
    }

    // Model (if specified)
    if (this.config.model) {
      parts.push(this.theme.dim(this.config.model));
    }

    // Token usage (if available)
    if (this.config.tokens) {
      const tokenText = this.formatTokens(this.config.tokens);
      parts.push(tokenText);
    }

    // Cost (if tracking)
    if (this.config.cost !== undefined) {
      parts.push(this.theme.muted(`$${this.config.cost.toFixed(4)}`));
    }

    // Duration
    if (this.config.duration !== undefined) {
      parts.push(this.theme.muted(this.formatDuration(this.config.duration)));
    }

    // Join with subtle separator
    const separator = this.theme.muted(' · ');
    return parts.join(separator);
  }

  /**
   * Render as a full-width bar
   */
  renderBar(config: StatusLineConfig = {}): string {
    const content = this.render(config);
    const width = process.stdout.columns || 80;
    const contentLength = this.stripAnsi(content).length;
    const padding = Math.max(0, width - contentLength - 4);

    return `  ${content}${' '.repeat(padding)}`;
  }

  /**
   * Render welcome/help hint
   */
  renderHint(): string {
    const hints = [
      this.theme.muted('Type'),
      this.theme.dim('/help'),
      this.theme.muted('for commands'),
      this.theme.muted('·'),
      this.theme.dim('/tools'),
      this.theme.muted('for tools'),
      this.theme.muted('·'),
      this.theme.dim('exit'),
      this.theme.muted('to quit')
    ];
    return `  ${hints.join(' ')}`;
  }

  /**
   * Render a separator line
   */
  renderSeparator(char: string = '─'): string {
    const width = Math.min(60, (process.stdout.columns || 80) - 4);
    return `  ${this.theme.borderDim(char.repeat(width))}`;
  }

  /**
   * Render prompt prefix
   */
  renderPrompt(prefix: string = '>'): string {
    return `  ${this.theme.accent(prefix)} `;
  }

  private formatMode(mode: string): string {
    const modeLabels: Record<string, { text: string; color: 'success' | 'info' | 'warning' }> = {
      dev: { text: 'dev', color: 'success' },
      plan: { text: 'plan', color: 'info' },
      chat: { text: 'chat', color: 'warning' }
    };

    const config = modeLabels[mode] || { text: mode, color: 'info' as const };
    return this.theme[config.color](config.text);
  }

  private formatTokens(tokens: { used: number; limit?: number }): string {
    const used = this.formatNumber(tokens.used);
    if (tokens.limit) {
      const percent = Math.round((tokens.used / tokens.limit) * 100);
      const color = percent > 80 ? 'warning' : percent > 50 ? 'dim' : 'muted';
      return this.theme[color](`${used}/${this.formatNumber(tokens.limit)}`);
    }
    return this.theme.muted(`${used} tokens`);
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  private formatNumber(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  }

  private stripAnsi(str: string): string {
    return str.replace(/\x1B\[[0-9;]*m/g, '');
  }
}

// Singleton instance
let statusLineInstance: StatusLine | null = null;

export function getStatusLine(): StatusLine {
  if (!statusLineInstance) {
    statusLineInstance = new StatusLine();
  }
  return statusLineInstance;
}