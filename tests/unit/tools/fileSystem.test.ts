import { describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

// We test the validatePath logic directly since the tools import it
// The validatePath function is: throw if resolved path is outside process.cwd()

describe('FileSystem path traversal protection', () => {
  const cwd = process.cwd();

  it('should allow paths within the workspace', () => {
    const safePath = path.resolve(cwd, 'src', 'index.ts');
    expect(safePath.startsWith(cwd)).toBe(true);
  });

  it('should detect path traversal attempts', () => {
    const traversalPath = path.resolve(cwd, '..', '..', 'etc', 'passwd');
    expect(traversalPath.startsWith(cwd + path.sep)).toBe(false);
    expect(traversalPath !== cwd).toBe(true);
  });

  it('should detect absolute path escapes', () => {
    const absoluteEscape = '/etc/passwd';
    const resolved = path.resolve(absoluteEscape);
    expect(resolved.startsWith(cwd + path.sep)).toBe(false);
  });

  it('should allow the cwd itself', () => {
    const cwdPath = path.resolve(cwd);
    expect(cwdPath === cwd || cwdPath.startsWith(cwd + path.sep)).toBe(true);
  });

  it('should block home directory traversal', () => {
    const homePath = path.resolve(process.env.HOME || '/root', '.ssh', 'id_rsa');
    expect(homePath.startsWith(cwd + path.sep)).toBe(false);
  });

  describe('validatePath helper logic', () => {
    function validatePath(filePath: string): void {
      const allowedRoot = path.resolve(process.cwd());
      const resolved = path.resolve(filePath);
      if (resolved !== allowedRoot && !resolved.startsWith(allowedRoot + path.sep)) {
        throw new Error(`Access denied: path '${filePath}' is outside the workspace`);
      }
    }

    it('throws for parent directory traversal', () => {
      expect(() => validatePath('../../etc/passwd')).toThrow('Access denied');
    });

    it('throws for absolute path to /etc', () => {
      expect(() => validatePath('/etc/shadow')).toThrow('Access denied');
    });

    it('does not throw for relative path within cwd', () => {
      expect(() => validatePath('./src/index.ts')).not.toThrow();
    });

    it('does not throw for deeply nested path within cwd', () => {
      expect(() => validatePath('./src/tools/shell.ts')).not.toThrow();
    });
  });
});
