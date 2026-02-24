/**
 * Semantic search over the codebase using embeddings.
 *
 * At `canvas index build` time, each source file is chunked and embedded.
 * Vectors are stored in SQLite alongside the graph.
 *
 * `canvas ask "query"` embeds the query and returns the most relevant
 * file chunks with context for the AI to reason about.
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

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
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

// ─── Vector math ──────────────────────────────────────────────────────────────

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
  const upsert = db.prepare(`
    INSERT INTO file_embeddings (file_path, chunk_index, chunk_text, vector, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(file_path, chunk_index) DO UPDATE SET
      chunk_text = excluded.chunk_text,
      vector = excluded.vector,
      updated_at = excluded.updated_at
  `);

  let processed = 0;
  const total = opts.files.length;

  for (const absFile of opts.files) {
    const relPath = path.relative(opts.rootDir, absFile);
    try {
      const content = await fs.readFile(absFile, 'utf-8');
      const chunks = chunkFile(relPath, content);

      const insertMany = db.transaction(() => {
        for (const chunk of chunks) {
          // Store a placeholder — we'll do async embedding below
          upsert.run(relPath, chunk.chunkIndex, chunk.text, Buffer.alloc(0), Date.now());
        }
      });
      insertMany();

      // Now embed each chunk
      for (const chunk of chunks) {
        try {
          const vector = await embed(`${relPath}\n\n${chunk.text}`);
          const buf = Buffer.from(vector.buffer);
          upsert.run(relPath, chunk.chunkIndex, chunk.text, buf, Date.now());
        } catch {
          // skip failed chunks
        }
      }

      processed++;
      if (opts.verbose && processed % 10 === 0) {
        process.stdout.write(`\r  Embedded ${processed}/${total} files...`);
      }
    } catch {
      // skip unreadable files
    }
  }

  if (opts.verbose) {
    process.stdout.write(`\r  Embedded ${processed}/${total} files.          \n`);
  }
}

/**
 * Search for relevant code chunks matching `query`.
 * Returns top-k results sorted by cosine similarity.
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

  // Load all embeddings — for large codebases, could use FAISS; fine for most repos
  const rows = db.prepare(`
    SELECT file_path, chunk_index, chunk_text, vector
    FROM file_embeddings
    WHERE length(vector) > 0
  `).all() as Array<{ file_path: string; chunk_index: number; chunk_text: string; vector: Buffer }>;

  if (rows.length === 0) {
    throw new Error(
      'Semantic index is empty. Run: canvas index build'
    );
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
  const files = (db.prepare('SELECT COUNT(DISTINCT file_path) as c FROM file_embeddings').get() as { c: number }).c;
  const chunks = (db.prepare('SELECT COUNT(*) as c FROM file_embeddings WHERE length(vector) > 0').get() as { c: number }).c;
  return { files, chunks };
}
