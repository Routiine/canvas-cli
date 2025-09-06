import chalk from 'chalk';

export class AnimatedSpinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval: NodeJS.Timeout | null = null;
  private text: string = '';
  private color: string = 'cyan';

  constructor(text: string = 'Processing', color: string = 'cyan') {
    this.text = text;
    this.color = color;
  }

  start(): void {
    if (this.interval) return;
    
    // Hide cursor
    process.stdout.write('\x1B[?25l');
    
    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      const coloredFrame = (chalk as any)[this.color](frame);
      const message = `  ${coloredFrame} ${this.text}...`;
      
      // Clear line and write new frame
      process.stdout.write('\r' + message);
      
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop(success: boolean = true, message?: string): void {
    if (!this.interval) return;
    
    clearInterval(this.interval);
    this.interval = null;
    
    // Clear the line
    process.stdout.write('\r' + ' '.repeat(50) + '\r');
    
    // Show final message
    if (message) {
      const icon = success ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${icon} ${message}`);
    }
    
    // Show cursor again
    process.stdout.write('\x1B[?25h');
  }

  update(text: string): void {
    this.text = text;
  }
}

// Convenience functions
export function showSpinner(text: string = 'Processing'): AnimatedSpinner {
  const spinner = new AnimatedSpinner(text);
  spinner.start();
  return spinner;
}

export async function withSpinner<T>(
  text: string,
  action: () => Promise<T>,
  successMessage?: string
): Promise<T> {
  const spinner = showSpinner(text);
  try {
    const result = await action();
    spinner.stop(true, successMessage || `${text} complete`);
    return result;
  } catch (error) {
    spinner.stop(false, `${text} failed`);
    throw error;
  }
}