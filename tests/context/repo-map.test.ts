import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as os from 'os';
import fs from 'fs-extra';
import { generateRepoMap } from '../../src/context/repo-map.js';

describe('generateRepoMap', () => {
  it('returns a string with Repository Map header', async () => {
    const result = await generateRepoMap({ root: process.cwd(), maxFiles: 50 });
    expect(typeof result).toBe('string');
    expect(result).toContain('Repository Map');
  });

  it('respects maxOutputChars limit', async () => {
    const result = await generateRepoMap({ root: process.cwd(), maxOutputChars: 500 });
    expect(result.length).toBeLessThanOrEqual(600); // allow slack for header/footer
  });

  it('boosts query-matched files', async () => {
    // Create a temp dir with two files: one matching the query, one not
    const tmpDir = path.join(os.tmpdir(), `canvas-test-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    await fs.writeFile(
      path.join(tmpDir, 'auth-handler.ts'),
      'export function authenticateUser() {}'
    );
    await fs.writeFile(
      path.join(tmpDir, 'utils.ts'),
      'export function formatDate() {}'
    );

    const withQuery = await generateRepoMap({ root: tmpDir, query: 'auth' });

    // auth-handler.ts should appear before utils.ts when query is 'auth'
    const authIdx = withQuery.indexOf('auth-handler.ts');
    const utilsIdx = withQuery.indexOf('utils.ts');

    expect(authIdx).toBeGreaterThanOrEqual(0);
    expect(authIdx).toBeLessThan(utilsIdx >= 0 ? utilsIdx : Infinity);

    await fs.remove(tmpDir);
  });
});
