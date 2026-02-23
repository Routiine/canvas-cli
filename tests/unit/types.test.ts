/**
 * Unit tests for type utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  getErrorMessage,
  isError,
  isObject,
  isStringArray,
  safeJsonParse
} from '../../src/types.js';

describe('Type Utilities', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error instance', () => {
      const error = new Error('test error message');
      expect(getErrorMessage(error)).toBe('test error message');
    });

    it('should return string errors as-is', () => {
      expect(getErrorMessage('string error')).toBe('string error');
    });

    it('should extract message from error-like objects', () => {
      const errorLike = { message: 'object error' };
      expect(getErrorMessage(errorLike)).toBe('object error');
    });

    it('should stringify unknown values', () => {
      expect(getErrorMessage(42)).toBe('42');
      expect(getErrorMessage(null)).toBe('null');
      expect(getErrorMessage(undefined)).toBe('undefined');
    });
  });

  describe('isError', () => {
    it('should return true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('type error'))).toBe(true);
    });

    it('should return false for non-Error values', () => {
      expect(isError('error string')).toBe(false);
      expect(isError({ message: 'object' })).toBe(false);
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2, 3])).toBe(false);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(42)).toBe(false);
      expect(isObject(true)).toBe(false);
    });
  });

  describe('isStringArray', () => {
    it('should return true for string arrays', () => {
      expect(isStringArray(['a', 'b', 'c'])).toBe(true);
      expect(isStringArray([])).toBe(true);
    });

    it('should return false for mixed arrays', () => {
      expect(isStringArray(['a', 1, 'c'])).toBe(false);
      expect(isStringArray([1, 2, 3])).toBe(false);
    });

    it('should return false for non-arrays', () => {
      expect(isStringArray('string')).toBe(false);
      expect(isStringArray({ 0: 'a' })).toBe(false);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      expect(safeJsonParse('{"key": "value"}')).toEqual({ key: 'value' });
      expect(safeJsonParse('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(safeJsonParse('"string"')).toBe('string');
    });

    it('should return null for invalid JSON', () => {
      expect(safeJsonParse('not json')).toBeNull();
      expect(safeJsonParse('{')).toBeNull();
      expect(safeJsonParse('')).toBeNull();
    });

    it('should validate with custom validator', () => {
      const isObject = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null && !Array.isArray(v);

      expect(safeJsonParse('{"key": "value"}', isObject)).toEqual({ key: 'value' });
      expect(safeJsonParse('[1, 2, 3]', isObject)).toBeNull();
    });
  });
});
