/**
 * Priority 3: Memory CLI Commands
 * canvas memory show|forget|search
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { PersistentMemory } from './persistent-memory.js';

export function registerMemoryCommands(program: Command): void {
  const memoryCmd = program.command('memory')
    .description('Manage persistent memory across sessions');
  
  memoryCmd
    .command('show')
    .description('Show stored memories for this project')
    .option('--file <path>', 'Filter by file path')
    .option('--category <cat>', 'Filter by category (decision|pattern|preference|fact|error)')
    .option('--limit <n>', 'Max memories to show', '20')
    .action(async (opts) => {
      const mem = new PersistentMemory('canvas-main', process.cwd());
      const memories = mem.list({
        filePath: opts.file,
        limit: parseInt(opts.limit)
      });
      
      if (memories.length === 0) {
        console.log(chalk.gray('No memories found for this project.'));
        return;
      }
      
      console.log(chalk.cyan.bold(`\n🧠 Memories (${memories.length})\n`));
      for (const m of memories) {
        const date = new Date(m.created_at).toLocaleDateString();
        const importance = (m.importance * 100).toFixed(0);
        console.log(chalk.bold(`[${m.id.slice(0, 8)}] ${chalk.yellow(m.category)}`));
        console.log(`  ${m.content}`);
        console.log(chalk.gray(`  Importance: ${importance}% | Accessed: ${m.access_count}x | ${date}`));
        if (m.file_path) console.log(chalk.gray(`  File: ${m.file_path}`));
        console.log();
      }
    });
  
  memoryCmd
    .command('forget <id>')
    .description('Delete a memory entry by ID (first 8 chars work)')
    .action(async (id) => {
      const mem = new PersistentMemory('canvas-main', process.cwd());
      // Try direct match first, then prefix match
      const memories = mem.list({ limit: 1000 });
      const target = memories.find(m => m.id === id || m.id.startsWith(id));
      
      if (!target) {
        console.log(chalk.red(`Memory not found: ${id}`));
        process.exit(1);
      }
      
      const deleted = mem.forget(target.id);
      if (deleted) {
        console.log(chalk.green(`✓ Deleted memory: ${target.content.slice(0, 60)}...`));
      } else {
        console.log(chalk.red('Failed to delete memory'));
      }
    });
  
  memoryCmd
    .command('search <query>')
    .description('Full-text search across memories')
    .option('--limit <n>', 'Max results', '10')
    .action(async (query, opts) => {
      const mem = new PersistentMemory('canvas-main', process.cwd());
      const results = mem.search(query, parseInt(opts.limit));
      
      if (results.length === 0) {
        console.log(chalk.gray(`No memories matching: ${query}`));
        return;
      }
      
      console.log(chalk.cyan.bold(`\n🔍 Search results for "${query}" (${results.length})\n`));
      for (const m of results) {
        console.log(chalk.bold(`[${m.id.slice(0, 8)}] ${chalk.yellow(m.category)}`));
        console.log(`  ${m.content}`);
        console.log(chalk.gray(`  Importance: ${(m.importance * 100).toFixed(0)}%`));
        console.log();
      }
    });
  
  memoryCmd
    .command('sessions')
    .description('Show recent session summaries')
    .option('--limit <n>', 'Max sessions to show', '5')
    .action(async (opts) => {
      const mem = new PersistentMemory('canvas-main', process.cwd());
      const summaries = mem.getRecentSummaries(parseInt(opts.limit));
      
      if (summaries.length === 0) {
        console.log(chalk.gray('No session summaries found.'));
        return;
      }
      
      console.log(chalk.cyan.bold(`\n📋 Recent Sessions (${summaries.length})\n`));
      for (const s of summaries) {
        const date = new Date(s.created_at).toLocaleString();
        console.log(chalk.bold(date));
        console.log(`  ${s.summary}`);
        if (s.key_decisions.length > 0) {
          console.log(chalk.gray('  Decisions: ' + s.key_decisions.slice(0, 2).join('; ')));
        }
        console.log();
      }
    });
}
