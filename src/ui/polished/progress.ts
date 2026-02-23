/**
 * Polished Progress System - Smooth, informative progress indicators
 */

import chalk from 'chalk';
import { PolishedTheme } from './theme.js';

export interface ProgressConfig {
  text?: string;
  showDots?: boolean;
  showElapsed?: boolean;
}

/**
 * Elegant spinner with smooth animation
 */
export class Spinner {
  private frames = ['◐', '◓', '◑', '◒'];
  private dotFrames = ['   ', '.  ', '.. ', '...'];
  private frameIndex = 0;
  private dotIndex = 0;
  private interval: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private theme: PolishedTheme;
  private text: string;
  private config: ProgressConfig;

  constructor(text: string = '', config: ProgressConfig = {}) {
    this.theme = new PolishedTheme('claude');
    this.text = text;
    this.config = {
      showDots: true,
      showElapsed: false,
      ...config
    };
  }

  start(): this {
    if (this.interval) return this;

    this.startTime = Date.now();
    process.stdout.write('\x1B[?25l'); // Hide cursor

    this.interval = setInterval(() => {
      this.render();
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.dotIndex = (this.dotIndex + 1) % this.dotFrames.length;
    }, 100);

    return this;
  }

  private render(): void {
    const spinner = this.theme.accent(this.frames[this.frameIndex]);
    const dots = this.config.showDots ? this.theme.muted(this.dotFrames[this.dotIndex]) : '';
    const text = this.theme.dim(this.text);

    let elapsed = '';
    if (this.config.showElapsed) {
      const ms = Date.now() - this.startTime;
      elapsed = this.theme.muted(` ${this.formatElapsed(ms)}`);
    }

    const line = `  ${spinner} ${text}${dots}${elapsed}`;
    process.stdout.write(`\r${line}\x1B[K`); // Clear to end of line
  }

  update(text: string): this {
    this.text = text;
    return this;
  }

  succeed(text?: string): void {
    this.stop();
    const icon = this.theme.success('✓');
    const message = text || this.text;
    console.log(`  ${icon} ${this.theme.text(message)}`);
  }

  fail(text?: string): void {
    this.stop();
    const icon = this.theme.error('✗');
    const message = text || this.text;
    console.log(`  ${icon} ${this.theme.text(message)}`);
  }

  warn(text?: string): void {
    this.stop();
    const icon = this.theme.warning('!');
    const message = text || this.text;
    console.log(`  ${icon} ${this.theme.text(message)}`);
  }

  info(text?: string): void {
    this.stop();
    const icon = this.theme.info('i');
    const message = text || this.text;
    console.log(`  ${icon} ${this.theme.dim(message)}`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write('\r\x1B[K'); // Clear line
    process.stdout.write('\x1B[?25h'); // Show cursor
  }

  private formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}

/**
 * Progress bar with percentage
 */
export class ProgressBar {
  private width: number;
  private theme: PolishedTheme;
  private current: number = 0;
  private total: number;
  private text: string;

  constructor(total: number, text: string = '', width: number = 30) {
    this.total = total;
    this.text = text;
    this.width = width;
    this.theme = new PolishedTheme('claude');
  }

  update(current: number, text?: string): void {
    this.current = Math.min(current, this.total);
    if (text) this.text = text;
    this.render();
  }

  increment(text?: string): void {
    this.update(this.current + 1, text);
  }

  private render(): void {
    const percent = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.round(percent * this.width);
    const empty = this.width - filled;

    const bar = this.theme.accent('█'.repeat(filled)) +
                this.theme.borderDim('░'.repeat(empty));

    const percentText = this.theme.dim(`${Math.round(percent * 100)}%`);
    const label = this.text ? this.theme.dim(` ${this.text}`) : '';

    process.stdout.write(`\r  ${bar} ${percentText}${label}\x1B[K`);
  }

  finish(text?: string): void {
    this.update(this.total);
    console.log('');
    if (text) {
      const icon = this.theme.success('✓');
      console.log(`  ${icon} ${this.theme.text(text)}`);
    }
  }
}

/**
 * Step-based progress indicator
 */
export class Steps {
  private steps: string[];
  private currentStep: number = 0;
  private theme: PolishedTheme;

  constructor(steps: string[]) {
    this.steps = steps;
    this.theme = new PolishedTheme('claude');
  }

  start(): void {
    console.log('');
    this.render();
  }

  next(text?: string): void {
    if (this.currentStep < this.steps.length) {
      // Mark current as complete
      this.renderStep(this.currentStep, 'complete');
      this.currentStep++;

      // Show next step
      if (this.currentStep < this.steps.length) {
        const stepText = text || this.steps[this.currentStep];
        this.renderStep(this.currentStep, 'active', stepText);
      }
    }
  }

  complete(text?: string): void {
    this.renderStep(this.currentStep, 'complete');
    if (text) {
      console.log(`\n  ${this.theme.success('✓')} ${this.theme.text(text)}`);
    }
  }

  fail(text?: string): void {
    this.renderStep(this.currentStep, 'error');
    if (text) {
      console.log(`\n  ${this.theme.error('✗')} ${this.theme.text(text)}`);
    }
  }

  private render(): void {
    this.steps.forEach((step, i) => {
      const state = i < this.currentStep ? 'complete' :
                    i === this.currentStep ? 'active' : 'pending';
      this.renderStep(i, state, step);
    });
  }

  private renderStep(index: number, state: 'pending' | 'active' | 'complete' | 'error', text?: string): void {
    const stepText = text || this.steps[index];
    const num = index + 1;

    let icon: string;
    let label: string;

    switch (state) {
      case 'complete':
        icon = this.theme.success('✓');
        label = this.theme.dim(stepText);
        break;
      case 'active':
        icon = this.theme.accent('◆');
        label = this.theme.text(stepText);
        break;
      case 'error':
        icon = this.theme.error('✗');
        label = this.theme.error(stepText);
        break;
      default:
        icon = this.theme.muted('○');
        label = this.theme.muted(stepText);
    }

    console.log(`  ${icon} ${label}`);
  }
}

// Convenience functions
export function spinner(text: string, config?: ProgressConfig): Spinner {
  return new Spinner(text, config).start();
}

export function progressBar(total: number, text?: string): ProgressBar {
  return new ProgressBar(total, text);
}

export function steps(stepList: string[]): Steps {
  return new Steps(stepList);
}

export async function withSpinner<T>(
  text: string,
  action: () => Promise<T>,
  config?: ProgressConfig
): Promise<T> {
  const s = spinner(text, config);
  try {
    const result = await action();
    s.succeed();
    return result;
  } catch (error) {
    s.fail();
    throw error;
  }
}