/**
 * A/B Testing Store
 * SQLite persistence for A/B tests and results.
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

import type { ABTest, ABVariant, ABResult, EvalCriteria } from './ab-testing.js';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  const dbDir = path.join(os.homedir(), '.canvas');
  fs.ensureDirSync(dbDir);
  const dbPath = path.join(dbDir, 'canvas.db');

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ab_tests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      variants TEXT NOT NULL,
      traffic_split TEXT NOT NULL,
      eval_criteria TEXT NOT NULL,
      winner_id TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS ab_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      response TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      user_rating INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ab_results_test ON ab_results(test_id);
    CREATE INDEX IF NOT EXISTS idx_ab_results_variant ON ab_results(variant_id);
  `);

  return db;
}

// ── Test CRUD ──

export function saveTest(test: ABTest): void {
  const database = getDb();
  database.prepare(`
    INSERT OR REPLACE INTO ab_tests (id, name, type, status, variants, traffic_split, eval_criteria, winner_id, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    test.id,
    test.name,
    test.type,
    test.status,
    JSON.stringify(test.variants),
    JSON.stringify(test.trafficSplit),
    JSON.stringify(test.evalCriteria),
    test.winnerId || null,
    test.createdAt,
    test.completedAt || null,
  );
}

export function getTest(id: string): ABTest | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM ab_tests WHERE id = ?').get(id) as any;
  return row ? rowToTest(row) : null;
}

export function listTests(status?: string): ABTest[] {
  const database = getDb();
  const query = status
    ? database.prepare('SELECT * FROM ab_tests WHERE status = ? ORDER BY created_at DESC')
    : database.prepare('SELECT * FROM ab_tests ORDER BY created_at DESC');
  const rows = (status ? query.all(status) : query.all()) as any[];
  return rows.map(rowToTest);
}

export function deleteTest(id: string): void {
  const database = getDb();
  database.prepare('DELETE FROM ab_results WHERE test_id = ?').run(id);
  database.prepare('DELETE FROM ab_tests WHERE id = ?').run(id);
}

function rowToTest(row: any): ABTest {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    variants: JSON.parse(row.variants),
    trafficSplit: JSON.parse(row.traffic_split),
    evalCriteria: JSON.parse(row.eval_criteria),
    winnerId: row.winner_id || undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  };
}

// ── Results ──

export function saveResult(result: ABResult): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO ab_results (test_id, variant_id, prompt, response, latency_ms, tokens_in, tokens_out, cost_usd, score, user_rating, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.testId,
    result.variantId,
    result.prompt,
    result.response,
    result.latencyMs,
    result.tokensIn,
    result.tokensOut,
    result.costUsd,
    result.score,
    result.userRating || null,
    result.createdAt,
  );
}

export function getResults(testId: string, variantId?: string, limit?: number): ABResult[] {
  const database = getDb();
  let query: string;
  let params: any[];

  if (variantId) {
    query = 'SELECT * FROM ab_results WHERE test_id = ? AND variant_id = ? ORDER BY created_at DESC';
    params = [testId, variantId];
  } else {
    query = 'SELECT * FROM ab_results WHERE test_id = ? ORDER BY created_at DESC';
    params = [testId];
  }

  if (limit) query += ` LIMIT ${limit}`;

  const rows = database.prepare(query).all(...params) as any[];
  return rows.map(rowToResult);
}

export function getResultCount(testId: string): number {
  const database = getDb();
  const row = database.prepare('SELECT COUNT(*) as count FROM ab_results WHERE test_id = ?').get(testId) as any;
  return row?.count || 0;
}

export function getVariantStats(testId: string, variantId: string): {
  count: number;
  avgScore: number;
  avgLatency: number;
  avgCost: number;
  avgTokensOut: number;
  scores: number[];
  latencies: number[];
} {
  const database = getDb();
  const agg = database.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(score) as avg_score,
      AVG(latency_ms) as avg_latency,
      AVG(cost_usd) as avg_cost,
      AVG(tokens_out) as avg_tokens_out
    FROM ab_results WHERE test_id = ? AND variant_id = ?
  `).get(testId, variantId) as any;

  const scores = database.prepare(
    'SELECT score FROM ab_results WHERE test_id = ? AND variant_id = ? ORDER BY score'
  ).all(testId, variantId).map((r: any) => r.score);

  const latencies = database.prepare(
    'SELECT latency_ms FROM ab_results WHERE test_id = ? AND variant_id = ? ORDER BY latency_ms'
  ).all(testId, variantId).map((r: any) => r.latency_ms);

  return {
    count: agg?.count || 0,
    avgScore: agg?.avg_score || 0,
    avgLatency: agg?.avg_latency || 0,
    avgCost: agg?.avg_cost || 0,
    avgTokensOut: agg?.avg_tokens_out || 0,
    scores,
    latencies,
  };
}

function rowToResult(row: any): ABResult {
  return {
    testId: row.test_id,
    variantId: row.variant_id,
    prompt: row.prompt,
    response: row.response,
    latencyMs: row.latency_ms,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    costUsd: row.cost_usd,
    score: row.score,
    userRating: row.user_rating || undefined,
    createdAt: row.created_at,
  };
}
