/**
 * Langfuse observability tracer.
 *
 * Wraps LLM provider calls with Langfuse tracing so every completion is
 * logged with model, tokens, latency, and cost.
 *
 * Activates only when LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set.
 * When the env vars are absent, all tracing calls are no-ops and the wrapped
 * provider behaves exactly as before — zero runtime cost.
 */

import type { Langfuse } from 'langfuse';

// ─── Singleton ────────────────────────────────────────────────────────────────

let _langfuse: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return null;
  }
  if (!_langfuse) {
    // Dynamic import keeps the module tree clean when Langfuse is not used.
    // We use a synchronous require here because getLangfuse() is called from
    // synchronous constructor code in TracedProvider.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Langfuse: LangfuseClass } = require('langfuse') as { Langfuse: typeof import('langfuse').Langfuse };
    _langfuse = new LangfuseClass({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
    });
  }
  return _langfuse;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceOptions {
  name: string;
  model: string;
  provider: string;
  input: Array<{ role: string; content: string }>;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Tracer ───────────────────────────────────────────────────────────────────

export class LangfuseTracer {
  /**
   * Run `fn`, record the result as a Langfuse generation, and return the text.
   *
   * If Langfuse is not configured the function is called directly with no
   * overhead.
   */
  async traceCompletion(
    opts: TraceOptions,
    fn: () => Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }>
  ): Promise<string> {
    const lf = getLangfuse();

    if (!lf) {
      const result = await fn();
      return result.text;
    }

    const trace = lf.trace({
      name: opts.name,
      sessionId: opts.sessionId,
      userId: opts.userId,
      metadata: opts.metadata,
    });

    const generation = trace.generation({
      name: opts.name,
      model: opts.model,
      modelParameters: { provider: opts.provider },
      input: opts.input,
    });

    try {
      const result = await fn();
      generation.end({
        output: result.text,
        usage: result.usage
          ? { input: result.usage.inputTokens, output: result.usage.outputTokens }
          : undefined,
      });
      return result.text;
    } catch (err) {
      generation.end({ output: String(err), level: 'ERROR' });
      throw err;
    }
  }

  /** Flush any buffered Langfuse events — call before process exit. */
  async flush(): Promise<void> {
    await getLangfuse()?.flushAsync();
  }
}

// ─── Singleton accessor ───────────────────────────────────────────────────────

let _tracer: LangfuseTracer | null = null;

export function getLangfuseTracer(): LangfuseTracer {
  if (!_tracer) _tracer = new LangfuseTracer();
  return _tracer;
}
