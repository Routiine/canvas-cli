/**
 * A/B Testing Engine
 * Supports model comparison and prompt strategy testing
 * with statistical tracking and winner selection.
 */

import { v4 as uuidv4 } from 'uuid';
import { getProviderRegistry } from '../intelligence/provider-registry.js';
import type { Message, CompletionOptions } from '../intelligence/provider-registry.js';
import * as store from './ab-store.js';

// ── Interfaces ──

export interface ABTest {
  id: string;
  name: string;
  type: 'model' | 'prompt' | 'combined';
  status: 'active' | 'paused' | 'completed';
  variants: ABVariant[];
  trafficSplit: number[];
  evalCriteria: EvalCriteria;
  createdAt: number;
  completedAt?: number;
  winnerId?: string;
}

export interface ABVariant {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ABResult {
  testId: string;
  variantId: string;
  prompt: string;
  response: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  score: number;
  userRating?: number;
  createdAt: number;
}

export interface EvalCriteria {
  autoScore: boolean;
  userRating: boolean;
  metrics: ('quality' | 'speed' | 'cost' | 'length')[];
}

export interface ABStats {
  variantId: string;
  variantName: string;
  runs: number;
  avgScore: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  avgTokensOut: number;
  p95LatencyMs: number;
  winRate: number;
  confidence: number;
}

export interface RunResult {
  variantId: string;
  variantName: string;
  response: string;
  latencyMs: number;
  score: number;
  costUsd: number;
}

// ── Scoring ──

/**
 * Score a response based on heuristics (0-100).
 * Adapted from eval-suite.ts with additional metrics.
 */
export function scoreResponse(response: string, prompt: string): number {
  let score = 50;
  const words = response.split(/\s+/).length;

  // Length scoring
  if (words > 50) score += 10;
  if (words > 150) score += 5;
  if (words > 500) score -= 5;   // Too verbose
  if (words < 10) score -= 20;   // Too short

  // Structure scoring
  if (response.includes('```')) score += 15;     // Has code blocks
  if (response.includes('- ') || response.includes('* ')) score += 5;  // Lists
  if (response.includes('##') || response.includes('**')) score += 3;  // Headers/bold

  // Relevance heuristic — check for keywords from prompt
  const promptKeywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const responseLC = response.toLowerCase();
  const matchCount = promptKeywords.filter(kw => responseLC.includes(kw)).length;
  const relevanceRatio = promptKeywords.length > 0 ? matchCount / promptKeywords.length : 0;
  score += Math.round(relevanceRatio * 15);

  // Technical content
  if (responseLC.includes('typescript') || responseLC.includes('javascript')) score += 3;
  if (responseLC.includes('function') || responseLC.includes('class')) score += 3;

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute a composite score factoring in multiple metrics
 */
function compositeScore(
  quality: number,
  latencyMs: number,
  costUsd: number,
  metrics: string[]
): number {
  let total = 0;
  let weights = 0;

  if (metrics.includes('quality')) {
    total += quality * 0.5;
    weights += 0.5;
  }
  if (metrics.includes('speed')) {
    // Faster is better: 100 for <1s, 50 for 5s, 0 for 30s+
    const speedScore = Math.max(0, 100 - (latencyMs / 300));
    total += speedScore * 0.2;
    weights += 0.2;
  }
  if (metrics.includes('cost')) {
    // Cheaper is better: 100 for $0, 50 for $0.01, 0 for $0.10+
    const costScore = Math.max(0, 100 - costUsd * 1000);
    total += costScore * 0.15;
    weights += 0.15;
  }
  if (metrics.includes('length')) {
    total += quality * 0.15;
    weights += 0.15;
  }

  return weights > 0 ? total / weights : quality;
}

// ── Statistical Significance ──

/**
 * Two-proportion z-test for comparing win rates.
 * Returns confidence level 0-1 (>0.95 = statistically significant).
 */
function calculateConfidence(winsA: number, totalA: number, winsB: number, totalB: number): number {
  if (totalA < 2 || totalB < 2) return 0;

  const pA = winsA / totalA;
  const pB = winsB / totalB;
  const pPool = (winsA + winsB) / (totalA + totalB);

  const se = Math.sqrt(pPool * (1 - pPool) * (1 / totalA + 1 / totalB));
  if (se === 0) return 0;

  const z = Math.abs(pA - pB) / se;

  // Approximate p-value from z-score using normal CDF
  const pValue = 2 * (1 - normalCDF(z));
  return Math.max(0, Math.min(1, 1 - pValue));
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// ── Core Engine ──

export class ABTestEngine {

  /**
   * Create a new A/B test
   */
  createTest(config: {
    name: string;
    type: 'model' | 'prompt' | 'combined';
    variants: Omit<ABVariant, 'id'>[];
    trafficSplit?: number[];
    evalCriteria?: Partial<EvalCriteria>;
  }): ABTest {
    const variants = config.variants.map(v => ({
      ...v,
      id: uuidv4().slice(0, 8),
    }));

    const trafficSplit = config.trafficSplit ||
      variants.map(() => Math.floor(100 / variants.length));

    const test: ABTest = {
      id: uuidv4().slice(0, 12),
      name: config.name,
      type: config.type,
      status: 'active',
      variants,
      trafficSplit,
      evalCriteria: {
        autoScore: true,
        userRating: false,
        metrics: ['quality', 'speed', 'cost'],
        ...config.evalCriteria,
      },
      createdAt: Date.now(),
    };

    store.saveTest(test);
    return test;
  }

  /**
   * Run a single prompt through all variants
   */
  async runSingle(testId: string, prompt: string): Promise<RunResult[]> {
    const test = store.getTest(testId);
    if (!test) throw new Error(`Test "${testId}" not found`);
    if (test.status !== 'active') throw new Error(`Test "${testId}" is ${test.status}`);

    const registry = getProviderRegistry();
    const results: RunResult[] = [];

    for (const variant of test.variants) {
      const messages: Message[] = [];

      // System prompt (variant-specific or default)
      if (variant.systemPrompt) {
        messages.push({ role: 'system', content: variant.systemPrompt });
      } else {
        messages.push({ role: 'system', content: 'You are a helpful AI assistant.' });
      }

      messages.push({ role: 'user', content: prompt });

      // Get the right provider
      const providerName = variant.provider || 'claude';
      const provider = registry.get(providerName) || registry.getBestAvailable();
      if (!provider) {
        results.push({
          variantId: variant.id,
          variantName: variant.name,
          response: '[ERROR: No provider available]',
          latencyMs: 0,
          score: 0,
          costUsd: 0,
        });
        continue;
      }

      const options: CompletionOptions = {
        model: variant.model,
        temperature: variant.temperature,
        maxTokens: variant.maxTokens,
      };

      // Execute and measure
      const startTime = Date.now();
      let response: string;
      try {
        response = await provider.complete(messages, options);
      } catch (error: any) {
        response = `[ERROR: ${error.message}]`;
      }
      const latencyMs = Date.now() - startTime;

      // Score
      const qualityScore = scoreResponse(response, prompt);
      const estimatedTokensIn = Math.ceil(prompt.length / 4);
      const estimatedTokensOut = Math.ceil(response.length / 4);
      const costUsd = provider.estimateCost(estimatedTokensIn, estimatedTokensOut, variant.model);

      const finalScore = compositeScore(
        qualityScore, latencyMs, costUsd, test.evalCriteria.metrics
      );

      // Store result
      const result: ABResult = {
        testId,
        variantId: variant.id,
        prompt,
        response,
        latencyMs,
        tokensIn: estimatedTokensIn,
        tokensOut: estimatedTokensOut,
        costUsd,
        score: finalScore,
        createdAt: Date.now(),
      };
      store.saveResult(result);

      results.push({
        variantId: variant.id,
        variantName: variant.name,
        response,
        latencyMs,
        score: finalScore,
        costUsd,
      });
    }

    return results;
  }

  /**
   * Run multiple prompts through all variants
   */
  async runBatch(testId: string, prompts: string[]): Promise<RunResult[][]> {
    const allResults: RunResult[][] = [];
    for (const prompt of prompts) {
      const results = await this.runSingle(testId, prompt);
      allResults.push(results);
    }
    return allResults;
  }

  /**
   * Get statistics for a test
   */
  getStats(testId: string): ABStats[] {
    const test = store.getTest(testId);
    if (!test) throw new Error(`Test "${testId}" not found`);

    const stats: ABStats[] = [];

    for (const variant of test.variants) {
      const vs = store.getVariantStats(testId, variant.id);

      // Calculate P95 latency
      const p95Index = Math.floor(vs.latencies.length * 0.95);
      const p95Latency = vs.latencies[p95Index] || 0;

      stats.push({
        variantId: variant.id,
        variantName: variant.name,
        runs: vs.count,
        avgScore: vs.avgScore,
        avgLatencyMs: vs.avgLatency,
        avgCostUsd: vs.avgCost,
        avgTokensOut: vs.avgTokensOut,
        p95LatencyMs: p95Latency,
        winRate: 0,     // computed below
        confidence: 0,  // computed below
      });
    }

    // Calculate win rates (pairwise head-to-head)
    if (stats.length === 2 && stats[0].runs > 0 && stats[1].runs > 0) {
      const results0 = store.getResults(testId, stats[0].variantId);
      const results1 = store.getResults(testId, stats[1].variantId);

      let wins0 = 0;
      let wins1 = 0;
      const pairs = Math.min(results0.length, results1.length);

      for (let i = 0; i < pairs; i++) {
        if (results0[i].score > results1[i].score) wins0++;
        else if (results1[i].score > results0[i].score) wins1++;
      }

      stats[0].winRate = pairs > 0 ? wins0 / pairs : 0;
      stats[1].winRate = pairs > 0 ? wins1 / pairs : 0;

      const conf = calculateConfidence(wins0, pairs, wins1, pairs);
      stats[0].confidence = conf;
      stats[1].confidence = conf;
    } else if (stats.length > 2) {
      // Multi-variant: win rate = % of times this variant had highest score
      const allPrompts = new Set<string>();
      for (const v of test.variants) {
        store.getResults(testId, v.id).forEach(r => allPrompts.add(r.prompt));
      }

      for (const s of stats) {
        const results = store.getResults(testId, s.variantId);
        let wins = 0;
        for (const r of results) {
          const otherScores = stats
            .filter(os => os.variantId !== s.variantId)
            .map(os => {
              const otherResults = store.getResults(testId, os.variantId);
              const match = otherResults.find(or => or.prompt === r.prompt);
              return match?.score || 0;
            });
          if (otherScores.every(os => r.score > os)) wins++;
        }
        s.winRate = results.length > 0 ? wins / results.length : 0;
      }
    }

    return stats;
  }

  /**
   * Declare the winner based on highest average score
   */
  declareWinner(testId: string): ABStats | null {
    const stats = this.getStats(testId);
    if (stats.length === 0) return null;

    const winner = stats.reduce((best, s) => s.avgScore > best.avgScore ? s : best);

    const test = store.getTest(testId);
    if (test) {
      test.status = 'completed';
      test.winnerId = winner.variantId;
      test.completedAt = Date.now();
      store.saveTest(test);
    }

    return winner;
  }

  /**
   * Weighted random variant assignment for live traffic splitting
   */
  assignVariant(testId: string): ABVariant | null {
    const test = store.getTest(testId);
    if (!test || test.status !== 'active') return null;

    const rand = Math.random() * 100;
    let cumulative = 0;
    for (let i = 0; i < test.variants.length; i++) {
      cumulative += test.trafficSplit[i];
      if (rand <= cumulative) return test.variants[i];
    }
    return test.variants[test.variants.length - 1];
  }

  /**
   * Get the last side-by-side comparison for a test
   */
  getLastComparison(testId: string): Array<{ variantName: string; response: string; score: number }> {
    const test = store.getTest(testId);
    if (!test) return [];

    const comparison: Array<{ variantName: string; response: string; score: number }> = [];
    for (const variant of test.variants) {
      const results = store.getResults(testId, variant.id, 1);
      if (results.length > 0) {
        comparison.push({
          variantName: variant.name,
          response: results[0].response,
          score: results[0].score,
        });
      }
    }
    return comparison;
  }

  // ── Passthrough to store ──

  getTest(id: string): ABTest | null { return store.getTest(id); }
  listTests(status?: string): ABTest[] { return store.listTests(status); }
  deleteTest(id: string): void { store.deleteTest(id); }

  pauseTest(id: string): void {
    const test = store.getTest(id);
    if (test) {
      test.status = 'paused';
      store.saveTest(test);
    }
  }

  resumeTest(id: string): void {
    const test = store.getTest(id);
    if (test && test.status === 'paused') {
      test.status = 'active';
      store.saveTest(test);
    }
  }

  exportResults(testId: string): { test: ABTest; results: ABResult[]; stats: ABStats[] } | null {
    const test = store.getTest(testId);
    if (!test) return null;
    const results = store.getResults(testId);
    const stats = this.getStats(testId);
    return { test, results, stats };
  }
}

let engine: ABTestEngine | null = null;

export function getABTestEngine(): ABTestEngine {
  if (!engine) {
    engine = new ABTestEngine();
  }
  return engine;
}
