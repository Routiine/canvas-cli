import { describe, it, expect, beforeEach } from '@jest/globals';
import { LoopGuard } from '../../src/intelligence/loop-guard.js';

describe('LoopGuard', () => {
  let guard: LoopGuard;

  beforeEach(() => {
    guard = new LoopGuard({ repeatThreshold: 2, windowSize: 3, maxCostUsd: 0.5, maxToolCalls: 10 });
  });

  it('allows normal diverse tool calls', () => {
    expect(() => {
      guard.record('read_file', { path: 'a.ts' });
      guard.record('write_file', { path: 'b.ts', content: 'x' });
      guard.record('run_shell_command', { command: 'npm test' });
    }).not.toThrow();
  });

  it('halts on repeated identical sequences', () => {
    expect(() => {
      // First occurrence
      guard.record('read_file', { path: 'a.ts' });
      guard.record('read_file', { path: 'b.ts' });
      guard.record('write_file', { path: 'c.ts' });
      // Second occurrence (exact repeat)
      guard.record('read_file', { path: 'a.ts' });
      guard.record('read_file', { path: 'b.ts' });
      guard.record('write_file', { path: 'c.ts' });
    }).toThrow(/Loop guard/);
  });

  it('halts when max tool calls exceeded', () => {
    expect(() => {
      for (let i = 0; i < 11; i++) {
        guard.record(`tool_${i}`, { i });
      }
    }).toThrow(/exceeded/);
  });

  it('halts when cost limit exceeded', () => {
    expect(() => {
      guard.addCost(0.3);
      guard.addCost(0.3); // Total: 0.6 > 0.5
    }).toThrow(/cost exceeded/);
  });

  it('exposes stats', () => {
    guard.record('read_file', { path: 'x.ts' });
    const stats = guard.stats;
    expect(stats.toolCalls).toBe(1);
    expect(stats.lastN).toContain('read_file');
  });
});
