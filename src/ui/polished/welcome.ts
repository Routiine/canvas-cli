/**
 * Polished Welcome Screen - Clean, minimal branding
 */

import { PolishedTheme } from './theme.js';

export class Welcome {
  private theme: PolishedTheme;

  constructor(theme?: PolishedTheme) {
    this.theme = theme || new PolishedTheme('claude');
  }

  /**
   * Render minimal welcome
   */
  minimal(version: string = '3.0.0'): void {
    console.log('');
    console.log(`  ${this.theme.text('canvas')} ${this.theme.muted(`v${version}`)}`);
    console.log('');
  }

  /**
   * Render standard welcome with ASCII art
   */
  standard(version: string = '3.0.0'): void {
    console.clear();
    console.log('');

    // Simple, clean ASCII logo
    const logo = [
      '   ___   __ _  _ __ __   __ __ _  ___',
      '  / __| / _` || \'_ \\\\ \\ / // _` |/ __|',
      ' | (__ | (_| || | | |\\ V /| (_| |\\__ \\',
      '  \\___| \\__,_||_| |_| \\_/  \\__,_||___/'
    ];

    logo.forEach(line => {
      console.log(`  ${this.theme.accent(line)}`);
    });

    console.log('');
    console.log(`  ${this.theme.dim('Production-ready AI CLI for Ollama')} ${this.theme.muted(`v${version}`)}`);
    console.log('');
    console.log(this.theme.borderDim('  ' + '─'.repeat(50)));
    console.log('');
  }

  /**
   * Render compact header (for ongoing sessions)
   */
  compact(): void {
    console.log('');
    console.log(`  ${this.theme.accent('canvas')} ${this.theme.muted('ready')}`);
    console.log('');
  }

  /**
   * Render session start info
   */
  sessionStart(config: { model?: string; mode?: string; tools?: number }): void {
    console.log('');

    if (config.model) {
      console.log(`  ${this.theme.dim('model')}   ${this.theme.text(config.model)}`);
    }

    if (config.mode) {
      console.log(`  ${this.theme.dim('mode')}    ${this.theme.text(config.mode)}`);
    }

    if (config.tools !== undefined) {
      console.log(`  ${this.theme.dim('tools')}   ${this.theme.text(config.tools.toString())} available`);
    }

    console.log('');
  }

  /**
   * Render tips/shortcuts
   */
  tips(): void {
    const tips = [
      ['/help', 'show commands'],
      ['/tools', 'list tools'],
      ['/exec', 'toggle execution mode'],
      ['exit', 'quit']
    ];

    console.log(`  ${this.theme.dim('shortcuts')}`);
    tips.forEach(([cmd, desc]) => {
      console.log(`    ${this.theme.accent(cmd.padEnd(10))} ${this.theme.muted(desc)}`);
    });
    console.log('');
  }

  /**
   * Render goodbye message
   */
  goodbye(): void {
    console.log('');
    console.log(`  ${this.theme.muted('goodbye')}`);
    console.log('');
  }

  /**
   * Render error on startup
   */
  startupError(error: string): void {
    console.log('');
    console.log(`  ${this.theme.error('✗')} ${this.theme.text('Startup failed')}`);
    console.log(`    ${this.theme.dim(error)}`);
    console.log('');
  }

  /**
   * Render connection status
   */
  connectionStatus(connected: boolean, url?: string): void {
    if (connected) {
      console.log(`  ${this.theme.success('✓')} ${this.theme.dim('connected to')} ${this.theme.text(url || 'Ollama')}`);
    } else {
      console.log(`  ${this.theme.error('✗')} ${this.theme.dim('cannot reach')} ${this.theme.text(url || 'Ollama')}`);
      console.log(`    ${this.theme.muted('Make sure Ollama is running: ollama serve')}`);
    }
  }
}

// Singleton
let welcomeInstance: Welcome | null = null;

export function getWelcome(): Welcome {
  if (!welcomeInstance) {
    welcomeInstance = new Welcome();
  }
  return welcomeInstance;
}