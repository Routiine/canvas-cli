/**
 * Polished Output Formatting - Clean, readable output for all CLI responses
 */

import chalk from 'chalk';
import { PolishedTheme } from './theme.js';

export class OutputFormatter {
  private theme: PolishedTheme;
  private indent: string = '  ';

  constructor(theme?: PolishedTheme) {
    this.theme = theme || new PolishedTheme('claude');
  }

  /**
   * Format a heading
   */
  heading(text: string, level: 1 | 2 | 3 = 1): string {
    switch (level) {
      case 1:
        return `\n${this.indent}${this.theme.highlight(text)}\n`;
      case 2:
        return `\n${this.indent}${this.theme.accent(text)}\n`;
      case 3:
        return `${this.indent}${this.theme.dim(text)}`;
    }
  }

  /**
   * Format a section with title and content
   */
  section(title: string, content: string | string[]): string {
    const lines = Array.isArray(content) ? content : [content];
    const header = `${this.indent}${this.theme.accent(title)}`;
    const body = lines.map(l => `${this.indent}  ${this.theme.text(l)}`).join('\n');
    return `${header}\n${body}`;
  }

  /**
   * Format a list
   */
  list(items: string[], bullet: string = '•'): string {
    return items
      .map(item => `${this.indent}${this.theme.muted(bullet)} ${this.theme.text(item)}`)
      .join('\n');
  }

  /**
   * Format a numbered list
   */
  numberedList(items: string[]): string {
    return items
      .map((item, i) => {
        const num = this.theme.muted(`${i + 1}.`);
        return `${this.indent}${num} ${this.theme.text(item)}`;
      })
      .join('\n');
  }

  /**
   * Format key-value pairs
   */
  keyValue(pairs: Record<string, string | number | boolean>): string {
    const maxKeyLen = Math.max(...Object.keys(pairs).map(k => k.length));
    return Object.entries(pairs)
      .map(([key, value]) => {
        const paddedKey = key.padEnd(maxKeyLen);
        return `${this.indent}${this.theme.dim(paddedKey)}  ${this.theme.text(String(value))}`;
      })
      .join('\n');
  }

  /**
   * Format a table
   */
  table(headers: string[], rows: string[][]): string {
    const colWidths = headers.map((h, i) => {
      const values = [h, ...rows.map(r => r[i] || '')];
      return Math.max(...values.map(v => v.length));
    });

    const headerRow = headers
      .map((h, i) => this.theme.dim(h.padEnd(colWidths[i])))
      .join('  ');

    const separator = colWidths
      .map(w => this.theme.borderDim('─'.repeat(w)))
      .join('──');

    const dataRows = rows.map(row =>
      row
        .map((cell, i) => this.theme.text((cell || '').padEnd(colWidths[i])))
        .join('  ')
    );

    return [
      `${this.indent}${headerRow}`,
      `${this.indent}${separator}`,
      ...dataRows.map(r => `${this.indent}${r}`)
    ].join('\n');
  }

  /**
   * Format a code block
   */
  code(content: string, language?: string): string {
    const lines = content.split('\n');
    const header = language
      ? `${this.indent}${this.theme.borderDim('┌─')} ${this.theme.muted(language)}`
      : `${this.indent}${this.theme.borderDim('┌─')}`;

    const body = lines.map(l => `${this.indent}${this.theme.borderDim('│')} ${this.theme.code(l)}`);
    const footer = `${this.indent}${this.theme.borderDim('└─')}`;

    return [header, ...body, footer].join('\n');
  }

  /**
   * Format an inline code snippet
   */
  inlineCode(text: string): string {
    return this.theme.code(`\`${text}\``);
  }

  /**
   * Format a file path
   */
  filePath(path: string): string {
    const parts = path.split('/');
    const file = parts.pop() || '';
    const dir = parts.join('/');

    if (dir) {
      return `${this.theme.muted(dir + '/')}${this.theme.accent(file)}`;
    }
    return this.theme.accent(file);
  }

  /**
   * Format a command
   */
  command(cmd: string): string {
    return `${this.theme.muted('$')} ${this.theme.text(cmd)}`;
  }

  /**
   * Format a success message
   */
  success(message: string, details?: string): string {
    const icon = this.theme.success('✓');
    const main = `${this.indent}${icon} ${this.theme.text(message)}`;
    if (details) {
      return `${main}\n${this.indent}  ${this.theme.dim(details)}`;
    }
    return main;
  }

  /**
   * Format an error message
   */
  error(message: string, details?: string): string {
    const icon = this.theme.error('✗');
    const main = `${this.indent}${icon} ${this.theme.text(message)}`;
    if (details) {
      return `${main}\n${this.indent}  ${this.theme.dim(details)}`;
    }
    return main;
  }

  /**
   * Format a warning message
   */
  warning(message: string, details?: string): string {
    const icon = this.theme.warning('!');
    const main = `${this.indent}${icon} ${this.theme.text(message)}`;
    if (details) {
      return `${main}\n${this.indent}  ${this.theme.dim(details)}`;
    }
    return main;
  }

  /**
   * Format an info message
   */
  info(message: string, details?: string): string {
    const icon = this.theme.info('i');
    const main = `${this.indent}${icon} ${this.theme.dim(message)}`;
    if (details) {
      return `${main}\n${this.indent}  ${this.theme.muted(details)}`;
    }
    return main;
  }

  /**
   * Format a diff (added/removed lines)
   */
  diff(added: string[], removed: string[]): string {
    const lines: string[] = [];

    removed.forEach(line => {
      lines.push(`${this.indent}${this.theme.error('-')} ${this.theme.dim(line)}`);
    });

    added.forEach(line => {
      lines.push(`${this.indent}${this.theme.success('+')} ${this.theme.text(line)}`);
    });

    return lines.join('\n');
  }

  /**
   * Format a quote/blockquote
   */
  quote(text: string): string {
    return text
      .split('\n')
      .map(line => `${this.indent}${this.theme.borderDim('│')} ${this.theme.dim(line)}`)
      .join('\n');
  }

  /**
   * Format a horizontal rule
   */
  hr(width: number = 40): string {
    return `${this.indent}${this.theme.borderDim('─'.repeat(width))}`;
  }

  /**
   * Format empty/blank line
   */
  blank(): string {
    return '';
  }

  /**
   * Format a tool execution header
   */
  toolHeader(toolName: string, action?: string): string {
    const icon = this.theme.accent('▸');
    const name = this.theme.text(toolName);
    const actionText = action ? this.theme.dim(` ${action}`) : '';
    return `${this.indent}${icon} ${name}${actionText}`;
  }

  /**
   * Format a tool result
   */
  toolResult(status: 'success' | 'error' | 'warning', message: string): string {
    switch (status) {
      case 'success':
        return this.success(message);
      case 'error':
        return this.error(message);
      case 'warning':
        return this.warning(message);
    }
  }

  /**
   * Format thinking/processing indicator
   */
  thinking(text: string = 'Thinking'): string {
    return `${this.indent}${this.theme.muted('···')} ${this.theme.dim(text)}`;
  }
}

// Singleton instance
let formatterInstance: OutputFormatter | null = null;

export function getFormatter(): OutputFormatter {
  if (!formatterInstance) {
    formatterInstance = new OutputFormatter();
  }
  return formatterInstance;
}

// Convenience exports
export const fmt = getFormatter();