/**
 * .canvasignore — Exclude files from Canvas CLI's AI context
 * Uses gitignore-style syntax.
 */

import * as fs from 'fs-extra';
import * as path from 'path';

let cachedPatterns: string[] | null = null;
let cachedRoot: string | null = null;

/**
 * Load .canvasignore patterns from project root
 */
export function loadCanvasIgnore(projectRoot?: string): string[] {
  const root = projectRoot || process.cwd();
  if (cachedRoot === root && cachedPatterns) return cachedPatterns;

  const ignorePath = path.join(root, '.canvasignore');
  try {
    if (fs.existsSync(ignorePath)) {
      const content = fs.readFileSync(ignorePath, 'utf8');
      cachedPatterns = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      cachedRoot = root;
      return cachedPatterns;
    }
  } catch {
    // Ignore read errors
  }
  cachedPatterns = [];
  cachedRoot = root;
  return cachedPatterns;
}

/**
 * Check if a file path should be ignored
 */
export function isIgnored(filePath: string, projectRoot?: string): boolean {
  const patterns = loadCanvasIgnore(projectRoot);
  if (patterns.length === 0) return false;

  const relative = path.relative(projectRoot || process.cwd(), filePath);

  for (const pattern of patterns) {
    if (matchIgnorePattern(pattern, relative)) return true;
  }
  return false;
}

/**
 * Simple gitignore-style pattern matching
 */
function matchIgnorePattern(pattern: string, filePath: string): boolean {
  // Negate patterns (!)
  if (pattern.startsWith('!')) return false;

  // Directory patterns (trailing /)
  const isDir = pattern.endsWith('/');
  const cleanPattern = isDir ? pattern.slice(0, -1) : pattern;

  // Convert gitignore glob to regex
  const regexStr = cleanPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');

  // If pattern has no slash, match against basename
  if (!cleanPattern.includes('/')) {
    const basename = path.basename(filePath);
    return new RegExp(`^${regexStr}$`).test(basename);
  }

  return new RegExp(`^${regexStr}(/.*)?$`).test(filePath);
}

/**
 * Clear the cached patterns (useful after file changes)
 */
export function clearIgnoreCache(): void {
  cachedPatterns = null;
  cachedRoot = null;
}
