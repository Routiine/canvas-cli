/**
 * File Service for Canvas CLI
 * Handles file operations with backups and recovery
 */

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { glob } from 'glob';
import { EventEmitter } from 'events';

export interface FileBackup {
  id: string;
  originalPath: string;
  backupPath: string;
  timestamp: Date;
  hash: string;
  size: number;
}

export interface FileOperation {
  type: 'create' | 'update' | 'delete' | 'move' | 'copy';
  path: string;
  content?: string;
  destination?: string;
  backup?: FileBackup;
}

export interface FileSearchOptions {
  pattern?: string;
  extensions?: string[];
  excludePaths?: string[];
  maxDepth?: number;
  includeHidden?: boolean;
}

export class FileService extends EventEmitter {
  private backupDir: string;
  private maxBackups: number;
  private operations: FileOperation[] = [];
  private backups: Map<string, FileBackup[]> = new Map();

  constructor(backupDir?: string, maxBackups: number = 10) {
    super();
    this.backupDir = backupDir || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.canvas-cli', 'backups');
    this.maxBackups = maxBackups;
    void this.initializeBackupDirectory();
  }

  private async initializeBackupDirectory(): Promise<void> {
    await fs.ensureDir(this.backupDir);
  }

  /**
   * Read a file with automatic backup
   */
  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    try {
      const absolutePath = path.resolve(filePath);
      const content = await fs.readFile(absolutePath, encoding);
      this.emit('file-read', { path: absolutePath });
      return content;
    } catch (error: any) {
      this.emit('file-error', { path: filePath, error: error.message });
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Write a file with automatic backup
   */
  async writeFile(filePath: string, content: string, createBackup: boolean = true): Promise<void> {
    try {
      const absolutePath = path.resolve(filePath);
      
      // Create backup if file exists
      if (createBackup && await fs.pathExists(absolutePath)) {
        await this.createBackup(absolutePath);
      }

      // Ensure directory exists
      await fs.ensureDir(path.dirname(absolutePath));
      
      // Write file
      await fs.writeFile(absolutePath, content, 'utf-8');
      
      // Record operation
      this.operations.push({
        type: 'update',
        path: absolutePath,
        content
      });

      this.emit('file-written', { path: absolutePath });
    } catch (error: any) {
      this.emit('file-error', { path: filePath, error: error.message });
      throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Create a backup of a file
   */
  async createBackup(filePath: string): Promise<FileBackup> {
    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf-8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const timestamp = new Date();
    const backupId = `${Date.now()}-${hash.substring(0, 8)}`;
    const backupPath = path.join(this.backupDir, `${backupId}-${path.basename(filePath)}`);

    await fs.writeFile(backupPath, content);

    const backup: FileBackup = {
      id: backupId,
      originalPath: absolutePath,
      backupPath,
      timestamp,
      hash,
      size: content.length
    };

    // Store backup reference
    if (!this.backups.has(absolutePath)) {
      this.backups.set(absolutePath, []);
    }
    
    const fileBackups = this.backups.get(absolutePath)!;
    fileBackups.push(backup);

    // Limit number of backups
    if (fileBackups.length > this.maxBackups) {
      const oldBackup = fileBackups.shift();
      if (oldBackup) {
        await fs.remove(oldBackup.backupPath);
      }
    }

    this.emit('backup-created', backup);
    return backup;
  }

  /**
   * Restore a file from backup
   */
  async restoreBackup(backupId: string): Promise<void> {
    let backup: FileBackup | undefined;
    let originalPath: string | undefined;

    // Find the backup
    for (const [path, backups] of this.backups) {
      const found = backups.find(b => b.id === backupId);
      if (found) {
        backup = found;
        originalPath = path;
        break;
      }
    }

    if (!backup || !originalPath) {
      throw new Error(`Backup ${backupId} not found`);
    }

    // Restore the file
    const content = await fs.readFile(backup.backupPath, 'utf-8');
    await fs.writeFile(originalPath, content);

    this.emit('backup-restored', backup);
  }

  /**
   * List all backups for a file
   */
  getBackups(filePath: string): FileBackup[] {
    const absolutePath = path.resolve(filePath);
    return this.backups.get(absolutePath) || [];
  }

  /**
   * Delete a file with backup
   */
  async deleteFile(filePath: string, createBackup: boolean = true): Promise<void> {
    try {
      const absolutePath = path.resolve(filePath);
      
      if (createBackup && await fs.pathExists(absolutePath)) {
        await this.createBackup(absolutePath);
      }

      await fs.remove(absolutePath);
      
      this.operations.push({
        type: 'delete',
        path: absolutePath
      });

      this.emit('file-deleted', { path: absolutePath });
    } catch (error: any) {
      this.emit('file-error', { path: filePath, error: error.message });
      throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Move a file
   */
  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      const absoluteSource = path.resolve(sourcePath);
      const absoluteDest = path.resolve(destPath);
      
      await fs.ensureDir(path.dirname(absoluteDest));
      await fs.move(absoluteSource, absoluteDest, { overwrite: true });
      
      this.operations.push({
        type: 'move',
        path: absoluteSource,
        destination: absoluteDest
      });

      this.emit('file-moved', { from: absoluteSource, to: absoluteDest });
    } catch (error: any) {
      this.emit('file-error', { path: sourcePath, error: error.message });
      throw new Error(`Failed to move file: ${error.message}`);
    }
  }

  /**
   * Copy a file
   */
  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      const absoluteSource = path.resolve(sourcePath);
      const absoluteDest = path.resolve(destPath);
      
      await fs.ensureDir(path.dirname(absoluteDest));
      await fs.copy(absoluteSource, absoluteDest, { overwrite: true });
      
      this.operations.push({
        type: 'copy',
        path: absoluteSource,
        destination: absoluteDest
      });

      this.emit('file-copied', { from: absoluteSource, to: absoluteDest });
    } catch (error: any) {
      this.emit('file-error', { path: sourcePath, error: error.message });
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
   * Search for files
   */
  async searchFiles(baseDir: string, options: FileSearchOptions = {}): Promise<string[]> {
    const {
      pattern = '**/*',
      extensions = [],
      excludePaths = ['node_modules', '.git', 'dist', 'build'],
      includeHidden = false
    } = options;

    let searchPattern = path.join(baseDir, pattern);
    
    if (extensions.length > 0) {
      const extPattern = extensions.length === 1 
        ? extensions[0] 
        : `{${extensions.join(',')}}`;
      searchPattern = path.join(baseDir, '**', `*${extPattern}`);
    }

    const files = await glob(searchPattern, {
      ignore: excludePaths.map(p => path.join(baseDir, '**', p, '**')),
      dot: includeHidden,
      nodir: true
    });

    return files;
  }

  /**
   * Get file statistics
   */
  async getFileStats(filePath: string): Promise<fs.Stats> {
    const absolutePath = path.resolve(filePath);
    return await fs.stat(absolutePath);
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    const absolutePath = path.resolve(filePath);
    return await fs.pathExists(absolutePath);
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath: string): Promise<void> {
    const absolutePath = path.resolve(dirPath);
    await fs.ensureDir(absolutePath);
    this.emit('directory-created', { path: absolutePath });
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    const absolutePath = path.resolve(dirPath);
    const items = await fs.readdir(absolutePath);
    return items.map(item => path.join(absolutePath, item));
  }

  /**
   * Get recent operations
   */
  getRecentOperations(limit: number = 10): FileOperation[] {
    return this.operations.slice(-limit);
  }

  /**
   * Clear operation history
   */
  clearOperationHistory(): void {
    this.operations = [];
  }

  /**
   * Undo last operation
   */
  async undoLastOperation(): Promise<void> {
    const lastOp = this.operations.pop();
    if (!lastOp) {
      throw new Error('No operations to undo');
    }

    switch (lastOp.type) {
      case 'create':
      case 'update':
        if (lastOp.backup) {
          await this.restoreBackup(lastOp.backup.id);
        }
        break;
      case 'delete':
        if (lastOp.backup) {
          await this.restoreBackup(lastOp.backup.id);
        }
        break;
      case 'move':
        if (lastOp.destination) {
          await fs.move(lastOp.destination, lastOp.path, { overwrite: true });
        }
        break;
      case 'copy':
        if (lastOp.destination) {
          await fs.remove(lastOp.destination);
        }
        break;
    }

    this.emit('operation-undone', lastOp);
  }
}

// Export singleton instance
export const fileService = new FileService();