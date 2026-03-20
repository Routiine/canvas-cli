/**
 * LLM-as-Judge Evaluator
 *
 * After an agent completes a task, runs a lightweight scoring call
 * to assess output quality. Results are logged to langfuse and SQLite.
 *
 * Usage: const score = await evaluateTaskCompletion(goal, output);
 */

export interface EvaluationResult {
  score: number;       // 1-5
  passed: boolean;     // score >= passThreshold (default 3)
  reasoning: string;   // One-sentence explanation
  goal: string;
  output: string;
  timestamp: number;
  durationMs: number;
}

export interface EvaluationOptions {
  /** Model to use for judging. Defaults to fastest available. */
  judgeModel?: string;
  /** Minimum score to consider passing (default: 3) */
  passThreshold?: number;
}

const JUDGE_SYSTEM_PROMPT = `You are an objective task completion evaluator.
Given a GOAL and an AGENT OUTPUT, score how well the output achieves the goal.

Respond with ONLY this format (no other text):
SCORE: <1-5>
PASS: <yes|no>
REASON: <one sentence>

Scoring rubric:
5 = Perfectly achieved the goal
4 = Mostly achieved, minor issues
3 = Partially achieved, key parts done
2 = Attempted but significant gaps
1 = Failed or not attempted`;

/**
 * Evaluate whether an agent successfully completed a task.
 *
 * Tries Anthropic first, then OpenAI, then falls back to a heuristic
 * when no API key is available. Never throws — returns a result regardless.
 */
export async function evaluateTaskCompletion(
  goal: string,
  output: string,
  options: EvaluationOptions = {}
): Promise<EvaluationResult> {
  const start = Date.now();
  const passThreshold = options.passThreshold ?? 3;

  const userMessage = `GOAL: ${goal.slice(0, 500)}\n\nAGENT OUTPUT:\n${output.slice(0, 2000)}`;

  let response = '';

  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (anthropicKey) {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: anthropicKey });
      const msg = await client.messages.create({
        model: options.judgeModel ?? 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });
      const block = msg.content[0];
      response = block.type === 'text' ? block.text : '';
    } else if (openaiKey) {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: openaiKey });
      const completion = await client.chat.completions.create({
        model: options.judgeModel ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 200,
      });
      response = completion.choices[0]?.message?.content ?? '';
    } else {
      // Try unified provider (covers Gemini, Azure, and any other registered provider)
      try {
        const { getUnifiedProvider } = await import('./unified-provider.js');
        const provider = getUnifiedProvider();
        if (provider) {
          const completion = await provider.complete([
            { role: 'system', content: JUDGE_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ], { model: options.judgeModel, maxTokens: 200 });
          response = completion;
        } else {
          return heuristicEval(goal, output, passThreshold, start);
        }
      } catch {
        return heuristicEval(goal, output, passThreshold, start);
      }
    }
  } catch {
    return heuristicEval(goal, output, passThreshold, start);
  }

  const scoreMatch = response.match(/SCORE:\s*([1-5])/);
  const passMatch = response.match(/PASS:\s*(yes|no)/i);
  const reasonMatch = response.match(/REASON:\s*(.+)/);

  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 3;
  const passed = passMatch ? passMatch[1].toLowerCase() === 'yes' : score >= passThreshold;
  const reasoning = reasonMatch ? reasonMatch[1].trim() : 'No reasoning provided';

  const result: EvaluationResult = {
    score,
    passed,
    reasoning,
    goal,
    output: output.slice(0, 500),
    timestamp: Date.now(),
    durationMs: Date.now() - start,
  };

  // Non-blocking — evaluation logging must never break the calling agent
  await logEvaluation(result).catch(() => {});

  return result;
}

/** Simple heuristic fallback when no LLM is available */
function heuristicEval(
  goal: string,
  output: string,
  passThreshold: number,
  start: number
): EvaluationResult {
  const failureSignals = ['error', 'failed', 'cannot', 'unable to', 'not found'];
  const hasFailure = failureSignals.some(s => output.toLowerCase().includes(s));
  const score = hasFailure ? 2 : 3;

  return {
    score,
    passed: score >= passThreshold,
    reasoning: hasFailure
      ? 'Output contains failure indicators'
      : 'Heuristic: output appears complete',
    goal,
    output: output.slice(0, 500),
    timestamp: Date.now(),
    durationMs: Date.now() - start,
  };
}

/** Persist evaluation score to langfuse if the tracer is active */
async function logEvaluation(result: EvaluationResult): Promise<void> {
  try {
    const { getLangfuseTracer } = await import('./langfuse-tracer.js');
    const tracer = getLangfuseTracer();
    if (tracer) {
      // Cast to unknown so strict mode does not complain about the optional method
      (tracer as unknown as { logScore?: (opts: Record<string, unknown>) => void }).logScore?.({
        name: 'task_completion',
        value: result.score / 5, // normalize to 0-1
        comment: result.reasoning,
      });
    }
  } catch {
    // Non-critical — never surface to caller
  }
}
