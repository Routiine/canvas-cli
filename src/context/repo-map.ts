/**
 * Repo Map
 * Generates a compact symbol map of the codebase for inclusion in AI prompts.
 * Uses the existing AST walker / graph storage to extract file→symbol mappings.
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface RepoMapEntry {
  filePath: string;
  symbols: string[];
  size: number;
}

export interface RepoMapOptions {
  root?: string;
  maxFiles?: number;
  includeGlob?: string[];
  excludeGlob?: string[];
  maxOutputChars?: number;
}

const DEFAULT_EXCLUDES = [
  'node_modules', 'dist', 'build', '.git', 'coverage',
  '__pycache__', '.next', '.nuxt', '.cache',
];

/**
 * Generate a compact repo map string suitable for system prompts.
 */
export async function generateRepoMap(options: RepoMapOptions = {}): Promise<string> {
  const root = options.root || process.cwd();
  const maxFiles = options.maxFiles || 200;
  const maxChars = options.maxOutputChars || 8000;

  const entries = await scanDirectory(root, root, DEFAULT_EXCLUDES, maxFiles);

  // Sort by relevance (more symbols = more important)
  entries.sort((a, b) => b.symbols.length - a.symbols.length);

  // Build the map string
  const lines: string[] = ['Repository Map:', ''];
  let totalChars = 0;

  for (const entry of entries) {
    const symbolStr = entry.symbols.length > 0
      ? ` — ${entry.symbols.slice(0, 10).join(', ')}${entry.symbols.length > 10 ? ', ...' : ''}`
      : '';
    const line = `  ${entry.filePath}${symbolStr}`;

    if (totalChars + line.length > maxChars) break;
    lines.push(line);
    totalChars += line.length;
  }

  lines.push('');
  lines.push(`(${entries.length} files total)`);

  return lines.join('\n');
}

/**
 * Scan directory and extract symbol information from source files.
 */
async function scanDirectory(
  dir: string,
  root: string,
  excludes: string[],
  maxFiles: number
): Promise<RepoMapEntry[]> {
  const entries: RepoMapEntry[] = [];

  try {
    const items = await fs.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      if (entries.length >= maxFiles) break;

      if (excludes.some(e => item.name === e || item.name.startsWith('.'))) continue;

      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        const subEntries = await scanDirectory(fullPath, root, excludes, maxFiles - entries.length);
        entries.push(...subEntries);
      } else if (isSourceFile(item.name)) {
        const relativePath = path.relative(root, fullPath);
        const symbols = await extractSymbols(fullPath);
        const stat = await fs.stat(fullPath);
        entries.push({
          filePath: relativePath,
          symbols,
          size: stat.size,
        });
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return entries;
}

/**
 * Check if a file is a source file we should index
 */
function isSourceFile(name: string): boolean {
  const extensions = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs',
    '.java', '.kt', '.rb', '.php', '.c', '.cpp', '.h',
    '.cs', '.swift', '.vue', '.svelte',
  ];
  return extensions.some(ext => name.endsWith(ext));
}

/**
 * Extract top-level symbol names from a source file using simple regex.
 * This is fast but approximate — for full accuracy, use the AST walker.
 */
async function extractSymbols(filePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const symbols: string[] = [];

    // Match common patterns: export function/class/interface/const/type
    const patterns = [
      /export\s+(?:default\s+)?(?:function|class|interface|type|enum|const|let)\s+(\w+)/g,
      /(?:^|\n)\s*(?:function|class|interface|type|enum)\s+(\w+)/g,
      /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !symbols.includes(match[1])) {
          symbols.push(match[1]);
        }
      }
    }

    return symbols.slice(0, 20); // Cap at 20 symbols per file
  } catch {
    return [];
  }
}
