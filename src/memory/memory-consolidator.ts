/**
 * Priority 3: Memory Consolidator
 * Runs at session end to extract durable facts from conversation
 */

import { PersistentMemory } from './persistent-memory.js';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ConsolidationResult {
  sessionId: string;
  summary: string;
  keyDecisions: string[];
  filesTouched: string[];
  memoriesCreated: number;
}

export class MemoryConsolidator {
  private memory: PersistentMemory;
  private agentId: string;
  
  constructor(agentId: string = 'canvas-main', projectPath: string = process.cwd()) {
    this.agentId = agentId;
    this.memory = new PersistentMemory(agentId, projectPath);
  }
  
  async consolidate(
    messages: ConversationMessage[],
    sessionId: string = uuidv4()
  ): Promise<ConsolidationResult> {
    const filesTouched = this.extractFileMentions(messages);
    const keyDecisions = this.extractDecisions(messages);
    const summary = this.generateSummary(messages);
    
    // Store high-importance decisions as individual memories
    let memoriesCreated = 0;
    for (const decision of keyDecisions) {
      this.memory.store({
        category: 'decision',
        content: decision,
        importance: 0.8,
        file_path: filesTouched[0],
      });
      memoriesCreated++;
    }
    
    // Extract code patterns mentioned
    const patterns = this.extractPatterns(messages);
    for (const pattern of patterns) {
      this.memory.store({
        category: 'pattern',
        content: pattern,
        importance: 0.6,
      });
      memoriesCreated++;
    }
    
    // Store session summary
    this.memory.storeSessionSummary(sessionId, summary, keyDecisions, filesTouched);
    
    return { sessionId, summary, keyDecisions, filesTouched, memoriesCreated };
  }
  
  private extractFileMentions(messages: ConversationMessage[]): string[] {
    const filePattern = /(?:src|lib|test|dist)\/[\w/.-]+\.[a-zA-Z]+/g;
    const files = new Set<string>();
    
    for (const msg of messages) {
      const matches = msg.content.match(filePattern) || [];
      for (const match of matches) files.add(match);
    }
    
    return Array.from(files).slice(0, 20);
  }
  
  private extractDecisions(messages: ConversationMessage[]): string[] {
    const decisions: string[] = [];
    const decisionPatterns = [
      /(?:decided|decision|chose|using|will use|going with|approach is)[:\s]+([^.!?\n]{20,150})/gi,
      /(?:instead of|rather than|prefer)[:\s]+([^.!?\n]{20,100})/gi,
    ];
    
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const pattern of decisionPatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(msg.content)) !== null) {
          const decision = match[1].trim();
          if (decision.length > 20) decisions.push(decision);
          if (decisions.length >= 10) break;
        }
      }
    }
    
    return [...new Set(decisions)].slice(0, 10);
  }
  
  private extractPatterns(messages: ConversationMessage[]): string[] {
    const patterns: string[] = [];
    const patternKeywords = ['pattern', 'convention', 'always', 'never', 'best practice', 'standard'];
    
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      const sentences = msg.content.split(/[.!?]\s+/);
      for (const sentence of sentences) {
        if (patternKeywords.some(kw => sentence.toLowerCase().includes(kw))) {
          if (sentence.length > 30 && sentence.length < 200) {
            patterns.push(sentence.trim());
          }
        }
      }
    }
    
    return [...new Set(patterns)].slice(0, 5);
  }
  
  private generateSummary(messages: ConversationMessage[]): string {
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content);
    
    if (userMessages.length === 0) return 'Empty session';
    
    const firstUserMsg = userMessages[0].slice(0, 200);
    const lastUserMsg = userMessages[userMessages.length - 1].slice(0, 200);
    const msgCount = messages.length;
    
    if (userMessages.length === 1) {
      return `Session with ${msgCount} messages. Task: ${firstUserMsg}`;
    }
    
    return `Session with ${msgCount} messages. Started with: "${firstUserMsg}". Ended with: "${lastUserMsg}". ${assistantMessages.length} assistant responses.`;
  }
}
