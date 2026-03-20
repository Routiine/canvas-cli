/**
 * Intent Learner — fuzzy classification with persistent correction memory.
 *
 * Three-layer lookup:
 *   1. Exact match against learned patterns (highest confidence)
 *   2. Fuzzy word-overlap match against learned patterns (>= FUZZY_THRESHOLD)
 *   3. Falls through to pattern/LLM classifiers in chat.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export type Intent = 'task' | 'executable';

interface LearnedPattern {
  input: string;           // normalized original input
  intent: Intent;
  hits: number;            // how many times this was matched and confirmed
  addedAt: string;
}

interface LearnedStore {
  patterns: LearnedPattern[];
}

const STORE_PATH = path.join(os.homedir(), '.canvas-cli', 'intent-learned.json');
const FUZZY_THRESHOLD = 0.55; // word-overlap Jaccard similarity required to trust a learned match

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function loadStore(): LearnedStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8')) as LearnedStore;
    }
  } catch {
    // corrupt file — start fresh
  }
  return { patterns: [] };
}

function saveStore(store: LearnedStore): void {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // non-fatal
  }
}

// ---------------------------------------------------------------------------
// Fuzzy scoring — Jaccard similarity on word sets
// ---------------------------------------------------------------------------

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'me', 'my', 'us', 'for', 'to', 'in', 'on', 'at',
  'of', 'with', 'that', 'this', 'it', 'i', 'you', 'can', 'please',
]);

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check learned patterns for a fuzzy match.
 * Returns the matched intent + similarity score, or null if no confident match.
 */
export function classifyByLearned(input: string): { intent: Intent; score: number; matched: string } | null {
  const store = loadStore();
  if (store.patterns.length === 0) return null;

  const tokens = tokenize(input);
  let best: { intent: Intent; score: number; matched: string } | null = null;

  for (const p of store.patterns) {
    const score = jaccard(tokens, tokenize(p.input));
    if (score >= FUZZY_THRESHOLD) {
      if (!best || score > best.score) {
        best = { intent: p.intent, score, matched: p.input };
      }
    }
  }

  return best;
}

/**
 * Save a confirmed correction. If the same (normalized) input already exists,
 * update it in-place; otherwise append.
 */
export function saveLearnedPattern(input: string, intent: Intent): void {
  const store = loadStore();
  const normalized = input.trim().toLowerCase();
  const existing = store.patterns.find(p => p.input === normalized);

  if (existing) {
    existing.intent = intent;
    existing.hits += 1;
  } else {
    store.patterns.push({
      input: normalized,
      intent,
      hits: 1,
      addedAt: new Date().toISOString(),
    });
  }

  // Keep store bounded — drop lowest-hit patterns beyond 500
  if (store.patterns.length > 500) {
    store.patterns.sort((a, b) => b.hits - a.hits);
    store.patterns.splice(500);
  }

  saveStore(store);
}

/**
 * Detect if the user is signalling that the last classification was wrong.
 * Returns true if the message looks like a correction.
 */
export function isCorrectionSignal(input: string): boolean {
  const t = input.trim().toLowerCase();
  const signals = [
    /^(no|nope|wrong|incorrect|that('s| was| is) wrong)/,
    /^(i meant|i wanted|i was asking|that should (have been|be))/,
    /^(not (a question|hypothetical|discussion)|this is (a task|an? action|executable))/,
    /^(actually|wait)[,.]?\s+(i|that|this)/,
    /^(re-?run|do it|run it|execute|just (do|build|run|make|create) it)/,
    /\b(wrong (mode|intent|classification))\b/,
    /\b(should (have|be) (run|executed|built|created|done))\b/,
  ];
  return signals.some(p => p.test(t));
}

/**
 * List all learned patterns (for `canvas memory` or debug display).
 */
export function listLearnedPatterns(): LearnedPattern[] {
  return loadStore().patterns;
}
