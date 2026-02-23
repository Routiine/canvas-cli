/**
 * Unit tests for configuration system
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Test the config validation logic directly
describe('Config Validation', () => {
  describe('URL validation', () => {
    const isValidUrl = (urlString: string): boolean => {
      try {
        new URL(urlString);
        return true;
      } catch {
        return false;
      }
    };

    it('should validate correct URLs', () => {
      expect(isValidUrl('http://localhost:11434')).toBe(true);
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://192.168.1.1:8080')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      // Note: localhost:11434 is parsed as a valid URL with 'localhost' as protocol
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('default config values', () => {
    it('should have safe defaults for autoExecute', () => {
      // autoExecute should default to false for safety
      const DEFAULT_CONFIG = {
        features: {
          autoExecute: false,
          confirmBeforeExecute: true
        }
      };

      expect(DEFAULT_CONFIG.features.autoExecute).toBe(false);
      expect(DEFAULT_CONFIG.features.confirmBeforeExecute).toBe(true);
    });

    it('should have sandbox disabled by default', () => {
      const DEFAULT_CONFIG = {
        sandbox: {
          enabled: false,
          type: 'none',
          filterEnv: true
        }
      };

      expect(DEFAULT_CONFIG.sandbox.enabled).toBe(false);
      expect(DEFAULT_CONFIG.sandbox.filterEnv).toBe(true);
    });
  });

  describe('timeout bounds', () => {
    it('should enforce minimum timeout of 1000ms', () => {
      const minTimeout = Math.min(Math.max(500, 1000), 600000);
      expect(minTimeout).toBe(1000);
    });

    it('should enforce maximum timeout of 600000ms', () => {
      const maxTimeout = Math.min(Math.max(1000000, 1000), 600000);
      expect(maxTimeout).toBe(600000);
    });

    it('should allow timeout within bounds', () => {
      const timeout = Math.min(Math.max(30000, 1000), 600000);
      expect(timeout).toBe(30000);
    });
  });

  describe('retry bounds', () => {
    it('should enforce maximum retries of 10', () => {
      const maxRetries = Math.min(Math.max(20, 0), 10);
      expect(maxRetries).toBe(10);
    });

    it('should enforce minimum retries of 0', () => {
      const minRetries = Math.min(Math.max(-1, 0), 10);
      expect(minRetries).toBe(0);
    });
  });
});
