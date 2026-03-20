/**
 * mem0 Memory Adapter
 *
 * Provides persistent cross-session memory using mem0's API.
 * Falls back to local LLM-powered memory extraction if MEM0_API_KEY is unset.
 *
 * mem0 operates at 3 levels:
 *   - user_id: long-term user preferences, patterns, identity
 *   - agent_id: agent-specific learned behaviors
 *   - session_id: context for the current session
 */

import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import crypto from 'crypto';
import { getProviderRegistry } from '../../intelligence/provider-registry.js';

const MEM0_BASE_URL = process.env.MEM0_BASE_URL || 'https://api.mem0.ai/v1';

export interface Mem0Memory {
  id: string;
  memory: string;
  created_at: string;
  updated_at: string;
  score?: number; // relevance score when searching
}

export interface AddMemoryOptions {
  userId?: string;
  agentId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchMemoryOptions extends AddMemoryOptions {
  limit?: number;
}

// ─── mem0 Cloud API client ────────────────────────────────────────────────────

async function mem0ApiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const apiKey = process.env.MEM0_API_KEY;
  if (!apiKey) throw new Error('MEM0_API_KEY not set');

  const { default: fetch } = await import('node-fetch');
  const res = await fetch(`${MEM0_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw new Error(`mem0 API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Local memory extraction (fallback when no MEM0_API_KEY) ─────────────────

interface LocalMemoryEntry {
  id: string;
  memory: string;
  createdAt: string;
  tags: string[];
}

interface LocalMemoryStore {
  userId: string;
  memories: LocalMemoryEntry[];
}

const LOCAL_MEMORY_DIR = path.join(os.homedir(), '.canvas', 'memories');

async function ensureLocalDir(): Promise<void> {
  await fs.ensureDir(LOCAL_MEMORY_DIR);
}

async function loadLocalStore(userId: string): Promise<LocalMemoryStore> {
  await ensureLocalDir();
  const file = path.join(LOCAL_MEMORY_DIR, `${userId}.json`);
  try {
    return await fs.readJson(file) as LocalMemoryStore;
  } catch {
    return { userId, memories: [] };
  }
}

async function saveLocalStore(store: LocalMemoryStore): Promise<void> {
  const file = path.join(LOCAL_MEMORY_DIR, `${store.userId}.json`);
  await fs.writeJson(file, store, { spaces: 2 });
}

async function extractMemoriesLocally(
  messages: Array<{ role: string; content: string }>,
  existingMemories: string[]
): Promise<string[]> {
  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();
  if (!provider) return [];

  const prompt = `Extract factual memories worth remembering from this conversation.
Focus on: user preferences, decisions made, facts learned, patterns observed.
Existing memories (don't duplicate): ${existingMemories.slice(0, 20).join('; ')}

Conversation:
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

Return a JSON array of strings, each a discrete memory fact. Max 5 new memories.
Return [] if nothing new worth remembering.`;

  try {
    const response = await provider.complete([{ role: 'user', content: prompt }], { temperature: 0.2 });
    const match = response.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as string[];
  } catch {
    // Extraction failed — return empty to avoid crashing the caller
  }
  return [];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class Mem0Adapter {
  private useMem0Cloud: boolean;

  constructor() {
    this.useMem0Cloud = !!process.env.MEM0_API_KEY;
  }

  async addMemory(
    messages: Array<{ role: string; content: string }>,
    opts: AddMemoryOptions
  ): Promise<Mem0Memory[]> {
    if (this.useMem0Cloud) {
      try {
        const result = await mem0ApiRequest('POST', '/memories/', {
          messages,
          user_id: opts.userId,
          agent_id: opts.agentId,
          run_id: opts.sessionId,
          metadata: opts.metadata,
        }) as { results: Mem0Memory[] };
        return result.results || [];
      } catch (err) {
        console.warn('[mem0] cloud addMemory failed, skipping:', err);
        return [];
      }
    }

    // Local fallback
    const userId = opts.userId || opts.agentId || 'default';
    try {
      const store = await loadLocalStore(userId);
      const existing = store.memories.map(m => m.memory);
      const newMemories = await extractMemoriesLocally(messages, existing);

      const added: Mem0Memory[] = [];
      for (const mem of newMemories) {
        const entry: LocalMemoryEntry = {
          id: crypto.randomUUID(),
          memory: mem,
          createdAt: new Date().toISOString(),
          tags: [],
        };
        store.memories.push(entry);
        added.push({
          id: entry.id,
          memory: mem,
          created_at: entry.createdAt,
          updated_at: entry.createdAt,
        });
      }

      if (added.length > 0) await saveLocalStore(store);
      return added;
    } catch (err) {
      console.warn('[mem0] local addMemory failed, skipping:', err);
      return [];
    }
  }

  async searchMemory(query: string, opts: SearchMemoryOptions): Promise<Mem0Memory[]> {
    if (this.useMem0Cloud) {
      try {
        const result = await mem0ApiRequest('POST', '/memories/search/', {
          query,
          user_id: opts.userId,
          agent_id: opts.agentId,
          run_id: opts.sessionId,
          limit: opts.limit || 10,
        }) as { results: Mem0Memory[] };
        return result.results || [];
      } catch (err) {
        console.warn('[mem0] cloud searchMemory failed, falling back to local:', err);
        // Fall through to local search
      }
    }

    // Local fallback: simple keyword match
    const userId = opts.userId || opts.agentId || 'default';
    try {
      const store = await loadLocalStore(userId);
      const lq = query.toLowerCase();
      const queryWords = lq.split(/\s+/).filter(w => w.length > 2);

      const candidates = store.memories
        .filter(m => {
          const ml = m.memory.toLowerCase();
          return ml.includes(lq) || queryWords.some(w => ml.includes(w));
        })
        .slice(0, opts.limit || 10);

      return candidates.map(m => ({
        id: m.id,
        memory: m.memory,
        created_at: m.createdAt,
        updated_at: m.createdAt,
      }));
    } catch (err) {
      console.warn('[mem0] local searchMemory failed:', err);
      return [];
    }
  }

  async getAllMemories(opts: AddMemoryOptions): Promise<Mem0Memory[]> {
    if (this.useMem0Cloud) {
      try {
        const params = new URLSearchParams();
        if (opts.userId) params.set('user_id', opts.userId);
        if (opts.agentId) params.set('agent_id', opts.agentId);
        const result = await mem0ApiRequest('GET', `/memories/?${params.toString()}`) as { results: Mem0Memory[] };
        return result.results || [];
      } catch (err) {
        console.warn('[mem0] cloud getAllMemories failed, falling back to local:', err);
        // Fall through to local
      }
    }

    const userId = opts.userId || opts.agentId || 'default';
    try {
      const store = await loadLocalStore(userId);
      return store.memories.map(m => ({
        id: m.id,
        memory: m.memory,
        created_at: m.createdAt,
        updated_at: m.createdAt,
      }));
    } catch (err) {
      console.warn('[mem0] local getAllMemories failed:', err);
      return [];
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    if (this.useMem0Cloud) {
      try {
        await mem0ApiRequest('DELETE', `/memories/${memoryId}/`);
        return;
      } catch (err) {
        console.warn('[mem0] cloud deleteMemory failed:', err);
        return;
      }
    }

    // Local: scan all store files and remove the entry with the matching id
    try {
      await ensureLocalDir();
      const files = await fs.readdir(LOCAL_MEMORY_DIR);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(LOCAL_MEMORY_DIR, file);
        try {
          const store = await fs.readJson(filePath) as LocalMemoryStore;
          const before = store.memories.length;
          store.memories = store.memories.filter(m => m.id !== memoryId);
          if (store.memories.length < before) {
            await fs.writeJson(filePath, store, { spaces: 2 });
            return; // Found and removed — stop scanning
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch (err) {
      console.warn('[mem0] local deleteMemory failed:', err);
    }
  }
}

let _adapter: Mem0Adapter | null = null;

export function getMem0Adapter(): Mem0Adapter {
  if (!_adapter) _adapter = new Mem0Adapter();
  return _adapter;
}
