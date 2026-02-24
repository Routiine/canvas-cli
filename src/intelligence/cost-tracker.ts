/**
 * Priority 1: Cost Tracker
 * Tracks token usage and cost per session
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

export interface RoutingLogEntry {
  session_id: string;
  task_hash: string;
  complexity_score: number;
  routed_to: 'local' | 'claude' | 'openai' | string;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  
  const dbDir = path.join(os.homedir(), '.canvas');
  fs.ensureDirSync(dbDir);
  const dbPath = path.join(dbDir, 'canvas.db');
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS routing_log (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      task_hash TEXT NOT NULL,
      complexity_score INTEGER NOT NULL,
      routed_to TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_routing_session ON routing_log(session_id);
    CREATE INDEX IF NOT EXISTS idx_routing_created ON routing_log(created_at);
    
    CREATE TABLE IF NOT EXISTS budget_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    
    INSERT OR IGNORE INTO budget_config (key, value) VALUES ('session_budget_usd', '1.00');
    INSERT OR IGNORE INTO budget_config (key, value) VALUES ('daily_budget_usd', '5.00');
  `);
  
  return db;
}

function hashTask(task: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(task.length, 256); i++) {
    hash = ((hash << 5) - hash) + task.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

export class CostTracker {
  private sessionId: string;
  private sessionCost: number = 0;
  private sessionTokensIn: number = 0;
  private sessionTokensOut: number = 0;
  
  constructor(sessionId: string = uuidv4()) {
    this.sessionId = sessionId;
    getDb(); // Initialize tables
  }
  
  logRouting(entry: RoutingLogEntry): void {
    const database = getDb();
    this.sessionCost += entry.cost_usd;
    this.sessionTokensIn += entry.tokens_in;
    this.sessionTokensOut += entry.tokens_out;
    
    database.prepare(`
      INSERT INTO routing_log (session_id, task_hash, complexity_score, routed_to, cost_usd, tokens_in, tokens_out, cache_creation_tokens, cache_read_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      this.sessionId,
      entry.task_hash || hashTask(''),
      entry.complexity_score,
      entry.routed_to,
      entry.cost_usd,
      entry.tokens_in,
      entry.tokens_out,
      entry.cache_creation_tokens || 0,
      entry.cache_read_tokens || 0,
      Date.now()
    );
  }
  
  getSessionBudget(): number {
    const database = getDb();
    const row = database.prepare("SELECT value FROM budget_config WHERE key = 'session_budget_usd'").get() as { value: string } | undefined;
    return row ? parseFloat(row.value) : 1.0;
  }
  
  getRemainingBudget(): number {
    return Math.max(0, this.getSessionBudget() - this.sessionCost);
  }
  
  getSessionStats(): { cost: number; tokensIn: number; tokensOut: number; remaining: number } {
    return {
      cost: this.sessionCost,
      tokensIn: this.sessionTokensIn,
      tokensOut: this.sessionTokensOut,
      remaining: this.getRemainingBudget()
    };
  }
  
  getDailyStats(): { cost: number; requests: number } {
    const database = getDb();
    const dayAgo = Date.now() - 86400000;
    const row = database.prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) as cost, COUNT(*) as requests
      FROM routing_log
      WHERE created_at > ? AND routed_to != 'local'
    `).get(dayAgo) as { cost: number; requests: number };
    return row || { cost: 0, requests: 0 };
  }
  
  setBudget(sessionBudget: number, dailyBudget?: number): void {
    const database = getDb();
    database.prepare("INSERT OR REPLACE INTO budget_config (key, value) VALUES ('session_budget_usd', ?)").run(sessionBudget.toString());
    if (dailyBudget !== undefined) {
      database.prepare("INSERT OR REPLACE INTO budget_config (key, value) VALUES ('daily_budget_usd', ?)").run(dailyBudget.toString());
    }
  }
}

let tracker: CostTracker | null = null;

export function getCostTracker(sessionId?: string): CostTracker {
  if (!tracker) {
    tracker = new CostTracker(sessionId);
  }
  return tracker;
}

export { hashTask };
