/**
 * Context Manager
 *
 * Keeps the message history within the model's useful context window.
 * Three strategies applied in order of cost:
 *
 *   1. Truncate long tool results inline (cheap, no extra LLM call)
 *   2. Summarise the middle of the conversation when history grows large
 *      (one fast /api/generate call, applied lazily)
 *   3. Hard-drop oldest non-system messages as last resort
 *
 * qwen2.5:14b has a 32K token context window. With the system prompt and
 * tool schema consuming ~4–6K tokens, and a typical response needing ~2K,
 * we target a working history budget of ~18K tokens.
 */

import type { NativeMessage } from './native-caller.js';

// ─── Token estimation ─────────────────────────────────────────────────────────

// Code is ~3 chars/token, prose ~4. Use 3.5 as a conservative middle ground.
const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateHistoryTokens(messages: NativeMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

// ─── Tool result truncation ───────────────────────────────────────────────────

// Large file reads are the most common context killer.
// 4000 chars ≈ 1100 tokens — enough to see the full content of most functions.
const MAX_TOOL_RESULT_CHARS = 4000;

export function truncateToolResult(result: string): string {
  if (result.length <= MAX_TOOL_RESULT_CHARS) return result;
  const kept = result.slice(0, MAX_TOOL_RESULT_CHARS);
  const omitted = result.length - MAX_TOOL_RESULT_CHARS;
  return `${kept}\n\n[... ${omitted} characters omitted to fit context window ...]`;
}

/**
 * Apply truncation to all 'tool' role messages. Returns a new array.
 */
export function truncateLongToolResults(messages: NativeMessage[]): NativeMessage[] {
  return messages.map(m =>
    m.role === 'tool' && m.content.length > MAX_TOOL_RESULT_CHARS
      ? { ...m, content: truncateToolResult(m.content) }
      : m
  );
}

// ─── History compaction ───────────────────────────────────────────────────────

// Compact when non-system history exceeds this threshold.
// Reserve headroom for: system prompt (~1K) + tools schema (~3K) + response (~2K).
const COMPACT_THRESHOLD_TOKENS = 18_000;

// Always keep the most recent N messages verbatim so the model has immediate context.
const KEEP_RECENT_COUNT = 8;

/**
 * Summarise the middle of the conversation if history is growing too large.
 *
 * The summary is injected as a system message so the model treats it as
 * authoritative background context, not a conversational turn.
 */
export async function compactHistoryIfNeeded(
  messages: NativeMessage[],
  baseUrl: string,
  model: string,
  force = false,
): Promise<{ messages: NativeMessage[]; compacted: boolean }> {
  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystem     = messages.filter(m => m.role !== 'system');

  const tokens = estimateHistoryTokens(nonSystem);
  if (!force && tokens <= COMPACT_THRESHOLD_TOKENS) {
    return { messages, compacted: false };
  }

  // Slice: recent messages stay verbatim; older ones get summarised.
  const recent      = nonSystem.slice(-KEEP_RECENT_COUNT);
  const toSummarise = nonSystem.slice(0, -KEEP_RECENT_COUNT);

  if (toSummarise.length === 0) {
    // Can't compact further — just trim the oldest message.
    return {
      messages: [...systemMessages, ...nonSystem.slice(1)],
      compacted: true,
    };
  }

  // Build a short transcript for the summariser.
  const transcript = toSummarise.map(m => {
    const label = m.role === 'tool' ? 'Tool result' : m.role === 'assistant' ? 'Assistant' : 'User';
    const body  = m.content.length > 500 ? m.content.slice(0, 500) + '…' : m.content;
    return `${label}: ${body}`;
  }).join('\n\n');

  let summary = '';
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: [
          'Summarise this conversation history into one compact paragraph.',
          'Include: files read or written (with paths), commands executed and outcomes,',
          'decisions made, and any errors encountered. Be specific. Omit pleasantries.\n\n',
          transcript,
        ].join(' '),
        stream: false,
        options: { temperature: 0, num_predict: 350 },
      }),
    });
    if (res.ok) {
      const data = await res.json() as { response?: string };
      summary = data.response?.trim() ?? '';
    }
  } catch {
    // Non-fatal — fall back to a plain omission notice.
  }

  const summaryMessage: NativeMessage = {
    role: 'system',
    content: summary
      ? `[Earlier context — ${toSummarise.length} messages compacted]\n${summary}`
      : `[${toSummarise.length} earlier messages omitted to fit context window]`,
  };

  return {
    messages: [...systemMessages, summaryMessage, ...recent],
    compacted: true,
  };
}

// ─── Response completeness ────────────────────────────────────────────────────

/**
 * Returns true if a model response looks truncated.
 *
 * Small models commonly truncate in three ways:
 *   - End with literal "..." or "…"
 *   - Leave a code block unclosed (odd number of ``` markers)
 *   - End with a stub comment like "// ... rest of the code"
 */
export function isResponseTruncated(text: string): boolean {
  const t = text.trimEnd();

  // Ends with ellipsis
  if (/\.\.\.+$|…$/.test(t)) return true;

  // Unclosed fenced code block
  const fences = (t.match(/```/g) ?? []).length;
  if (fences % 2 !== 0) return true;

  // Stub comment patterns common in smaller models
  if (/\/\/\s*\.{2,}|\/\/\s*(rest|more|continues?|etc\.?)\b/i.test(t)) return true;
  if (/\[\s*\.{2,}\s*(more|rest|omitted|truncated)\s*\]/i.test(t)) return true;

  return false;
}
