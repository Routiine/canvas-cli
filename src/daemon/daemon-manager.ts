/**
 * Priority 4: Daemon Manager
 * Background agent: canvas daemon start|stop|status
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import Database from 'better-sqlite3';

const CANVAS_DIR = path.join(os.homedir(), '.canvas');
const PID_FILE = path.join(CANVAS_DIR, 'daemon.pid');
const LOG_FILE = path.join(CANVAS_DIR, 'daemon.log');

function getDb(): Database.Database {
  fs.ensureDirSync(CANVAS_DIR);
  const db = new Database(path.join(CANVAS_DIR, 'canvas.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      file_path TEXT,
      message TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_findings_job ON daemon_findings(job_name);
    CREATE INDEX IF NOT EXISTS idx_findings_severity ON daemon_findings(severity);
    CREATE INDEX IF NOT EXISTS idx_findings_resolved ON daemon_findings(resolved);
  `);
  return db;
}

export function isRunning(): boolean {
  try {
    if (!fs.existsSync(PID_FILE)) return false;
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
    process.kill(pid, 0); // Check if process exists
    return true;
  } catch {
    return false;
  }
}

export function getPid(): number | null {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    return parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim());
  } catch {
    return null;
  }
}

export async function startDaemon(): Promise<{ success: boolean; pid?: number; message: string }> {
  if (isRunning()) {
    const pid = getPid();
    return { success: false, message: `Daemon already running (PID: ${pid})` };
  }

  fs.ensureDirSync(CANVAS_DIR);

  // Find daemon worker script
  const workerPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'daemon-worker.js'
  );

  // Spawn detached daemon process
  const logStream = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [workerPath], {
    detached: true,
    stdio: ['ignore', logStream, logStream],
    env: { ...process.env }
  });

  child.unref();

  // Write PID file
  fs.writeFileSync(PID_FILE, child.pid!.toString());

  return { success: true, pid: child.pid, message: `Daemon started (PID: ${child.pid})` };
}

export function stopDaemon(): { success: boolean; message: string } {
  if (!isRunning()) {
    // Clean up stale PID file
    if (fs.existsSync(PID_FILE)) fs.removeSync(PID_FILE);
    return { success: false, message: 'Daemon is not running' };
  }

  const pid = getPid();
  if (!pid) return { success: false, message: 'Cannot read PID file' };

  try {
    process.kill(pid, 'SIGTERM');
    fs.removeSync(PID_FILE);
    return { success: true, message: `Daemon stopped (PID: ${pid})` };
  } catch (err) {
    fs.removeSync(PID_FILE);
    return { success: false, message: `Failed to stop daemon: ${err}` };
  }
}

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: string;
  logFile: string;
  recentFindings: number;
  unresolvedFindings: number;
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  const running = isRunning();
  const pid = getPid();

  let recentFindings = 0;
  let unresolvedFindings = 0;

  try {
    const db = getDb();
    const dayAgo = Date.now() - 86400000;
    const recent = db.prepare('SELECT COUNT(*) as c FROM daemon_findings WHERE created_at > ?').get(dayAgo) as { c: number };
    const unresolved = db.prepare('SELECT COUNT(*) as c FROM daemon_findings WHERE resolved = 0').get() as { c: number };
    recentFindings = recent.c;
    unresolvedFindings = unresolved.c;
    db.close();
  } catch {
    // DB may not exist yet
  }

  return {
    running,
    pid: pid || undefined,
    logFile: LOG_FILE,
    recentFindings,
    unresolvedFindings
  };
}

export function addFinding(jobName: string, severity: 'info' | 'warning' | 'error', message: string, filePath?: string, details: object = {}): void {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO daemon_findings (job_name, severity, file_path, message, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jobName, severity, filePath || null, message, JSON.stringify(details), Date.now());
    db.close();
  } catch {
    // Ignore storage errors in daemon
  }
}

export interface DaemonFinding {
  id: number;
  job_name: string;
  severity: 'info' | 'warning' | 'error';
  file_path: string | null;
  message: string;
  details: string;
  resolved: number;
  created_at: number;
}

export function getFindings(options: { resolved?: boolean; limit?: number; severity?: string } = {}): DaemonFinding[] {
  try {
    const db = getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.resolved !== undefined) {
      conditions.push('resolved = ?');
      params.push(options.resolved ? 1 : 0);
    }
    if (options.severity) {
      conditions.push('severity = ?');
      params.push(options.severity);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(options.limit ?? 50);

    const rows = db.prepare(`
      SELECT * FROM daemon_findings ${where} ORDER BY created_at DESC LIMIT ?
    `).all(...params) as DaemonFinding[];
    db.close();
    return rows;
  } catch {
    return [];
  }
}
