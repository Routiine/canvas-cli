/**
 * AI Summarization Service
 *
 * Provides intelligent context summarization using Ollama models.
 * Replaces the stub implementation in context-manager.ts
 *
 * Features:
 * - Multiple summarization styles
 * - Importance preservation
 * - Code-aware summarization
 * - Conversation thread preservation
 */

import { EventEmitter } from 'events';
import type {
  ContextEntry,
  SummarizationRequest,
  SummarizationResult
} from '../unified-types';
import {
  ContextEntryType,
  ContextPriority
} from '../unified-types';
import type { OllamaBackend } from '../../agents/autonomous/ollama-backend';
import { getOllamaBackend } from '../../agents/autonomous/ollama-backend';

// ============================================================================
// Types
// ============================================================================

interface SummarizationConfig {
  model: string;
  maxChunkSize: number;
  preserveCodeBlocks: boolean;
  preserveErrors: boolean;
  preserveDecisions: boolean;
  targetCompressionRatio: number;
}

interface ChunkSummary {
  original: ContextEntry[];
  summary: string;
  tokens: number;
  preserved: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SummarizationConfig = {
  model: 'llama3.2:1b',
  maxChunkSize: 4000,  // tokens
  preserveCodeBlocks: true,
  preserveErrors: true,
  preserveDecisions: true,
  targetCompressionRatio: 0.3  // Target 30% of original size
};

// ============================================================================
// Summarization Service
// ============================================================================

export class SummarizationService extends EventEmitter {
  private config: SummarizationConfig;
  private ollama: OllamaBackend;
  private summaryCache: Map<string, string> = new Map();

  constructor(config: Partial<SummarizationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ollama = getOllamaBackend();
  }

  // ==========================================================================
  // Main Summarization Methods
  // ==========================================================================

  async summarize(request: SummarizationRequest): Promise<SummarizationResult> {
    const { entries, targetTokens, preserveTypes, preserveIds, style } = request;

    if (entries.length === 0) {
      return {
        summary: '',
        originalTokens: 0,
        summaryTokens: 0,
        compressionRatio: 1,
        preservedEntries: [],
        summarizedEntries: []
      };
    }

    const originalTokens = entries.reduce((sum, e) => sum + e.tokens, 0);

    // Separate entries to preserve vs summarize
    const { toPreserve, toSummarize } = this.separateEntries(
      entries,
      preserveTypes || [],
      preserveIds || []
    );

    // If nothing to summarize, return preserved as-is
    if (toSummarize.length === 0) {
      const preservedContent = toPreserve.map(e => this.formatEntry(e)).join('\n\n');
      const preservedTokens = toPreserve.reduce((sum, e) => sum + e.tokens, 0);

      return {
        summary: preservedContent,
        originalTokens,
        summaryTokens: preservedTokens,
        compressionRatio: preservedTokens / originalTokens,
        preservedEntries: toPreserve.map(e => e.id),
        summarizedEntries: []
      };
    }

    // Chunk and summarize
    const chunks = this.chunkEntries(toSummarize);
    const chunkSummaries: ChunkSummary[] = [];

    for (const chunk of chunks) {
      const summary = await this.summarizeChunk(chunk, style || 'concise');
      chunkSummaries.push(summary);
    }

    // Combine summaries
    const combinedSummary = await this.combineSummaries(
      chunkSummaries,
      toPreserve,
      targetTokens,
      style || 'concise'
    );

    const summaryTokens = this.estimateTokens(combinedSummary);

    return {
      summary: combinedSummary,
      originalTokens,
      summaryTokens,
      compressionRatio: summaryTokens / originalTokens,
      preservedEntries: toPreserve.map(e => e.id),
      summarizedEntries: toSummarize.map(e => e.id)
    };
  }

  async summarizeConversation(entries: ContextEntry[]): Promise<string> {
    // Filter to messages only
    const messages = entries.filter(e =>
      e.type === ContextEntryType.MESSAGE ||
      e.type === ContextEntryType.RESULT
    );

    if (messages.length === 0) {
      return 'No conversation to summarize.';
    }

    const conversation = messages.map(m => {
      const role = m.metadata.role || 'unknown';
      return `${role}: ${m.content.substring(0, 500)}`;
    }).join('\n');

    const response = await this.ollama.generate({
      model: this.config.model,
      prompt: `Summarize this conversation, preserving key decisions and action items:\n\n${conversation}`,
      system: `You are a conversation summarizer. Create a concise summary that captures:
1. Main topics discussed
2. Key decisions made
3. Action items or tasks identified
4. Important outcomes

Keep the summary under 200 words.`,
      options: {
        temperature: 0.3,
        num_predict: 500
      }
    });

    return response.response;
  }

  async summarizeCodeContext(entries: ContextEntry[]): Promise<string> {
    // Filter to code and file entries
    const codeEntries = entries.filter(e =>
      e.type === ContextEntryType.CODE ||
      e.type === ContextEntryType.FILE
    );

    if (codeEntries.length === 0) {
      return 'No code context to summarize.';
    }

    const codeContext = codeEntries.map(e => {
      const file = e.metadata.file || 'unknown';
      const lang = e.metadata.language || 'unknown';
      const snippet = e.content.substring(0, 1000);
      return `File: ${file} (${lang})\n\`\`\`\n${snippet}\n\`\`\``;
    }).join('\n\n');

    const response = await this.ollama.generate({
      model: this.config.model,
      prompt: `Summarize this code context:\n\n${codeContext}`,
      system: `You are a code summarizer. Create a technical summary that captures:
1. Files and their purposes
2. Key functions/classes
3. Dependencies and relationships
4. Notable patterns or issues

Keep the summary under 300 words.`,
      options: {
        temperature: 0.2,
        num_predict: 600
      }
    });

    return response.response;
  }

  async incrementalSummarize(
    existingSummary: string,
    newEntries: ContextEntry[]
  ): Promise<string> {
    if (newEntries.length === 0) {
      return existingSummary;
    }

    const newContent = newEntries.map(e => this.formatEntry(e)).join('\n');

    const response = await this.ollama.generate({
      model: this.config.model,
      prompt: `Existing summary:\n${existingSummary}\n\nNew information:\n${newContent}`,
      system: `You are an incremental summarizer. Update the existing summary to incorporate the new information.
- Keep important information from the existing summary
- Add relevant new information
- Remove redundant or outdated details
- Keep the summary concise`,
      options: {
        temperature: 0.3,
        num_predict: 800
      }
    });

    return response.response;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private separateEntries(
    entries: ContextEntry[],
    preserveTypes: ContextEntryType[],
    preserveIds: string[]
  ): { toPreserve: ContextEntry[]; toSummarize: ContextEntry[] } {
    const toPreserve: ContextEntry[] = [];
    const toSummarize: ContextEntry[] = [];

    for (const entry of entries) {
      // Always preserve critical entries
      if (entry.priority === ContextPriority.CRITICAL) {
        toPreserve.push(entry);
        continue;
      }

      // Preserve by type
      if (preserveTypes.includes(entry.type)) {
        toPreserve.push(entry);
        continue;
      }

      // Preserve by ID
      if (preserveIds.includes(entry.id)) {
        toPreserve.push(entry);
        continue;
      }

      // Preserve errors if configured
      if (this.config.preserveErrors && entry.type === ContextEntryType.ERROR) {
        toPreserve.push(entry);
        continue;
      }

      // Summarize everything else
      toSummarize.push(entry);
    }

    return { toPreserve, toSummarize };
  }

  private chunkEntries(entries: ContextEntry[]): ContextEntry[][] {
    const chunks: ContextEntry[][] = [];
    let currentChunk: ContextEntry[] = [];
    let currentTokens = 0;

    for (const entry of entries) {
      if (currentTokens + entry.tokens > this.config.maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentTokens = 0;
      }

      currentChunk.push(entry);
      currentTokens += entry.tokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async summarizeChunk(
    entries: ContextEntry[],
    style: 'concise' | 'detailed' | 'bullet'
  ): Promise<ChunkSummary> {
    const content = entries.map(e => this.formatEntry(e)).join('\n\n');
    const cacheKey = this.computeCacheKey(content, style);

    // Check cache
    if (this.summaryCache.has(cacheKey)) {
      const cached = this.summaryCache.get(cacheKey)!;
      return {
        original: entries,
        summary: cached,
        tokens: this.estimateTokens(cached),
        preserved: []
      };
    }

    const stylePrompts = {
      concise: 'Create a brief summary (2-3 sentences) capturing the key points.',
      detailed: 'Create a comprehensive summary preserving important details.',
      bullet: 'Create a bullet-point summary of the key information.'
    };

    const response = await this.ollama.generate({
      model: this.config.model,
      prompt: `Summarize the following:\n\n${content}`,
      system: `You are a context summarizer. ${stylePrompts[style]}
Focus on:
- Key information and decisions
- Important code changes or errors
- Action items and outcomes
Omit redundant or trivial details.`,
      options: {
        temperature: 0.3,
        num_predict: style === 'detailed' ? 800 : 400
      }
    });

    const summary = response.response;

    // Cache the result
    this.summaryCache.set(cacheKey, summary);

    // Limit cache size
    if (this.summaryCache.size > 1000) {
      const firstKey = this.summaryCache.keys().next().value;
      if (firstKey) {
        this.summaryCache.delete(firstKey);
      }
    }

    return {
      original: entries,
      summary,
      tokens: this.estimateTokens(summary),
      preserved: []
    };
  }

  private async combineSummaries(
    chunkSummaries: ChunkSummary[],
    preservedEntries: ContextEntry[],
    targetTokens: number,
    style: 'concise' | 'detailed' | 'bullet'
  ): Promise<string> {
    const parts: string[] = [];

    // Add preserved entries first
    if (preservedEntries.length > 0) {
      parts.push('## Preserved Context');
      for (const entry of preservedEntries) {
        parts.push(this.formatEntry(entry));
      }
    }

    // Add summaries
    if (chunkSummaries.length === 1) {
      parts.push('\n## Summary');
      parts.push(chunkSummaries[0].summary);
    } else if (chunkSummaries.length > 1) {
      // Combine multiple summaries if needed
      const combinedSummary = chunkSummaries.map((cs, i) =>
        `Part ${i + 1}: ${cs.summary}`
      ).join('\n\n');

      // If combined is still too long, summarize again
      const combinedTokens = this.estimateTokens(combinedSummary);

      if (combinedTokens > targetTokens * 0.7) {
        const response = await this.ollama.generate({
          model: this.config.model,
          prompt: `Combine these summaries into one coherent summary:\n\n${combinedSummary}`,
          system: `Create a unified summary from multiple parts. Keep it ${style}.`,
          options: {
            temperature: 0.3,
            num_predict: Math.min(targetTokens, 1000)
          }
        });

        parts.push('\n## Summary');
        parts.push(response.response);
      } else {
        parts.push('\n## Summary');
        parts.push(combinedSummary);
      }
    }

    return parts.join('\n\n');
  }

  private formatEntry(entry: ContextEntry): string {
    const timestamp = entry.timestamp.toISOString().split('T')[0];
    const prefix = this.getEntryPrefix(entry);

    switch (entry.type) {
      case ContextEntryType.CODE:
        const lang = entry.metadata.language || '';
        return `${prefix} [${timestamp}]\n\`\`\`${lang}\n${entry.content}\n\`\`\``;

      case ContextEntryType.FILE:
        return `${prefix} ${entry.metadata.file || 'file'} [${timestamp}]\n${entry.content}`;

      case ContextEntryType.ERROR:
        return `${prefix} [${timestamp}]\n${entry.content}`;

      case ContextEntryType.COMMAND:
        return `${prefix} [${timestamp}]: ${entry.content}`;

      default:
        return `${prefix} [${timestamp}]: ${entry.content}`;
    }
  }

  private getEntryPrefix(entry: ContextEntry): string {
    switch (entry.type) {
      case ContextEntryType.MESSAGE:
        return entry.metadata.role === 'user' ? '**User**' : '**Assistant**';
      case ContextEntryType.CODE:
        return '**Code**';
      case ContextEntryType.FILE:
        return '**File**';
      case ContextEntryType.COMMAND:
        return '**Command**';
      case ContextEntryType.RESULT:
        return '**Result**';
      case ContextEntryType.ERROR:
        return '**Error**';
      case ContextEntryType.SYSTEM:
        return '**System**';
      case ContextEntryType.SUMMARY:
        return '**Summary**';
      default:
        return '**Entry**';
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private computeCacheKey(content: string, style: string): string {
    // Simple hash-like key
    let hash = 0;
    const str = content + style;
    for (let i = 0; i < Math.min(str.length, 1000); i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${style}_${hash}`;
  }

  // ==========================================================================
  // Specialized Summarization Methods
  // ==========================================================================

  async summarizeErrors(entries: ContextEntry[]): Promise<string> {
    const errors = entries.filter(e => e.type === ContextEntryType.ERROR);

    if (errors.length === 0) {
      return 'No errors to summarize.';
    }

    const errorContent = errors.map((e, i) =>
      `Error ${i + 1} [${e.timestamp.toISOString()}]:\n${e.content}`
    ).join('\n\n');

    const response = await this.ollama.generate({
      model: this.config.model,
      prompt: `Analyze and summarize these errors:\n\n${errorContent}`,
      system: `You are an error analyst. Summarize the errors:
1. Common patterns or root causes
2. Severity assessment
3. Suggested fixes
Keep it technical and actionable.`,
      options: {
        temperature: 0.2,
        num_predict: 600
      }
    });

    return response.response;
  }

  async summarizeSession(entries: ContextEntry[]): Promise<string> {
    // Create a comprehensive session summary
    const messages = entries.filter(e => e.type === ContextEntryType.MESSAGE);
    const code = entries.filter(e => e.type === ContextEntryType.CODE);
    const errors = entries.filter(e => e.type === ContextEntryType.ERROR);
    const commands = entries.filter(e => e.type === ContextEntryType.COMMAND);

    const sections: string[] = [];

    if (messages.length > 0) {
      sections.push(`Conversation: ${messages.length} messages`);
      sections.push(await this.summarizeConversation(messages));
    }

    if (code.length > 0) {
      sections.push(`\nCode: ${code.length} snippets`);
      sections.push(await this.summarizeCodeContext(code));
    }

    if (errors.length > 0) {
      sections.push(`\nErrors: ${errors.length} encountered`);
      sections.push(await this.summarizeErrors(errors));
    }

    if (commands.length > 0) {
      sections.push(`\nCommands: ${commands.length} executed`);
    }

    return sections.join('\n');
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  updateConfig(config: Partial<SummarizationConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): SummarizationConfig {
    return { ...this.config };
  }

  clearCache(): void {
    this.summaryCache.clear();
    this.emit('cache_cleared');
  }

  getCacheSize(): number {
    return this.summaryCache.size;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let summarizationServiceInstance: SummarizationService | null = null;

export function getSummarizationService(
  config?: Partial<SummarizationConfig>
): SummarizationService {
  if (!summarizationServiceInstance) {
    summarizationServiceInstance = new SummarizationService(config);
  } else if (config) {
    summarizationServiceInstance.updateConfig(config);
  }
  return summarizationServiceInstance;
}

export function resetSummarizationService(): void {
  if (summarizationServiceInstance) {
    summarizationServiceInstance.clearCache();
    summarizationServiceInstance.removeAllListeners();
  }
  summarizationServiceInstance = null;
}
