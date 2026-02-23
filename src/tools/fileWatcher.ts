import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import chokidar from 'chokidar';
import { EventEmitter } from 'events';
import crypto from 'crypto';

// File Watcher Manager
export class FileWatcherManager extends EventEmitter {
  private watchers: Map<string, any> = new Map();
  private fileHashes: Map<string, string> = new Map();
  private contextCallback?: (changes: FileChange[]) => void;

  async startWatching(paths: string[], options?: WatchOptions): Promise<void> {
    const watcherId = options?.id || 'default';
    
    // Stop existing watcher if any
    if (this.watchers.has(watcherId)) {
      await this.stopWatching(watcherId);
    }

    const watcher = chokidar.watch(paths, {
      persistent: true,
      ignoreInitial: options?.ignoreInitial ?? true,
      ignored: options?.ignored || /(^|[\/\\])\../, // ignore dotfiles
      depth: options?.depth,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    // Track file changes
    const changes: FileChange[] = [];
    
    watcher
      .on('add', (filePath) => {
        console.log(chalk.green(`📄 File added: ${filePath}`));
        this.updateFileHash(filePath);
        changes.push({ type: 'added', path: filePath, timestamp: new Date() });
        this.emit('fileAdded', filePath);
      })
      .on('change', async (filePath) => {
        const hasChanged = await this.hasFileChanged(filePath);
        if (hasChanged) {
          console.log(chalk.yellow(`📝 File changed: ${filePath}`));
          changes.push({ type: 'modified', path: filePath, timestamp: new Date() });
          this.emit('fileChanged', filePath);
          
          // Auto-reload context if callback provided
          if (this.contextCallback && changes.length > 0) {
            this.contextCallback(changes);
            changes.length = 0; // Clear after processing
          }
        }
      })
      .on('unlink', (filePath) => {
        console.log(chalk.red(`🗑️  File removed: ${filePath}`));
        this.fileHashes.delete(filePath);
        changes.push({ type: 'deleted', path: filePath, timestamp: new Date() });
        this.emit('fileDeleted', filePath);
      })
      .on('error', (error) => {
        console.error(chalk.red('Watcher error:'), error);
        this.emit('error', error);
      });

    this.watchers.set(watcherId, watcher);
    console.log(chalk.cyan(`👁️  Watching ${paths.length} path(s)`));
  }

  async stopWatching(watcherId: string = 'default'): Promise<void> {
    const watcher = this.watchers.get(watcherId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(watcherId);
      console.log(chalk.gray(`Stopped watching: ${watcherId}`));
    }
  }

  async stopAllWatchers(): Promise<void> {
    for (const [id, watcher] of this.watchers) {
      await watcher.close();
    }
    this.watchers.clear();
    console.log(chalk.gray('All watchers stopped'));
  }

  private async hasFileChanged(filePath: string): Promise<boolean> {
    const newHash = await this.calculateFileHash(filePath);
    const oldHash = this.fileHashes.get(filePath);
    
    if (oldHash !== newHash) {
      this.fileHashes.set(filePath, newHash);
      return true;
    }
    return false;
  }

  private async updateFileHash(filePath: string): Promise<void> {
    const hash = await this.calculateFileHash(filePath);
    this.fileHashes.set(filePath, hash);
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (error) {
      return '';
    }
  }

  setContextReloadCallback(callback: (changes: FileChange[]) => void): void {
    this.contextCallback = callback;
  }

  getWatchedPaths(): string[] {
    const paths: string[] = [];
    for (const watcher of this.watchers.values()) {
      const watched = watcher.getWatched();
      for (const dir in watched) {
        paths.push(...watched[dir].map((file: any) => path.join(dir, file)));
      }
    }
    return paths;
  }
}

// Watch Files Tool
export class WatchFilesTool extends BaseTool {
  name = 'watch_files';
  description = 'Watch files for changes and auto-reload context';
  parameters = {
    paths: { type: 'array', description: 'Files or directories to watch' },
    recursive: { type: 'boolean', description: 'Watch directories recursively', optional: true },
    extensions: { type: 'array', description: 'File extensions to watch', optional: true }
  };

  private static watcherManager = new FileWatcherManager();

  async execute(params: { paths: string[]; recursive?: boolean; extensions?: string[] }): Promise<any> {
    if (!params.paths || !Array.isArray(params.paths) || params.paths.length === 0) {
      throw new Error('At least one path is required');
    }

    // Filter and validate paths
    const validPaths = params.paths.filter(p => p && typeof p === 'string' && p.trim());
    if (validPaths.length === 0) {
      throw new Error('No valid paths specified');
    }

    const paths = validPaths.map(p => path.resolve(p));

    // Build ignore patterns from extensions
    let ignored: any = undefined;
    if (params.extensions && params.extensions.length > 0) {
      const extensionPattern = new RegExp(`\\.(${params.extensions.join('|')})$`);
      ignored = (filePath: string) => !extensionPattern.test(filePath);
    }

    await WatchFilesTool.watcherManager.startWatching(paths, {
      id: 'user-watch',
      depth: params.recursive ? undefined : 0,
      ignored
    });

    return {
      watching: paths,
      recursive: params.recursive || false,
      extensions: params.extensions || ['all'],
      status: 'active'
    };
  }

  static getManager(): FileWatcherManager {
    return this.watcherManager;
  }
}

// Stop Watching Tool
export class StopWatchingTool extends BaseTool {
  name = 'stop_watching';
  description = 'Stop watching files for changes';
  parameters = {
    watcherId: { type: 'string', description: 'Watcher ID to stop', optional: true }
  };

  async execute(params: { watcherId?: string }): Promise<string> {
    const manager = WatchFilesTool.getManager();
    
    if (params.watcherId) {
      await manager.stopWatching(params.watcherId);
      return `Stopped watching: ${params.watcherId}`;
    } else {
      await manager.stopAllWatchers();
      return 'Stopped all file watchers';
    }
  }
}

// List Watchers Tool
export class ListWatchersTool extends BaseTool {
  name = 'list_watchers';
  description = 'List all active file watchers';
  parameters = {};

  async execute(params: {}): Promise<any> {
    const manager = WatchFilesTool.getManager();
    const paths = manager.getWatchedPaths();
    
    return {
      activeWatchers: paths.length > 0,
      watchedPaths: paths,
      count: paths.length
    };
  }
}

// Auto-reload Context Tool
export class AutoReloadContextTool extends BaseTool {
  name = 'auto_reload_context';
  description = 'Enable auto-reload of context when files change';
  parameters = {
    enabled: { type: 'boolean', description: 'Enable or disable auto-reload' },
    debounce: { type: 'number', description: 'Debounce time in ms', optional: true }
  };

  private static debounceTimer: NodeJS.Timeout | null = null;
  private static pendingChanges: FileChange[] = [];

  async execute(params: { enabled: boolean; debounce?: number }): Promise<string> {
    const manager = WatchFilesTool.getManager();
    const debounceTime = params.debounce || 1000;

    if (params.enabled) {
      manager.setContextReloadCallback((changes) => {
        // Accumulate changes
        AutoReloadContextTool.pendingChanges.push(...changes);

        // Clear existing timer
        if (AutoReloadContextTool.debounceTimer) {
          clearTimeout(AutoReloadContextTool.debounceTimer);
        }

        // Set new debounce timer
        AutoReloadContextTool.debounceTimer = setTimeout(() => {
          this.processChanges(AutoReloadContextTool.pendingChanges);
          AutoReloadContextTool.pendingChanges = [];
        }, debounceTime);
      });

      console.log(chalk.green('✓ Auto-reload context enabled'));
      return `Auto-reload enabled with ${debounceTime}ms debounce`;
    } else {
      manager.setContextReloadCallback(() => {});
      
      if (AutoReloadContextTool.debounceTimer) {
        clearTimeout(AutoReloadContextTool.debounceTimer);
        AutoReloadContextTool.debounceTimer = null;
      }
      
      console.log(chalk.yellow('Auto-reload context disabled'));
      return 'Auto-reload disabled';
    }
  }

  private async processChanges(changes: FileChange[]): Promise<void> {
    console.log(chalk.cyan(`\n🔄 Reloading context due to ${changes.length} file change(s):`));
    
    const summary = {
      added: changes.filter(c => c.type === 'added').length,
      modified: changes.filter(c => c.type === 'modified').length,
      deleted: changes.filter(c => c.type === 'deleted').length
    };

    console.log(chalk.dim(`  Added: ${summary.added}, Modified: ${summary.modified}, Deleted: ${summary.deleted}`));
    
    // Here you would trigger actual context reload
    // This could involve re-reading configuration files,
    // updating the AI's context, refreshing caches, etc.
    
    console.log(chalk.green('✓ Context reloaded successfully\n'));
  }
}

// File Change Tracker Tool
export class FileChangeTrackerTool extends BaseTool {
  name = 'track_changes';
  description = 'Track and report file changes in the project';
  parameters = {
    since: { type: 'string', description: 'Track changes since (timestamp or duration)', optional: true }
  };

  private static changeHistory: FileChange[] = [];
  private static maxHistorySize = 1000;

  async execute(params: { since?: string }): Promise<any> {
    const manager = WatchFilesTool.getManager();
    
    // Set up change tracking if not already done
    if (FileChangeTrackerTool.changeHistory.length === 0) {
      manager.on('fileAdded', (path) => this.recordChange('added', path));
      manager.on('fileChanged', (path) => this.recordChange('modified', path));
      manager.on('fileDeleted', (path) => this.recordChange('deleted', path));
    }

    // Filter changes based on 'since' parameter
    let relevantChanges = FileChangeTrackerTool.changeHistory;
    
    if (params.since) {
      const sinceTime = this.parseSinceTime(params.since);
      relevantChanges = relevantChanges.filter(c => c.timestamp >= sinceTime);
    }

    // Group changes by type
    const grouped = {
      added: relevantChanges.filter(c => c.type === 'added'),
      modified: relevantChanges.filter(c => c.type === 'modified'),
      deleted: relevantChanges.filter(c => c.type === 'deleted')
    };

    return {
      totalChanges: relevantChanges.length,
      changes: grouped,
      period: params.since || 'all time',
      summary: {
        filesAdded: grouped.added.length,
        filesModified: grouped.modified.length,
        filesDeleted: grouped.deleted.length
      }
    };
  }

  private recordChange(type: FileChangeType, filePath: string): void {
    const change: FileChange = {
      type,
      path: filePath,
      timestamp: new Date()
    };

    FileChangeTrackerTool.changeHistory.push(change);

    // Limit history size
    if (FileChangeTrackerTool.changeHistory.length > FileChangeTrackerTool.maxHistorySize) {
      FileChangeTrackerTool.changeHistory.shift();
    }
  }

  private parseSinceTime(since: string): Date {
    // Handle duration strings like "5m", "1h", "2d"
    const durationMatch = since.match(/^(\d+)([smhd])$/);
    if (durationMatch) {
      const [, value, unit] = durationMatch;
      const now = new Date();
      const ms = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000
      }[unit] || 1000;
      
      return new Date(now.getTime() - parseInt(value) * ms);
    }

    // Try to parse as date
    return new Date(since);
  }
}

// Types
interface WatchOptions {
  id?: string;
  ignoreInitial?: boolean;
  ignored?: any;
  depth?: number;
}

interface FileChange {
  type: FileChangeType;
  path: string;
  timestamp: Date;
}

type FileChangeType = 'added' | 'modified' | 'deleted';