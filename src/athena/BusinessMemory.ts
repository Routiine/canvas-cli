/**
 * BusinessMemory
 * Wraps PersistentMemory with Athena-specific business knowledge operations.
 */

import { PersistentMemory, type MemoryEntry } from '../memory/persistent-memory.js';

export type BusinessCategory = 'brand' | 'competitor' | 'keyword' | 'insight' | 'decision';

// Map business categories onto the MemoryEntry categories supported by PersistentMemory.
// PersistentMemory accepts: 'decision' | 'pattern' | 'preference' | 'fact' | 'error'
const CATEGORY_MAP: Record<BusinessCategory, MemoryEntry['category']> = {
  brand: 'fact',
  competitor: 'fact',
  keyword: 'fact',
  insight: 'pattern',
  decision: 'decision',
};

export class BusinessMemory {
  private memory: PersistentMemory;
  private agentId: string;
  private projectPath: string;

  constructor(agentId = 'athena', projectPath = process.cwd()) {
    this.agentId = agentId;
    this.projectPath = projectPath;
    this.memory = new PersistentMemory(agentId, projectPath);
  }

  async storeFact(
    content: string,
    category: BusinessCategory = 'insight',
    importance = 0.6
  ): Promise<void> {
    const mappedCategory = CATEGORY_MAP[category];
    this.memory.store({
      category: mappedCategory,
      content: `[${category}] ${content}`,
      importance,
    });
  }

  /**
   * Returns a formatted multi-line string summarising recent brand-related memories.
   */
  async getBrandContext(): Promise<string> {
    const entries = this.memory.recall({
      agentId: this.agentId,
      projectPath: this.projectPath,
      category: 'fact',
      limit: 10,
    });

    if (entries.length === 0) {
      return 'No brand context stored yet.';
    }

    return entries
      .map((e) => `- ${e.content}`)
      .join('\n');
  }

  /**
   * Builds a complete system prompt context string that Athena can prepend to
   * any LLM call so it always has current business knowledge.
   */
  async buildSystemContext(): Promise<string> {
    const all = this.memory.list({ limit: 20 });

    const sections: string[] = [
      'You are Athena AI — an autonomous business execution agent with deep knowledge of this business.',
      '',
    ];

    if (all.length > 0) {
      sections.push('[What you know about this business]');
      for (const entry of all) {
        sections.push(`  - ${entry.content}`);
      }
      sections.push('');
    }

    sections.push(
      'Your capabilities:',
      '- Web research and competitor analysis',
      '- SEO and content strategy',
      '- Business metrics analysis',
      '- Code development and automation',
      '- Any task requiring intelligence, research, or execution',
      '',
      'Always use tools when you need current information. Never make up facts.',
    );

    return sections.join('\n');
  }

  /**
   * Full-text search across stored memories, returning up to `limit` entries.
   */
  async recallRelevant(query: string, limit = 5): Promise<MemoryEntry[]> {
    return this.memory.recall({
      query,
      agentId: this.agentId,
      projectPath: this.projectPath,
      limit,
    });
  }

  /**
   * List all stored memories (for display commands).
   */
  list(options: { limit?: number } = {}): MemoryEntry[] {
    return this.memory.list({ limit: options.limit ?? 50 });
  }
}
