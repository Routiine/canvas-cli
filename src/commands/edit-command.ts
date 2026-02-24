/**
 * canvas edit <file> "instruction"
 *
 * Sends the file to AI with an edit instruction, shows a colored unified diff,
 * and lets the user accept/reject the changes before applying.
 *
 * canvas undo — restores the most recent snapshot for a file.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { getProviderRegistry } from '../intelligence/provider-registry.js';

const SNAPSHOT_DIR = path.join(os.homedir(), '.canvas', 'snapshots');

// ─── Snapshot helpers ────────────────────────────────────────────────────────

async function saveSnapshot(filePath: string): Promise<string> {
  await fs.ensureDir(SNAPSHOT_DIR);
  const timestamp = Date.now();
  const basename = path.basename(filePath);
  const snapshotPath = path.join(SNAPSHOT_DIR, `${timestamp}-${basename}`);
  // Store the original path inside so `canvas undo` knows what to restore
  const content = await fs.readFile(filePath, 'utf-8');
  await fs.writeJSON(snapshotPath + '.meta.json', { originalPath: filePath, timestamp });
  await fs.writeFile(snapshotPath, content);
  return snapshotPath;
}

async function findLatestSnapshot(filePath: string): Promise<string | null> {
  await fs.ensureDir(SNAPSHOT_DIR);
  const entries = await fs.readdir(SNAPSHOT_DIR);
  const metas = entries.filter(e => e.endsWith('.meta.json'));

  const matched: Array<{ snapshotPath: string; timestamp: number }> = [];
  for (const meta of metas) {
    const data = await fs.readJSON(path.join(SNAPSHOT_DIR, meta)) as { originalPath: string; timestamp: number };
    if (path.resolve(data.originalPath) === path.resolve(filePath)) {
      const snapshotPath = path.join(SNAPSHOT_DIR, meta.replace('.meta.json', ''));
      matched.push({ snapshotPath, timestamp: data.timestamp });
    }
  }
  if (matched.length === 0) return null;
  matched.sort((a, b) => b.timestamp - a.timestamp);
  return matched[0].snapshotPath;
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

interface Hunk {
  header: string;
  lines: string[];
}

function parseDiff(diffText: string): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current);
      current = { header: line, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

function colorDiff(diffText: string): string {
  return diffText
    .split('\n')
    .map(line => {
      if (line.startsWith('+++') || line.startsWith('---')) return chalk.bold(line);
      if (line.startsWith('@@')) return chalk.cyan(line);
      if (line.startsWith('+')) return chalk.green(line);
      if (line.startsWith('-')) return chalk.red(line);
      return chalk.gray(line);
    })
    .join('\n');
}

function generateUnifiedDiff(originalPath: string, newContent: string): string {
  const tmpPath = originalPath + '.canvas-edit-tmp';
  try {
    fs.writeFileSync(tmpPath, newContent);
    try {
      const result = execSync(`diff -u "${originalPath}" "${tmpPath}"`, { encoding: 'utf-8' });
      return result;
    } catch (err: unknown) {
      // diff exits with code 1 when there are differences (not an error)
      if (err && typeof err === 'object' && 'stdout' in err) {
        return (err as { stdout: string }).stdout;
      }
      return '';
    }
  } finally {
    try { fs.removeSync(tmpPath); } catch { /* ignore */ }
  }
}

// ─── Apply hunk-by-hunk ───────────────────────────────────────────────────────

function applyHunks(originalLines: string[], acceptedHunks: Hunk[]): string {
  // For simplicity, if all hunks accepted return the new content directly.
  // A full patch applier is complex; we track accepted vs rejected hunks
  // and re-apply via patch command.
  void originalLines;
  void acceptedHunks;
  // Handled externally via the full-accept path; this is a placeholder for partial.
  return '';
}

// ─── AI edit ──────────────────────────────────────────────────────────────────

async function aiEditFile(filePath: string, instruction: string): Promise<string> {
  const registry = getProviderRegistry();
  const provider = registry.getBestAvailable();
  if (!provider) {
    throw new Error('No AI provider available. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or ensure Ollama is running.');
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const ext = path.extname(filePath).slice(1) || 'text';

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a precise code editor. When given a file and an instruction, return ONLY the complete modified file content with no explanation, no markdown fences, no preamble. Preserve formatting, indentation, and style exactly.'
    },
    {
      role: 'user' as const,
      content: `File: ${filePath}\n\nInstruction: ${instruction}\n\nCurrent content:\n\`\`\`${ext}\n${content}\n\`\`\``
    }
  ];

  process.stdout.write(chalk.dim('Thinking'));
  const stream = provider.completeStream(messages, { temperature: 0.1 });
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    process.stdout.write(chalk.dim('.'));
  }
  process.stdout.write('\n');

  let result = chunks.join('');

  // Strip markdown fences if the model added them despite instruction
  result = result.replace(/^```[\w]*\n/, '').replace(/\n```\s*$/, '');

  return result;
}

// ─── Interactive review ───────────────────────────────────────────────────────

async function reviewAndApply(
  filePath: string,
  newContent: string,
  mode: 'all' | 'hunk'
): Promise<void> {
  const diffText = generateUnifiedDiff(filePath, newContent);

  if (!diffText.trim()) {
    console.log(chalk.yellow('No changes — file is already identical to the proposed edit.'));
    return;
  }

  console.log('\n' + colorDiff(diffText) + '\n');

  const inquirer = (await import('inquirer')).default;

  if (mode === 'all') {
    const { apply } = await inquirer.prompt<{ apply: boolean }>([
      {
        type: 'confirm',
        name: 'apply',
        message: 'Apply these changes?',
        default: true
      }
    ]);

    if (!apply) {
      console.log(chalk.yellow('Changes discarded.'));
      return;
    }

    const snapshot = await saveSnapshot(filePath);
    await fs.writeFile(filePath, newContent);
    console.log(chalk.green(`✓ Changes applied. Snapshot: ${snapshot}`));
    return;
  }

  // Hunk-by-hunk mode
  const hunks = parseDiff(diffText);
  if (hunks.length === 0) {
    console.log(chalk.yellow('No hunks found in diff.'));
    return;
  }

  const acceptedHunks: number[] = [];

  for (let i = 0; i < hunks.length; i++) {
    const hunk = hunks[i];
    console.log(chalk.cyan(`\n── Hunk ${i + 1}/${hunks.length} ──`));
    console.log(chalk.cyan(hunk.header));
    console.log(hunk.lines.map(l => {
      if (l.startsWith('+')) return chalk.green(l);
      if (l.startsWith('-')) return chalk.red(l);
      return chalk.gray(l);
    }).join('\n'));

    const { choice } = await inquirer.prompt<{ choice: string }>([
      {
        type: 'list',
        name: 'choice',
        message: `Hunk ${i + 1}:`,
        choices: [
          { name: 'Accept', value: 'accept' },
          { name: 'Skip', value: 'skip' },
          { name: 'Accept all remaining', value: 'all' },
          { name: 'Reject all remaining', value: 'none' }
        ]
      }
    ]);

    if (choice === 'all') {
      for (let j = i; j < hunks.length; j++) acceptedHunks.push(j);
      break;
    }
    if (choice === 'none') break;
    if (choice === 'accept') acceptedHunks.push(i);
  }

  if (acceptedHunks.length === 0) {
    console.log(chalk.yellow('No hunks accepted — file unchanged.'));
    return;
  }

  if (acceptedHunks.length === hunks.length) {
    // All accepted — apply full new content
    const snapshot = await saveSnapshot(filePath);
    await fs.writeFile(filePath, newContent);
    console.log(chalk.green(`✓ All hunks applied. Snapshot: ${snapshot}`));
  } else {
    // Partial acceptance: apply only accepted hunks via patch
    const tmpPatch = filePath + '.canvas-patch';
    const header = `--- ${filePath}\n+++ ${filePath}\n`;
    const patchContent = header + acceptedHunks.map(i => {
      const hunk = hunks[i];
      return hunk.header + '\n' + hunk.lines.join('\n');
    }).join('\n');

    try {
      await fs.writeFile(tmpPatch, patchContent);
      const snapshot = await saveSnapshot(filePath);
      execSync(`patch -u "${filePath}" "${tmpPatch}"`, { stdio: 'pipe' });
      console.log(chalk.green(`✓ ${acceptedHunks.length}/${hunks.length} hunks applied. Snapshot: ${snapshot}`));
    } catch (e: unknown) {
      console.log(chalk.red(`Patch failed: ${e instanceof Error ? e.message : String(e)}`));
      console.log(chalk.dim('Tip: Use --all mode for reliable acceptance of all changes.'));
    } finally {
      try { await fs.remove(tmpPatch); } catch { /* ignore */ }
    }
  }

  void applyHunks; // referenced to avoid unused warning
}

// ─── Commands ─────────────────────────────────────────────────────────────────

export function createEditCommand(): Command {
  return new Command('edit')
    .description('AI-powered file edit with diff review')
    .argument('<file>', 'File to edit')
    .argument('<instruction>', 'What to change (in quotes)')
    .option('--all', 'Accept/reject entire diff (default)', false)
    .option('--hunk', 'Review and accept/reject hunk by hunk', false)
    .option('--yes', 'Apply without prompting (non-interactive)', false)
    .action(async (file: string, instruction: string, opts: { all: boolean; hunk: boolean; yes: boolean }) => {
      const absPath = path.resolve(file);
      if (!await fs.pathExists(absPath)) {
        console.error(chalk.red(`File not found: ${absPath}`));
        process.exit(1);
      }

      console.log(chalk.cyan(`\nEditing ${chalk.bold(file)}`));
      console.log(chalk.dim(`Instruction: ${instruction}\n`));

      try {
        const newContent = await aiEditFile(absPath, instruction);
        const diffText = generateUnifiedDiff(absPath, newContent);

        if (!diffText.trim()) {
          console.log(chalk.yellow('No changes produced.'));
          return;
        }

        if (opts.yes) {
          await saveSnapshot(absPath);
          await fs.writeFile(absPath, newContent);
          console.log(chalk.green('✓ Changes applied.'));
          return;
        }

        const mode = opts.hunk ? 'hunk' : 'all';
        await reviewAndApply(absPath, newContent, mode);
      } catch (err: unknown) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });
}

export function createUndoCommand(): Command {
  return new Command('undo')
    .description('Restore a file to its pre-edit snapshot')
    .argument('<file>', 'File to restore')
    .action(async (file: string) => {
      const absPath = path.resolve(file);
      const snapshot = await findLatestSnapshot(absPath);

      if (!snapshot) {
        console.log(chalk.yellow(`No snapshot found for ${file}`));
        return;
      }

      const inquirer = (await import('inquirer')).default;
      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Restore ${file} from snapshot?`,
          default: true
        }
      ]);

      if (!confirm) {
        console.log(chalk.dim('Cancelled.'));
        return;
      }

      const original = await fs.readFile(snapshot, 'utf-8');
      await fs.writeFile(absPath, original);
      console.log(chalk.green(`✓ Restored ${file} from snapshot`));
    });
}
