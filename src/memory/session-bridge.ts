/**
 * Priority 3: Session Bridge
 * Loads relevant memory context at session start
 */

import { PersistentMemory } from './persistent-memory.js';
import path from 'path';

export interface SessionContext {
  recentDecisions: string[];
  recentPatterns: string[];
  fileScopedMemories: Map<string, string[]>;
  sessionSummaries: string[];
  systemPromptAddition: string;
}

export class SessionBridge {
  private memory: PersistentMemory;
  private projectPath: string;
  
  constructor(agentId: string = 'canvas-main', projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
    this.memory = new PersistentMemory(agentId, projectPath);
  }
  
  async loadContext(currentFiles: string[] = []): Promise<SessionContext> {
    const recentSummaries = this.memory.getRecentSummaries(3);
    const decisions = this.memory.recall({
      projectPath: this.projectPath,
      category: 'decision',
      limit: 10,
      minImportance: 0.5
    });
    const patterns = this.memory.recall({
      projectPath: this.projectPath,
      category: 'pattern',
      limit: 5,
      minImportance: 0.4
    });
    
    const fileScopedMemories = new Map<string, string[]>();
    for (const file of currentFiles.slice(0, 5)) {
      const fileMemories = this.memory.list({ filePath: file, limit: 5 });
      if (fileMemories.length > 0) {
        fileScopedMemories.set(file, fileMemories.map(m => m.content));
      }
    }
    
    const recentDecisions = decisions.map(m => m.content);
    const recentPatterns = patterns.map(m => m.content);
    const sessionSummaries = recentSummaries.map(s => s.summary);
    
    const systemPromptAddition = this.buildSystemPromptAddition(
      recentDecisions,
      recentPatterns,
      sessionSummaries,
      fileScopedMemories
    );
    
    return {
      recentDecisions,
      recentPatterns,
      fileScopedMemories,
      sessionSummaries,
      systemPromptAddition
    };
  }
  
  private buildSystemPromptAddition(
    decisions: string[],
    patterns: string[],
    summaries: string[],
    fileScopedMemories: Map<string, string[]>
  ): string {
    const parts: string[] = [];
    
    if (summaries.length > 0) {
      parts.push('## Previous Session Context');
      summaries.forEach(s => parts.push(`- ${s}`));
    }
    
    if (decisions.length > 0) {
      parts.push('\n## Past Decisions');
      decisions.slice(0, 5).forEach(d => parts.push(`- ${d}`));
    }
    
    if (patterns.length > 0) {
      parts.push('\n## Established Patterns');
      patterns.slice(0, 3).forEach(p => parts.push(`- ${p}`));
    }
    
    if (fileScopedMemories.size > 0) {
      parts.push('\n## File-Specific Notes');
      for (const [file, memories] of fileScopedMemories) {
        const filename = path.basename(file);
        memories.slice(0, 2).forEach(m => parts.push(`- ${filename}: ${m}`));
      }
    }
    
    return parts.length > 0 ? parts.join('\n') : '';
  }
}
