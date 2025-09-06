import { EventEmitter } from 'events';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// 1. Block-Based Output Organization
export interface Block {
  id: string;
  type: 'command' | 'output' | 'error' | 'info' | 'ai_response';
  command?: string;
  content: string;
  timestamp: Date;
  duration?: number;
  exitCode?: number;
  collapsed: boolean;
  metadata?: {
    cwd?: string;
    env?: any;
    user?: string;
    mode?: string;
  };
  shareable: boolean;
  shareUrl?: string;
}

export class BlockSystem extends EventEmitter {
  private blocks: Map<string, Block> = new Map();
  private activeBlock: Block | null = null;
  private blockHistory: string[] = [];
  private maxBlocks: number = 1000;
  private storageDir: string;
  
  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'blocks');
    fs.ensureDirSync(this.storageDir);
    this.loadRecentBlocks();
  }
  
  createBlock(type: Block['type'], content: string, command?: string): Block {
    const block: Block = {
      id: uuidv4(),
      type,
      content,
      command,
      timestamp: new Date(),
      collapsed: false,
      shareable: true,
      metadata: {
        cwd: process.cwd(),
        user: os.userInfo().username,
        mode: this.getCurrentMode()
      }
    };
    
    this.blocks.set(block.id, block);
    this.blockHistory.push(block.id);
    
    // Cleanup old blocks if exceeding limit
    if (this.blockHistory.length > this.maxBlocks) {
      const oldId = this.blockHistory.shift();
      if (oldId) this.blocks.delete(oldId);
    }
    
    this.emit('block-created', block);
    this.saveBlock(block);
    
    return block;
  }
  
  startCommandBlock(command: string): void {
    if (this.activeBlock) {
      this.endBlock();
    }
    
    this.activeBlock = this.createBlock('command', '', command);
    (this.activeBlock.metadata as any).startTime = Date.now();
  }
  
  appendToActiveBlock(content: string): void {
    if (this.activeBlock) {
      this.activeBlock.content += content;
      this.emit('block-updated', this.activeBlock);
    }
  }
  
  endBlock(exitCode?: number): void {
    if (this.activeBlock) {
      const metadata = this.activeBlock.metadata as any;
      if (metadata?.startTime) {
        this.activeBlock.duration = Date.now() - metadata.startTime;
      }
      this.activeBlock.exitCode = exitCode;
      this.emit('block-completed', this.activeBlock);
      this.saveBlock(this.activeBlock);
      this.activeBlock = null;
    }
  }
  
  getBlock(id: string): Block | undefined {
    return this.blocks.get(id);
  }
  
  getRecentBlocks(limit: number = 10): Block[] {
    return this.blockHistory
      .slice(-limit)
      .map(id => this.blocks.get(id))
      .filter(Boolean) as Block[];
  }
  
  toggleBlockCollapse(id: string): void {
    const block = this.blocks.get(id);
    if (block) {
      block.collapsed = !block.collapsed;
      this.emit('block-toggled', block);
    }
  }
  
  async shareBlock(id: string): Promise<string> {
    const block = this.blocks.get(id);
    if (!block) throw new Error('Block not found');
    
    // Generate shareable URL (in production, this would upload to a service)
    const shareId = uuidv4().slice(0, 8);
    const shareData = {
      block,
      sharedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    };
    
    const sharePath = path.join(this.storageDir, 'shared', `${shareId}.json`);
    await fs.ensureDir(path.dirname(sharePath));
    await fs.writeJson(sharePath, shareData);
    
    block.shareUrl = `canvas://blocks/${shareId}`;
    this.emit('block-shared', block);
    
    return block.shareUrl;
  }
  
  renderBlock(block: Block): string {
    const lines: string[] = [];
    const borderColor = '#404040';
    const width = process.stdout.columns || 80;
    
    // Header
    const typeIcons = {
      command: '⚡',
      output: '📄',
      error: '❌',
      info: 'ℹ️',
      ai_response: '🤖'
    };
    
    const icon = typeIcons[block.type];
    const time = block.timestamp.toLocaleTimeString();
    const duration = block.duration ? `(${block.duration}ms)` : '';
    
    lines.push(chalk.hex(borderColor)('┌' + '─'.repeat(width - 2) + '┐'));
    
    // Title bar
    const title = `${icon} ${block.command || block.type} ${duration}`;
    const titleLine = `│ ${title.padEnd(width - 4)} │`;
    lines.push(chalk.hex(borderColor)(titleLine));
    
    // Separator
    lines.push(chalk.hex(borderColor)('├' + '─'.repeat(width - 2) + '┤'));
    
    // Content (collapsed or expanded)
    if (!block.collapsed) {
      const contentLines = block.content.split('\n');
      for (const line of contentLines.slice(0, 20)) { // Limit display
        const paddedLine = line.padEnd(width - 4);
        lines.push(chalk.hex(borderColor)('│ ') + paddedLine + chalk.hex(borderColor)(' │'));
      }
      
      if (contentLines.length > 20) {
        const moreLine = `... ${contentLines.length - 20} more lines ...`.padEnd(width - 4);
        lines.push(chalk.hex(borderColor)('│ ') + chalk.dim(moreLine) + chalk.hex(borderColor)(' │'));
      }
    } else {
      const collapsedLine = '[Collapsed - Press Enter to expand]'.padEnd(width - 4);
      lines.push(chalk.hex(borderColor)('│ ') + chalk.dim(collapsedLine) + chalk.hex(borderColor)(' │'));
    }
    
    // Footer
    lines.push(chalk.hex(borderColor)('└' + '─'.repeat(width - 2) + '┘'));
    
    // Metadata
    if (block.shareUrl) {
      lines.push(chalk.dim(`  Share URL: ${block.shareUrl}`));
    }
    lines.push(chalk.dim(`  ID: ${block.id} | Time: ${time}`));
    
    return lines.join('\n');
  }
  
  private saveBlock(block: Block): void {
    const blockPath = path.join(this.storageDir, `${block.id}.json`);
    fs.writeJsonSync(blockPath, block);
  }
  
  private loadRecentBlocks(): void {
    try {
      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.endsWith('.json'))
        .slice(-100); // Load last 100 blocks
      
      for (const file of files) {
        const block = fs.readJsonSync(path.join(this.storageDir, file));
        this.blocks.set(block.id, block);
        this.blockHistory.push(block.id);
      }
    } catch (error) {
      // Silent fail on first run
    }
  }
  
  private getCurrentMode(): string {
    // Integration with mode manager
    try {
      const { getModeManager } = require('../modes/modeManager.js');
      return getModeManager().getCurrentMode();
    } catch {
      return 'unknown';
    }
  }
  
  searchBlocks(query: string): Block[] {
    const results: Block[] = [];
    const lowerQuery = query.toLowerCase();
    
    for (const block of this.blocks.values()) {
      if (
        block.content.toLowerCase().includes(lowerQuery) ||
        block.command?.toLowerCase().includes(lowerQuery)
      ) {
        results.push(block);
      }
    }
    
    return results.slice(-20); // Return last 20 matches
  }
  
  exportBlocks(format: 'json' | 'markdown' = 'json'): string {
    const blocks = this.getRecentBlocks(50);
    
    if (format === 'json') {
      return JSON.stringify(blocks, null, 2);
    }
    
    // Markdown format
    let markdown = '# Canvas CLI Session Blocks\n\n';
    
    for (const block of blocks) {
      markdown += `## ${block.type}: ${block.command || 'Output'}\n`;
      markdown += `**Time:** ${block.timestamp}\n`;
      if (block.duration) markdown += `**Duration:** ${block.duration}ms\n`;
      markdown += '\n```\n' + block.content + '\n```\n\n---\n\n';
    }
    
    return markdown;
  }
}

// Singleton instance
let blockSystemInstance: BlockSystem | null = null;

export function getBlockSystem(): BlockSystem {
  if (!blockSystemInstance) {
    blockSystemInstance = new BlockSystem();
  }
  return blockSystemInstance;
}