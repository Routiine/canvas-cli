/**
 * Semantic search over the codebase using embeddings.
 *
 * At `canvas index build` time, each source file is chunked and embedded.
 * Vectors are stored in SQLite alongside the graph.
 *
 * `canvas ask "query"` embeds the query and returns the most relevant
 * file chunks with context for the AI to reason about.
 *
 * Vector storage uses sqlite-vec for native KNN search — no O(n) JS loop.
 */

import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import Database from 'better-sqlite3';
import chalk from 'chalk';

const DB_PATH = path.join(os.homedir(), '.canvas', 'canvas.db');
const CHUNK_SIZE = 100; // lines per chunk
const CHUNK_OVERLAP = 10; // overlap lines between chunks

// ─── DB setup ─────────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;
let _vecEnabled = false;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');

    // Attempt to load sqlite-vec extension for native KNN search.
    // Falls back gracefully to the JS cosine-similarity path if unavailable.
    try {
      // Dynamic require is intentional: sqlite-vec is an optional native addon.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require('sqlite-vec') as { load: (db: Database.Database) => void };
      sqliteVec.load(_db);
      _vecEnabled = true;
    } catch (err) {
      console.warn(
        chalk.yellow('sqlite-vec unavailable — falling back to in-memory cosine similarity.'),
        err instanceof Error ? err.message : String(err)
      );
      _vecEnabled = false;
    }

    // Metadata table — always present.
    _db.exec(`
      CREATE TABLE IF NOT EXISTS file_embeddings (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        vector BLOB NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(file_path, chunk_index)
      );
      CREATE INDEX IF NOT EXISTS idx_embeddings_file ON file_embeddings(file_path);
    `);

    // Vector index — only when sqlite-vec loaded successfully.
    if (_vecEnabled) {
      _db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS vec_index
        USING vec0(rowid INTEGER PRIMARY KEY, embedding FLOAT[768]);
      `);
    }
  }
  return _db;
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

interface FileChunk {
  fileRelPath: string;
  chunkIndex: number;
  text: string;
  startLine: number;
  endLine: number;
}

function chunkFile(filePath: string, content: string): FileChunk[] {
  const lines = content.split('\n');
  const chunks: FileChunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const start = i;
    const end = Math.min(i + CHUNK_SIZE, lines.length);
    const chunkLines = lines.slice(start, end);

    // Skip empty chunks
    if (chunkLines.some(l => l.trim())) {
      chunks.push({
        fileRelPath: filePath,
        chunkIndex: chunks.length,
        text: chunkLines.join('\n'),
        startLine: start + 1,
        endLine: end
      });
    }

    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

// ─── Embedding provider ───────────────────────────────────────────────────────

type EmbeddingFn = (text: string) => Promise<Float32Array>;

async function getEmbeddingFn(): Promise<EmbeddingFn | null> {
  // Try to use HybridEmbeddingService
  try {
    const { HybridEmbeddingService } = await import('../agents/embeddings/hybrid-embeddings.js');
    const service = new HybridEmbeddingService();
    return async (text: string) => {
      const result = await service.embed(text);
      return result.vector;
    };
  } catch {
    // Fallback: try Ollama nomic-embed-text directly
    try {
      const { default: fetch } = await import('node-fetch');
      return async (text: string) => {
        const resp = await fetch('http://localhost:11434/api/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
        });
        if (!resp.ok) throw new Error(`Ollama embeddings failed: ${resp.status}`);
        const data = await resp.json() as { embedding: number[] };
        return new Float32Array(data.embedding);
      };
    } catch {
      return null;
    }
  }
}

// ─── Vector math (fallback path only) ────────────────────────────────────────

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface EmbedFilesOptions {
  rootDir: string;
  files: string[];
  verbose?: boolean;
}

export interface SearchResult {
  filePath: string;
  chunkIndex: number;
  score: number;
  text: string;
  startLine: number;
  endLine: number;
}

/**
 * Embed a batch of files and store vectors in SQLite.
 * Called from `canvas index build`.
 */
export async function embedFiles(opts: EmbedFilesOptions): Promise<void> {
  const embed = await getEmbeddingFn();
  if (!embed) {
    if (opts.verbose) {
      console.log(chalk.yellow('  No embedding provider available — skipping semantic index.'));
      console.log(chalk.dim('  (Install nomic-embed-text via ollama pull nomic-embed-text)'));
    }
    return;
  }

  const db = getDb();

  const upsertMeta = db.prepare(`
    INSERT INTO file_embeddings (file_path, chunk_index, chunk_text, vector, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_path, chunk_index) DO UPDATE SET
      chunk_text = excluded.chunk_text,
      vector = excluded.vector,
      updated_at = excluded.updated_at
    RETURNING id
  `);

  const upsertMetaNoReturn = db.prepare(`
    INSERT INTO file_embeddings (file_path, chunk_index, chunk_text, vector, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_path, chunk_index) DO UPDATE SET
      chunk_text = excluded.chunk_text,
      vector = excluded.vector,
      updated_at = excluded.updated_at
  `);

  const upsertVec = _vecEnabled
    ? db.prepare(`INSERT OR REPLACE INTO vec_index(rowid, embedding) VALUES (?, ?)`)
    : null;

  const getRowId = db.prepare(
    `SELECT id FROM file_embeddings WHERE file_path = ? AND chunk_index = ?`
  );

  let processed = 0;
  const total = opts.files.length;

  for (const absFile of opts.files) {
    const relPath = path.relative(opts.rootDir, absFile);
    try {
      const content = await fs.readFile(absFile, 'utf-8');
      const chunks = chunkFile(relPath, content);

      // Placeholder rows so the file is tracked even before embedding completes.
      const insertPlaceholders = db.transaction(() => {
        for (const chunk of chunks) {
          upsertMetaNoReturn.run(relPath, chunk.chunkIndex, chunk.text, Buffer.alloc(0), Date.now());
        }
      });
      insertPlaceholders();

      // Embed each chunk and persist the vector.
      for (const chunk of chunks) {
        try {
          const vector = await embed(`${relPath}\n\n${chunk.text}`);
          const buf = Buffer.from(vector.buffer);

          if (upsertVec) {
            // With sqlite-vec: upsert metadata then insert into the vector index.
            const insertResult = upsertMeta.get(
              relPath, chunk.chunkIndex, chunk.text, buf, Date.now()
            ) as { id: number } | undefined;

            // RETURNING supplies the id on INSERT; on UPDATE we fall back to SELECT.
            const rowId = insertResult?.id ??
              (getRowId.get(relPath, chunk.chunkIndex) as { id: number } | undefined)?.id;

            if (rowId !== undefined) {
              // sqlite-vec accepts a JSON array string for float[] columns.
              const jsonVec = JSON.stringify(Array.from(vector));
              upsertVec.run(rowId, jsonVec);
            }
          } else {
            // Fallback: store raw buffer in the BLOB column.
            upsertMetaNoReturn.run(relPath, chunk.chunkIndex, chunk.text, buf, Date.now());
          }
        } catch {
          // Skip failed chunks — partial indexes are fine.
        }
      }

      processed++;
      if (opts.verbose && processed % 10 === 0) {
        process.stdout.write(`\r  Embedded ${processed}/${total} files...`);
      }
    } catch {
      // Skip unreadable files.
    }
  }

  if (opts.verbose) {
    process.stdout.write(`\r  Embedded ${processed}/${total} files.          \n`);
  }
}

/**
 * Search for relevant code chunks matching `query`.
 * Returns top-k results sorted by relevance.
 *
 * When sqlite-vec is available: native KNN query (O(log n)).
 * Fallback: full-table cosine similarity scan (O(n) in JS).
 */
export async function semanticSearch(
  query: string,
  topK: number = 5
): Promise<SearchResult[]> {
  const embed = await getEmbeddingFn();
  if (!embed) {
    throw new Error(
      'No embedding provider available. Run: ollama pull nomic-embed-text'
    );
  }

  const queryVec = await embed(query);
  const db = getDb();

  if (_vecEnabled) {
    // ── Native KNN path ──────────────────────────────────────────────────────
    const jsonVec = JSON.stringify(Array.from(queryVec));

    const rows = db.prepare(`
      SELECT f.file_path, f.chunk_index, f.chunk_text, v.distance
      FROM vec_index v
      JOIN file_embeddings f ON f.id = v.rowid
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance
    `).all(jsonVec, topK) as Array<{
      file_path: string;
      chunk_index: number;
      chunk_text: string;
      distance: number;
    }>;

    if (rows.length === 0) {
      throw new Error('Semantic index is empty. Run: canvas index build');
    }

    return rows.map(row => {
      const lines = row.chunk_text.split('\n');
      return {
        filePath: row.file_path,
        chunkIndex: row.chunk_index,
        // sqlite-vec returns L2 distance; convert to a 0–1 similarity score.
        score: 1 / (1 + row.distance),
        text: row.chunk_text,
        startLine: 1,
        endLine: lines.length
      };
    });
  }

  // ── Fallback: full-table JS cosine similarity ────────────────────────────
  const rows = db.prepare(`
    SELECT file_path, chunk_index, chunk_text, vector
    FROM file_embeddings
    WHERE length(vector) > 0
  `).all() as Array<{
    file_path: string;
    chunk_index: number;
    chunk_text: string;
    vector: Buffer;
  }>;

  if (rows.length === 0) {
    throw new Error('Semantic index is empty. Run: canvas index build');
  }

  const scored = rows.map(row => {
    const vec = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.length / 4);
    const score = cosineSimilarity(queryVec, vec);
    const lines = row.chunk_text.split('\n');
    return {
      filePath: row.file_path,
      chunkIndex: row.chunk_index,
      score,
      text: row.chunk_text,
      startLine: 1,
      endLine: lines.length
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Return stats about the semantic index.
 */
export function getEmbeddingStats(): { files: number; chunks: number } {
  const db = getDb();
  const files = (
    db.prepare('SELECT COUNT(DISTINCT file_path) as c FROM file_embeddings').get() as { c: number }
  ).c;
  const chunks = (
    db.prepare('SELECT COUNT(*) as c FROM file_embeddings WHERE length(vector) > 0').get() as { c: number }
  ).c;
  return { files, chunks };
}
