/**
 * Repo Map
 * Generates a compact symbol map of the codebase for inclusion in AI prompts.
 * Uses the existing AST walker / graph storage to extract file->symbol mappings.
 *
 * Ranking strategy (aider-inspired reference density):
 *   score = (symbolCount * 2) + (importedByCount * 5)
 * Files matched by the optional `query` parameter receive a 3x multiplier.
 */

import fs from 'fs-extra';
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
  /** When provided, files whose paths or symbols contain this string get a 3x score boost */
  query?: string;
}

const DEFAULT_EXCLUDES = [
  'node_modules', 'dist', 'build', '.git', 'coverage',
  '__pycache__', '.next', '.nuxt', '.cache',
];

/**
 * Generate a compact repo map string suitable for system prompts.
 * Files are ranked by reference density: files imported by many others score higher.
 */
export async function generateRepoMap(options: RepoMapOptions = {}): Promise<string> {
  const root = options.root || process.cwd();
  const maxFiles = options.maxFiles || 200;
  const maxChars = options.maxOutputChars || 8000;
  const query = options.query;

  const entries = await scanDirectory(root, root, DEFAULT_EXCLUDES, maxFiles);

  // Build import reference counts — files imported by many others are architectural hot-spots
  const refCount = await buildReferenceMap(entries, root);

  // Score each file: symbol density + import reference weight
  const scored = entries.map(entry => {
    const importedByCount = refCount.get(entry.filePath) ?? 0;
    let score = (entry.symbols.length * 2) + (importedByCount * 5);

    // Boost files matching the query (path or any symbol)
    if (query) {
      const q = query.toLowerCase();
      const pathMatch = entry.filePath.toLowerCase().includes(q);
      const symbolMatch = entry.symbols.some(s => s.toLowerCase().includes(q));
      if (pathMatch || symbolMatch) {
        score *= 3;
      }
    }

    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Build the map string
  const lines: string[] = ['Repository Map:', ''];
  let totalChars = 0;

  for (const { entry } of scored) {
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
 * Build a map of how many times each file is imported by other files.
 * Files with high import counts are architectural hot-spots.
 */
async function buildReferenceMap(entries: RepoMapEntry[], root: string): Promise<Map<string, number>> {
  const refCount = new Map<string, number>();

  // Initialize all tracked files with 0
  for (const entry of entries) {
    refCount.set(entry.filePath, 0);
  }

  for (const entry of entries) {
    try {
      const fullPath = path.join(root, entry.filePath);
      const content = await fs.readFile(fullPath, 'utf8');

      // Match ES module import statements: import ... from './path'
      const importRegex = /from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        // Only resolve relative imports — package imports are not in the map
        if (importPath.startsWith('.')) {
          const dir = path.dirname(entry.filePath);
          const resolved = path.normalize(path.join(dir, importPath));
          // Try direct match with each extension, then as an index file
          for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
            const withExt = resolved.endsWith(ext) ? resolved : resolved + ext;
            if (refCount.has(withExt)) {
              refCount.set(withExt, (refCount.get(withExt) ?? 0) + 1);
              break;
            }
            const asIndex = path.join(resolved, `index${ext}`);
            if (refCount.has(asIndex)) {
              refCount.set(asIndex, (refCount.get(asIndex) ?? 0) + 1);
              break;
            }
          }
        }
      }
    } catch {
      // Skip files we can't read
    }
  }

  return refCount;
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
