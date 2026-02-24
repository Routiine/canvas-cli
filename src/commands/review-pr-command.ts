/**
 * canvas review-pr <number>
 *
 * Reads a GitHub PR's diff via the Octokit REST API, sends each changed file
 * to the AI for code review, and posts inline review comments back to the PR.
 *
 * Requirements:
 *   GITHUB_TOKEN env var
 *   Run from inside a git repo with a GitHub remote
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { getProviderRegistry } from '../intelligence/provider-registry.js';

// ─── Git remote helpers ───────────────────────────────────────────────────────

function getGitHubOwnerRepo(): { owner: string; repo: string } {
  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    // Support https://github.com/owner/repo.git and git@github.com:owner/repo.git
    const match =
      remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/) ||
      remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (!match) throw new Error('Cannot parse GitHub remote URL');
    return { owner: match[1], repo: match[2] };
  } catch {
    throw new Error('Could not determine GitHub owner/repo from git remote. Ensure you are in a GitHub repo.');
  }
}

// ─── AI review ────────────────────────────────────────────────────────────────

interface FileReview {
  filename: string;
  comments: Array<{ line: number; body: string }>;
  summary: string;
}

async function reviewFileDiff(filename: string, patch: string): Promise<FileReview> {
  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();
  if (!provider) throw new Error('No AI provider available.');

  const messages = [
    {
      role: 'system' as const,
      content: `You are an expert code reviewer. Review the given file diff and provide:
1. A brief summary of the changes (1-2 sentences)
2. Specific inline comments on problematic lines (bugs, security issues, performance, style)

Respond in this exact JSON format:
{
  "summary": "...",
  "comments": [
    { "line": <diff line number where the issue appears>, "body": "..." }
  ]
}

Only comment on actual issues — do not nitpick style unless it is inconsistent with the file.
If the code looks good, return an empty comments array.`
    },
    {
      role: 'user' as const,
      content: `File: ${filename}\n\nDiff:\n\`\`\`diff\n${patch}\n\`\`\``
    }
  ];

  const chunks: string[] = [];
  for await (const chunk of provider.completeStream(messages, { temperature: 0.2 })) {
    chunks.push(chunk);
  }

  const raw = chunks.join('').trim();

  try {
    // Extract JSON from response (model might wrap in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]) as { summary: string; comments: Array<{ line: number; body: string }> };
    return { filename, summary: parsed.summary, comments: parsed.comments || [] };
  } catch {
    // Graceful degradation: return summary-only review
    return { filename, summary: raw.slice(0, 300), comments: [] };
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function createReviewPRCommand(): Command {
  return new Command('review-pr')
    .description('AI code review for a GitHub pull request')
    .argument('<number>', 'PR number to review')
    .option('--dry-run', 'Show review without posting to GitHub', false)
    .option('--files <pattern>', 'Only review files matching this pattern')
    .option('--max-files <n>', 'Max files to review (default: 20)', '20')
    .action(async (prNumber: string, opts: { dryRun: boolean; files?: string; maxFiles: string }) => {
      const token = process.env.GITHUB_TOKEN;
      if (!token && !opts.dryRun) {
        console.error(chalk.red('GITHUB_TOKEN environment variable required to post review.'));
        console.log(chalk.dim('Use --dry-run to see the review without posting.'));
        process.exit(1);
      }

      const maxFiles = parseInt(opts.maxFiles, 10);

      let owner: string, repo: string;
      try {
        ({ owner, repo } = getGitHubOwnerRepo());
      } catch (err: unknown) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }

      console.log(chalk.cyan(`\nReviewing PR #${prNumber} — ${owner}/${repo}\n`));

      const { Octokit } = await import('@octokit/rest');
      const octokit = new Octokit({ auth: token });

      // Fetch PR metadata
      const { data: pr } = await octokit.pulls.get({
        owner, repo, pull_number: parseInt(prNumber, 10)
      });

      console.log(chalk.bold(`  ${pr.title}`));
      console.log(chalk.dim(`  ${pr.head.sha.slice(0, 7)} → ${pr.base.sha.slice(0, 7)} | ${pr.changed_files} files changed\n`));

      // Fetch changed files
      const { data: files } = await octokit.pulls.listFiles({
        owner, repo, pull_number: parseInt(prNumber, 10), per_page: 100
      });

      let reviewableFiles = files.filter(f => f.patch && f.patch.length > 0);
      if (opts.files) {
        reviewableFiles = reviewableFiles.filter(f => f.filename.includes(opts.files!));
      }
      reviewableFiles = reviewableFiles.slice(0, maxFiles);

      if (reviewableFiles.length === 0) {
        console.log(chalk.yellow('No reviewable files found.'));
        return;
      }

      console.log(chalk.dim(`Reviewing ${reviewableFiles.length} files...\n`));

      const reviews: FileReview[] = [];
      let hasIssues = false;

      for (const file of reviewableFiles) {
        process.stdout.write(chalk.dim(`  Reviewing ${file.filename}...`));
        try {
          const review = await reviewFileDiff(file.filename, file.patch!);
          reviews.push(review);

          if (review.comments.length > 0) {
            hasIssues = true;
            console.log(chalk.yellow(` ${review.comments.length} issue(s)`));
          } else {
            console.log(chalk.green(' OK'));
          }
        } catch (err: unknown) {
          console.log(chalk.red(` Error: ${err instanceof Error ? err.message : String(err)}`));
        }
      }

      // Build overall summary
      const overallSummary = reviews
        .filter(r => r.summary)
        .map(r => `**${r.filename}**: ${r.summary}`)
        .join('\n');

      const totalComments = reviews.reduce((sum, r) => sum + r.comments.length, 0);

      const reviewBody = `## Canvas CLI AI Review

${overallSummary}

---
${hasIssues
  ? `Found **${totalComments}** potential issue(s) across ${reviews.filter(r => r.comments.length > 0).length} file(s).`
  : '**No issues found.** LGTM!'}

*Generated by [Canvas CLI](https://github.com/canvas-cli)*`;

      console.log('\n' + chalk.cyan('── Review Summary ──'));
      console.log(chalk.dim(reviewBody));

      if (opts.dryRun) {
        console.log(chalk.yellow('\nDry run — not posting to GitHub.'));

        for (const rev of reviews) {
          if (rev.comments.length > 0) {
            console.log(chalk.bold(`\n${rev.filename}:`));
            for (const c of rev.comments) {
              console.log(chalk.yellow(`  Line ${c.line}: ${c.body}`));
            }
          }
        }
        return;
      }

      // Post review to GitHub
      // Build inline comments mapped to diff positions
      const reviewComments: Array<{
        path: string;
        position: number;
        body: string;
      }> = [];

      for (const rev of reviews) {
        const fileData = reviewableFiles.find(f => f.filename === rev.filename);
        if (!fileData || !fileData.patch) continue;

        const patchLines = fileData.patch.split('\n');

        for (const comment of rev.comments) {
          // Map line number to diff position (1-indexed position in the diff)
          const position = Math.min(comment.line, patchLines.length);
          reviewComments.push({
            path: rev.filename,
            position,
            body: comment.body
          });
        }
      }

      try {
        await octokit.pulls.createReview({
          owner,
          repo,
          pull_number: parseInt(prNumber, 10),
          commit_id: pr.head.sha,
          body: reviewBody,
          event: hasIssues ? 'COMMENT' : 'APPROVE',
          comments: reviewComments
        });
        console.log(chalk.green(`\n✓ Review posted to PR #${prNumber}`));
      } catch (err: unknown) {
        console.error(chalk.red(`Failed to post review: ${err instanceof Error ? err.message : String(err)}`));
        console.log(chalk.dim('Use --dry-run to see the review output without posting.'));
      }
    });
}
