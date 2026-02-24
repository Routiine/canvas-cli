/**
 * Priority 4: Performance Regression Spotter
 * Tracks bundle size and complexity trends, flags regressions
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { addFinding } from './daemon-manager.js';

const execAsync = promisify(exec);
const CANVAS_DIR = path.join(os.homedir(), '.canvas');

function getDb(): Database.Database {
  fs.ensureDirSync(CANVAS_DIR);
  const db = new Database(path.join(CANVAS_DIR, 'canvas.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS perf_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commit_hash TEXT NOT NULL,
      dist_size_bytes INTEGER NOT NULL,
      ts_file_count INTEGER NOT NULL,
      avg_file_lines REAL NOT NULL,
      large_files TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_perf_created ON perf_snapshots(created_at);
  `);
  return db;
}

interface PerfSnapshot {
  commit_hash: string;
  dist_size_bytes: number;
  ts_file_count: number;
  avg_file_lines: number;
  large_files: string[];
}

async function captureSnapshot(projectDir: string = process.cwd()): Promise<PerfSnapshot | null> {
  try {
    // Get current commit hash
    const { stdout: hashOut } = await execAsync('git rev-parse --short HEAD', { cwd: projectDir });
    const commit_hash = hashOut.trim();

    // Measure dist/ directory size
    const distDir = path.join(projectDir, 'dist');
    let dist_size_bytes = 0;
    if (await fs.pathExists(distDir)) {
      const { stdout: duOut } = await execAsync(`du -sb "${distDir}"`, { timeout: 10000 });
      dist_size_bytes = parseInt(duOut.split('\t')[0]);
    }

    // Count TS files and measure line counts
    const { stdout: findOut } = await execAsync(
      `find "${path.join(projectDir, 'src')}" -name "*.ts" ! -name "*.d.ts"`,
      { timeout: 10000 }
    );
    const tsFiles = findOut.trim().split('\n').filter(Boolean);
    const ts_file_count = tsFiles.length;

    // Sample line counts (max 50 files for performance)
    const sample = tsFiles.slice(0, 50);
    let totalLines = 0;
    const largeFiles: string[] = [];

    for (const file of sample) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').length;
        totalLines += lines;
        if (lines > 500) {
          largeFiles.push(`${path.relative(projectDir, file)}:${lines}`);
        }
      } catch {
        // Skip unreadable files
      }
    }

    const avg_file_lines = sample.length > 0 ? totalLines / sample.length : 0;

    return { commit_hash, dist_size_bytes, ts_file_count, avg_file_lines, large_files: largeFiles };
  } catch {
    return null;
  }
}

async function detectRegressions(current: PerfSnapshot, db: Database.Database): Promise<void> {
  // Compare against last snapshot
  const last = db.prepare(`
    SELECT * FROM perf_snapshots ORDER BY created_at DESC LIMIT 1
  `).get() as (PerfSnapshot & { dist_size_bytes: number; ts_file_count: number; avg_file_lines: number; large_files: string }) | undefined;

  if (!last) return;

  const lastLargeFiles = JSON.parse(last.large_files || '[]') as string[];

  // Bundle size regression (>20% increase)
  if (last.dist_size_bytes > 0) {
    const sizeRatio = current.dist_size_bytes / last.dist_size_bytes;
    if (sizeRatio > 1.2) {
      const delta = current.dist_size_bytes - last.dist_size_bytes;
      addFinding('perf-monitor', 'warning',
        `Bundle size grew ${((sizeRatio - 1) * 100).toFixed(0)}% (+${Math.round(delta / 1024)}KB) since last snapshot`,
        'dist/',
        { before: last.dist_size_bytes, after: current.dist_size_bytes, commit: current.commit_hash }
      );
    }
  }

  // File count spike (>10 new files)
  const fileCountDelta = current.ts_file_count - last.ts_file_count;
  if (fileCountDelta > 10) {
    addFinding('perf-monitor', 'info',
      `${fileCountDelta} new TypeScript files added since last snapshot`,
      'src/',
      { before: last.ts_file_count, after: current.ts_file_count }
    );
  }

  // Average file size regression (>50 lines increase)
  if (current.avg_file_lines - last.avg_file_lines > 50) {
    addFinding('perf-monitor', 'info',
      `Average file length increased by ${(current.avg_file_lines - last.avg_file_lines).toFixed(0)} lines`,
      'src/',
      { before: last.avg_file_lines, after: current.avg_file_lines }
    );
  }

  // New large files
  const newLargeFiles = current.large_files.filter(f => !lastLargeFiles.includes(f));
  for (const file of newLargeFiles) {
    const [name, lines] = file.split(':');
    addFinding('perf-monitor', 'info',
      `New large file detected: ${name} (${lines} lines)`,
      name,
      { lines: parseInt(lines) }
    );
  }
}

export async function runPerfMonitor(projectDir: string = process.cwd()): Promise<void> {
  const snapshot = await captureSnapshot(projectDir);
  if (!snapshot) return;

  const db = getDb();

  await detectRegressions(snapshot, db);

  db.prepare(`
    INSERT INTO perf_snapshots (commit_hash, dist_size_bytes, ts_file_count, avg_file_lines, large_files, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    snapshot.commit_hash,
    snapshot.dist_size_bytes,
    snapshot.ts_file_count,
    snapshot.avg_file_lines,
    JSON.stringify(snapshot.large_files),
    Date.now()
  );

  db.close();
}

export function startPerfMonitor(intervalMs: number = 24 * 3600 * 1000): NodeJS.Timeout {
  void runPerfMonitor();
  return setInterval(() => { void runPerfMonitor(); }, intervalMs);
}
