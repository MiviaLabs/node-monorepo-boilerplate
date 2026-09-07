/**
 * Unit tests for Retry utility
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { retry, makeRetryable, isTransientError } from './retry';

describe('retry', () => {
  describe('successful operation', () => {
    it('should return result on first attempt', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return 'success';
      };

      const result = await retry(fn);
      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 1);
    });

    it('should pass through function arguments', async () => {
      const fn = async (a: number, b: number) => a + b;

      const result = await retry(() => fn(2, 3));
      assert.strictEqual(result, 5);
    });
  });

  describe('retry on failure', () => {
    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retry(fn, { maxAttempts: 5, baseDelayMs: 10 });
      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3);
    });

    it('should throw after max attempts', async () => {
      const fn = async () => {
        throw new Error('Permanent failure');
      };

      await assert.rejects(
        async () => {
          await retry(fn, { maxAttempts: 3, baseDelayMs: 10 });
        },
        (error: Error) => {
          assert.strictEqual(error.message, 'Permanent failure');
          return true;
        }
      );
    });

    it('should respect custom maxAttempts', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new Error('Always fails');
      };

      await assert.rejects(async () => {
        await retry(fn, { maxAttempts: 2, baseDelayMs: 10 });
      });
      assert.strictEqual(attempts, 2);
    });
  });

  describe('delay calculation', () => {
    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const fn = async () => {
        throw new Error('Fail');
      };

      await assert.rejects(async () => {
        await retry(fn, {
          maxAttempts: 4,
          baseDelayMs: 100,
          jitter: false,
          onRetry: (attempt, _error, delay) => {
            delays.push(delay);
          }
        });
      });

      // Verify exponential backoff: 100, 200, 400
      assert.strictEqual(delays.length, 3);
      assert.ok(delays[0]! >= 100 && delays[0]! < 150);
      assert.ok(delays[1]! >= 200 && delays[1]! < 250);
      assert.ok(delays[2]! >= 400 && delays[2]! < 450);
    });

    it('should apply max delay cap', async () => {
      const delays: number[] = [];
      const fn = async () => {
        throw new Error('Fail');
      };

      await assert.rejects(async () => {
        await retry(fn, {
          maxAttempts: 10,
          baseDelayMs: 100,
          maxDelayMs: 200,
          jitter: false,
          onRetry: (attempt, _error, delay) => {
            delays.push(delay);
          }
        });
      });

      // All delays should be capped at maxDelayMs
      for (const delay of delays) {
        assert.ok(delay <= 200, `Delay ${delay} exceeds max delay of 200`);
      }
    });

    it('should add jitter when enabled', async () => {
      const delays: number[] = [];
      const fn = async () => {
        throw new Error('Fail');
      };

      await assert.rejects(async () => {
        await retry(fn, {
          maxAttempts: 5,
          baseDelayMs: 100,
          jitter: true,
          onRetry: (attempt, _error, delay) => {
            delays.push(delay);
          }
        });
      });

      // With jitter, delays should vary
      assert.ok(delays.length > 0);

      // Check that at least some delays have jitter added
      const hasJitter = delays.some((delay) => delay > 100 && delay < 200);
      assert.ok(hasJitter, 'Expected some delays to have jitter added');
    });
  });

  describe('isRetryable predicate', () => {
    it('should not retry non-retryable errors', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        throw new Error('Non-retryable');
      };

      await assert.rejects(async () => {
        await retry(fn, {
          maxAttempts: 5,
          isRetryable: (error) => {
            const err = error as Error;
            return err.message !== 'Non-retryable';
          }
        });
      });
      assert.strictEqual(attempts, 1);
    });

    it('should retry retryable errors', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retryable');
        }
        return 'success';
      };

      const result = await retry(fn, {
        maxAttempts: 5,
        isRetryable: (error) => {
          const err = error as Error;
          return err.message === 'Retryable';
        }
      });
      assert.strictEqual(result, 'success');
      assert.strictEqual(attempts, 3);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry callback with correct parameters', async () => {
      const retryInfo: Array<{ attempt: number; error: unknown; delay: number }> = [];
      let attempts = 0;

      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      await retry(fn, {
        maxAttempts: 5,
        baseDelayMs: 50,
        jitter: false,
        onRetry: (attempt, error, delay) => {
          retryInfo.push({ attempt, error, delay });
        }
      });

      assert.strictEqual(retryInfo.length, 2);
      assert.strictEqual(retryInfo[0]!.attempt, 1);
      assert.strictEqual(retryInfo[0]!.delay, 50);
      assert.strictEqual(retryInfo[1]!.attempt, 2);
      assert.strictEqual(retryInfo[1]!.delay, 100);
    });
  });
});

describe('makeRetryable', () => {
  it('should create a retryable version of a function', async () => {
    let attempts = 0;
    const fn = async (value: number) => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Fail');
      }
      return value * 2;
    };

    const retryableFn = makeRetryable(fn, { maxAttempts: 5, baseDelayMs: 10 });
    const result = await retryableFn(21);
    assert.strictEqual(result, 42);
    assert.strictEqual(attempts, 3);
  });

  it('should preserve function signature', async () => {
    const fn = async (a: number, b: string, c: boolean) => {
      return `${a}-${b}-${c}`;
    };

    const retryableFn = makeRetryable(fn);
    const result = await retryableFn(1, 'test', true);
    assert.strictEqual(result, '1-test-true');
  });
});

describe('isTransientError', () => {
  describe('Error objects', () => {
    it('should detect timeout errors', () => {
      const error = new Error('operation timed out');
      assert.strictEqual(isTransientError(error), true);
    });

    it('should detect network errors', () => {
      const error = new Error('ECONNREFUSED');
      assert.strictEqual(isTransientError(error), true);
    });

    it('should detect temporary errors', () => {
      const error = new Error('temporary failure');
      assert.strictEqual(isTransientError(error), true);
    });

    it('should detect rate limit errors', () => {
      const error = new Error('rate limit exceeded');
      assert.strictEqual(isTransientError(error), true);
    });

    it('should return false for non-transient errors', () => {
      const error = new Error('Invalid credentials');
      assert.strictEqual(isTransientError(error), false);
    });
  });

  describe('GCP error objects', () => {
    it('should detect transient GCP errors', () => {
      // DEADLINE_EXCEEDED
      assert.strictEqual(isTransientError({ code: 4 }), true);
      // RESOURCE_EXHAUSTED
      assert.strictEqual(isTransientError({ code: 8 }), true);
      // ABORTED
      assert.strictEqual(isTransientError({ code: 10 }), true);
      // UNAVAILABLE
      assert.strictEqual(isTransientError({ code: 14 }), true);
    });

    it('should return false for non-transient GCP errors', () => {
      // NOT_FOUND
      assert.strictEqual(isTransientError({ code: 5 }), false);
      // PERMISSION_DENIED
      assert.strictEqual(isTransientError({ code: 7 }), false);
    });
  });

  describe('Other types', () => {
    it('should handle string errors', () => {
      assert.strictEqual(isTransientError('timeout error'), false);
    });

    it('should handle null errors', () => {
      assert.strictEqual(isTransientError(null), false);
    });

    it('should handle undefined errors', () => {
      assert.strictEqual(isTransientError(undefined), false);
    });
  });

  describe('transient error patterns', () => {
    const transientPatterns = [
      'etimedout',
      'econnrefused',
      'econnreset',
      'enotfound',
      'eaigain',
      'Network error',
      'Service unavailable',
      'Too many requests'
    ];

    transientPatterns.forEach((pattern) => {
      it(`should detect pattern: ${pattern}`, () => {
        const error = new Error(pattern);
        assert.strictEqual(isTransientError(error), true);
      });
    });
  });
});
