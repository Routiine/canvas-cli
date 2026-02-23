/**
 * Polished Prompt - Clean, minimal input experience
 */

import readline from 'readline';
import { PolishedTheme } from './theme.js';
import { StatusLine } from './status-line.js';

export interface PromptConfig {
  prefix?: string;
  placeholder?: string;
  showStatus?: boolean;
  showHint?: boolean;
  mode?: 'dev' | 'plan' | 'chat';
  model?: string;
  multiline?: boolean;
  clearScreen?: boolean;
}

export class Prompt {
  private theme: PolishedTheme;
  private statusLine: StatusLine;
  private config: PromptConfig;
  private history: string[] = [];
  private historyIndex: number = -1;

  constructor(config: PromptConfig = {}) {
    this.theme = new PolishedTheme('claude');
    this.statusLine = new StatusLine(this.theme);
    this.config = {
      prefix: '>',
      showStatus: true,
      showHint: true,
      mode: 'dev',
      clearScreen: false,
      ...config
    };
  }

  /**
   * Get input with polished styling
   */
  async getInput(): Promise<string> {
    if (this.config.clearScreen) {
      console.clear();
    }

    // Show status line if enabled
    if (this.config.showStatus) {
      console.log(this.statusLine.render({
        mode: this.config.mode,
        model: this.config.model
      }));
    }

    // Show hint on first prompt
    if (this.config.showHint) {
      console.log(this.statusLine.renderHint());
      this.config.showHint = false; // Only show once
    }

    // Blank line for breathing room
    console.log('');

    // Render prompt
    const promptText = `  ${this.theme.accent(this.config.prefix || '>')} `;

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        prompt: promptText
      });

      // Handle history navigation
      const stdin = process.stdin;
      if (stdin.isTTY) {
        stdin.setRawMode(true);
      }

      rl.prompt();

      rl.on('line', (input) => {
        const trimmed = input.trim();

        // Add to history if not empty and not duplicate
        if (trimmed && this.history[0] !== trimmed) {
          this.history.unshift(trimmed);
          if (this.history.length > 100) {
            this.history.pop();
          }
        }

        this.historyIndex = -1;
        rl.close();
        resolve(trimmed);
      });

      rl.on('close', () => {
        resolve('');
      });
    });
  }

  /**
   * Get multiline input (ends with empty line)
   */
  async getMultilineInput(): Promise<string> {
    console.log(this.theme.dim('  (Enter empty line to finish)'));
    console.log('');

    const lines: string[] = [];
    const promptText = `  ${this.theme.accent('│')} `;

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: promptText
      });

      rl.prompt();

      rl.on('line', (input) => {
        if (input === '') {
          rl.close();
          resolve(lines.join('\n'));
        } else {
          lines.push(input);
          rl.prompt();
        }
      });

      rl.on('close', () => {
        resolve(lines.join('\n'));
      });
    });
  }

  /**
   * Show a confirmation prompt
   */
  async confirm(message: string, defaultValue: boolean = true): Promise<boolean> {
    const hint = defaultValue ? 'Y/n' : 'y/N';
    const prompt = `  ${this.theme.text(message)} ${this.theme.dim(`(${hint})`)} `;

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(prompt, (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();

        if (normalized === '') {
          resolve(defaultValue);
        } else {
          resolve(normalized === 'y' || normalized === 'yes');
        }
      });
    });
  }

  /**
   * Show a selection prompt
   */
  async select(message: string, choices: string[]): Promise<number> {
    console.log(`  ${this.theme.text(message)}`);
    console.log('');

    choices.forEach((choice, i) => {
      const num = this.theme.accent(`${i + 1}`);
      console.log(`  ${num}. ${this.theme.text(choice)}`);
    });

    console.log('');
    const prompt = `  ${this.theme.dim('Enter number:')} `;

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const askAgain = () => {
        rl.question(prompt, (answer) => {
          const num = parseInt(answer, 10);
          if (num >= 1 && num <= choices.length) {
            rl.close();
            resolve(num - 1);
          } else {
            console.log(this.theme.error('  Invalid selection'));
            askAgain();
          }
        });
      };

      askAgain();
    });
  }

  /**
   * Show input with validation
   */
  async input(message: string, validate?: (value: string) => boolean | string): Promise<string> {
    const prompt = `  ${this.theme.text(message)} `;

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const askAgain = () => {
        rl.question(prompt, (answer) => {
          if (validate) {
            const result = validate(answer);
            if (result === true) {
              rl.close();
              resolve(answer);
            } else {
              const errorMsg = typeof result === 'string' ? result : 'Invalid input';
              console.log(this.theme.error(`  ${errorMsg}`));
              askAgain();
            }
          } else {
            rl.close();
            resolve(answer);
          }
        });
      };

      askAgain();
    });
  }

  /**
   * Update prompt configuration
   */
  setConfig(config: Partial<PromptConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update mode
   */
  setMode(mode: 'dev' | 'plan' | 'chat'): void {
    this.config.mode = mode;
  }

  /**
   * Update model
   */
  setModel(model: string): void {
    this.config.model = model;
  }
}

// Singleton instance
let promptInstance: Prompt | null = null;

export function getPrompt(config?: PromptConfig): Prompt {
  if (!promptInstance) {
    promptInstance = new Prompt(config);
  }
  return promptInstance;
}