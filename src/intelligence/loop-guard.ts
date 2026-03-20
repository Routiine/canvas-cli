/**
 * Loop Guard — detects and stops infinite agent loops.
 *
 * Tracks a sliding window of recent tool calls. If the same sequence
 * of tool calls repeats N times, it halts execution and surfaces the issue.
 *
 * Also tracks API spend and halts if a configurable cost threshold is exceeded.
 */

export interface ToolCallRecord {
  toolName: string;
  params: string; // JSON stringified, truncated
  timestamp: number;
  cost: number;
}

export interface LoopGuardOptions {
  /** Number of identical sequences before triggering (default: 3) */
  repeatThreshold?: number;
  /** Window size to check for repeated sequences (default: 6 tool calls) */
  windowSize?: number;
  /** Max API cost in USD before halting (default: $1.00) */
  maxCostUsd?: number;
  /** Max tool calls per session (default: 200) */
  maxToolCalls?: number;
}

export class LoopGuard {
  private history: ToolCallRecord[] = [];
  private totalCost = 0;
  private options: Required<LoopGuardOptions>;

  constructor(options: LoopGuardOptions = {}) {
    this.options = {
      repeatThreshold: options.repeatThreshold ?? 3,
      windowSize: options.windowSize ?? 6,
      maxCostUsd: options.maxCostUsd ?? 1.0,
      maxToolCalls: options.maxToolCalls ?? 200,
    };
  }

  /**
   * Record a tool call and check if we're in a loop.
   * @throws {Error} if a loop or cost limit is detected
   */
  record(toolName: string, params: object, cost = 0): void {
    const record: ToolCallRecord = {
      toolName,
      params: JSON.stringify(params).slice(0, 200),
      timestamp: Date.now(),
      cost,
    };

    this.history.push(record);
    this.totalCost += cost;

    this.checkLimits();
  }

  private checkLimits(): void {
    const { repeatThreshold, windowSize, maxCostUsd, maxToolCalls } = this.options;

    // Hard limits
    if (this.history.length > maxToolCalls) {
      throw new Error(
        `Loop guard: exceeded ${maxToolCalls} tool calls in this session. ` +
        `Halting to prevent runaway agent.`
      );
    }

    if (this.totalCost > maxCostUsd) {
      throw new Error(
        `Loop guard: API cost exceeded $${maxCostUsd.toFixed(2)} ` +
        `(current: $${this.totalCost.toFixed(4)}). Halting.`
      );
    }

    // Sequence repeat detection — only check once we have enough history
    if (this.history.length < windowSize * repeatThreshold) return;

    const window = this.history.slice(-windowSize);
    const signature = window.map(r => `${r.toolName}:${r.params}`).join('|');

    let repeats = 0;
    for (let i = 0; i <= this.history.length - windowSize; i++) {
      const slice = this.history.slice(i, i + windowSize);
      const sliceSig = slice.map(r => `${r.toolName}:${r.params}`).join('|');
      if (sliceSig === signature) repeats++;
    }

    if (repeats >= repeatThreshold) {
      throw new Error(
        `Loop guard: detected identical tool sequence repeated ${repeats} times.\n` +
        `Sequence: ${window.map(r => r.toolName).join(' -> ')}\n` +
        `Halting to prevent infinite loop. Use /execute to resume manually.`
      );
    }
  }

  /** Add to total cost (call after receiving API response with usage data) */
  addCost(usd: number): void {
    this.totalCost += usd;
    if (this.totalCost > this.options.maxCostUsd) {
      throw new Error(
        `Loop guard: API cost exceeded $${this.options.maxCostUsd.toFixed(2)} ` +
        `(current: $${this.totalCost.toFixed(4)}). Halting.`
      );
    }
  }

  get stats() {
    return {
      toolCalls: this.history.length,
      totalCostUsd: this.totalCost,
      lastN: this.history.slice(-5).map(r => r.toolName),
    };
  }

  reset(): void {
    this.history = [];
    this.totalCost = 0;
  }
}

// Session-level singleton
let _guard: LoopGuard | null = null;

export function getLoopGuard(options?: LoopGuardOptions): LoopGuard {
  if (!_guard) _guard = new LoopGuard(options);
  return _guard;
}

export function resetLoopGuard(): void {
  _guard = null;
}
