import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { encode } from 'gpt-3-encoder';
import crypto from 'crypto';

// Smart Context Manager with RAG support
export class SmartContextManager {
  private static instance: SmartContextManager;
  private contextChunks: Map<string, ContextChunk> = new Map();
  private contextIndex: Map<string, string[]> = new Map(); // keyword -> chunk IDs
  private maxContextSize: number = 100000; // tokens
  private currentContextSize: number = 0;
  private priorityQueue: PriorityQueue<ContextChunk> = new PriorityQueue();
  
  private constructor() {}

  static getInstance(): SmartContextManager {
    if (!SmartContextManager.instance) {
      SmartContextManager.instance = new SmartContextManager();
    }
    return SmartContextManager.instance;
  }

  // Add content to context with smart chunking
  async addToContext(content: string, metadata: ContextMetadata): Promise<string> {
    const chunks = this.smartChunk(content, metadata);
    const chunkIds: string[] = [];

    for (const chunk of chunks) {
      const chunkId = this.generateChunkId(chunk);
      chunk.id = chunkId;
      chunk.timestamp = new Date();
      chunk.accessCount = 0;
      chunk.relevanceScore = this.calculateRelevance(chunk);
      
      // Store chunk
      this.contextChunks.set(chunkId, chunk);
      chunkIds.push(chunkId);
      
      // Index for retrieval
      this.indexChunk(chunk);
      
      // Add to priority queue
      this.priorityQueue.enqueue(chunk, chunk.relevanceScore);
      
      // Update context size
      this.currentContextSize += chunk.tokenCount;
    }

    // Manage context size
    await this.optimizeContextSize();

    return chunkIds.join(',');
  }

  // Smart chunking with semantic boundaries
  private smartChunk(content: string, metadata: ContextMetadata): ContextChunk[] {
    const chunks: ContextChunk[] = [];
    const maxChunkTokens = 2000;
    
    // Determine chunking strategy based on content type
    if (metadata.type === 'code') {
      // Chunk by functions/classes for code
      chunks.push(...this.chunkByCodeBlocks(content, metadata, maxChunkTokens));
    } else if (metadata.type === 'documentation') {
      // Chunk by sections for docs
      chunks.push(...this.chunkBySections(content, metadata, maxChunkTokens));
    } else {
      // Default: chunk by paragraphs
      chunks.push(...this.chunkByParagraphs(content, metadata, maxChunkTokens));
    }

    return chunks;
  }

  private chunkByCodeBlocks(content: string, metadata: ContextMetadata, maxTokens: number): ContextChunk[] {
    const chunks: ContextChunk[] = [];
    const functionPattern = /(?:function|class|const|let|var)\s+(\w+)[\s\S]*?(?=\n(?:function|class|const|let|var)\s+|\n$)/g;
    let match;
    
    while ((match = functionPattern.exec(content)) !== null) {
      const block = match[0];
      const tokens = encode(block);
      
      if (tokens.length <= maxTokens) {
        chunks.push({
          id: '',
          content: block,
          metadata: { ...metadata, blockName: match[1] },
          tokenCount: tokens.length,
          type: 'code-block',
          relevanceScore: 0,
          timestamp: new Date(),
          accessCount: 0
        });
      } else {
        // Split large blocks
        chunks.push(...this.splitLargeChunk(block, metadata, maxTokens));
      }
    }

    return chunks.length > 0 ? chunks : this.chunkBySize(content, metadata, maxTokens);
  }

  private chunkBySections(content: string, metadata: ContextMetadata, maxTokens: number): ContextChunk[] {
    const chunks: ContextChunk[] = [];
    const sections = content.split(/\n#{1,6}\s+/);
    
    for (const section of sections) {
      if (section.trim()) {
        const tokens = encode(section);
        
        if (tokens.length <= maxTokens) {
          chunks.push({
            id: '',
            content: section,
            metadata,
            tokenCount: tokens.length,
            type: 'section',
            relevanceScore: 0,
            timestamp: new Date(),
            accessCount: 0
          });
        } else {
          chunks.push(...this.splitLargeChunk(section, metadata, maxTokens));
        }
      }
    }

    return chunks.length > 0 ? chunks : this.chunkBySize(content, metadata, maxTokens);
  }

  private chunkByParagraphs(content: string, metadata: ContextMetadata, maxTokens: number): ContextChunk[] {
    const chunks: ContextChunk[] = [];
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    let currentTokens = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = encode(paragraph).length;
      
      if (currentTokens + paragraphTokens <= maxTokens) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        currentTokens += paragraphTokens;
      } else {
        if (currentChunk) {
          chunks.push({
            id: '',
            content: currentChunk,
            metadata,
            tokenCount: currentTokens,
            type: 'paragraph',
            relevanceScore: 0,
            timestamp: new Date(),
            accessCount: 0
          });
        }
        currentChunk = paragraph;
        currentTokens = paragraphTokens;
      }
    }

    if (currentChunk) {
      chunks.push({
        id: '',
        content: currentChunk,
        metadata,
        tokenCount: currentTokens,
        type: 'paragraph',
        relevanceScore: 0,
        timestamp: new Date(),
        accessCount: 0
      });
    }

    return chunks;
  }

  private chunkBySize(content: string, metadata: ContextMetadata, maxTokens: number): ContextChunk[] {
    const chunks: ContextChunk[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let currentTokens = 0;

    for (const line of lines) {
      const lineTokens = encode(line).length;
      
      if (currentTokens + lineTokens <= maxTokens) {
        currentChunk += (currentChunk ? '\n' : '') + line;
        currentTokens += lineTokens;
      } else {
        if (currentChunk) {
          chunks.push({
            id: '',
            content: currentChunk,
            metadata,
            tokenCount: currentTokens,
            type: 'size-based',
            relevanceScore: 0,
            timestamp: new Date(),
            accessCount: 0
          });
        }
        currentChunk = line;
        currentTokens = lineTokens;
      }
    }

    if (currentChunk) {
      chunks.push({
        id: '',
        content: currentChunk,
        metadata,
        tokenCount: currentTokens,
        type: 'size-based',
        relevanceScore: 0,
        timestamp: new Date(),
        accessCount: 0
      });
    }

    return chunks;
  }

  private splitLargeChunk(content: string, metadata: ContextMetadata, maxTokens: number): ContextChunk[] {
    return this.chunkBySize(content, metadata, maxTokens);
  }

  // Index chunk for retrieval
  private indexChunk(chunk: ContextChunk): void {
    // Extract keywords for indexing
    const keywords = this.extractKeywords(chunk.content);
    
    for (const keyword of keywords) {
      if (!this.contextIndex.has(keyword)) {
        this.contextIndex.set(keyword, []);
      }
      this.contextIndex.get(keyword)!.push(chunk.id);
    }
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction (can be enhanced with NLP)
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Get unique words
    return [...new Set(words)];
  }

  // Retrieve relevant context based on query (RAG)
  async retrieveContext(query: string, maxTokens: number = 10000): Promise<string> {
    const queryKeywords = this.extractKeywords(query);
    const relevantChunks: Map<string, number> = new Map();
    
    // Find relevant chunks
    for (const keyword of queryKeywords) {
      const chunkIds = this.contextIndex.get(keyword) || [];
      for (const chunkId of chunkIds) {
        const currentScore = relevantChunks.get(chunkId) || 0;
        relevantChunks.set(chunkId, currentScore + 1);
      }
    }

    // Sort by relevance
    const sortedChunks = Array.from(relevantChunks.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([chunkId]) => this.contextChunks.get(chunkId))
      .filter(chunk => chunk !== undefined) as ContextChunk[];

    // Build context within token limit
    let context = '';
    let tokenCount = 0;
    
    for (const chunk of sortedChunks) {
      if (tokenCount + chunk.tokenCount <= maxTokens) {
        context += (context ? '\n\n---\n\n' : '') + chunk.content;
        tokenCount += chunk.tokenCount;
        chunk.accessCount++;
        chunk.lastAccessed = new Date();
      } else {
        break;
      }
    }

    return context;
  }

  // Optimize context size by removing least relevant chunks
  private async optimizeContextSize(): Promise<void> {
    while (this.currentContextSize > this.maxContextSize) {
      const leastRelevant = this.priorityQueue.dequeue();
      if (!leastRelevant) break;
      
      this.contextChunks.delete(leastRelevant.id);
      this.currentContextSize -= leastRelevant.tokenCount;
      
      // Remove from index
      for (const [keyword, chunkIds] of this.contextIndex) {
        const index = chunkIds.indexOf(leastRelevant.id);
        if (index > -1) {
          chunkIds.splice(index, 1);
          if (chunkIds.length === 0) {
            this.contextIndex.delete(keyword);
          }
        }
      }
    }
  }

  private calculateRelevance(chunk: ContextChunk): number {
    let score = 100;
    
    // Recency bonus
    const ageInMinutes = (Date.now() - chunk.timestamp.getTime()) / 60000;
    score -= Math.min(ageInMinutes * 0.1, 50);
    
    // Access frequency bonus
    score += chunk.accessCount * 5;
    
    // Type-based priority
    const typePriority = {
      'code-block': 20,
      'section': 15,
      'paragraph': 10,
      'size-based': 5
    };
    score += typePriority[chunk.type] || 0;
    
    // Metadata priority
    if (chunk.metadata.priority === 'high') score += 30;
    if (chunk.metadata.priority === 'low') score -= 20;
    
    return Math.max(0, score);
  }

  private generateChunkId(chunk: ContextChunk): string {
    const hash = crypto.createHash('sha256');
    hash.update(chunk.content);
    hash.update(JSON.stringify(chunk.metadata));
    return hash.digest('hex').substring(0, 16);
  }

  // Get context statistics
  getStatistics(): ContextStatistics {
    const stats: ContextStatistics = {
      totalChunks: this.contextChunks.size,
      totalTokens: this.currentContextSize,
      maxTokens: this.maxContextSize,
      utilizationPercent: (this.currentContextSize / this.maxContextSize) * 100,
      chunkTypes: {},
      averageRelevance: 0
    };

    let totalRelevance = 0;
    for (const chunk of this.contextChunks.values()) {
      stats.chunkTypes[chunk.type] = (stats.chunkTypes[chunk.type] || 0) + 1;
      totalRelevance += chunk.relevanceScore;
    }
    
    stats.averageRelevance = this.contextChunks.size > 0 
      ? totalRelevance / this.contextChunks.size 
      : 0;

    return stats;
  }

  // Clear all context
  clearContext(): void {
    this.contextChunks.clear();
    this.contextIndex.clear();
    this.currentContextSize = 0;
    this.priorityQueue = new PriorityQueue();
    console.log(chalk.yellow('Context cleared'));
  }

  // Export context to file
  async exportContext(filePath: string): Promise<void> {
    const exportData = {
      chunks: Array.from(this.contextChunks.values()),
      index: Array.from(this.contextIndex.entries()),
      statistics: this.getStatistics()
    };
    
    await fs.writeJSON(filePath, exportData, { spaces: 2 });
    console.log(chalk.green(`Context exported to ${filePath}`));
  }

  // Import context from file
  async importContext(filePath: string): Promise<void> {
    const importData = await fs.readJSON(filePath);
    
    this.clearContext();
    
    for (const chunk of importData.chunks) {
      chunk.timestamp = new Date(chunk.timestamp);
      chunk.lastAccessed = chunk.lastAccessed ? new Date(chunk.lastAccessed) : undefined;
      this.contextChunks.set(chunk.id, chunk);
      this.currentContextSize += chunk.tokenCount;
      this.priorityQueue.enqueue(chunk, chunk.relevanceScore);
    }
    
    for (const [keyword, chunkIds] of importData.index) {
      this.contextIndex.set(keyword, chunkIds);
    }
    
    console.log(chalk.green(`Context imported from ${filePath}`));
  }
}

// Smart Context Tool
export class SmartContextTool extends BaseTool {
  name = 'smart_context';
  description = 'Manage context intelligently with RAG support';
  parameters = {
    action: { type: 'string', description: 'Action: add, retrieve, optimize, stats, clear' },
    content: { type: 'string', description: 'Content to add', optional: true },
    query: { type: 'string', description: 'Query for retrieval', optional: true },
    metadata: { type: 'object', description: 'Content metadata', optional: true }
  };

  private manager = SmartContextManager.getInstance();

  async execute(params: any): Promise<any> {
    switch (params.action) {
      case 'add':
        if (!params.content) throw new Error('Content required for add action');
        const metadata: ContextMetadata = params.metadata || { 
          type: 'general',
          source: 'user',
          priority: 'normal'
        };
        const chunkIds = await this.manager.addToContext(params.content, metadata);
        return { action: 'added', chunkIds, stats: this.manager.getStatistics() };
      
      case 'retrieve':
        if (!params.query) throw new Error('Query required for retrieve action');
        const context = await this.manager.retrieveContext(params.query, params.maxTokens);
        return { action: 'retrieved', context, length: encode(context).length };
      
      case 'optimize':
        await this.manager['optimizeContextSize']();
        return { action: 'optimized', stats: this.manager.getStatistics() };
      
      case 'stats':
        return this.manager.getStatistics();
      
      case 'clear':
        this.manager.clearContext();
        return { action: 'cleared' };
      
      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }
}

// Priority Queue implementation
class PriorityQueue<T> {
  private items: Array<{ element: T; priority: number }> = [];

  enqueue(element: T, priority: number): void {
    const queueElement = { element, priority };
    let added = false;

    for (let i = 0; i < this.items.length; i++) {
      if (queueElement.priority > this.items[i].priority) {
        this.items.splice(i, 0, queueElement);
        added = true;
        break;
      }
    }

    if (!added) {
      this.items.push(queueElement);
    }
  }

  dequeue(): T | undefined {
    const item = this.items.pop();
    return item?.element;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

// Types
interface ContextChunk {
  id: string;
  content: string;
  metadata: ContextMetadata;
  tokenCount: number;
  type: 'code-block' | 'section' | 'paragraph' | 'size-based';
  relevanceScore: number;
  timestamp: Date;
  lastAccessed?: Date;
  accessCount: number;
}

interface ContextMetadata {
  type: 'code' | 'documentation' | 'conversation' | 'general';
  source: string;
  priority?: 'high' | 'normal' | 'low';
  language?: string;
  filePath?: string;
  [key: string]: any;
}

interface ContextStatistics {
  totalChunks: number;
  totalTokens: number;
  maxTokens: number;
  utilizationPercent: number;
  chunkTypes: Record<string, number>;
  averageRelevance: number;
}