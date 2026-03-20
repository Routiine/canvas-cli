/**
 * Priority 2: Graph Watcher
 * Incremental codebase graph updates via chokidar
 */

import chokidar from 'chokidar';
import fs from 'fs-extra';
import { walkSourceFile } from './ast-walker.js';
import { enrichWithGit } from './git-enricher.js';
import { getGraphStorage } from './graph-storage.js';

let watcher: ReturnType<typeof chokidar.watch> | null = null;

async function processFile(filePath: string): Promise<void> {
  try {
    if (!await fs.pathExists(filePath)) {
      getGraphStorage().deleteFileNodes(filePath);
      return;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const { nodes, edges } = walkSourceFile(filePath, content);

    // Enrich file node with git info
    const gitInfo = await enrichWithGit(filePath);
    const fileNode = nodes.find(n => n.node_type === 'file');
    if (fileNode) {
      fileNode.git_author = gitInfo.author;
      fileNode.git_last_modified = gitInfo.lastModified;
      fileNode.commit_summary = gitInfo.commitSummary;
    }

    getGraphStorage().deleteFileNodes(filePath);
    getGraphStorage().upsertNodes(nodes);
    getGraphStorage().upsertEdges(edges);
  } catch {
    // Ignore parse errors for non-TS files
  }
}

export function startGraphWatcher(rootDir: string = process.cwd()): void {
  if (watcher) return;

  watcher = chokidar.watch(`${rootDir}/src/**/*.ts`, {
    persistent: true,
    ignoreInitial: false,
    ignored: ['**/node_modules/**', '**/*.d.ts', '**/dist/**']
  });

  watcher
    .on('add', (filePath) => { void processFile(filePath); })
    .on('change', (filePath) => { void processFile(filePath); })
    .on('unlink', (filePath) => { getGraphStorage().deleteFileNodes(filePath); });
}

export function stopGraphWatcher(): void {
  if (watcher) {
    void watcher.close();
    watcher = null;
  }
}
