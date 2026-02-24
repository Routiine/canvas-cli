/**
 * Audit Logger
 * Logs all tool executions, model calls, and permission decisions
 * to SQLite for compliance and debugging.
 *
 * CLI: canvas audit show [--limit N] [--since <date>]
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';

const DB_PATH = path.join(os.homedir(), '.canvas', 'canvas.db');

export interface AuditEntry {
  id?: number;
  timestamp: string;
  event_type: 'tool_exec' | 'model_call' | 'permission' | 'login' | 'config_change' | 'error';
  user?: string;
  action: string;
  details?: string;
  result?: 'success' | 'denied' | 'error';
  session_id?: string;
}

export class AuditLogger {
  private db: Database.Database;

  constructor() {
    fs.ensureDirSync(path.dirname(DB_PATH));
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initTable();
  }

  private initTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        event_type TEXT NOT NULL,
        user TEXT,
        action TEXT NOT NULL,
        details TEXT,
        result TEXT,
        session_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
    `);
  }

  /**
   * Log an audit event
   */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (event_type, user, action, details, result, session_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.event_type,
      entry.user || process.env.USER || 'unknown',
      entry.action,
      entry.details,
      entry.result,
      entry.session_id
    );
  }

  /**
   * Query audit log
   */
  query(options?: {
    limit?: number;
    since?: string;
    eventType?: string;
    user?: string;
  }): AuditEntry[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.since) {
      conditions.push('timestamp >= ?');
      params.push(options.since);
    }
    if (options?.eventType) {
      conditions.push('event_type = ?');
      params.push(options.eventType);
    }
    if (options?.user) {
      conditions.push('user = ?');
      params.push(options.user);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit || 50;

    const stmt = this.db.prepare(`
      SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ?
    `);

    return stmt.all(...params, limit) as AuditEntry[];
  }

  /**
   * Get audit summary statistics
   */
  getSummary(since?: string): {
    totalEvents: number;
    byType: Record<string, number>;
    byResult: Record<string, number>;
    recentErrors: AuditEntry[];
  } {
    const sinceClause = since ? `WHERE timestamp >= '${since}'` : '';

    const total = this.db.prepare(
      `SELECT COUNT(*) as count FROM audit_log ${sinceClause}`
    ).get() as any;

    const byType = this.db.prepare(
      `SELECT event_type, COUNT(*) as count FROM audit_log ${sinceClause} GROUP BY event_type`
    ).all() as any[];

    const byResult = this.db.prepare(
      `SELECT result, COUNT(*) as count FROM audit_log ${sinceClause} GROUP BY result`
    ).all() as any[];

    const recentErrors = this.db.prepare(
      `SELECT * FROM audit_log WHERE result = 'error' ${since ? `AND timestamp >= '${since}'` : ''} ORDER BY timestamp DESC LIMIT 5`
    ).all() as AuditEntry[];

    return {
      totalEvents: total.count,
      byType: Object.fromEntries(byType.map((r: any) => [r.event_type, r.count])),
      byResult: Object.fromEntries(byResult.map((r: any) => [r.result || 'unknown', r.count])),
      recentErrors,
    };
  }
}

let instance: AuditLogger | null = null;

export function getAuditLogger(): AuditLogger {
  if (!instance) {
    instance = new AuditLogger();
  }
  return instance;
}
