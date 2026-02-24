/**
 * Priority 3: Persistent Memory System
 * SQLite-backed memory that survives across sessions
 * Replaces JSON file backend in AgentMemory
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';

export interface MemoryEntry {
  id: string;
  agent_id: string;
  project_path: string;
  file_path?: string;
  category: 'decision' | 'pattern' | 'preference' | 'fact' | 'error';
  content: string;
  importance: number;
  access_count: number;
  last_accessed: number;
  created_at: number;
  expires_at?: number;
}

export interface MemoryQuery {
  agentId?: string;
  projectPath?: string;
  filePath?: string;
  category?: string;
  query?: string;  // FTS5 search
  limit?: number;
  minImportance?: number;
}

/** Row returned by session_summaries queries before JSON.parse */
interface SessionSummaryRow {
  session_id: string;
  summary: string;
  key_decisions: string;
  files_touched: string;
  created_at: number;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  
  const dbDir = path.join(os.homedir(), '.canvas');
  fs.ensureDirSync(dbDir);
  const dbPath = path.join(dbDir, 'canvas.db');
  
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      project_path TEXT NOT NULL DEFAULT '',
      file_path TEXT,
      category TEXT NOT NULL DEFAULT 'fact',
      content TEXT NOT NULL,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_path);
    CREATE INDEX IF NOT EXISTS idx_memories_file ON memories(file_path);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
    
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      tokenize='porter'
    );
    
    CREATE TABLE IF NOT EXISTS session_summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      project_path TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL,
      key_decisions TEXT NOT NULL DEFAULT '[]',
      files_touched TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_summaries_session ON session_summaries(session_id);
    CREATE INDEX IF NOT EXISTS idx_summaries_project ON session_summaries(project_path);
  `);
  
  return db;
}

export class PersistentMemory {
  private agentId: string;
  private projectPath: string;
  
  constructor(agentId: string, projectPath: string = process.cwd()) {
    this.agentId = agentId;
    this.projectPath = projectPath;
  }
  
  store(entry: Omit<MemoryEntry, 'id' | 'agent_id' | 'project_path' | 'access_count' | 'last_accessed' | 'created_at'>): string {
    const database = getDb();
    const id = uuidv4();
    const now = Date.now();
    
    database.prepare(`
      INSERT INTO memories (id, agent_id, project_path, file_path, category, content, importance, access_count, last_accessed, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      this.agentId,
      this.projectPath,
      entry.file_path || null,
      entry.category,
      entry.content,
      entry.importance ?? 0.5,
      now,
      now,
      entry.expires_at || null
    );
    
    // Also insert into FTS table
    database.prepare(`INSERT INTO memories_fts(rowid, content) VALUES (last_insert_rowid(), ?)`).run(entry.content);
    
    return id;
  }
  
  recall(query: MemoryQuery): MemoryEntry[] {
    const database = getDb();
    const now = Date.now();
    
    // Apply importance decay before recall
    this.applyDecay();
    
    let results: MemoryEntry[];
    
    if (query.query) {
      // FTS5 search
      const ftsResults = database.prepare(`
        SELECT m.* FROM memories m
        JOIN memories_fts ON memories_fts.rowid = rowid
        WHERE memories_fts MATCH ?
          AND (expires_at IS NULL OR expires_at > ?)
          AND (? IS NULL OR m.agent_id = ?)
          AND (? IS NULL OR m.project_path = ?)
        ORDER BY rank
        LIMIT ?
      `).all(
        query.query,
        now,
        query.agentId ?? null, query.agentId ?? null,
        query.projectPath ?? null, query.projectPath ?? null,
        query.limit ?? 20
      ) as MemoryEntry[];
      results = ftsResults;
    } else {
      const conditions: string[] = ['(expires_at IS NULL OR expires_at > ?)'];
      const params: (string | number | null)[] = [now];
      
      if (query.agentId) { conditions.push('agent_id = ?'); params.push(query.agentId); }
      if (query.projectPath) { conditions.push('project_path = ?'); params.push(query.projectPath); }
      if (query.filePath) { conditions.push('file_path = ?'); params.push(query.filePath); }
      if (query.category) { conditions.push('category = ?'); params.push(query.category); }
      if (query.minImportance) { conditions.push('importance >= ?'); params.push(query.minImportance); }
      
      params.push(query.limit ?? 50);
      
      results = database.prepare(`
        SELECT * FROM memories WHERE ${conditions.join(' AND ')}
        ORDER BY importance DESC, last_accessed DESC
        LIMIT ?
      `).all(...params) as MemoryEntry[];
    }
    
    // Update access counts
    if (results.length > 0) {
      const ids = results.map(r => r.id);
      const placeholders = ids.map(() => '?').join(',');
      database.prepare(`
        UPDATE memories SET access_count = access_count + 1, last_accessed = ?
        WHERE id IN (${placeholders})
      `).run(now, ...ids);
    }
    
    return results;
  }
  
  forget(id: string): boolean {
    const database = getDb();
    const result = database.prepare('DELETE FROM memories WHERE id = ? AND agent_id = ?').run(id, this.agentId);
    return result.changes > 0;
  }
  
  private applyDecay(): void {
    const database = getDb();
    const dayMs = 86400000;
    const now = Date.now();
    
    // Decay importance by 5% per day of non-access
    database.prepare(`
      UPDATE memories 
      SET importance = importance * POWER(0.95, CAST((? - last_accessed) AS REAL) / ?)
      WHERE agent_id = ? AND last_accessed < ?
    `).run(now, dayMs, this.agentId, now - dayMs);
  }
  
  storeSessionSummary(sessionId: string, summary: string, keyDecisions: string[], filesTouched: string[]): void {
    const database = getDb();
    database.prepare(`
      INSERT INTO session_summaries (id, session_id, project_path, summary, key_decisions, files_touched, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      sessionId,
      this.projectPath,
      summary,
      JSON.stringify(keyDecisions),
      JSON.stringify(filesTouched),
      Date.now()
    );
  }
  
  getRecentSummaries(limit: number = 5): Array<{
    session_id: string;
    summary: string;
    key_decisions: string[];
    files_touched: string[];
    created_at: number;
  }> {
    const database = getDb();
    const rows = database.prepare(`
      SELECT * FROM session_summaries 
      WHERE project_path = ?
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(this.projectPath, limit) as SessionSummaryRow[];
    
    return rows.map(r => ({
      session_id: r.session_id,
      summary: r.summary,
      key_decisions: JSON.parse(r.key_decisions) as string[],
      files_touched: JSON.parse(r.files_touched) as string[],
      created_at: r.created_at
    }));
  }
  
  list(options: { filePath?: string; limit?: number } = {}): MemoryEntry[] {
    const database = getDb();
    const now = Date.now();
    
    const conditions: string[] = ['agent_id = ?', 'project_path = ?', '(expires_at IS NULL OR expires_at > ?)'];
    const params: (string | number | null)[] = [this.agentId, this.projectPath, now];
    
    if (options.filePath) {
      conditions.push('file_path = ?');
      params.push(options.filePath);
    }
    
    params.push(options.limit ?? 100);
    
    return database.prepare(`
      SELECT * FROM memories WHERE ${conditions.join(' AND ')}
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(...params) as MemoryEntry[];
  }
  
  search(query: string, limit: number = 20): MemoryEntry[] {
    return this.recall({ query, projectPath: this.projectPath, limit });
  }
}

export function getPersistentMemory(agentId: string, projectPath?: string): PersistentMemory {
  return new PersistentMemory(agentId, projectPath);
}
