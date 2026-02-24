/**
 * Priority 5: PR Review Comment Extractor
 * GitHub PR review comments -> DPO preference pairs
 */

import { Octokit } from '@octokit/rest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import simpleGit from 'simple-git';

export interface DPOEntry {
  prompt: string;
  chosen: string;
  rejected: string;
}

const TRAINING_DIR = path.join(os.homedir(), '.canvas', 'training');

async function getRepoInfo(): Promise<{ owner: string; repo: string } | null> {
  try {
    const git = simpleGit();
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin?.refs?.fetch) return null;

    const match = origin.refs.fetch.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (!match) return null;

    return { owner: match[1], repo: match[2] };
  } catch {
    return null;
  }
}

export async function extractPRReviews(token?: string): Promise<{ written: number; outputFile: string }> {
  await fs.ensureDir(TRAINING_DIR);
  const outputFile = path.join(TRAINING_DIR, 'pr-reviews.jsonl');

  const apiToken = token || process.env.GITHUB_TOKEN;
  if (!apiToken) {
    return { written: 0, outputFile };
  }

  const repoInfo = await getRepoInfo();
  if (!repoInfo) {
    return { written: 0, outputFile };
  }

  const octokit = new Octokit({ auth: apiToken });
  const entries: DPOEntry[] = [];

  try {
    const prs = await octokit.pulls.list({
      ...repoInfo,
      state: 'closed',
      per_page: 50
    });

    for (const pr of prs.data) {
      const comments = await octokit.pulls.listReviewComments({
        ...repoInfo,
        pull_number: pr.number
      });

      for (const comment of comments.data) {
        if (!comment.diff_hunk || !comment.body) continue;
        if (comment.body.length < 20) continue;

        entries.push({
          prompt: `Review this code:\n\`\`\`\n${comment.diff_hunk.slice(0, 1000)}\n\`\`\``,
          chosen: comment.body,
          rejected: '' // Would need the original code before review
        });
      }
    }
  } catch {
    // GitHub API may be unavailable
  }

  const jsonl = entries.map(e => JSON.stringify(e)).join('\n');
  await fs.writeFile(outputFile, jsonl, 'utf-8');

  return { written: entries.length, outputFile };
}
