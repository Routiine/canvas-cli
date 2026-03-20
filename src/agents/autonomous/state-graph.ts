/**
 * LangGraph State Graph for Autonomous Agent Execution
 *
 * Wraps canvas-cli's autonomous orchestrator in a proper state machine
 * with checkpointing, human-in-the-loop interrupts, and observable state.
 *
 * Graph flow:
 *   START → plan → execute → verify → [done | retry | human_review]
 */

import { StateGraph, END, START, MemorySaver, Annotation } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { getProviderRegistry } from '../../intelligence/provider-registry.js';

// ─── State Schema ─────────────────────────────────────────────────────────────

const AgentState = Annotation.Root({
  goal: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),

  threadId: Annotation<string>({
    reducer: (_, b) => b,
    default: () => '',
  }),

  plan: Annotation<Array<{ id: string; description: string; status: 'pending' | 'done' | 'failed' }>>({
    reducer: (_, b) => b,
    default: () => [],
  }),

  currentStep: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),

  results: Annotation<Array<{ stepId: string; output: string; success: boolean }>>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),

  retryCount: Annotation<number>({
    reducer: (_, b) => b,
    default: () => 0,
  }),

  needsHumanReview: Annotation<boolean>({
    reducer: (_, b) => b,
    default: () => false,
  }),

  humanFeedback: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  finalOutput: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  error: Annotation<string | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
});

type AgentStateType = typeof AgentState.State;

// ─── Graph Nodes ──────────────────────────────────────────────────────────────

async function planNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();

  if (!provider) {
    return { error: 'No LLM provider available' };
  }

  const response = await provider.complete([
    {
      role: 'system',
      content: 'You are a planning agent. Break down the goal into 3-7 concrete executable steps. Return JSON only.',
    },
    {
      role: 'user',
      content: `Goal: ${state.goal}\n\nReturn a JSON array of steps: [{"id": "1", "description": "..."}]`,
    },
  ], { temperature: 0.2 });

  try {
    const match = response.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array found in planning response');
    const rawSteps = JSON.parse(match[0]) as Array<{ id: string; description: string }>;
    const plan = rawSteps.map(s => ({ ...s, status: 'pending' as const }));
    return { plan, currentStep: 0 };
  } catch (err: unknown) {
    return { error: `Planning failed: ${String(err)}` };
  }
}

async function executeNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { plan, currentStep } = state;
  if (currentStep >= plan.length) {
    return { finalOutput: 'All steps completed.' };
  }

  const step = plan[currentStep];
  if (!step) return { error: `Invalid step index ${currentStep}` };

  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();
  if (!provider) return { error: 'No provider available' };

  try {
    const output = await provider.complete([
      {
        role: 'system',
        content: 'Execute the given task step. Be concise and factual about what was done.',
      },
      {
        role: 'user',
        content: `Execute step: ${step.description}\n\nContext: Working toward goal: ${state.goal}${
          state.humanFeedback ? `\n\nHuman feedback: ${state.humanFeedback}` : ''
        }`,
      },
    ], { temperature: 0.3 });

    const updatedPlan = plan.map((s, i) =>
      i === currentStep ? { ...s, status: 'done' as const } : s
    );

    return {
      plan: updatedPlan,
      results: [{ stepId: step.id, output, success: true }],
    };
  } catch (err: unknown) {
    const updatedPlan = plan.map((s, i) =>
      i === currentStep ? { ...s, status: 'failed' as const } : s
    );
    return {
      plan: updatedPlan,
      results: [{ stepId: step.id, output: String(err), success: false }],
    };
  }
}

async function verifyNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const lastResult = state.results[state.results.length - 1];
  if (!lastResult) {
    return { currentStep: state.currentStep + 1 };
  }

  const step = state.plan[state.currentStep];

  // Heuristic: steps that touch external or destructive operations require human sign-off
  const needsReview =
    step !== undefined &&
    /delete|drop|publish|deploy|send|push|payment|production/i.test(step.description) &&
    !state.humanFeedback;

  if (needsReview) {
    return { needsHumanReview: true };
  }

  // Failed step — retry up to 2 times before advancing
  if (!lastResult.success && state.retryCount < 2) {
    return { retryCount: state.retryCount + 1 };
  }

  return {
    currentStep: state.currentStep + 1,
    needsHumanReview: false,
    humanFeedback: null,
    retryCount: 0,
  };
}

async function summarizeNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();

  if (!provider) {
    return { finalOutput: 'Task complete (no provider available for summary).' };
  }

  const resultLines = state.results
    .map(r => `- ${r.stepId}: ${r.success ? 'SUCCESS' : 'FAILED'} — ${r.output.slice(0, 200)}`)
    .join('\n');

  const summary = await provider.complete([
    { role: 'system', content: 'Summarize what was accomplished. Be concise.' },
    {
      role: 'user',
      content: `Goal: ${state.goal}\n\nResults:\n${resultLines}`,
    },
  ], { temperature: 0.3 });

  return { finalOutput: summary };
}

// This node is an interrupt point — the graph pauses here and waits for
// the caller to resume with humanFeedback set in the state.
async function humanReviewNode(_state: AgentStateType): Promise<Partial<AgentStateType>> {
  return { needsHumanReview: false };
}

// ─── Routing ──────────────────────────────────────────────────────────────────

function routeAfterPlanNode(state: AgentStateType): string {
  if (state.error) return END;
  return 'execute_node';
}

function routeAfterVerifyNode(state: AgentStateType): string {
  if (state.error) return END;
  if (state.needsHumanReview) return 'human_review_node';
  if (state.currentStep >= state.plan.length) return 'summarize_node';
  return 'execute_node';
}

// ─── Checkpointer Singleton ───────────────────────────────────────────────────

let _checkpointer: BaseCheckpointSaver | null = null;

function getCheckpointer(): BaseCheckpointSaver {
  if (!_checkpointer) {
    // MemorySaver provides in-process checkpointing: survives individual node
    // failures and human-in-the-loop interrupts within a single process lifetime.
    // For persistence across process restarts, swap in SqliteSaver from
    // @langchain/langgraph-checkpoint-sqlite with a file-backed DB path.
    _checkpointer = new MemorySaver();
  }
  return _checkpointer;
}

// ─── Build & Export ────────────────────────────────────────────────────────────

export function buildAgentGraph() {
  const graph = new StateGraph(AgentState)
    .addNode('plan_node', planNode)
    .addNode('execute_node', executeNode)
    .addNode('verify_node', verifyNode)
    .addNode('summarize_node', summarizeNode)
    .addNode('human_review_node', humanReviewNode)
    .addEdge(START, 'plan_node')
    .addConditionalEdges('plan_node', routeAfterPlanNode, {
      execute_node: 'execute_node',
      [END]: END,
    })
    .addEdge('execute_node', 'verify_node')
    .addConditionalEdges('verify_node', routeAfterVerifyNode, {
      execute_node: 'execute_node',
      human_review_node: 'human_review_node',
      summarize_node: 'summarize_node',
      [END]: END,
    })
    .addEdge('human_review_node', 'execute_node')
    .addEdge('summarize_node', END);

  return graph.compile({
    checkpointer: getCheckpointer(),
    // Pause before human_review_node so the caller can inject feedback then resume
    interruptBefore: ['human_review_node'],
  });
}

// ─── Public Runner API ────────────────────────────────────────────────────────

export interface RunAgentOptions {
  goal: string;
  /** Reuse an existing thread ID to resume an interrupted run */
  threadId?: string;
  /** Provide after a human_review interrupt to unblock the graph */
  humanFeedback?: string;
  /** Called after each node completes with the node name and its output slice */
  onProgress?: (step: string, state: Partial<AgentStateType>) => void;
}

export async function runAutonomousGraph(opts: RunAgentOptions): Promise<string> {
  const app = buildAgentGraph();
  const threadId = opts.threadId ?? `canvas-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  const initialState: Partial<AgentStateType> = {
    goal: opts.goal,
    threadId,
    humanFeedback: opts.humanFeedback ?? null,
  };

  let finalResult = '';

  for await (const chunk of await app.stream(initialState, config)) {
    for (const [nodeName, nodeState] of Object.entries(chunk)) {
      opts.onProgress?.(nodeName, nodeState as Partial<AgentStateType>);

      if (nodeName === '__end__') {
        const s = nodeState as AgentStateType;
        finalResult = s.finalOutput ?? 'Task complete.';
      }

      // Surface the thread ID so callers can resume after a human_review_node interrupt
      if (nodeName === 'human_review_node') {
        const s = nodeState as Partial<AgentStateType>;
        if (s.needsHumanReview === false) {
          // Graph has paused — threadId is the resume handle
          finalResult = `INTERRUPTED:${threadId}`;
        }
      }
    }
  }

  return finalResult || 'Task complete.';
}

export type { AgentStateType };
