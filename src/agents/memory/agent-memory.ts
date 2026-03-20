/**
 * Agent Memory System
 * Provides persistent memory and context management for AI agents
 */

import { EventEmitter } from 'events';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { z } from 'zod';
import crypto from 'crypto';
import { getMem0Adapter, type Mem0Memory } from './mem0-adapter.js';

// Memory Entry Schema
export const MemoryEntrySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  timestamp: z.string(),
  type: z.enum([
    'conversation', 'decision', 'learning', 'context', 'preference', 'error',
    'communication', 'consultation', 'task_execution', 'execution_plan',
    'replication', 'notification', 'request', 'query', 'response',
    'broadcast', 'coordination', 'system', 'user', 'assistant'
  ]),
  category: z.string().optional(),
  content: z.any(),
  embedding: z.array(z.number()).optional(),
  metadata: z.object({
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    projectId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    relevanceScore: z.number().optional(),
    accessCount: z.number().default(0),
    lastAccessed: z.string().optional()
  }),
  relationships: z.array(z.object({
    relatedId: z.string(),
    type: z.enum(['follows', 'references', 'contradicts', 'updates', 'supports']),
    strength: z.number().min(0).max(1)
  })).optional()
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// Memory Store Schema
export const MemoryStoreSchema = z.object({
  agentId: z.string(),
  created: z.string(),
  lastModified: z.string(),
  entries: z.array(MemoryEntrySchema),
  index: z.object({
    byType: z.record(z.array(z.string())),
    byCategory: z.record(z.array(z.string())),
    bySession: z.record(z.array(z.string())),
    byProject: z.record(z.array(z.string()))
  }),
  statistics: z.object({
    totalEntries: z.number(),
    totalSessions: z.number(),
    averageRelevance: z.number(),
    mostAccessedEntries: z.array(z.string())
  })
});

export type MemoryStore = z.infer<typeof MemoryStoreSchema>;

// Working Memory for active context
export interface WorkingMemory {
  currentContext: Map<string, any>;
  recentEntries: MemoryEntry[];
  activeSession: string;
  focusTopics: string[];
  temporaryData: Map<string, any>;
}

// Long-term Memory Configuration
export interface MemoryConfig {
  maxEntries: number;
  maxAge: number; // days
  compressionThreshold: number;
  relevanceThreshold: number;
  autoSave: boolean;
  saveInterval: number; // milliseconds
}

/**
 * Agent Memory System Implementation
 */
export class AgentMemory extends EventEmitter {
  private agentId: string;
  private memoryPath: string;
  private store: MemoryStore;
  private workingMemory: WorkingMemory;
  private config: MemoryConfig;
  private autoSaveTimer?: NodeJS.Timeout;
  private embeddings: Map<string, number[]> = new Map();
  
  constructor(agentId: string, config?: Partial<MemoryConfig>) {
    super();
    this.agentId = agentId;
    
    const canvasDir = path.join(os.homedir(), '.canvas-cli');
    this.memoryPath = path.join(canvasDir, 'memory', `${agentId}.json`);
    
    this.config = {
      maxEntries: 10000,
      maxAge: 90,
      compressionThreshold: 5000,
      relevanceThreshold: 0.3,
      autoSave: true,
      saveInterval: 30000, // 30 seconds
      ...config
    };
    
    this.workingMemory = {
      currentContext: new Map(),
      recentEntries: [],
      activeSession: this.generateSessionId(),
      focusTopics: [],
      temporaryData: new Map()
    };
    
    this.store = this.createEmptyStore();
  }
  
  /**
   * Initialize memory system
   */
  async initialize(): Promise<void> {
    await fs.ensureDir(path.dirname(this.memoryPath));
    await this.load();

    if (this.config.autoSave) {
      this.startAutoSave();
    }

    // Load cross-session memories from mem0 and inject the top entries into
    // working memory as persistent context.  Non-blocking: failures are
    // swallowed so a missing or unreachable mem0 never prevents startup.
    getMem0Adapter()
      .getAllMemories({ agentId: this.agentId })
      .then(memories => {
        const top = memories.slice(0, 20);
        if (top.length > 0) {
          this.workingMemory.currentContext.set('mem0:persistent', top.map(m => m.memory));
        }
      })
      .catch(console.warn);

    this.emit('initialized', { agentId: this.agentId });
  }
  
  /**
   * Remember information
   */
  async remember(
    content: any,
    type: MemoryEntry['type'] = 'context',
    metadata?: Partial<MemoryEntry['metadata']>
  ): Promise<string> {
    const entry: MemoryEntry = {
      id: this.generateId(),
      agentId: this.agentId,
      timestamp: new Date().toISOString(),
      type,
      content,
      metadata: {
        sessionId: this.workingMemory.activeSession,
        ...metadata,
        accessCount: 0
      }
    };
    
    // Generate embedding for semantic search
    if (typeof content === 'string' || (content && content.text)) {
      entry.embedding = await this.generateEmbedding(content.text || content);
      this.embeddings.set(entry.id, entry.embedding);
    }
    
    // Add to store
    this.store.entries.push(entry);
    this.updateIndex(entry);
    
    // Add to working memory
    this.workingMemory.recentEntries.unshift(entry);
    if (this.workingMemory.recentEntries.length > 100) {
      this.workingMemory.recentEntries.pop();
    }
    
    // Check if compression needed
    if (this.store.entries.length > this.config.compressionThreshold) {
      await this.compress();
    }
    
    this.emit('remembered', { entryId: entry.id, type, agentId: this.agentId });
    
    return entry.id;
  }
  
  /**
   * Recall information
   */
  async recall(
    query: string | { type?: string; category?: string; sessionId?: string },
    limit: number = 10
  ): Promise<MemoryEntry[]> {
    let results: MemoryEntry[] = [];
    
    if (typeof query === 'string') {
      // Semantic search
      results = await this.semanticSearch(query, limit);
    } else {
      // Structured search
      results = this.structuredSearch(query, limit);
    }
    
    // Update access counts
    for (const entry of results) {
      entry.metadata.accessCount++;
      entry.metadata.lastAccessed = new Date().toISOString();
    }
    
    this.emit('recalled', { query, count: results.length });
    
    return results;
  }
  
  /**
   * Forget information
   */
  async forget(criteria: {
    id?: string;
    type?: string;
    olderThan?: Date;
    sessionId?: string;
  }): Promise<number> {
    const before = this.store.entries.length;
    
    if (criteria.id) {
      this.store.entries = this.store.entries.filter(e => e.id !== criteria.id);
    } else {
      this.store.entries = this.store.entries.filter(entry => {
        if (criteria.type && entry.type !== criteria.type) return true;
        if (criteria.sessionId && entry.metadata.sessionId !== criteria.sessionId) return true;
        if (criteria.olderThan && new Date(entry.timestamp) > criteria.olderThan) return true;
        return false;
      });
    }
    
    const forgotten = before - this.store.entries.length;
    
    if (forgotten > 0) {
      await this.rebuildIndex();
      this.emit('forgotten', { count: forgotten, criteria });
    }
    
    return forgotten;
  }
  
  /**
   * Get context for current session
   */
  getContext(): Map<string, any> {
    return new Map(this.workingMemory.currentContext);
  }
  
  /**
   * Update context
   */
  updateContext(key: string, value: any): void {
    this.workingMemory.currentContext.set(key, value);
    
    // Remember context update
    void this.remember({
      action: 'context_update',
      key,
      value
    }, 'context');
  }
  
  /**
   * Clear working memory
   */
  clearWorkingMemory(): void {
    this.workingMemory.currentContext.clear();
    this.workingMemory.recentEntries = [];
    this.workingMemory.temporaryData.clear();
    this.workingMemory.focusTopics = [];
  }
  
  /**
   * Start new session
   */
  startSession(sessionId?: string): string {
    this.workingMemory.activeSession = sessionId || this.generateSessionId();
    this.clearWorkingMemory();
    
    void this.remember({
      action: 'session_start',
      sessionId: this.workingMemory.activeSession
    }, 'context');
    
    return this.workingMemory.activeSession;
  }
  
  /**
   * Consolidate memories (learning)
   */
  async consolidate(): Promise<void> {
    console.log(chalk.dim('🧠 Consolidating memories...'));
    
    // Group related memories
    const consolidated = await this.groupRelatedMemories();
    
    // Extract patterns
    const patterns = this.extractPatterns(consolidated);
    
    // Create learning entries
    for (const pattern of patterns) {
      await this.remember({
        type: 'learned_pattern',
        pattern: pattern.description,
        confidence: pattern.confidence,
        examples: pattern.examples
      }, 'learning');
    }
    
    // Prune low-relevance memories
    await this.pruneLowRelevanceMemories();
    
    this.emit('consolidated', { patterns: patterns.length });
  }
  
  /**
   * Share memory with another agent
   */
  async shareWith(targetAgentId: string, entryIds: string[]): Promise<void> {
    const entries = this.store.entries.filter(e => entryIds.includes(e.id));
    
    if (entries.length === 0) {
      throw new Error('No entries found to share');
    }
    
    const sharedMemory = {
      fromAgent: this.agentId,
      toAgent: targetAgentId,
      timestamp: new Date().toISOString(),
      entries
    };
    
    // Save to shared memory location
    const sharedPath = path.join(
      path.dirname(this.memoryPath),
      'shared',
      `${this.agentId}-to-${targetAgentId}-${Date.now()}.json`
    );
    
    await fs.ensureDir(path.dirname(sharedPath));
    await fs.writeJson(sharedPath, sharedMemory, { spaces: 2 });
    
    this.emit('shared', { targetAgentId, count: entries.length });
  }
  
  /**
   * Import shared memories
   */
  async importShared(fromAgentId: string): Promise<number> {
    const sharedDir = path.join(path.dirname(this.memoryPath), 'shared');
    const pattern = `${fromAgentId}-to-${this.agentId}-*.json`;
    
    const files = await fs.readdir(sharedDir);
    const sharedFiles = files.filter(f => f.match(new RegExp(pattern.replace('*', '.*'))));
    
    let imported = 0;
    
    for (const file of sharedFiles) {
      const sharedMemory = await fs.readJson(path.join(sharedDir, file));
      
      for (const entry of sharedMemory.entries) {
        // Add with reference to source
        await this.remember(entry.content, entry.type, {
          ...entry.metadata,
          sourceAgent: fromAgentId,
          imported: true
        });
        imported++;
      }
      
      // Remove processed file
      await fs.remove(path.join(sharedDir, file));
    }
    
    this.emit('imported', { fromAgentId, count: imported });
    
    return imported;
  }
  
  /**
   * Get memory statistics
   */
  getStatistics(): MemoryStore['statistics'] {
    const stats: MemoryStore['statistics'] = {
      totalEntries: this.store.entries.length,
      totalSessions: new Set(this.store.entries.map(e => e.metadata.sessionId)).size,
      averageRelevance: 0,
      mostAccessedEntries: [] as string[]
    };

    // Calculate average relevance
    const relevanceScores = this.store.entries
      .map(e => e.metadata.relevanceScore || 0)
      .filter(s => s > 0);

    if (relevanceScores.length > 0) {
      stats.averageRelevance = relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length;
    }

    // Find most accessed entries
    const sorted = [...this.store.entries]
      .sort((a, b) => (b.metadata.accessCount || 0) - (a.metadata.accessCount || 0))
      .slice(0, 10);

    stats.mostAccessedEntries = sorted.map(e => e.id);

    return stats;
  }

  /**
   * Get recent memories (alias for recall with recent entries)
   */
  async getRecentMemories(type?: string, limit: number = 10): Promise<MemoryEntry[]> {
    let results = [...this.store.entries];

    if (type) {
      results = results.filter(e => e.type === type);
    }

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return results.slice(0, limit);
  }

  /**
   * Add a memory (alias for remember)
   */
  async addMemory(
    type: string,
    content: any,
    metadata?: Partial<MemoryEntry['metadata']>
  ): Promise<string> {
    return this.remember(content, type as MemoryEntry['type'], metadata);
  }

  /**
   * Sync recent conversation entries to mem0 for cross-session persistence.
   * Extracts memorable facts from the provided messages and stores them in
   * mem0 (cloud or local fallback). Non-blocking — failures are logged, not thrown.
   *
   * Call this after saving a batch of conversation entries.
   */
  syncToMem0(messages: Array<{ role: string; content: string }>): void {
    getMem0Adapter()
      .addMemory(messages, {
        agentId: this.agentId,
        sessionId: this.workingMemory.activeSession,
      })
      .catch(console.warn);
  }

  /**
   * Search mem0 for memories relevant to a query.
   * Returns an array of past memory strings to inject into the agent's context.
   * Falls back to empty array on error so callers are never blocked.
   */
  async recallFromMem0(query: string, limit: number = 10): Promise<Mem0Memory[]> {
    try {
      return await getMem0Adapter().searchMemory(query, {
        agentId: this.agentId,
        limit,
      });
    } catch (err) {
      console.warn('[AgentMemory] recallFromMem0 failed:', err);
      return [];
    }
  }

  /**
   * Private helper methods
   */

  private createEmptyStore(): MemoryStore {
    return {
      agentId: this.agentId,
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      entries: [],
      index: {
        byType: {},
        byCategory: {},
        bySession: {},
        byProject: {}
      },
      statistics: {
        totalEntries: 0,
        totalSessions: 0,
        averageRelevance: 0,
        mostAccessedEntries: []
      }
    };
  }
  
  private async load(): Promise<void> {
    if (await fs.pathExists(this.memoryPath)) {
      try {
        const data = await fs.readJson(this.memoryPath);
        this.store = MemoryStoreSchema.parse(data);
        
        // Rebuild embeddings cache
        for (const entry of this.store.entries) {
          if (entry.embedding) {
            this.embeddings.set(entry.id, entry.embedding);
          }
        }
      } catch (error) {
        console.log(chalk.yellow('⚠ Could not load memory, starting fresh'));
        this.store = this.createEmptyStore();
      }
    }
  }
  
  private async save(): Promise<void> {
    this.store.lastModified = new Date().toISOString();
    this.store.statistics = this.getStatistics();
    
    await fs.writeJson(this.memoryPath, this.store, { spaces: 2 });
  }
  
  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(() => {
      this.save().catch(error => {
        console.error('Auto-save failed:', error);
      });
    }, this.config.saveInterval);
  }
  
  private updateIndex(entry: MemoryEntry): void {
    // Index by type
    if (!this.store.index.byType[entry.type]) {
      this.store.index.byType[entry.type] = [];
    }
    this.store.index.byType[entry.type].push(entry.id);
    
    // Index by category
    if (entry.category) {
      if (!this.store.index.byCategory[entry.category]) {
        this.store.index.byCategory[entry.category] = [];
      }
      this.store.index.byCategory[entry.category].push(entry.id);
    }
    
    // Index by session
    if (entry.metadata.sessionId) {
      if (!this.store.index.bySession[entry.metadata.sessionId]) {
        this.store.index.bySession[entry.metadata.sessionId] = [];
      }
      this.store.index.bySession[entry.metadata.sessionId].push(entry.id);
    }
    
    // Index by project
    if (entry.metadata.projectId) {
      if (!this.store.index.byProject[entry.metadata.projectId]) {
        this.store.index.byProject[entry.metadata.projectId] = [];
      }
      this.store.index.byProject[entry.metadata.projectId].push(entry.id);
    }
  }
  
  private async rebuildIndex(): Promise<void> {
    this.store.index = {
      byType: {},
      byCategory: {},
      bySession: {},
      byProject: {}
    };
    
    for (const entry of this.store.entries) {
      this.updateIndex(entry);
    }
  }
  
  private async semanticSearch(query: string, limit: number): Promise<MemoryEntry[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    const scores: Array<{ entry: MemoryEntry; score: number }> = [];
    
    for (const entry of this.store.entries) {
      if (entry.embedding) {
        const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
        if (score > this.config.relevanceThreshold) {
          scores.push({ entry, score });
        }
      }
    }
    
    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.entry);
  }
  
  private structuredSearch(query: any, limit: number): MemoryEntry[] {
    let results = [...this.store.entries];
    
    if (query.type) {
      const ids = this.store.index.byType[query.type] || [];
      results = results.filter(e => ids.includes(e.id));
    }
    
    if (query.category) {
      const ids = this.store.index.byCategory[query.category] || [];
      results = results.filter(e => ids.includes(e.id));
    }
    
    if (query.sessionId) {
      const ids = this.store.index.bySession[query.sessionId] || [];
      results = results.filter(e => ids.includes(e.id));
    }
    
    // Sort by recency and relevance
    results.sort((a, b) => {
      const scoreA = (a.metadata.relevanceScore || 0) + (a.metadata.accessCount || 0) / 10;
      const scoreB = (b.metadata.relevanceScore || 0) + (b.metadata.accessCount || 0) / 10;
      return scoreB - scoreA;
    });
    
    return results.slice(0, limit);
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Simplified embedding generation
    // In production, use a real embedding model
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0);
    
    for (let i = 0; i < words.length; i++) {
      const hash = this.hashString(words[i]);
      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1 / Math.sqrt(words.length);
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }
  
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  private async compress(): Promise<void> {
    console.log(chalk.dim('📦 Compressing memory...'));
    
    // Remove old entries
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.maxAge);
    
    const before = this.store.entries.length;
    this.store.entries = this.store.entries.filter(e => 
      new Date(e.timestamp) > cutoffDate || 
      e.type === 'learning' ||
      (e.metadata.accessCount || 0) > 5
    );
    
    const removed = before - this.store.entries.length;
    
    if (removed > 0) {
      await this.rebuildIndex();
      console.log(chalk.dim(`  ✓ Removed ${removed} old entries`));
    }
  }
  
  private async groupRelatedMemories(): Promise<Map<string, MemoryEntry[]>> {
    const groups = new Map<string, MemoryEntry[]>();
    const processed = new Set<string>();
    
    for (const entry of this.store.entries) {
      if (processed.has(entry.id)) continue;
      
      const related = await this.findRelatedEntries(entry, 0.7);
      if (related.length > 1) {
        const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        groups.set(groupId, related);
        related.forEach(e => processed.add(e.id));
      }
    }
    
    return groups;
  }
  
  private async findRelatedEntries(entry: MemoryEntry, threshold: number): Promise<MemoryEntry[]> {
    if (!entry.embedding) return [entry];
    
    const related = [entry];
    
    for (const other of this.store.entries) {
      if (other.id === entry.id || !other.embedding) continue;
      
      const similarity = this.cosineSimilarity(entry.embedding, other.embedding);
      if (similarity > threshold) {
        related.push(other);
      }
    }
    
    return related;
  }
  
  private extractPatterns(groups: Map<string, MemoryEntry[]>): any[] {
    const patterns = [];
    
    for (const [groupId, entries] of groups) {
      if (entries.length < 3) continue;
      
      // Extract common themes
      const contents = entries.map(e => JSON.stringify(e.content));
      const commonWords = this.findCommonWords(contents);
      
      if (commonWords.length > 0) {
        patterns.push({
          id: groupId,
          description: `Pattern: ${commonWords.join(', ')}`,
          confidence: entries.length / 10, // Simple confidence metric
          examples: entries.slice(0, 3).map(e => e.id),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return patterns;
  }
  
  private findCommonWords(texts: string[]): string[] {
    const wordCounts = new Map<string, number>();
    
    for (const text of texts) {
      const words = new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 3));
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
    
    return Array.from(wordCounts.entries())
      .filter(([word, count]) => count >= texts.length * 0.6)
      .map(([word]) => word)
      .slice(0, 5);
  }
  
  private async pruneLowRelevanceMemories(): Promise<void> {
    const threshold = this.config.relevanceThreshold;
    
    this.store.entries = this.store.entries.filter(entry => {
      // Keep learning entries
      if (entry.type === 'learning') return true;
      
      // Keep frequently accessed entries
      if ((entry.metadata.accessCount || 0) > 3) return true;
      
      // Keep recent entries
      const age = Date.now() - new Date(entry.timestamp).getTime();
      if (age < 7 * 24 * 60 * 60 * 1000) return true; // 7 days
      
      // Keep high relevance entries
      if ((entry.metadata.relevanceScore || 0) > threshold) return true;
      
      return false;
    });
  }
  
  private generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }
  
  /**
   * Cleanup and disposal
   */
  async dispose(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    await this.save();
    this.clearWorkingMemory();
    
    this.emit('disposed', { agentId: this.agentId });
  }
}

// Export factory function
export function createAgentMemory(agentId: string, config?: Partial<MemoryConfig>): AgentMemory {
  return new AgentMemory(agentId, config);
}