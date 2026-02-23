/**
 * Unit tests for error handler utilities
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ErrorHandler,
  CircuitBreaker,
  withTimeout,
  RecoveryStrategies
} from '../../../src/utils/error-handler.js';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = ErrorHandler.getInstance();
    errorHandler.clearErrorLog();
  });

  afterEach(() => {
    // Clean up global handlers to prevent accumulation between tests
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    // Reset singleton for test isolation
    (ErrorHandler as any).instance = undefined;
    (ErrorHandler as any).handlersSetup = false;
  });

  describe('withRetry', () => {
    it('should succeed on first attempt if no error', async () => {
      let callCount = 0;
      const fn = async (): Promise<string> => {
        callCount++;
        return 'success';
      };

      const result = await errorHandler.withRetry(fn, 'test-operation');

      expect(result).toBe('success');
      expect(callCount).toBe(1);
    });

    it('should retry on transient errors', async () => {
      let callCount = 0;
      const fn = async (): Promise<string> => {
        callCount++;
        if (callCount === 1) {
          throw new Error('network error');
        }
        return 'success';
      };

      const result = await errorHandler.withRetry(fn, 'test-operation', {
        maxRetries: 3,
        initialDelay: 10
      });

      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });

    it('should throw after max retries', async () => {
      const fn = async (): Promise<string> => {
        throw new Error('network error');
      };

      await expect(
        errorHandler.withRetry(fn, 'test-operation', {
          maxRetries: 2,
          initialDelay: 10
        })
      ).rejects.toThrow('network error');
    });
  });

  describe('error statistics', () => {
    beforeEach(() => {
      // Suppress error events from being treated as unhandled
      errorHandler.on('error', () => { /* suppress for tests */ });
    });

    it('should track error statistics', () => {
      errorHandler.handleError('test-op', new Error('test error'));
      errorHandler.handleError('test-op', new Error('test error 2'));

      const stats = errorHandler.getStatistics();

      expect(stats.totalErrors).toBeGreaterThanOrEqual(2);
      expect(stats.errorsByOperation['test-op']).toBe(2);
    });

    it('should check if operation is failing frequently', () => {
      errorHandler.handleError('failing-op', new Error('error 1'));
      errorHandler.handleError('failing-op', new Error('error 2'));
      errorHandler.handleError('failing-op', new Error('error 3'));

      expect(errorHandler.isOperationFailing('failing-op', 3)).toBe(true);
      expect(errorHandler.isOperationFailing('failing-op', 5)).toBe(false);
    });

    it('should reset operation errors', () => {
      errorHandler.handleError('reset-op', new Error('error'));
      errorHandler.handleError('reset-op', new Error('error'));

      errorHandler.resetOperationErrors('reset-op');

      expect(errorHandler.isOperationFailing('reset-op', 1)).toBe(false);
    });
  });

  describe('cleanup handlers', () => {
    it('should register cleanup handlers', () => {
      const cleanup = (): void => { /* cleanup logic */ };

      errorHandler.registerCleanup('test-cleanup', cleanup);

      // Just verify no error
      expect(true).toBe(true);
    });

    it('should unregister cleanup handlers', () => {
      const cleanup = (): void => { /* cleanup logic */ };

      errorHandler.registerCleanup('test-cleanup', cleanup);
      errorHandler.unregisterCleanup('test-cleanup');

      // Just verify no error
      expect(true).toBe(true);
    });
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 100, 2);
  });

  it('should start in closed state', () => {
    expect(breaker.getState()).toBe('closed');
  });

  it('should allow execution in closed state', async () => {
    const result = await breaker.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('closed');
  });

  it('should open after threshold failures', async () => {
    const failingFn = (): Promise<never> => Promise.reject(new Error('fail'));

    // Fail 3 times (threshold)
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch { /* expected */ }
    }

    expect(breaker.getState()).toBe('open');
  });

  it('should reject execution when open', async () => {
    const failingFn = (): Promise<never> => Promise.reject(new Error('fail'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch { /* expected */ }
    }

    await expect(
      breaker.execute(() => Promise.resolve('success'))
    ).rejects.toThrow('Circuit breaker is open');
  });

  it('should reset to closed state', () => {
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
  });
});

describe('withTimeout', () => {
  it('should resolve within timeout', async () => {
    const result = await withTimeout(
      Promise.resolve('success'),
      1000,
      'test-op'
    );

    expect(result).toBe('success');
  });

  it('should reject on timeout', async () => {
    const slowPromise = new Promise<string>(resolve =>
      setTimeout(() => resolve('slow'), 5000)
    );

    await expect(
      withTimeout(slowPromise, 50, 'test-op')
    ).rejects.toThrow('test-op timed out after 50ms');
  });
});

describe('RecoveryStrategies', () => {
  describe('exponentialBackoff', () => {
    it('should calculate exponential delays', () => {
      const delay1 = RecoveryStrategies.exponentialBackoff(1, 1000);
      const delay2 = RecoveryStrategies.exponentialBackoff(2, 1000);
      const delay3 = RecoveryStrategies.exponentialBackoff(3, 1000);

      // Should be roughly exponential (with jitter)
      expect(delay1).toBeLessThan(3000);
      expect(delay2).toBeLessThan(5000);
      expect(delay3).toBeLessThan(10000);
    });

    it('should cap at 30 seconds', () => {
      const delay = RecoveryStrategies.exponentialBackoff(10, 1000);
      expect(delay).toBeLessThanOrEqual(31000); // 30s + jitter
    });
  });

  describe('linearBackoff', () => {
    it('should calculate linear delays', () => {
      expect(RecoveryStrategies.linearBackoff(1, 1000)).toBe(1000);
      expect(RecoveryStrategies.linearBackoff(2, 1000)).toBe(2000);
      expect(RecoveryStrategies.linearBackoff(3, 1000)).toBe(3000);
    });

    it('should cap at 30 seconds', () => {
      expect(RecoveryStrategies.linearBackoff(50, 1000)).toBe(30000);
    });
  });

  describe('fixedDelay', () => {
    it('should return fixed delay', () => {
      expect(RecoveryStrategies.fixedDelay(5000)).toBe(5000);
      expect(RecoveryStrategies.fixedDelay()).toBe(1000);
    });
  });
});
