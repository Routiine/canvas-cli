/**
 * Priority 5: Training Data Extractor
 * git log + diffs -> Alpaca JSONL format for fine-tuning
 */

import simpleGit from 'simple-git';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface AlpacaEntry {
  instruction: string;
  input: string;
  output: string;
}

const git = simpleGit();
const TRAINING_DIR = path.join(os.homedir(), '.canvas', 'training');

export async function extractGitHistory(
  maxCommits: number = 500,
  projectDir: string = process.cwd()
): Promise<{ written: number; outputFile: string }> {
  await fs.ensureDir(TRAINING_DIR);
  const outputFile = path.join(TRAINING_DIR, 'git-history.jsonl');

  const log = await git.cwd(projectDir).log({ maxCount: maxCommits });
  const entries: AlpacaEntry[] = [];

  for (const commit of log.all) {
    if (!commit.message || commit.message.length < 10) continue;

    try {
      // Get diff for this commit
      const diff = await git.cwd(projectDir).show([
        commit.hash,
        '--stat',
        '--patch',
        '--unified=3'
      ]);

      if (!diff || diff.length < 50) continue;

      // Truncate large diffs
      const truncatedDiff = diff.slice(0, 4000);

      entries.push({
        instruction: commit.message.trim(),
        input: truncatedDiff,
        output: '' // Alpaca format: output is the model's expected completion
      });
    } catch {
      // Skip commits we can't get diffs for
    }
  }

  // Write as JSONL
  const jsonl = entries.map(e => JSON.stringify(e)).join('\n');
  await fs.writeFile(outputFile, jsonl, 'utf-8');

  return { written: entries.length, outputFile };
}
