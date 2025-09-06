/**
 * Canvas CLI Logger - Centralized logging system
 * Replaces console.log throughout the application
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

interface LoggerConfig {
  level: LogLevel;
  enableFile: boolean;
  enableConsole: boolean;
  logDir?: string;
  timestamp: boolean;
  colorize: boolean;
}

class Logger {
  private config: LoggerConfig;
  private logFile: string | null = null;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    success: 1
  };
  private colors: Record<LogLevel, (text: string) => string> = {
    debug: chalk.gray,
    info: chalk.blue,
    warn: chalk.yellow,
    error: chalk.red,
    success: chalk.green
  };

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      level: config?.level || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      enableFile: config?.enableFile || false,
      enableConsole: config?.enableConsole !== false,
      logDir: config?.logDir || path.join(os.homedir(), '.canvas-cli', 'logs'),
      timestamp: config?.timestamp !== false,
      colorize: config?.colorize !== false
    };

    if (this.config.enableFile) {
      this.initializeFileLogging();
    }
  }

  private initializeFileLogging(): void {
    try {
      fs.ensureDirSync(this.config.logDir!);
      const date = new Date().toISOString().split('T')[0];
      this.logFile = path.join(this.config.logDir!, `canvas-cli-${date}.log`);
    } catch (error) {
      // Fallback to console if file logging fails
      this.config.enableFile = false;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const parts: string[] = [];
    
    if (this.config.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    parts.push(`[${level.toUpperCase()}]`);
    parts.push(message);
    
    if (data !== undefined) {
      if (typeof data === 'object') {
        parts.push(JSON.stringify(data, null, 2));
      } else {
        parts.push(String(data));
      }
    }
    
    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, data);

    // Console output
    if (this.config.enableConsole) {
      const output = this.config.colorize 
        ? this.colors[level](formattedMessage)
        : formattedMessage;
      
      if (level === 'error') {
        console.error(output);
      } else {
        console.log(output);
      }
    }

    // File output
    if (this.config.enableFile && this.logFile) {
      try {
        fs.appendFileSync(this.logFile, formattedMessage + '\n');
      } catch (error) {
        // Silently fail file writing
      }
    }
  }

  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  success(message: string, data?: any): void {
    this.log('success', message, data);
  }

  // Convenience method for progress messages
  progress(message: string): void {
    if (this.config.enableConsole) {
      process.stdout.write('\r' + chalk.cyan(message));
    }
  }

  // Clear line for progress updates
  clearLine(): void {
    if (this.config.enableConsole) {
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
    }
  }

  // Update configuration
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setFileLogging(enabled: boolean): void {
    this.config.enableFile = enabled;
    if (enabled && !this.logFile) {
      this.initializeFileLogging();
    }
  }

  // Group logging for better organization
  group(label: string): void {
    this.info(`--- ${label} ---`);
  }

  groupEnd(): void {
    this.info('---');
  }

  // Table logging for structured data
  table(data: any[]): void {
    if (this.config.enableConsole && this.shouldLog('info')) {
      console.table(data);
    }
  }
}

// Create singleton instance
const logger = new Logger({
  level: process.env.LOG_LEVEL as LogLevel || 'info',
  enableFile: process.env.LOG_TO_FILE === 'true',
  enableConsole: process.env.LOG_TO_CONSOLE !== 'false'
});

// Export singleton and class
export { logger, Logger };

// Convenience exports
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
export const success = logger.success.bind(logger);
export const progress = logger.progress.bind(logger);

// Global console override (optional - can be enabled via environment variable)
if (process.env.OVERRIDE_CONSOLE === 'true') {
  console.log = logger.info.bind(logger);
  console.error = logger.error.bind(logger);
  console.warn = logger.warn.bind(logger);
  console.debug = logger.debug.bind(logger);
}

export default logger;