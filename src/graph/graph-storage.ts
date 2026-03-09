/**
 * Priority 2: Graph Storage
 * SQLite backend for codebase semantic graph
 */

import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

export interface GraphNode {
  id: string;
  node_type: 'file' | 'function' | 'class' | 'variable' | 'import';
  file_path: string;
  symbol_name?: string;
  line_start?: number;
  line_end?: number;
  signature?: string;
  doc_comment?: string;
  git_author?: string;
  git_last_modified?: number;
  commit_summary?: string;
  updated_at: number;
}

export interface GraphEdge {
  id?: number;
  from_id: string;
  to_id: string;
  edge_type: 'calls' | 'imports' | 'inherits' | 'uses' | 'exports';
  line_number?: number;
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
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      node_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      symbol_name TEXT,
      line_start INTEGER,
      line_end INTEGER,
      signature TEXT,
      doc_comment TEXT,
      git_author TEXT,
      git_last_modified INTEGER,
      commit_summary TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_file ON graph_nodes(file_path);
    CREATE INDEX IF NOT EXISTS idx_nodes_symbol ON graph_nodes(symbol_name);
    CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(node_type);

    CREATE TABLE IF NOT EXISTS graph_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      line_number INTEGER,
      FOREIGN KEY(from_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY(to_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges(from_id);
    CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges(to_id);
    CREATE INDEX IF NOT EXISTS idx_edges_type ON graph_edges(edge_type);
  `);

  return db;
}

export class GraphStorage {
  upsertNode(node: GraphNode): void {
    const database = getDb();
    database.prepare(`
      INSERT OR REPLACE INTO graph_nodes
        (id, node_type, file_path, symbol_name, line_start, line_end, signature, doc_comment,
         git_author, git_last_modified, commit_summary, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      node.id,
      node.node_type,
      node.file_path,
      node.symbol_name || null,
      node.line_start || null,
      node.line_end || null,
      node.signature || null,
      node.doc_comment || null,
      node.git_author || null,
      node.git_last_modified || null,
      node.commit_summary || null,
      node.updated_at
    );
  }

  upsertNodes(nodes: GraphNode[]): void {
    const database = getDb();
    const insert = database.prepare(`
      INSERT OR REPLACE INTO graph_nodes
        (id, node_type, file_path, symbol_name, line_start, line_end, signature, doc_comment,
         git_author, git_last_modified, commit_summary, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = database.transaction((nodes: GraphNode[]) => {
      for (const node of nodes) {
        insert.run(
          node.id, node.node_type, node.file_path, node.symbol_name || null,
          node.line_start || null, node.line_end || null, node.signature || null,
          node.doc_comment || null, node.git_author || null, node.git_last_modified || null,
          node.commit_summary || null, node.updated_at
        );
      }
    });
    tx(nodes);
  }

  upsertEdges(edges: GraphEdge[]): void {
    const database = getDb();
    // Delete existing edges for from_ids in this batch to avoid duplicates
    const fromIds = [...new Set(edges.map(e => e.from_id))];
    for (const fromId of fromIds) {
      database.prepare('DELETE FROM graph_edges WHERE from_id = ?').run(fromId);
    }

    const insert = database.prepare(`
      INSERT INTO graph_edges (from_id, to_id, edge_type, line_number)
      VALUES (?, ?, ?, ?)
    `);
    const tx = database.transaction((edges: GraphEdge[]) => {
      for (const edge of edges) {
        insert.run(edge.from_id, edge.to_id, edge.edge_type, edge.line_number || null);
      }
    });
    tx(edges);
  }

  deleteFileNodes(filePath: string): void {
    const database = getDb();
    database.prepare('DELETE FROM graph_nodes WHERE file_path = ?').run(filePath);
  }

  getCallers(symbolId: string): GraphNode[] {
    const database = getDb();
    return database.prepare(`
      SELECT n.* FROM graph_nodes n
      JOIN graph_edges e ON e.from_id = n.id
      WHERE e.to_id = ? AND e.edge_type = 'calls'
    `).all(symbolId) as GraphNode[];
  }

  getCallees(symbolId: string): GraphNode[] {
    const database = getDb();
    return database.prepare(`
      SELECT n.* FROM graph_nodes n
      JOIN graph_edges e ON e.to_id = n.id
      WHERE e.from_id = ? AND e.edge_type = 'calls'
    `).all(symbolId) as GraphNode[];
  }

  getImporters(fileId: string): GraphNode[] {
    const database = getDb();
    return database.prepare(`
      SELECT n.* FROM graph_nodes n
      JOIN graph_edges e ON e.from_id = n.id
      WHERE e.to_id = ? AND e.edge_type = 'imports'
    `).all(fileId) as GraphNode[];
  }

  getFileNode(filePath: string): GraphNode | undefined {
    const database = getDb();
    return database.prepare(
      "SELECT * FROM graph_nodes WHERE file_path = ? AND node_type = 'file' LIMIT 1"
    ).get(filePath) as GraphNode | undefined;
  }

  getNodesByFile(filePath: string): GraphNode[] {
    const database = getDb();
    return database.prepare('SELECT * FROM graph_nodes WHERE file_path = ? ORDER BY line_start').all(filePath) as GraphNode[];
  }

  findSymbol(name: string): GraphNode[] {
    const database = getDb();
    return database.prepare(`
      SELECT * FROM graph_nodes WHERE symbol_name LIKE ? ORDER BY node_type, file_path LIMIT 50
    `).all(`%${name}%`) as GraphNode[];
  }

  getContext(filePath: string, symbolName?: string): {
    node?: GraphNode;
    callers: GraphNode[];
    callees: GraphNode[];
    importers: GraphNode[];
  } {
    const database = getDb();

    let node: GraphNode | undefined;
    if (symbolName) {
      node = database.prepare(
        'SELECT * FROM graph_nodes WHERE file_path = ? AND symbol_name = ? LIMIT 1'
      ).get(filePath, symbolName) as GraphNode | undefined;
    } else {
      node = database.prepare(
        "SELECT * FROM graph_nodes WHERE file_path = ? AND node_type = 'file' LIMIT 1"
      ).get(filePath) as GraphNode | undefined;
    }

    const id = node?.id || filePath;
    return {
      node,
      callers: this.getCallers(id),
      callees: this.getCallees(id),
      importers: this.getImporters(id)
    };
  }

  getStats(): { nodeCount: number; edgeCount: number; fileCount: number } {
    const database = getDb();
    const nodeCount = (database.prepare('SELECT COUNT(*) as c FROM graph_nodes').get() as { c: number }).c;
    const edgeCount = (database.prepare('SELECT COUNT(*) as c FROM graph_edges').get() as { c: number }).c;
    const fileCount = (database.prepare("SELECT COUNT(DISTINCT file_path) as c FROM graph_nodes").get() as { c: number }).c;
    return { nodeCount, edgeCount, fileCount };
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _graphStorage: GraphStorage | null = null;
export function getGraphStorage(): GraphStorage {
  if (!_graphStorage) _graphStorage = new GraphStorage();
  return _graphStorage;
}
