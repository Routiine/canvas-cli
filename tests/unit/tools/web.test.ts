import { describe, it, expect } from '@jest/globals';

// Test the SSRF validation logic
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isPrivateAddress(address: string): boolean {
  return PRIVATE_IP_RANGES.some(range => range.test(address));
}

function validateScheme(url: string): void {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`URL scheme '${parsed.protocol}' is not allowed`);
  }
}

describe('SSRF Protection', () => {
  describe('Private IP detection', () => {
    it('should detect loopback address', () => {
      expect(isPrivateAddress('127.0.0.1')).toBe(true);
    });

    it('should detect localhost loopback range', () => {
      expect(isPrivateAddress('127.1.2.3')).toBe(true);
    });

    it('should detect AWS metadata endpoint', () => {
      expect(isPrivateAddress('169.254.169.254')).toBe(true);
    });

    it('should detect 10.x private range', () => {
      expect(isPrivateAddress('10.0.0.1')).toBe(true);
      expect(isPrivateAddress('10.255.255.255')).toBe(true);
    });

    it('should detect 192.168.x private range', () => {
      expect(isPrivateAddress('192.168.1.1')).toBe(true);
    });

    it('should detect 172.16-31.x private range', () => {
      expect(isPrivateAddress('172.16.0.1')).toBe(true);
      expect(isPrivateAddress('172.31.255.255')).toBe(true);
    });

    it('should NOT block public IP addresses', () => {
      expect(isPrivateAddress('8.8.8.8')).toBe(false);
      expect(isPrivateAddress('1.1.1.1')).toBe(false);
      expect(isPrivateAddress('93.184.216.34')).toBe(false);
    });

    it('should detect IPv6 loopback', () => {
      expect(isPrivateAddress('::1')).toBe(true);
    });

    it('should detect IPv6 link-local', () => {
      expect(isPrivateAddress('fe80::1')).toBe(true);
    });
  });

  describe('URL scheme validation', () => {
    it('should allow http URLs', () => {
      expect(() => validateScheme('http://example.com')).not.toThrow();
    });

    it('should allow https URLs', () => {
      expect(() => validateScheme('https://example.com')).not.toThrow();
    });

    it('should block file:// URLs', () => {
      expect(() => validateScheme('file:///etc/passwd')).toThrow('not allowed');
    });

    it('should block ftp:// URLs', () => {
      expect(() => validateScheme('ftp://example.com')).toThrow('not allowed');
    });

    it('should block gopher:// URLs', () => {
      expect(() => validateScheme('gopher://example.com')).toThrow('not allowed');
    });
  });
});
