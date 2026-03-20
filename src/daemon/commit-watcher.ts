/**
 * Priority 4: Commit Watcher
 * Watches .git/COMMIT_EDITMSG for new commits, runs analysis
 */

import chokidar from 'chokidar';
import simpleGit from 'simple-git';
import path from 'path';
import fs from 'fs-extra';
import { addFinding } from './daemon-manager.js';

const git = simpleGit();

async function analyzeCommit(): Promise<void> {
  try {
    const diff = await git.diff(['HEAD~1', 'HEAD', '--name-only']);
    const changedFiles = diff.split('\n').filter(Boolean);

    // Check for common issues in changed files
    for (const file of changedFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

      try {
        const fullPath = path.resolve(file);
        if (!await fs.pathExists(fullPath)) continue;
        const content = await fs.readFile(fullPath, 'utf-8');

        // Check for console.log left in production code
        if (content.includes('console.log(') && !file.includes('test') && !file.includes('spec')) {
          addFinding('commit-watcher', 'warning',
            'console.log() found in non-test file', file,
            { file, issue: 'debug_log' });
        }

        // Check for TODO/FIXME
        const todoMatch = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)[:\s]/g);
        if (todoMatch && todoMatch.length > 0) {
          addFinding('commit-watcher', 'info',
            `${todoMatch.length} TODO/FIXME comment(s) in committed file`, file,
            { file, count: todoMatch.length });
        }

        // Check for hardcoded credentials pattern
        const credPattern = /(?:password|secret|api_key|token)\s*=\s*['"][^'"]{8,}/gi;
        if (credPattern.test(content)) {
          addFinding('commit-watcher', 'error',
            'Possible hardcoded credential detected', file,
            { file, issue: 'hardcoded_credential' });
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Git operations may fail in non-git directories
  }
}

let watcher: ReturnType<typeof chokidar.watch> | null = null;

export function startCommitWatcher(projectDir: string = process.cwd()): void {
  const commitMsgPath = path.join(projectDir, '.git', 'COMMIT_EDITMSG');

  if (!fs.existsSync(path.join(projectDir, '.git'))) return;

  watcher = chokidar.watch(commitMsgPath, {
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', () => {
    void analyzeCommit();
  });
}

export function stopCommitWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}
