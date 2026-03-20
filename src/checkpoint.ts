import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import chalk from 'chalk';
import type { ConversationCheckpoint, Message } from './types.js';

export class CheckpointManager {
  private checkpointPath: string;
  private projectHash: string;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private static readonly AUTO_SAVE_DEBOUNCE_MS = 2000;

  constructor() {
    const projectPath = process.cwd();
    this.projectHash = crypto.createHash('md5').update(projectPath).digest('hex');
    this.checkpointPath = path.join(
      os.homedir(),
      '.canvas-cli',
      'checkpoints',
      this.projectHash
    );
    fs.ensureDirSync(this.checkpointPath);
  }

  async saveCheckpoint(messages: Message[], tag?: string): Promise<string> {
    const id = tag || `checkpoint-${Date.now()}`;
    const checkpoint: ConversationCheckpoint = {
      id,
      timestamp: new Date(),
      messages,
      tag
    };
    
    const filePath = path.join(this.checkpointPath, `${id}.json`);
    await fs.writeJSON(filePath, checkpoint);

    console.log(chalk.green(`✓ Saved checkpoint: ${id}`));
    return id;
  }

  async loadCheckpoint(id: string): Promise<ConversationCheckpoint | null> {
    const filePath = path.join(this.checkpointPath, `${id}.json`);
    
    if (!await fs.pathExists(filePath)) {
      console.log(chalk.red(`Checkpoint not found: ${id}`));
      return null;
    }
    
    const checkpoint = await fs.readJSON(filePath);
    console.log(chalk.green(`✓ Loaded checkpoint: ${id}`));
    return checkpoint;
  }

  async listCheckpoints(): Promise<ConversationCheckpoint[]> {
    const files = await fs.readdir(this.checkpointPath);
    const checkpoints: ConversationCheckpoint[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const checkpoint = await fs.readJSON(path.join(this.checkpointPath, file));
        checkpoints.push(checkpoint);
      }
    }
    
    checkpoints.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return checkpoints;
  }

  async deleteCheckpoint(id: string): Promise<boolean> {
    const filePath = path.join(this.checkpointPath, `${id}.json`);
    
    if (!await fs.pathExists(filePath)) {
      console.log(chalk.red(`Checkpoint not found: ${id}`));
      return false;
    }
    
    await fs.remove(filePath);
    console.log(chalk.green(`✓ Deleted checkpoint: ${id}`));
    return true;
  }

  async autoSave(messages: Message[]): Promise<void> {
    // Debounce: cancel any pending auto-save and schedule a new one
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    return new Promise<void>((resolve) => {
      this.autoSaveTimer = setTimeout(async () => {
        this.autoSaveTimer = null;
        const autoSavePath = path.join(this.checkpointPath, 'autosave.json');
        const checkpoint: ConversationCheckpoint = {
          id: 'autosave',
          timestamp: new Date(),
          messages
        };
        await fs.writeJSON(autoSavePath, checkpoint);
        resolve();
      }, CheckpointManager.AUTO_SAVE_DEBOUNCE_MS);
    });
  }

  /** Write autosave immediately (no debounce) — use on clean shutdown. */
  async flushAutoSave(messages: Message[]): Promise<void> {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    const autoSavePath = path.join(this.checkpointPath, 'autosave.json');
    const checkpoint: ConversationCheckpoint = {
      id: 'autosave',
      timestamp: new Date(),
      messages,
    };
    await fs.writeJSON(autoSavePath, checkpoint);
  }

  async loadAutoSave(): Promise<ConversationCheckpoint | null> {
    const autoSavePath = path.join(this.checkpointPath, 'autosave.json');
    
    if (!await fs.pathExists(autoSavePath)) {
      return null;
    }
    
    return await fs.readJSON(autoSavePath);
  }

  async createFileBackup(filePath: string, toolCallId: string): Promise<void> {
    if (!await fs.pathExists(filePath)) {
      return;
    }
    
    const backupDir = path.join(this.checkpointPath, 'file-backups', toolCallId);
    await fs.ensureDir(backupDir);
    
    const content = await fs.readFile(filePath, 'utf-8');
    const backupPath = path.join(backupDir, path.basename(filePath));
    
    await fs.writeFile(backupPath, content);
    
    // Save metadata
    const metaPath = path.join(backupDir, 'meta.json');
    await fs.writeJSON(metaPath, {
      originalPath: filePath,
      backupPath,
      timestamp: new Date().toISOString(),
      toolCallId
    });
  }

  async restoreFileBackup(toolCallId: string): Promise<void> {
    const backupDir = path.join(this.checkpointPath, 'file-backups', toolCallId);
    
    if (!await fs.pathExists(backupDir)) {
      console.log(chalk.red(`No backup found for tool call: ${toolCallId}`));
      return;
    }
    
    const metaPath = path.join(backupDir, 'meta.json');
    const meta = await fs.readJSON(metaPath);
    
    const backupContent = await fs.readFile(meta.backupPath, 'utf-8');
    await fs.writeFile(meta.originalPath, backupContent);
    
    console.log(chalk.green(`✓ Restored file: ${meta.originalPath}`));
  }

  async listFileBackups(): Promise<any[]> {
    const backupDir = path.join(this.checkpointPath, 'file-backups');
    
    if (!await fs.pathExists(backupDir)) {
      return [];
    }
    
    const toolCallDirs = await fs.readdir(backupDir);
    const backups = [];
    
    for (const dir of toolCallDirs) {
      const metaPath = path.join(backupDir, dir, 'meta.json');
      if (await fs.pathExists(metaPath)) {
        const meta = await fs.readJSON(metaPath);
        backups.push(meta);
      }
    }
    
    return backups;
  }
}