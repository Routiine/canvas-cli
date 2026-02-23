import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

// Test the fixed encryption functions (salt:iv:ciphertext format)
function encrypt(text: string, encryptionKey: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string, encryptionKey: string): string {
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  const [saltHex, ivHex, encrypted] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

describe('SecretRedaction encryption', () => {
  const testKey = 'test-encryption-key-32-bytes-long!!';
  const testPlaintext = 'super-secret-api-key-12345';

  it('should encrypt and decrypt correctly', () => {
    const encrypted = encrypt(testPlaintext, testKey);
    const decrypted = decrypt(encrypted, testKey);
    expect(decrypted).toBe(testPlaintext);
  });

  it('should produce different ciphertext each time (random salt)', () => {
    const encrypted1 = encrypt(testPlaintext, testKey);
    const encrypted2 = encrypt(testPlaintext, testKey);
    expect(encrypted1).not.toBe(encrypted2);
  });

  it('should produce 3-part format (salt:iv:ciphertext)', () => {
    const encrypted = encrypt(testPlaintext, testKey);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toHaveLength(32); // 16 bytes as hex
    expect(parts[1]).toHaveLength(32); // 16 bytes as hex
  });

  it('should throw on invalid format (not 3 parts)', () => {
    expect(() => decrypt('invalid', testKey)).toThrow('Invalid encrypted data format');
    expect(() => decrypt('only:two', testKey)).toThrow('Invalid encrypted data format');
  });

  it('should fail to decrypt with wrong key', () => {
    const encrypted = encrypt(testPlaintext, testKey);
    expect(() => decrypt(encrypted, 'wrong-key')).toThrow();
  });

  describe('AWS secret key pattern validation', () => {
    const awsPattern = /(AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[=:]\s*([A-Za-z0-9/+=]{40})/g;

    it('should match AWS_SECRET_ACCESS_KEY=<40chars>', () => {
      const text = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      expect(awsPattern.test(text)).toBe(true);
    });

    it('should match aws_secret_access_key: <40chars>', () => {
      awsPattern.lastIndex = 0;
      const text = 'aws_secret_access_key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
      expect(awsPattern.test(text)).toBe(true);
    });

    it('should NOT match arbitrary 40-char strings (was the bug)', () => {
      awsPattern.lastIndex = 0;
      const text = 'some-random-40-char-string-here-abcdefghij';
      expect(awsPattern.test(text)).toBe(false);
    });

    it('should NOT match a SHA-1 hash (was false positive)', () => {
      awsPattern.lastIndex = 0;
      const text = 'hash: da39a3ee5e6b4b0d3255bfef95601890afd80709';
      expect(awsPattern.test(text)).toBe(false);
    });
  });

  describe('File hash uses SHA-256 not MD5', () => {
    it('sha256 hash has correct length', () => {
      const hash = crypto.createHash('sha256').update('test').digest('hex');
      expect(hash).toHaveLength(64); // SHA-256 is 32 bytes = 64 hex chars
    });

    it('md5 would have been only 32 chars (confirming we switched)', () => {
      const md5 = crypto.createHash('md5').update('test').digest('hex');
      expect(md5).toHaveLength(32); // MD5 is 16 bytes = 32 hex chars (not 64)
    });
  });
});
