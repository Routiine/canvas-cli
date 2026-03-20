/**
 * Native Ollama Function Calling
 *
 * Uses /api/chat with the `tools` parameter so the model returns structured
 * tool_calls rather than text we have to regex-parse.  Reliable multi-turn
 * execution loop: model calls tool → we run it → we feed result back →
 * model continues until it has no more tool calls.
 *
 * Models confirmed to support native function calling with Ollama:
 *   qwen2.5:*, qwen2:*, llama3.1:*, llama3.2:*,
 *   mistral:*, mistral-nemo:*, mixtral:*,
 *   command-r:*, command-r-plus:*, firefunction:*
 *
 * Depth features layered on top of the basic loop:
 *   - Tool-call enforcement: if round 1 returns prose with clear action intent,
 *     re-prompt once before accepting the text as a final answer.
 *   - Tool result truncation: large tool results are trimmed so they don't
 *     exhaust the context window on a single read_file call.
 *   - History compaction: when the conversation grows past the model's useful
 *     window, older turns are summarised via a fast /api/generate call.
 *   - Response continuation: if the final text response looks truncated
 *     (unclosed code block, trailing "..."), one continuation is requested.
 */

import chalk from 'chalk';
import type { ToolRegistry } from '../tools/registry.js';
import {
  truncateLongToolResults,
  compactHistoryIfNeeded,
  isResponseTruncated,
} from './context-manager.js';
import { selectToolsForTask, extractUserPrompt, type ToolDefinition } from '../tools/task-selector.js';
import { verifyWrittenFiles, extractWrittenFiles } from './post-write-verify.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NativeMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: NativeToolCall[];
}

interface NativeToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface ChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: NativeToolCall[];
  };
  done: boolean;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface StreamChunk {
  message?: {
    role?: string;
    content?: string;
    tool_calls?: NativeToolCall[];
  };
  done: boolean;
}

// ---------------------------------------------------------------------------
// Model capability detection
// ---------------------------------------------------------------------------

const NATIVE_TOOL_MODELS = [
  'qwen2.5', 'qwen2', 'qwen',
  'llama3.1', 'llama3.2', 'llama3.3',
  'mistral', 'mistral-nemo', 'mixtral',
  'command-r', 'firefunction',
  'nous-hermes', 'functionary',
  'smollm2', 'granite',
];

export function supportsNativeFunctionCalling(model: string): boolean {
  const m = model.toLowerCase();
  return NATIVE_TOOL_MODELS.some(prefix => m.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Error enrichment
// ---------------------------------------------------------------------------

/**
 * Turn a raw error message into actionable context for the model.
 * The model reads this when deciding how to recover — specific hints lead to
 * better recovery strategies than a bare exception string.
 */
function enrichError(toolName: string, raw: string): string {
  const r = raw.toLowerCase();

  if (r.includes('enoent') || r.includes('no such file')) {
    return `Error: File not found — ${raw}\nHint: Check the path exists. Use list_directory or glob_search to find the correct path, then retry.`;
  }
  if (r.includes('eacces') || r.includes('permission denied')) {
    return `Error: Permission denied — ${raw}\nHint: Try a different output path (e.g. inside the project directory), or check file ownership.`;
  }
  if (r.includes('eexist') || r.includes('already exists')) {
    return `Error: File already exists — ${raw}\nHint: Use edit_file to modify the existing file, or choose a different filename.`;
  }
  if (r.includes('command not found') || r.includes('not recognized')) {
    return `Error: Command not found — ${raw}\nHint: The tool may need to be installed. Try checking with 'which <command>' or install via npm/pip/apt.`;
  }
  if (r.includes('etimedout') || r.includes('timeout') || r.includes('econnrefused')) {
    return `Error: Connection failed — ${raw}\nHint: The service may be down. Check if it's running and retry.`;
  }
  if (r.includes('syntaxerror') || r.includes('unexpected token')) {
    return `Error: Syntax error — ${raw}\nHint: There is invalid syntax in the code. Read the file, find the syntax error, and fix it.`;
  }
  if (r.includes('typeerror') || r.includes('is not a function') || r.includes('cannot read')) {
    return `Error: Runtime type error in ${toolName} — ${raw}\nHint: Check that required parameters are correct types and values are not null/undefined.`;
  }
  if (r.includes('eisdir') || r.includes('is a directory')) {
    return `Error: Expected file but got directory — ${raw}\nHint: Specify a file path, not a directory path.`;
  }

  // Default: return enriched with tool context but no specific hint
  return `Error in ${toolName}: ${raw}`;
}

// ---------------------------------------------------------------------------
// Action-intent detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the model's response describes an action it intends to take
 * but did not actually execute via a tool call.
 *
 * Common failure mode with smaller models: they say "I'll use write_file to..."
 * instead of emitting a tool_call. We catch this and re-prompt once.
 */
function detectsActionIntent(text: string): boolean {
  const t = text.toLowerCase();

  // Explicit tool name mentions without actually calling them
  if (/\b(write_file|read_file|run_shell_command|list_files?|list_directory|run_shell|shell_command)\b/.test(t)) {
    return true;
  }

  // "I will / I'll / I am going to <action verb>"
  if (/\bi(?:'ll| will| am going to| would)\s+(write|create|make|add|edit|modify|update|save|run|execute|call|invoke|use the)\b/.test(t)) {
    return true;
  }

  // "Let me <action verb>"
  if (/\blet me\s+(write|create|make|add|edit|modify|update|save|run|execute|read|check)\b/.test(t)) {
    return true;
  }

  // "To do this I need to / I'll need to"
  if (/\b(?:to do this,?\s+)?i(?:'ll)?\s+need to\s+(write|create|run|execute|call|use)\b/.test(t)) {
    return true;
  }

  // "Using the write_file/run_shell tool" — describes intent
  if (/\busing (?:the\s+)?(?:write_file|read_file|run_shell|list_files?)\s+tool\b/.test(t)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Core: multi-turn tool execution loop
// ---------------------------------------------------------------------------

export interface NativeCallOptions {
  baseUrl: string;
  model: string;
  messages: NativeMessage[];
  registry: ToolRegistry;
  maxRounds?: number;
  onText?: (chunk: string) => void;
  onToolStart?: (name: string, args: Record<string, unknown>) => void;
  onToolDone?: (name: string, result: string, durationMs: number) => void;
  onError?: (name: string, error: string) => void;
  onCompact?: () => void;
  onRound?: (round: number, toolCount: number) => void;
  onUsage?: (promptTokens: number, completionTokens: number) => void;
}

export async function callWithNativeTools(opts: NativeCallOptions): Promise<string> {
  const {
    baseUrl,
    model,
    messages,
    registry,
    maxRounds = 15,
    onText,
    onToolStart,
    onToolDone,
    onError,
    onCompact,
    onRound,
    onUsage,
  } = opts;

  let history: NativeMessage[] = [...messages];

  // Select only the tools relevant to this task — reduces schema overhead from
  // ~10K tokens (all tools) to ~500–1500 tokens (task-relevant subset).
  const prompt = extractUserPrompt(messages);
  const tools: ToolDefinition[] = selectToolsForTask(prompt, registry.getToolDefinitions() as ToolDefinition[]);

  let fullText = '';
  let round = 0;
  let enforcementUsed = false; // only re-prompt for action intent once

  while (round < maxRounds) {
    round++;

    // ── Context management ───────────────────────────────────────────────
    // 1. Truncate any long tool results already in history.
    history = truncateLongToolResults(history);

    // 2. Compact if we're approaching the model's context limit.
    const { messages: compacted, compacted: didCompact } =
      await compactHistoryIfNeeded(history, baseUrl, model);
    if (didCompact) {
      history = compacted;
      onCompact?.();
    }

    // ── LLM call (streaming) ─────────────────────────────────────────────
    // Stream each round so content tokens appear in real time.
    // Ollama sends tool_calls as a single terminal chunk after content tokens,
    // so emitting tokens live is safe — by the time tool_calls arrive we've
    // already shown all the reasoning text.
    const streamed = await postStreamChat(
      `${baseUrl}/api/chat`,
      { model, messages: history, tools, options: { temperature: 0.3 } },
      (token) => { onText?.(token); },
    );

    const toolCount = streamed.tool_calls?.length ?? 0;
    onRound?.(round, toolCount);
    if (streamed.promptTokens > 0 || streamed.completionTokens > 0) {
      onUsage?.(streamed.promptTokens, streamed.completionTokens);
    }

    const msg = {
      content: streamed.content,
      tool_calls: streamed.tool_calls,
    };

    // ── Tool calls present → execute them ────────────────────────────────
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      // Content was already streamed live above; accumulate into fullText.
      if (msg.content) {
        fullText += msg.content;
      }

      // Add assistant message with tool calls to history.
      history.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.tool_calls,
      });

      const executedCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

      // Split calls into read-only (parallelisable) and mutating (must be sequential).
      // Read-only tools have no side effects — safe to run concurrently.
      const READ_ONLY = new Set([
        'read_file', 'read_many_files', 'list_directory', 'list_files',
        'grep_search', 'glob_search', 'search_files', 'find_symbol',
        'git_status', 'git_diff', 'git_log', 'introspect_tools',
        'web_fetch', 'web_search', 'get_environment', 'smart_context',
        'index_stats', 'search_codebase',
      ]);

      const readCalls  = msg.tool_calls.filter(c => READ_ONLY.has(c.function.name));
      const writeCalls = msg.tool_calls.filter(c => !READ_ONLY.has(c.function.name));

      // Execute read-only tools in parallel, then mutating tools sequentially.
      const allCalls = [...readCalls, ...writeCalls];
      const batchBoundary = readCalls.length; // first N are parallel

      const runTool = async (call: typeof msg.tool_calls[0]) => {
        const { name, arguments: args } = call.function;
        onToolStart?.(name, args);
        const start = Date.now();
        try {
          const raw = await registry.execute(name, args);
          const result = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
          onToolDone?.(name, result, Date.now() - start);
          return { name, args, result, ok: true };
        } catch (err: unknown) {
          const result = enrichError(name, err instanceof Error ? err.message : String(err));
          onError?.(name, result);
          return { name, args, result, ok: false };
        }
      };

      // Run reads in parallel, writes sequentially.
      // Results are kept as ordered arrays — no Map — so duplicate calls
      // (same tool + same args called twice) each get their own result slot.
      const readResults = readCalls.length > 0
        ? await Promise.all(readCalls.map(runTool))
        : [];

      const writeResults: Awaited<ReturnType<typeof runTool>>[] = [];
      for (const call of writeCalls) {
        writeResults.push(await runTool(call));
      }

      // allCalls = [...readCalls, ...writeCalls] — results align by index
      const orderedResults = [...readResults, ...writeResults];
      for (const r of orderedResults) {
        executedCalls.push({ name: r.name, arguments: r.args });
        history.push({
          role: 'tool',
          content: r.result.length > 4000
            ? r.result.slice(0, 4000) + '\n\n[... truncated ...]'
            : r.result,
        });
      }

      // ── Post-write verification ─────────────────────────────────────────
      // If any files were written this round, run a quick type/syntax check.
      // Errors get injected back into history so the model can self-correct.
      const written = extractWrittenFiles(executedCalls);
      if (written.length > 0) {
        const verify = await verifyWrittenFiles(written);
        if (!verify.passed && verify.errors) {
          history.push({
            role: 'user',
            content: `Verification failed after writing files. Fix these errors:\n\n${verify.errors}`,
          });
          // Don't continue — let the loop run again so the model can fix them.
        }
      }

      continue; // back to top of loop
    }

    // ── No tool calls returned ────────────────────────────────────────────

    // Action-intent enforcement: if round 1 returned prose with clear intent
    // to use a tool but didn't actually call one, re-prompt exactly once.
    if (round === 1 && !enforcementUsed && msg.content && detectsActionIntent(msg.content)) {
      enforcementUsed = true;

      // Add the prose response so the model can see what it said.
      history.push({ role: 'assistant', content: msg.content });
      history.push({
        role: 'user',
        content: 'You described what you would do but did not call any tools. ' +
                 'Please use the appropriate tool to complete this action now. ' +
                 'Do not describe it — execute it.',
      });
      continue; // retry without incrementing meaningful state
    }

    // Model is genuinely done (or enforcement didn't help).
    // Tokens were already streamed live via onText during the postStreamChat call.
    if (msg.content) {
      fullText += msg.content;
      // onText was already called token-by-token during streaming — no repeat needed.
    }

    // Response-continuation: if the output looks truncated, ask for the rest.
    if (msg.content && isResponseTruncated(msg.content)) {
      history.push({ role: 'assistant', content: msg.content });
      const continuationPrompt = 'Your response appears to be truncated. ' +
        'Please continue exactly from where you left off — do not repeat what you already wrote.';
      history.push({ role: 'user', content: continuationPrompt });

      // One-shot continuation: call the model once more, no tool loop needed.
      try {
        const cont = await post<ChatResponse>(`${baseUrl}/api/chat`, {
          model,
          messages: history,
          tools,
          stream: false,
          options: { temperature: 0.3 },
        });
        if (cont.message.content) {
          fullText += cont.message.content;
          onText?.(cont.message.content);
        }
      } catch {
        // non-fatal — return what we have
      }
    }

    break;
  }

  if (round >= maxRounds) {
    const note = '\n\n(reached maximum tool-use rounds)';
    fullText += note;
    onText?.(note);
  }

  return fullText;
}

// ---------------------------------------------------------------------------
// Streaming final response (text only, no tools in flight)
// ---------------------------------------------------------------------------

/**
 * Stream a plain chat response with no tools — used for task/conversational mode.
 * Yields text chunks via onChunk.
 *
 * Includes continuation: if the streamed response looks truncated, one follow-up
 * non-streaming call is made to complete it.
 */
export async function streamChat(opts: {
  baseUrl: string;
  model: string;
  messages: NativeMessage[];
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { baseUrl, model, messages, onChunk } = opts;
  let full = '';

  // Apply context management before the call.
  const { messages: compacted } = await compactHistoryIfNeeded(messages, baseUrl, model);
  const prepared = truncateLongToolResults(compacted);

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: prepared, stream: true }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama /api/chat returned ${res.status}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    for (const line of text.split('\n').filter(Boolean)) {
      try {
        const chunk = JSON.parse(line) as StreamChunk;
        const piece = chunk.message?.content ?? '';
        if (piece) {
          full += piece;
          onChunk(piece);
        }
        if (chunk.done) {
          // Check for truncation and request continuation if needed.
          if (isResponseTruncated(full)) {
            const continuation = await requestContinuation(baseUrl, model, prepared, full);
            if (continuation) {
              full += continuation;
              onChunk(continuation);
            }
          }
          return full;
        }
      } catch {
        // partial JSON line — skip
      }
    }
  }

  return full;
}

/**
 * Request a single continuation if the response appears truncated.
 * Non-streaming so we can check the result before emitting it.
 */
async function requestContinuation(
  baseUrl: string,
  model: string,
  history: NativeMessage[],
  truncatedResponse: string,
): Promise<string> {
  try {
    const res = await post<ChatResponse>(`${baseUrl}/api/chat`, {
      model,
      messages: [
        ...history,
        { role: 'assistant', content: truncatedResponse },
        {
          role: 'user',
          content: 'Your response appears to be truncated. ' +
                   'Continue exactly from where you left off — do not repeat.',
        },
      ],
      stream: false,
      options: { temperature: 0.3 },
    });
    return res.message.content ?? '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Streaming chat helper (with tool_calls support)
// ---------------------------------------------------------------------------

interface StreamedResponse {
  content: string;
  tool_calls?: NativeToolCall[];
  promptTokens: number;
  completionTokens: number;
}

/**
 * Stream a /api/chat call and return accumulated content + tool_calls.
 *
 * Ollama streaming format:
 *   - Content tokens: {"message":{"content":"token"},"done":false}
 *   - Tool calls:     {"message":{"tool_calls":[...]},"done":false}
 *   - Usage:          {"done":true,"eval_count":N,"prompt_eval_count":M}
 *
 * Because tool_calls arrive as a single complete chunk, streaming is safe
 * for multi-turn tool-calling loops — no partial JSON assembly needed.
 *
 * @param onToken called with each content token as it arrives
 */
async function postStreamChat(
  url: string,
  body: Record<string, unknown>,
  onToken?: (token: string) => void,
): Promise<StreamedResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Ollama API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let content = '';
  let tool_calls: NativeToolCall[] | undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? ''; // keep incomplete last line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as {
          message?: { content?: string; tool_calls?: NativeToolCall[] };
          done?: boolean;
          eval_count?: number;
          prompt_eval_count?: number;
        };

        const piece = chunk.message?.content ?? '';
        if (piece) {
          content += piece;
          onToken?.(piece);
        }

        if (chunk.message?.tool_calls?.length) {
          tool_calls = chunk.message.tool_calls;
        }

        if (chunk.done) {
          promptTokens = chunk.prompt_eval_count ?? 0;
          completionTokens = chunk.eval_count ?? 0;
        }
      } catch {
        // partial or malformed JSON line — skip
      }
    }
  }

  return { content, tool_calls, promptTokens, completionTokens };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

// ─── Groq fallback ────────────────────────────────────────────────────────────

interface GroqMessage { role: string; content: string; }
interface GroqResponse { choices: Array<{ message: { content: string } }> }

/**
 * Call Groq's OpenAI-compatible API as a fallback when Ollama is unavailable.
 * Uses llama-3.3-70b-versatile — Groq's fastest capable model.
 */
export async function callGroqFallback(
  messages: NativeMessage[],
  apiKey: string,
): Promise<string> {
  // Strip tool_calls from messages — Groq chat/completions in text mode
  const groqMessages: GroqMessage[] = messages
    .filter(m => m.role !== 'tool')
    .map(m => ({ role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: groqMessages,
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json() as GroqResponse;
  return data.choices[0]?.message?.content ?? '';
}

/**
 * Format a tool call for display — used by callers rendering progress.
 */
export function fmtToolCall(name: string, args: Record<string, unknown>): string {
  const preview = Object.entries(args)
    .slice(0, 2)
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60);
      return `${k}=${val}`;
    })
    .join(', ');
  return `${chalk.cyan(name)}(${chalk.dim(preview)})`;
}
