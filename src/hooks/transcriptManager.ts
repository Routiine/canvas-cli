import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import type { Message } from '../types.js';

export interface TranscriptEntry {
  timestamp: Date;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mode?: 'planning' | 'execution';
  tokens?: { input: number; output: number };
  tools?: Array<{ name: string; parameters: any; result?: any }>;
  metadata?: any;
}

export interface TranscriptSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  entries: TranscriptEntry[];
  summary?: string;
  tags?: string[];
  model?: string;
  totalTokens?: { input: number; output: number };
}

export class TranscriptManager {
  private currentSession: TranscriptSession | null = null;
  private transcriptsPath: string;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private maxTranscriptSize: number = 100; // Max entries before auto-compact
  
  constructor() {
    const canvasDir = path.join(os.homedir(), '.canvas-cli');
    this.transcriptsPath = path.join(canvasDir, 'transcripts');
    fs.ensureDirSync(this.transcriptsPath);
    
    // Load or create current session
    this.initializeSession();
  }
  
  private initializeSession(): void {
    const sessionId = `session-${Date.now()}`;
    this.currentSession = {
      id: sessionId,
      startTime: new Date(),
      entries: [],
      totalTokens: { input: 0, output: 0 }
    };
    
    // Start auto-save
    this.startAutoSave();
  }
  
  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    this.autoSaveInterval = setInterval(() => {
      this.save();
    }, 30000); // Auto-save every 30 seconds
  }
  
  addEntry(entry: Omit<TranscriptEntry, 'timestamp'>): void {
    if (!this.currentSession) {
      this.initializeSession();
    }
    
    const fullEntry: TranscriptEntry = {
      ...entry,
      timestamp: new Date()
    };
    
    this.currentSession!.entries.push(fullEntry);
    
    // Update token counts
    if (entry.tokens) {
      this.currentSession!.totalTokens!.input += entry.tokens.input;
      this.currentSession!.totalTokens!.output += entry.tokens.output;
    }
    
    // Check if we need to compact
    if (this.currentSession!.entries.length >= this.maxTranscriptSize) {
      this.compact();
    }
  }
  
  addMessage(message: Message, mode?: 'planning' | 'execution'): void {
    this.addEntry({
      role: message.role as 'user' | 'assistant',
      content: message.content,
      mode,
      metadata: message.metadata
    });
  }
  
  addToolExecution(toolName: string, parameters: any, result?: any): void {
    const lastEntry = this.currentSession?.entries[this.currentSession.entries.length - 1];
    
    if (lastEntry) {
      if (!lastEntry.tools) {
        lastEntry.tools = [];
      }
      lastEntry.tools.push({ name: toolName, parameters, result });
    }
  }
  
  compact(): void {
    if (!this.currentSession || this.currentSession.entries.length === 0) {
      return;
    }
    
    console.log(chalk.dim('  📝 Compacting transcript...'));
    
    // Save current session before compacting
    this.save();
    
    // Summarize the session
    const summary = this.generateSummary();
    
    // Create compacted version
    const compactedSession: TranscriptSession = {
      ...this.currentSession,
      summary,
      entries: this.currentSession.entries.slice(-20) // Keep last 20 entries
    };
    
    // Save compacted version
    const compactPath = path.join(
      this.transcriptsPath,
      `compact-${this.currentSession.id}.json`
    );
    fs.writeJsonSync(compactPath, compactedSession, { spaces: 2 });
    
    // Reset current session with carryover
    const carryoverEntries = this.currentSession.entries.slice(-10);
    this.currentSession.entries = carryoverEntries;
    
    console.log(chalk.dim('  ✓ Transcript compacted'));
  }
  
  private generateSummary(): string {
    if (!this.currentSession) return '';
    
    const entries = this.currentSession.entries;
    const userCommands = entries.filter(e => e.role === 'user').length;
    const assistantResponses = entries.filter(e => e.role === 'assistant').length;
    const toolsUsed = new Set<string>();
    
    entries.forEach(entry => {
      if (entry.tools) {
        entry.tools.forEach(tool => toolsUsed.add(tool.name));
      }
    });
    
    const topics = this.extractTopics(entries);
    
    return `Session with ${userCommands} user commands and ${assistantResponses} responses. ` +
           `Tools used: ${Array.from(toolsUsed).join(', ') || 'none'}. ` +
           `Topics: ${topics.join(', ')}.`;
  }
  
  private extractTopics(entries: TranscriptEntry[]): string[] {
    const topics = new Set<string>();
    const keywords = {
      'file operations': /\b(file|write|read|create|delete|edit)\b/i,
      'git operations': /\b(git|commit|push|pull|branch|merge)\b/i,
      'building': /\b(build|compile|webpack|rollup|vite)\b/i,
      'testing': /\b(test|jest|mocha|cypress|playwright)\b/i,
      'deployment': /\b(deploy|docker|kubernetes|aws|azure)\b/i,
      'debugging': /\b(debug|error|fix|bug|issue)\b/i,
      'configuration': /\b(config|setup|install|package)\b/i,
      'documentation': /\b(docs|readme|comment|explain)\b/i
    };
    
    entries.forEach(entry => {
      for (const [topic, pattern] of Object.entries(keywords)) {
        if (pattern.test(entry.content)) {
          topics.add(topic);
        }
      }
    });
    
    return Array.from(topics).slice(0, 3); // Top 3 topics
  }
  
  save(sessionPath?: string): void {
    if (!this.currentSession) return;
    
    const savePath = sessionPath || path.join(
      this.transcriptsPath,
      `${this.currentSession.id}.json`
    );
    
    try {
      fs.writeJsonSync(savePath, this.currentSession, { spaces: 2 });
    } catch (error) {
      console.log(chalk.yellow('⚠ Could not save transcript'));
    }
  }
  
  load(sessionId: string): TranscriptSession | null {
    const sessionPath = path.join(this.transcriptsPath, `${sessionId}.json`);
    
    if (fs.existsSync(sessionPath)) {
      try {
        return fs.readJsonSync(sessionPath);
      } catch (error) {
        return null;
      }
    }
    
    return null;
  }
  
  listSessions(): Array<{ id: string; startTime: Date; entries: number; summary?: string }> {
    const sessions = [];
    
    try {
      const files = fs.readdirSync(this.transcriptsPath);
      
      for (const file of files) {
        if (file.startsWith('session-') && file.endsWith('.json')) {
          const sessionPath = path.join(this.transcriptsPath, file);
          try {
            const session = fs.readJsonSync(sessionPath);
            sessions.push({
              id: session.id,
              startTime: new Date(session.startTime),
              entries: session.entries.length,
              summary: session.summary
            });
          } catch (error) {
            // Skip corrupted files
          }
        }
      }
    } catch (error) {
      // Return empty array if directory doesn't exist
    }
    
    return sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }
  
  exportSession(format: 'markdown' | 'json' | 'html' = 'markdown'): string {
    if (!this.currentSession) return '';
    
    switch (format) {
      case 'markdown':
        return this.exportAsMarkdown();
      case 'html':
        return this.exportAsHTML();
      case 'json':
      default:
        return JSON.stringify(this.currentSession, null, 2);
    }
  }
  
  private exportAsMarkdown(): string {
    if (!this.currentSession) return '';
    
    let markdown = `# Canvas CLI Transcript\n\n`;
    markdown += `**Session ID:** ${this.currentSession.id}\n`;
    markdown += `**Start Time:** ${this.currentSession.startTime}\n`;
    
    if (this.currentSession.totalTokens) {
      markdown += `**Tokens:** Input: ${this.currentSession.totalTokens.input}, Output: ${this.currentSession.totalTokens.output}\n`;
    }
    
    markdown += `\n---\n\n`;
    
    for (const entry of this.currentSession.entries) {
      const roleEmoji = entry.role === 'user' ? '👤' : '🤖';
      markdown += `## ${roleEmoji} ${entry.role.toUpperCase()}\n`;
      markdown += `*${entry.timestamp}*`;
      
      if (entry.mode) {
        markdown += ` | Mode: ${entry.mode}`;
      }
      
      markdown += `\n\n${entry.content}\n`;
      
      if (entry.tools && entry.tools.length > 0) {
        markdown += `\n### Tools Used:\n`;
        for (const tool of entry.tools) {
          markdown += `- **${tool.name}**\n`;
          if (tool.parameters) {
            markdown += `  - Parameters: \`${JSON.stringify(tool.parameters)}\`\n`;
          }
          if (tool.result) {
            markdown += `  - Result: \`${JSON.stringify(tool.result)}\`\n`;
          }
        }
      }
      
      markdown += `\n---\n\n`;
    }
    
    return markdown;
  }
  
  private exportAsHTML(): string {
    if (!this.currentSession) return '';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canvas CLI Transcript - ${this.currentSession.id}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a1a;
      color: #e0e0e0;
    }
    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h1 { color: #00ff88; }
    .metadata {
      color: #888;
      font-size: 0.9em;
    }
    .entry {
      margin: 20px 0;
      padding: 15px;
      border-radius: 8px;
      background: #242424;
    }
    .entry.user {
      background: #1a2332;
      border-left: 3px solid #4a9eff;
    }
    .entry.assistant {
      background: #2a1a32;
      border-left: 3px solid #ff4a9e;
    }
    .timestamp {
      color: #666;
      font-size: 0.85em;
    }
    .content {
      margin-top: 10px;
      white-space: pre-wrap;
      line-height: 1.6;
    }
    .tools {
      margin-top: 10px;
      padding: 10px;
      background: #1a1a1a;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
    }
    .mode {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      margin-left: 10px;
    }
    .mode.planning { background: #4a4a4a; }
    .mode.execution { background: #8a4a4a; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Canvas CLI Transcript</h1>
    <div class="metadata">
      <p><strong>Session ID:</strong> ${this.currentSession.id}</p>
      <p><strong>Start Time:</strong> ${this.currentSession.startTime}</p>
      ${this.currentSession.totalTokens ? `
      <p><strong>Tokens:</strong> Input: ${this.currentSession.totalTokens.input}, Output: ${this.currentSession.totalTokens.output}</p>
      ` : ''}
    </div>
  </div>
  
  <div class="entries">
    ${this.currentSession.entries.map(entry => `
      <div class="entry ${entry.role}">
        <div class="header">
          <span class="role">${entry.role === 'user' ? '👤 User' : '🤖 Assistant'}</span>
          ${entry.mode ? `<span class="mode ${entry.mode}">${entry.mode}</span>` : ''}
          <span class="timestamp">${entry.timestamp}</span>
        </div>
        <div class="content">${this.escapeHtml(entry.content)}</div>
        ${entry.tools && entry.tools.length > 0 ? `
          <div class="tools">
            <strong>Tools:</strong>
            ${entry.tools.map(tool => `
              <div>• ${tool.name}: ${JSON.stringify(tool.parameters)}</div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `).join('')}
  </div>
</body>
</html>`;
  }
  
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  search(query: string): TranscriptEntry[] {
    if (!this.currentSession) return [];
    
    const lowerQuery = query.toLowerCase();
    return this.currentSession.entries.filter(entry =>
      entry.content.toLowerCase().includes(lowerQuery)
    );
  }
  
  getStats(): {
    totalSessions: number;
    currentSessionEntries: number;
    totalTokensUsed: { input: number; output: number };
    averageSessionLength: number;
  } {
    const sessions = this.listSessions();
    
    return {
      totalSessions: sessions.length,
      currentSessionEntries: this.currentSession?.entries.length || 0,
      totalTokensUsed: this.currentSession?.totalTokens || { input: 0, output: 0 },
      averageSessionLength: sessions.length > 0
        ? sessions.reduce((sum, s) => sum + s.entries, 0) / sessions.length
        : 0
    };
  }
  
  cleanup(daysToKeep: number = 7): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    try {
      const files = fs.readdirSync(this.transcriptsPath);
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(this.transcriptsPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.removeSync(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        console.log(chalk.dim(`  🗑️ Cleaned up ${deletedCount} old transcript files`));
      }
    } catch (error) {
      // Silent fail
    }
  }
  
  dispose(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    
    if (this.currentSession) {
      this.currentSession.endTime = new Date();
      this.save();
    }
  }
}

// Singleton instance
let transcriptInstance: TranscriptManager | null = null;

export function getTranscriptManager(): TranscriptManager {
  if (!transcriptInstance) {
    transcriptInstance = new TranscriptManager();
  }
  return transcriptInstance;
}