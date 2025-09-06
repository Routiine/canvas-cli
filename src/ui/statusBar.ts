import chalk from 'chalk';
import os from 'os';
import { performance } from 'perf_hooks';

interface StatusBarConfig {
  showMode?: boolean;
  showModel?: boolean;
  showMemory?: boolean;
  showTime?: boolean;
  showFiles?: boolean;
  showTokens?: boolean;
  position?: 'top' | 'bottom';
  width?: number;
}

export class StatusBar {
  private startTime: number;
  private mode: 'planning' | 'execution' = 'planning';
  private model: string = 'qwen2.5-coder:14b';
  private fileCount: number = 0;
  private tokenCount: { input: number; output: number } = { input: 0, output: 0 };
  private config: StatusBarConfig;
  private updateInterval: NodeJS.Timeout | null = null;
  
  constructor(config: StatusBarConfig = {}) {
    this.config = {
      showMode: true,
      showModel: true,
      showMemory: true,
      showTime: true,
      showFiles: false,
      showTokens: false,
      position: 'bottom',
      width: process.stdout.columns || 80,
      ...config
    };
    this.startTime = performance.now();
  }
  
  setMode(mode: 'planning' | 'execution'): void {
    this.mode = mode;
  }
  
  setModel(model: string): void {
    this.model = model;
  }
  
  setFileCount(count: number): void {
    this.fileCount = count;
  }
  
  updateTokens(input: number, output: number): void {
    this.tokenCount.input = input;
    this.tokenCount.output = output;
  }
  
  private getMemoryUsage(): string {
    const used = process.memoryUsage();
    const heapUsed = Math.round(used.heapUsed / 1024 / 1024);
    const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024);
    const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024);
    
    return `${heapUsed}MB | ${freeMem}/${totalMem}GB`;
  }
  
  private getSessionTime(): string {
    const elapsed = performance.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  private formatTokens(): string {
    const total = this.tokenCount.input + this.tokenCount.output;
    if (total === 0) return 'No tokens';
    
    // Format with K for thousands
    const formatNum = (n: number) => {
      if (n >= 1000) {
        return `${(n / 1000).toFixed(1)}K`;
      }
      return n.toString();
    };
    
    return `↓${formatNum(this.tokenCount.input)} ↑${formatNum(this.tokenCount.output)}`;
  }
  
  render(): string {
    const segments: string[] = [];
    
    // Mode indicator
    if (this.config.showMode) {
      const modeColor = this.mode === 'execution' ? '#ff6b6b' : '#888888';
      segments.push(chalk.hex(modeColor)(`[${this.mode.toUpperCase()}]`));
    }
    
    // Model
    if (this.config.showModel) {
      segments.push(chalk.hex('#606060')(`📊 ${this.model}`));
    }
    
    // Memory usage
    if (this.config.showMemory) {
      segments.push(chalk.hex('#505050')(`💾 ${this.getMemoryUsage()}`));
    }
    
    // Session time
    if (this.config.showTime) {
      segments.push(chalk.hex('#505050')(`⏱️ ${this.getSessionTime()}`));
    }
    
    // File count
    if (this.config.showFiles && this.fileCount > 0) {
      segments.push(chalk.hex('#505050')(`📁 ${this.fileCount} files`));
    }
    
    // Token usage
    if (this.config.showTokens && (this.tokenCount.input > 0 || this.tokenCount.output > 0)) {
      segments.push(chalk.hex('#505050')(`🔤 ${this.formatTokens()}`));
    }
    
    // Join segments with separator
    const statusText = segments.join(chalk.hex('#303030')(' │ '));
    
    // Create the status bar with borders
    const barWidth = this.config.width || process.stdout.columns || 80;
    const contentWidth = barWidth - 4; // Account for borders
    
    // Calculate padding
    const plainText = statusText.replace(/\x1b\[[0-9;]*m/g, ''); // Remove ANSI codes for length calculation
    const padding = Math.max(0, contentWidth - plainText.length);
    
    // Build the complete status bar
    const topBorder = chalk.hex('#303030')('  ┌' + '─'.repeat(contentWidth) + '┐');
    const content = chalk.hex('#303030')('  │ ') + statusText + ' '.repeat(padding) + chalk.hex('#303030')(' │');
    const bottomBorder = chalk.hex('#303030')('  └' + '─'.repeat(contentWidth) + '┘');
    
    return `${topBorder}\n${content}\n${bottomBorder}`;
  }
  
  display(): void {
    console.log(this.render());
  }
  
  // Start auto-updating status bar
  startLive(intervalMs: number = 1000): void {
    if (this.updateInterval) {
      this.stopLive();
    }
    
    this.updateInterval = setInterval(() => {
      // Save cursor position
      process.stdout.write('\x1b[s');
      
      // Move to status bar position
      if (this.config.position === 'top') {
        process.stdout.write('\x1b[H'); // Move to top
      } else {
        const lines = process.stdout.rows || 24;
        process.stdout.write(`\x1b[${lines - 3};0H`); // Move to bottom
      }
      
      // Clear lines and render status bar
      process.stdout.write('\x1b[K'); // Clear line
      console.log(this.render());
      
      // Restore cursor position
      process.stdout.write('\x1b[u');
    }, intervalMs);
  }
  
  stopLive(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
  
  // Compact inline status for minimal display
  getCompactStatus(): string {
    const modeIndicator = this.mode === 'execution' ? '●' : '○';
    const modeColor = this.mode === 'execution' ? '#ff6b6b' : '#888888';
    
    return chalk.hex(modeColor)(modeIndicator) + 
           chalk.hex('#404040')(` ${this.model} • ${this.getSessionTime()}`);
  }
  
  // Static method for quick status display
  static quickStatus(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const colors = {
      info: '#606060',
      success: '#00ff00',
      warning: '#ffaa00',
      error: '#ff0000'
    };
    
    const icons = {
      info: 'ℹ',
      success: '✓',
      warning: '⚠',
      error: '✗'
    };
    
    console.log(chalk.hex(colors[type])(`  ${icons[type]} ${message}`));
  }
}

// Singleton instance for global access
let statusBarInstance: StatusBar | null = null;

export function getStatusBar(config?: StatusBarConfig): StatusBar {
  if (!statusBarInstance) {
    statusBarInstance = new StatusBar(config);
  } else if (config) {
    // Update config if provided
    statusBarInstance = new StatusBar(config);
  }
  return statusBarInstance;
}

// Helper function to display a temporary status message
export function showStatus(message: string, duration: number = 3000): void {
  const bar = getStatusBar();
  
  // Save cursor position
  process.stdout.write('\x1b[s');
  
  // Move to bottom of screen
  const lines = process.stdout.rows || 24;
  process.stdout.write(`\x1b[${lines};0H`);
  
  // Clear line and show message
  process.stdout.write('\x1b[K');
  process.stdout.write(chalk.hex('#606060')(`  ${message}`));
  
  // Restore cursor after duration
  setTimeout(() => {
    process.stdout.write('\x1b[K'); // Clear the message
    process.stdout.write('\x1b[u'); // Restore cursor
  }, duration);
}