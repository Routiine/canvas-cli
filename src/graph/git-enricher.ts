/**
 * Priority 2: Git Enricher
 * Adds git blame/commit metadata to graph nodes
 */

import simpleGit from 'simple-git';
import type { GraphNode } from './graph-storage.js';

export interface GitInfo {
  author?: string;
  lastModified?: number;
  commitSummary?: string;
}

const git = simpleGit();
const cache = new Map<string, GitInfo>();

export async function enrichWithGit(filePath: string): Promise<GitInfo> {
  if (cache.has(filePath)) return cache.get(filePath)!;

  try {
    const log = await git.log({ file: filePath, maxCount: 1 });
    const latest = log.latest;

    if (!latest) return {};

    const info: GitInfo = {
      author: latest.author_name,
      lastModified: new Date(latest.date).getTime(),
      commitSummary: latest.message?.slice(0, 120)
    };

    cache.set(filePath, info);
    return info;
  } catch {
    return {};
  }
}

export async function enrichNodes(nodes: GraphNode[]): Promise<GraphNode[]> {
  const fileNodes = nodes.filter(n => n.node_type === 'file');

  await Promise.all(
    fileNodes.map(async (node) => {
      const info = await enrichWithGit(node.file_path);
      node.git_author = info.author;
      node.git_last_modified = info.lastModified;
      node.commit_summary = info.commitSummary;
    })
  );

  return nodes;
}
