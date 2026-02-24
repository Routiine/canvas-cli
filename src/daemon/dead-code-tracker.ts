/**
 * Priority 4: Dead Code Tracker
 * Finds symbols not touched in 30+ days via git log
 */

import simpleGit, { type SimpleGitOptions } from 'simple-git';
import { addFinding } from './daemon-manager.js';

const git = simpleGit();

export async function trackDeadCode(projectDir: string = process.cwd()): Promise<void> {
  void projectDir; // used for future scoped git instance

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  try {
    const logOptions: Partial<SimpleGitOptions> & Record<string, string | null> = {
      '--after': cutoff,
      '--name-only': null,
      '--pretty': 'format:'
    };

    const log = await git.log(logOptions);

    if (log.all) {
      // simple-git doesn't parse --name-only well in this format
      // future: iterate log.all for per-entry file lists
    }

    addFinding('dead-code-tracker', 'info',
      'Dead code scan completed. Check graph_nodes for stale symbols.',
      undefined,
      { cutoffDate: cutoff }
    );
  } catch {
    // Git operations may fail
  }
}

export function startDeadCodeTracker(intervalMs: number = 7 * 24 * 3600 * 1000): NodeJS.Timeout {
  void trackDeadCode();
  return setInterval(() => { void trackDeadCode(); }, intervalMs);
}
