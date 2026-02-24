/**
 * Watch Mode
 * Monitors source files for special AI comments (// AI! and // AI?)
 * and triggers edits or questions automatically.
 *
 * Usage: canvas watch [--root <dir>]
 */

import fs from 'fs-extra';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface WatchTrigger {
  type: 'edit' | 'question';
  filePath: string;
  line: number;
  comment: string;
  fullLine: string;
}

export interface WatchConfig {
  root: string;
  patterns: string[];
  editMarker: string;
  questionMarker: string;
  debounceMs: number;
}

const DEFAULT_CONFIG: WatchConfig = {
  root: process.cwd(),
  patterns: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.js', 'src/**/*.jsx'],
  editMarker: '// AI!',
  questionMarker: '// AI?',
  debounceMs: 1000,
};

export class WatchMode extends EventEmitter {
  private config: WatchConfig;
  private watcher: fs.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private active = false;

  constructor(config?: Partial<WatchConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start watching for AI comments
   */
  async start(): Promise<void> {
    if (this.active) return;

    const chokidar = await import('chokidar');
    this.watcher = chokidar.watch(this.config.patterns, {
      cwd: this.config.root,
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    });

    this.watcher.on('change', (filePath: string) => {
      this.handleFileChange(path.join(this.config.root, filePath));
    });

    this.active = true;
    this.emit('started');
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.active = false;
    this.emit('stopped');
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Handle a file change — scan for AI markers
   */
  private handleFileChange(filePath: string): void {
    // Debounce per file
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.scanFile(filePath);
    }, this.config.debounceMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Scan a file for AI markers
   */
  private async scanFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes(this.config.editMarker)) {
          const comment = line.split(this.config.editMarker)[1]?.trim() || '';
          const trigger: WatchTrigger = {
            type: 'edit',
            filePath,
            line: i + 1,
            comment,
            fullLine: line,
          };
          this.emit('trigger', trigger);
        }

        if (line.includes(this.config.questionMarker)) {
          const comment = line.split(this.config.questionMarker)[1]?.trim() || '';
          const trigger: WatchTrigger = {
            type: 'question',
            filePath,
            line: i + 1,
            comment,
            fullLine: line,
          };
          this.emit('trigger', trigger);
        }
      }
    } catch {
      // Skip files we can't read
    }
  }
}
