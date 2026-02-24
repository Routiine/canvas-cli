/**
 * Coding Conventions
 * Loads project-specific coding conventions from .canvas/conventions.md
 * and includes them in AI system prompts.
 */

import fs from 'fs-extra';
import * as path from 'path';

const CONVENTIONS_FILE = '.canvas/conventions.md';
const ALTERNATIVE_FILES = [
  '.canvas/CONVENTIONS.md',
  'CONVENTIONS.md',
  '.coding-conventions.md',
];

let cached: string | null = null;
let cachedRoot: string | null = null;

/**
 * Load coding conventions for the current project
 */
export function loadCodingConventions(projectRoot?: string): string | null {
  const root = projectRoot || process.cwd();

  if (cachedRoot === root && cached !== null) return cached;

  const filesToCheck = [
    path.join(root, CONVENTIONS_FILE),
    ...ALTERNATIVE_FILES.map(f => path.join(root, f)),
  ];

  for (const filePath of filesToCheck) {
    try {
      if (fs.existsSync(filePath)) {
        cached = fs.readFileSync(filePath, 'utf8');
        cachedRoot = root;
        return cached;
      }
    } catch {
      // Continue to next file
    }
  }

  cached = '';
  cachedRoot = root;
  return null;
}

/**
 * Get conventions as a system prompt section
 */
export function getConventionsPrompt(projectRoot?: string): string {
  const conventions = loadCodingConventions(projectRoot);
  if (!conventions) return '';

  return [
    '## Project Coding Conventions',
    '',
    conventions.trim(),
    '',
  ].join('\n');
}

/**
 * Clear the conventions cache
 */
export function clearConventionsCache(): void {
  cached = null;
  cachedRoot = null;
}
