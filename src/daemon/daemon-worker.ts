/**
 * Priority 4: Daemon Worker
 * Long-running background process spawned by daemon-manager
 */

import { startCommitWatcher } from './commit-watcher.js';
import { startDependencyMonitor } from './dependency-monitor.js';
import { startDeadCodeTracker } from './dead-code-tracker.js';
import { startPerfMonitor } from './perf-monitor.js';
import { addFinding } from './daemon-manager.js';
import simpleGit from 'simple-git';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

const HEARTBEAT_INTERVAL = 60_000; // 1 minute
const WEEKLY_MS = 7 * 24 * 3600 * 1000;

process.title = 'canvas-daemon';

const timers: NodeJS.Timeout[] = [];

function shutdown(): void {
  for (const t of timers) clearInterval(t);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ── Priority 5: Scheduled re-tune trigger ──────────────────────────────────

async function checkAndTriggerRetune(): Promise<void> {
  try {
    const dbPath = path.join(os.homedir(), '.canvas', 'canvas.db');
    if (!fs.existsSync(dbPath)) return;

    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS retune_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Count commits since last retune
    const lastRunRow = db.prepare("SELECT value FROM retune_state WHERE key = 'last_retune_commit'").get() as { value: string } | undefined;
    const lastRunHash = lastRunRow?.value;

    const git = simpleGit();
    const log = await git.log({ maxCount: 1 });
    const latestHash = log.latest?.hash;

    if (!latestHash) { db.close(); return; }

    // Get commit count since last retune
    let commitsSince = 0;
    if (lastRunHash) {
      try {
        const range = await git.log({ from: lastRunHash, to: 'HEAD' });
        commitsSince = range.total;
      } catch {
        commitsSince = 0;
      }
    } else {
      // First run — check if we have enough commits to bother
      const total = await git.log({ maxCount: 50 });
      commitsSince = total.total;
    }

    const COMMIT_THRESHOLD = 50;

    if (commitsSince >= COMMIT_THRESHOLD) {
      addFinding('retune-scheduler', 'info',
        `${commitsSince} commits since last fine-tune. Consider running 'canvas finetune extract && canvas finetune run'.`,
        undefined,
        { commitsSince, threshold: COMMIT_THRESHOLD, latestHash }
      );

      // Update last retune marker
      db.prepare("INSERT OR REPLACE INTO retune_state (key, value) VALUES ('last_retune_commit', ?)").run(latestHash);
    }

    db.close();
  } catch {
    // Git or DB errors are non-fatal
  }
}

async function start(): Promise<void> {
  addFinding('daemon', 'info', `Canvas daemon started (PID: ${process.pid})`);

  // Start commit watcher
  startCommitWatcher(process.cwd());

  // Start dependency monitor (every 6 hours)
  const depTimer = startDependencyMonitor(6 * 3600 * 1000);
  timers.push(depTimer);

  // Start dead code tracker (weekly)
  const deadTimer = startDeadCodeTracker(WEEKLY_MS);
  timers.push(deadTimer);

  // Start performance regression spotter (daily)
  const perfTimer = startPerfMonitor(24 * 3600 * 1000);
  timers.push(perfTimer);

  // Priority 5: Check for re-tune trigger weekly
  void checkAndTriggerRetune();
  const retuneTimer = setInterval(() => { void checkAndTriggerRetune(); }, WEEKLY_MS);
  timers.push(retuneTimer);

  // Heartbeat
  const heartbeat = setInterval(() => {
    // Keep process alive
  }, HEARTBEAT_INTERVAL);
  timers.push(heartbeat);
}

start().catch((err) => {
  console.error('Daemon error:', err);
  process.exit(1);
});
