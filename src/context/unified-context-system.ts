/**
 * Unified Context System
 *
 * Main orchestrator for context management that integrates:
 * - Context storage and versioning
 * - Sliding window management
 * - AI-powered summarization
 * - Semantic search with embeddings
 *
 * Replaces fragmented context systems with a single, coherent approach.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import type {
  ContextEntry,
  ContextWindow,
  ContextSnapshot,
  ContextDelta,
  ContextEvent,
  SearchResult,
  SearchOptions,
  UnifiedContextConfig,
  ModelContextConfig,
  StorageStats
} from './unified-types';
import {
  ContextEntryType,
  ContextPriority,
  MODEL_CONTEXT_CONFIGS,
  DEFAULT_UNIFIED_CONTEXT_CONFIG
} from './unified-types';
import type { SummarizationService } from './summarization/summarization-service';
import { getSummarizationService } from './summarization/summarization-service';
import type { HybridEmbeddingService } from '../agents/embeddings/hybrid-embeddings';
import { getEmbeddingService } from '../agents/embeddings/hybrid-embeddings';

// ============================================================================
// Unified Context System
// ============================================================================

export class UnifiedContextSystem extends EventEmitter {
  private config: UnifiedContextConfig;
  private entries: Map<string, ContextEntry> = new Map();
  private currentWindow: ContextWindow;
  private snapshots: ContextSnapshot[] = [];
  private deltas: ContextDelta[] = [];
  private summarization: SummarizationService;
  private embeddings: HybridEmbeddingService;
  private initialized: boolean = false;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private modelConfig: ModelContextConfig;

  constructor(config: Partial<UnifiedContextConfig> = {}) {
    super();
    this.config = { ...DEFAULT_UNIFIED_CONTEXT_CONFIG, ...config };
    this.summarization = getSummarizationService({
      model: this.config.summarization.model
    });
    this.embeddings = getEmbeddingService({
      provider: this.config.embeddings.provider as any,
      dimensions: this.config.embeddings.dimensions,
      cacheSize: this.config.embeddings.cacheSize
    });

    // Default to llama3.2 model config
    this.modelConfig = MODEL_CONTEXT_CONFIGS['llama3.2:3b'];

    this.currentWindow = {
      entries: [],
      totalTokens: 0,
      maxTokens: this.config.window.maxTokens,
      model: 'llama3.2:3b',
      compressionLevel: 0
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize embeddings
    if (this.config.embeddings.enabled) {
      await this.embeddings.initialize();
    }

    // Load persisted state
    await this.loadState();

    // Start snapshot timer
    if (this.config.storage.snapshotInterval > 0) {
      this.snapshotTimer = setInterval(
        () => this.createSnapshot(),
        this.config.storage.snapshotInterval
      );
    }

    this.initialized = true;
    this.emit('initialized');
  }

  async shutdown(): Promise<void> {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }

    // Final save
    await this.saveState();
    this.initialized = false;
  }

  // ==========================================================================
  // Entry Management
  // ==========================================================================

  async addEntry(
    type: ContextEntryType,
    content: string,
    metadata: Partial<ContextEntry['metadata']> = {},
    priority: ContextPriority = ContextPriority.MEDIUM
  ): Promise<ContextEntry> {
    const id = uuidv4();
    const tokens = this.estimateTokens(content);

    const entry: ContextEntry = {
      id,
      type,
      content,
      timestamp: new Date(),
      priority,
      tokens,
      metadata: {
        ...metadata,
        source: metadata.source || 'user'
      },
      version: 1,
      deleted: false
    };

    // Generate embedding if enabled
    if (this.config.embeddings.enabled) {
      try {
        const result = await this.embeddings.embed(content);
        entry.embedding = result.vector;
      } catch {
        // Continue without embedding
      }
    }

    this.entries.set(id, entry);
    this.recordDelta({ type: 'add', entry });

    // Update window
    await this.updateWindow();

    this.emitEvent({ type: 'entry_added', entry });
    return entry;
  }

  async addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    priority: ContextPriority = ContextPriority.MEDIUM
  ): Promise<ContextEntry> {
    return this.addEntry(
      ContextEntryType.MESSAGE,
      content,
      { role },
      priority
    );
  }

  async addCode(
    code: string,
    language: string,
    file?: string,
    priority: ContextPriority = ContextPriority.MEDIUM
  ): Promise<ContextEntry> {
    return this.addEntry(
      ContextEntryType.CODE,
      code,
      { language, file },
      priority
    );
  }

  async addFile(
    content: string,
    filePath: string,
    priority: ContextPriority = ContextPriority.MEDIUM
  ): Promise<ContextEntry> {
    const language = this.detectLanguage(filePath);
    return this.addEntry(
      ContextEntryType.FILE,
      content,
      { file: filePath, language },
      priority
    );
  }

  async addCommand(
    command: string,
    priority: ContextPriority = ContextPriority.LOW
  ): Promise<ContextEntry> {
    return this.addEntry(
      ContextEntryType.COMMAND,
      command,
      {},
      priority
    );
  }

  async addResult(
    result: string,
    source: string,
    priority: ContextPriority = ContextPriority.MEDIUM
  ): Promise<ContextEntry> {
    return this.addEntry(
      ContextEntryType.RESULT,
      result,
      { source },
      priority
    );
  }

  async addError(
    error: string,
    source: string,
    priority: ContextPriority = ContextPriority.HIGH
  ): Promise<ContextEntry> {
    return this.addEntry(
      ContextEntryType.ERROR,
      error,
      { source },
      priority
    );
  }

  getEntry(id: string): ContextEntry | undefined {
    return this.entries.get(id);
  }

  async updateEntry(id: string, changes: Partial<ContextEntry>): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    // Apply changes
    Object.assign(entry, changes);
    entry.version++;

    // Re-embed if content changed
    if (changes.content && this.config.embeddings.enabled) {
      try {
        const result = await this.embeddings.embed(changes.content);
        entry.embedding = result.vector;
      } catch {
        // Continue without embedding
      }
    }

    // Recalculate tokens if content changed
    if (changes.content) {
      entry.tokens = this.estimateTokens(changes.content);
    }

    this.recordDelta({ type: 'modify', id, changes });
    this.emitEvent({ type: 'entry_modified', id, changes });

    await this.updateWindow();
    return true;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const entry = this.entries.get(id);
    if (!entry) return false;

    entry.deleted = true;
    this.recordDelta({ type: 'delete', id });
    this.emitEvent({ type: 'entry_deleted', id });

    await this.updateWindow();
    return true;
  }

  // ==========================================================================
  // Window Management
  // ==========================================================================

  private async updateWindow(): Promise<void> {
    const availableTokens = this.modelConfig.maxContextTokens -
                            this.modelConfig.reservedOutputTokens;

    // Get all active entries sorted by relevance
    const activeEntries = Array.from(this.entries.values())
      .filter(e => !e.deleted)
      .sort((a, b) => this.calculateRelevance(b) - this.calculateRelevance(a));

    // Check if compression needed
    const totalTokens = activeEntries.reduce((sum, e) => sum + e.tokens, 0);
    const threshold = availableTokens * this.modelConfig.compressionThreshold;

    if (totalTokens > threshold && this.config.summarization.enabled) {
      await this.compressContext(availableTokens);
      return;
    }

    // Build window with entries that fit
    const windowEntries: ContextEntry[] = [];
    let currentTokens = 0;

    for (const entry of activeEntries) {
      if (currentTokens + entry.tokens <= availableTokens) {
        windowEntries.push(entry);
        currentTokens += entry.tokens;
      }
    }

    this.currentWindow = {
      entries: windowEntries,
      totalTokens: currentTokens,
      maxTokens: availableTokens,
      model: this.modelConfig.name,
      compressionLevel: 0
    };

    this.emitEvent({ type: 'window_updated', window: this.currentWindow });
  }

  private calculateRelevance(entry: ContextEntry): number {
    const priorityWeight = this.config.window.priorityWeights[entry.priority];
    const typeWeight = this.config.window.typeWeights[entry.type];

    // Recency bonus (entries from last hour get boost)
    const age = Date.now() - entry.timestamp.getTime();
    const recencyBonus = age < 3600000 ? 2 : age < 86400000 ? 1.5 : 1;

    // Version penalty (higher versions indicate edits, might be less relevant)
    const versionPenalty = 1 / entry.version;

    return priorityWeight * typeWeight * recencyBonus * versionPenalty;
  }

  private async compressContext(targetTokens: number): Promise<void> {
    const activeEntries = Array.from(this.entries.values())
      .filter(e => !e.deleted)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Preserve recent entries
    const recentCount = this.config.summarization.preserveRecent;
    const toPreserve = activeEntries.slice(-recentCount);
    const toSummarize = activeEntries.slice(0, -recentCount);

    if (toSummarize.length === 0) {
      await this.updateWindow();
      return;
    }

    const beforeTokens = this.currentWindow.totalTokens;

    // Summarize older entries
    const result = await this.summarization.summarize({
      entries: toSummarize,
      targetTokens: targetTokens * 0.4,  // Allocate 40% for summary
      preserveTypes: [ContextEntryType.ERROR],
      style: 'concise'
    });

    // Create summary entry
    const summaryEntry = await this.addEntry(
      ContextEntryType.SUMMARY,
      result.summary,
      {
        summarizedFrom: result.summarizedEntries,
        source: 'compression'
      },
      ContextPriority.HIGH
    );

    // Mark summarized entries as deleted
    for (const id of result.summarizedEntries) {
      await this.deleteEntry(id);
    }

    // Update window
    await this.updateWindow();

    this.emitEvent({
      type: 'context_compressed',
      before: beforeTokens,
      after: this.currentWindow.totalTokens
    });
  }

  setModel(modelName: string): void {
    const config = MODEL_CONTEXT_CONFIGS[modelName];
    if (config) {
      this.modelConfig = config;
      this.currentWindow.model = modelName;
      this.currentWindow.maxTokens = config.maxContextTokens - config.reservedOutputTokens;
    }
  }

  getWindow(): ContextWindow {
    return { ...this.currentWindow };
  }

  getWindowContent(): string {
    return this.currentWindow.entries
      .map(e => this.formatEntryForPrompt(e))
      .join('\n\n');
  }

  // ==========================================================================
  // Search
  // ==========================================================================

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, limit = 10, types, minScore = 0.5, semantic = true } = options;
    const results: SearchResult[] = [];

    const activeEntries = Array.from(this.entries.values())
      .filter(e => !e.deleted && (!types || types.includes(e.type)));

    if (semantic && this.config.embeddings.enabled) {
      // Semantic search
      try {
        const queryResult = await this.embeddings.embed(query);

        for (const entry of activeEntries) {
          if (!entry.embedding) continue;

          const score = this.embeddings.cosineSimilarity(queryResult.vector, entry.embedding);

          if (score >= minScore) {
            results.push({
              entry,
              score,
              matchType: 'semantic'
            });
          }
        }
      } catch {
        // Fall back to keyword search
      }
    }

    // Keyword search (always run, combine with semantic)
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(k => k.length > 2);

    for (const entry of activeEntries) {
      const contentLower = entry.content.toLowerCase();
      let keywordScore = 0;

      for (const keyword of keywords) {
        if (contentLower.includes(keyword)) {
          keywordScore += 1 / keywords.length;
        }
      }

      if (keywordScore >= minScore * 0.5) {
        // Check if already in semantic results
        const existing = results.find(r => r.entry.id === entry.id);
        if (existing) {
          // Combine scores
          existing.score = existing.score * this.config.search.semanticWeight +
                          keywordScore * this.config.search.keywordWeight;
        } else {
          results.push({
            entry,
            score: keywordScore,
            matchType: 'keyword'
          });
        }
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);

    this.emitEvent({ type: 'search_performed', query, results: results.length });

    return results.slice(0, limit);
  }

  async findSimilar(entryId: string, limit: number = 5): Promise<SearchResult[]> {
    const entry = this.entries.get(entryId);
    if (!entry || !entry.embedding) {
      return [];
    }

    const results: SearchResult[] = [];

    for (const [id, other] of this.entries) {
      if (id === entryId || other.deleted || !other.embedding) continue;

      const score = this.embeddings.cosineSimilarity(entry.embedding, other.embedding);

      if (score > 0.5) {
        results.push({
          entry: other,
          score,
          matchType: 'semantic'
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  async createSnapshot(): Promise<ContextSnapshot> {
    const entries = Array.from(this.entries.values()).filter(e => !e.deleted);
    const totalTokens = entries.reduce((sum, e) => sum + e.tokens, 0);

    const snapshot: ContextSnapshot = {
      id: uuidv4(),
      timestamp: new Date(),
      entries,
      totalTokens,
      checksum: this.computeChecksum(entries)
    };

    this.snapshots.push(snapshot);

    // Trim old snapshots
    while (this.snapshots.length > this.config.storage.maxSnapshots) {
      this.snapshots.shift();
    }

    // Clear deltas since snapshot
    this.deltas = [];

    this.emitEvent({ type: 'snapshot_created', snapshot });

    // Persist
    await this.saveState();

    return snapshot;
  }

  private recordDelta(delta: { type: 'add' | 'modify' | 'delete'; entry?: ContextEntry; id?: string; changes?: Partial<ContextEntry> }): void {
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];

    if (!latestSnapshot) {
      return;
    }

    let contextDelta = this.deltas.find(d => d.snapshotId === latestSnapshot.id);

    if (!contextDelta) {
      contextDelta = {
        snapshotId: latestSnapshot.id,
        timestamp: new Date(),
        added: [],
        modified: [],
        deleted: []
      };
      this.deltas.push(contextDelta);
    }

    switch (delta.type) {
      case 'add':
        if (delta.entry) {
          contextDelta.added.push(delta.entry);
        }
        break;
      case 'modify':
        if (delta.id && delta.changes) {
          contextDelta.modified.push({ id: delta.id, changes: delta.changes });
        }
        break;
      case 'delete':
        if (delta.id) {
          contextDelta.deleted.push(delta.id);
        }
        break;
    }
  }

  private async saveState(): Promise<void> {
    const storagePath = path.resolve(this.config.storage.persistPath);
    await fs.ensureDir(storagePath);

    // Save current state
    const state = {
      entries: Array.from(this.entries.entries()),
      snapshots: this.snapshots.slice(-10),  // Keep recent snapshots
      deltas: this.deltas,
      savedAt: new Date()
    };

    await fs.writeJson(
      path.join(storagePath, 'context-state.json'),
      state,
      { spaces: 2 }
    );
  }

  private async loadState(): Promise<void> {
    const statePath = path.join(this.config.storage.persistPath, 'context-state.json');

    try {
      if (await fs.pathExists(statePath)) {
        const state = await fs.readJson(statePath);

        this.entries = new Map(state.entries || []);
        this.snapshots = state.snapshots || [];
        this.deltas = state.deltas || [];

        // Update window with loaded entries
        await this.updateWindow();
      }
    } catch {
      // Start fresh if load fails
      this.entries.clear();
      this.snapshots = [];
      this.deltas = [];
    }
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  getStats(): StorageStats {
    const entries = Array.from(this.entries.values()).filter(e => !e.deleted);
    const timestamps = entries.map(e => e.timestamp.getTime());

    return {
      totalEntries: entries.length,
      totalTokens: entries.reduce((sum, e) => sum + e.tokens, 0),
      snapshots: this.snapshots.length,
      deltas: this.deltas.length,
      compressionRatio: this.currentWindow.compressionLevel,
      oldestEntry: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date(),
      newestEntry: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date()
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.md': 'markdown',
      '.html': 'html',
      '.css': 'css',
      '.sql': 'sql'
    };
    return langMap[ext] || 'text';
  }

  private formatEntryForPrompt(entry: ContextEntry): string {
    switch (entry.type) {
      case ContextEntryType.MESSAGE:
        const role = entry.metadata.role || 'unknown';
        return `[${role}]: ${entry.content}`;

      case ContextEntryType.CODE:
        const lang = entry.metadata.language || '';
        return `\`\`\`${lang}\n${entry.content}\n\`\`\``;

      case ContextEntryType.FILE:
        return `File: ${entry.metadata.file || 'unknown'}\n${entry.content}`;

      case ContextEntryType.ERROR:
        return `Error: ${entry.content}`;

      case ContextEntryType.SUMMARY:
        return `[Summary]: ${entry.content}`;

      default:
        return entry.content;
    }
  }

  private computeChecksum(entries: ContextEntry[]): string {
    const content = entries.map(e => e.id + e.content).join('');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private emitEvent(event: ContextEvent): void {
    this.emit(event.type, event);
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  updateConfig(config: Partial<UnifiedContextConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): UnifiedContextConfig {
    return { ...this.config };
  }

  clear(): void {
    this.entries.clear();
    this.snapshots = [];
    this.deltas = [];
    this.currentWindow.entries = [];
    this.currentWindow.totalTokens = 0;
    this.currentWindow.compressionLevel = 0;
    this.emit('cleared');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let unifiedContextInstance: UnifiedContextSystem | null = null;

export async function getUnifiedContextSystem(
  config?: Partial<UnifiedContextConfig>
): Promise<UnifiedContextSystem> {
  if (!unifiedContextInstance) {
    unifiedContextInstance = new UnifiedContextSystem(config);
    await unifiedContextInstance.initialize();
  } else if (config) {
    unifiedContextInstance.updateConfig(config);
  }
  return unifiedContextInstance;
}

export function resetUnifiedContextSystem(): void {
  if (unifiedContextInstance) {
    unifiedContextInstance.clear();
    unifiedContextInstance.removeAllListeners();
  }
  unifiedContextInstance = null;
}
