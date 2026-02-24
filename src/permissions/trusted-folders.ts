/**
 * Trusted Folders
 * Manage a list of trusted project directories that skip certain permission prompts.
 */

import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const TRUSTED_FILE = path.join(os.homedir(), '.canvas', 'trusted-folders.json');

interface TrustedFolder {
  path: string;
  addedAt: string;
  reason?: string;
}

let cached: TrustedFolder[] | null = null;

function loadTrusted(): TrustedFolder[] {
  if (cached) return cached;
  try {
    if (fs.existsSync(TRUSTED_FILE)) {
      cached = fs.readJsonSync(TRUSTED_FILE);
      return cached!;
    }
  } catch {
    // Start fresh
  }
  cached = [];
  return cached;
}

function saveTrusted(folders: TrustedFolder[]): void {
  fs.ensureDirSync(path.dirname(TRUSTED_FILE));
  fs.writeJsonSync(TRUSTED_FILE, folders, { spaces: 2 });
  cached = folders;
}

/**
 * Check if a directory is trusted
 */
export function isTrustedFolder(dir?: string): boolean {
  const target = path.resolve(dir || process.cwd());
  const trusted = loadTrusted();
  return trusted.some(t => target === t.path || target.startsWith(t.path + path.sep));
}

/**
 * Add a folder to the trusted list
 */
export function addTrustedFolder(dir: string, reason?: string): void {
  const absPath = path.resolve(dir);
  const trusted = loadTrusted();

  if (trusted.some(t => t.path === absPath)) return; // Already trusted

  trusted.push({
    path: absPath,
    addedAt: new Date().toISOString(),
    reason,
  });

  saveTrusted(trusted);
}

/**
 * Remove a folder from the trusted list
 */
export function removeTrustedFolder(dir: string): boolean {
  const absPath = path.resolve(dir);
  const trusted = loadTrusted();
  const before = trusted.length;
  const filtered = trusted.filter(t => t.path !== absPath);

  if (filtered.length !== before) {
    saveTrusted(filtered);
    return true;
  }
  return false;
}

/**
 * List all trusted folders
 */
export function listTrustedFolders(): TrustedFolder[] {
  return [...loadTrusted()];
}

/**
 * Clear the cache (useful after file changes)
 */
export function clearTrustedCache(): void {
  cached = null;
}
