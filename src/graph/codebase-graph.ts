/**
 * Priority 2: Codebase Graph - Main Entry
 * Build index, watch for changes, query graph
 */

import { glob } from 'glob';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { walkSourceFile } from './ast-walker.js';
import { enrichNodes } from './git-enricher.js';
import { getGraphStorage, type GraphNode } from './graph-storage.js';
import { startGraphWatcher, stopGraphWatcher } from './graph-watcher.js';

export async function buildIndex(rootDir: string = process.cwd(), verbose = false): Promise<string[]> {
  const startTime = Date.now();

  const files = await glob(`${rootDir}/src/**/*.ts`, {
    ignore: ['**/node_modules/**', '**/*.d.ts', '**/dist/**']
  });

  if (verbose) {
    console.log(chalk.cyan(`\n📊 Indexing ${files.length} TypeScript files...\n`));
  }

  let processed = 0;
  const batchSize = 20;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    await Promise.all(batch.map(async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const { nodes, edges } = walkSourceFile(filePath, content);
        const enriched = await enrichNodes(nodes);
        getGraphStorage().deleteFileNodes(filePath);
        getGraphStorage().upsertNodes(enriched);
        getGraphStorage().upsertEdges(edges);
        processed++;

        if (verbose && processed % 20 === 0) {
          process.stdout.write(`\r  Processed: ${processed}/${files.length}`);
        }
      } catch {
        // Skip unparseable files
      }
    }));
  }

  const stats = getGraphStorage().getStats();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (verbose) {
    console.log(`\n${chalk.green('✓')} Index built in ${elapsed}s`);
    console.log(chalk.gray(`  Nodes: ${stats.nodeCount} | Edges: ${stats.edgeCount} | Files: ${stats.fileCount}`));
  }

  return files;
}

export function watchAndUpdate(rootDir: string = process.cwd()): void {
  startGraphWatcher(rootDir);
}

export function stopWatching(): void {
  stopGraphWatcher();
}

export function querySymbol(name: string): GraphNode[] {
  return getGraphStorage().findSymbol(name);
}

export function getFileContext(filePath: string, symbolName?: string) {
  return getGraphStorage().getContext(filePath, symbolName);
}

export function getStats() {
  return getGraphStorage().getStats();
}
