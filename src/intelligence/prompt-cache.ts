/**
 * Prompt Caching
 * Adds cache_control breakpoints for Anthropic and DeepSeek providers.
 * Caches system prompt, read-only files, and repo map between turns.
 * Tracks cache hit/miss stats for cost optimization.
 */

export interface CacheableBlock {
  type: 'system' | 'repo_map' | 'file' | 'context';
  content: string;
  hash: string;
  cacheControl?: { type: 'ephemeral' };
}

export interface CacheStats {
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalSaved: number; // USD saved from cache hits
  hitRate: number; // 0-1
  hits: number;
  misses: number;
}

interface CacheEntry {
  hash: string;
  content: string;
  createdAt: number;
  lastUsedAt: number;
  hitCount: number;
}

/**
 * Compute a fast hash of content for cache key comparison
 */
function quickHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export class PromptCache {
  private cache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats = {
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalSaved: 0,
    hitRate: 0,
    hits: 0,
    misses: 0,
  };
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private keepAliveCallback: (() => Promise<void>) | null = null;

  /**
   * Add cache_control breakpoints to Anthropic-style messages.
   * The first 4 cacheable blocks get { cache_control: { type: 'ephemeral' } }.
   * Anthropic supports up to 4 cache breakpoints per request.
   */
  addCacheBreakpoints(params: {
    system?: string;
    repoMap?: string;
    readOnlyFiles?: Array<{ path: string; content: string }>;
    messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; [key: string]: unknown }> }>;
  }): {
    system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    messages: typeof params.messages;
  } {
    const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];
    let breakpointsUsed = 0;
    const MAX_BREAKPOINTS = 4;

    // System prompt — always cache (breakpoint 1)
    if (params.system) {
      const hash = quickHash(params.system);
      this.trackAccess('system', hash, params.system);
      systemBlocks.push({
        type: 'text',
        text: params.system,
        ...(breakpointsUsed < MAX_BREAKPOINTS ? { cache_control: { type: 'ephemeral' } } : {}),
      });
      breakpointsUsed++;
    }

    // Repo map — cache if provided (breakpoint 2)
    if (params.repoMap) {
      const hash = quickHash(params.repoMap);
      this.trackAccess('repo_map', hash, params.repoMap);
      systemBlocks.push({
        type: 'text',
        text: `\n\n<repo_map>\n${params.repoMap}\n</repo_map>`,
        ...(breakpointsUsed < MAX_BREAKPOINTS ? { cache_control: { type: 'ephemeral' } } : {}),
      });
      breakpointsUsed++;
    }

    // Read-only files — cache each (breakpoints 3-4)
    if (params.readOnlyFiles) {
      for (const file of params.readOnlyFiles) {
        if (breakpointsUsed >= MAX_BREAKPOINTS) break;
        const hash = quickHash(file.content);
        this.trackAccess(`file:${file.path}`, hash, file.content);
        systemBlocks.push({
          type: 'text',
          text: `\n\n<file path="${file.path}">\n${file.content}\n</file>`,
          cache_control: { type: 'ephemeral' },
        });
        breakpointsUsed++;
      }
    }

    return {
      system: systemBlocks,
      messages: params.messages,
    };
  }

  /**
   * Track cache access for stats
   */
  private trackAccess(key: string, hash: string, content: string): void {
    const existing = this.cache.get(key);
    if (existing && existing.hash === hash) {
      existing.lastUsedAt = Date.now();
      existing.hitCount++;
      this.stats.hits++;
    } else {
      this.cache.set(key, {
        hash,
        content,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        hitCount: 0,
      });
      this.stats.misses++;
    }
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Record cache token usage from API response
   */
  recordUsage(usage: {
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  }, pricePerMillionInput: number): void {
    if (usage.cacheCreationInputTokens) {
      // Cache creation costs 25% more than regular input
      this.stats.cacheCreationTokens += usage.cacheCreationInputTokens;
    }
    if (usage.cacheReadInputTokens) {
      // Cache reads cost 90% less than regular input
      this.stats.cacheReadTokens += usage.cacheReadInputTokens;
      const regularCost = (usage.cacheReadInputTokens * pricePerMillionInput) / 1_000_000;
      const cachedCost = regularCost * 0.1; // 90% discount
      this.stats.totalSaved += (regularCost - cachedCost);
    }
  }

  /**
   * Start keep-alive pings to maintain cache (every 4 minutes)
   */
  startKeepAlive(callback: () => Promise<void>): void {
    this.stopKeepAlive();
    this.keepAliveCallback = callback;
    this.keepAliveTimer = setInterval(async () => {
      if (this.keepAliveCallback) {
        try {
          await this.keepAliveCallback();
        } catch {
          // Silently fail — cache will just expire
        }
      }
    }, 4 * 60 * 1000); // 4 minutes (Anthropic cache TTL is 5 min)
    this.keepAliveTimer.unref(); // Don't prevent process exit
  }

  /**
   * Stop keep-alive pings
   */
  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.keepAliveCallback = null;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalSaved: 0,
      hitRate: 0,
      hits: 0,
      misses: 0,
    };
  }

  /**
   * Evict stale entries (not used in last 10 minutes)
   */
  evictStale(): number {
    const threshold = Date.now() - 10 * 60 * 1000;
    let evicted = 0;
    for (const [key, entry] of this.cache) {
      if (entry.lastUsedAt < threshold) {
        this.cache.delete(key);
        evicted++;
      }
    }
    return evicted;
  }
}

let instance: PromptCache | null = null;

export function getPromptCache(): PromptCache {
  if (!instance) {
    instance = new PromptCache();
  }
  return instance;
}
