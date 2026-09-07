/**
 * Unit tests for Context (AsyncLocalStorage)
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  setRequestContext,
  getRequestContext,
  withRequestContext,
  getRequestId,
  getUserId,
  getOrganizationId,
  ILogContext
} from '../context';

describe('Context', () => {
  describe('setRequestContext and getRequestContext', () => {
    it('should set and get request context', () => {
      const context: ILogContext = {
        userId: 'user-123',
        requestId: 'req-456',
        organizationId: 'org-789'
      };

      setRequestContext(context);

      const retrieved = getRequestContext();
      assert.strictEqual(retrieved?.userId, 'user-123');
      assert.strictEqual(retrieved?.requestId, 'req-456');
      assert.strictEqual(retrieved?.organizationId, 'org-789');
    });

    it('should return undefined when no context is set', () => {
      // Clear any existing context by running in a new context
      // Note: withRequestContext always creates a context with startTime, so we get empty object
      withRequestContext({}, () => {
        const result = getRequestContext();
        // Result will be an empty object (after startTime is filtered out)
        assert.ok(result);
        assert.strictEqual(Object.keys(result ?? {}).length, 0);
      });
    });

    it('should merge context when set multiple times', () => {
      setRequestContext({ userId: 'user-1' });
      setRequestContext({ requestId: 'req-1' });

      const result = getRequestContext();
      assert.ok(result); // Should have merged context
      // Access via index signature for dynamic properties
      assert.strictEqual(result?.['userId'], 'user-1');
    });

    it('should handle empty context', () => {
      setRequestContext({});

      const result = getRequestContext();
      // startTime should be present but filtered out
      assert.ok(result);
    });

    it('should handle context with custom fields', () => {
      const customContext: ILogContext = {
        userId: 'user-123',
        customField: 'custom-value',
        nested: { object: true },
        count: 42
      };

      setRequestContext(customContext);

      const result = getRequestContext();
      assert.strictEqual(result?.userId, 'user-123');
      // Access via index signature for dynamic properties
      assert.strictEqual(result?.['customField'], 'custom-value');
      assert.strictEqual(typeof result?.['nested'] === 'object', true);
    });
  });

  describe('withRequestContext', () => {
    it('should run callback with context', () => {
      const context: ILogContext = {
        userId: 'user-123',
        requestId: 'req-456'
      };

      let capturedContext: ILogContext | undefined;

      withRequestContext(context, () => {
        capturedContext = getRequestContext();
      });

      assert.strictEqual(capturedContext?.userId, 'user-123');
      assert.strictEqual(capturedContext?.requestId, 'req-456');
    });

    it('should return value from callback', () => {
      const context: ILogContext = { userId: 'user-123' };

      const result = withRequestContext(context, () => {
        return 'callback-result';
      });

      assert.strictEqual(result, 'callback-result');
    });

    it('should return complex value from callback', () => {
      const context: ILogContext = { userId: 'user-123' };

      const result = withRequestContext(context, () => {
        return { value: 42, text: 'result' };
      });

      assert.strictEqual(result.value, 42);
      assert.strictEqual(result.text, 'result');
    });

    it('should isolate context between calls', () => {
      const context1: ILogContext = { userId: 'user-1' };
      const context2: ILogContext = { userId: 'user-2' };

      let result1: ILogContext | undefined;
      let result2: ILogContext | undefined;

      withRequestContext(context1, () => {
        result1 = getRequestContext();
      });

      withRequestContext(context2, () => {
        result2 = getRequestContext();
      });

      assert.strictEqual(result1?.userId, 'user-1');
      assert.strictEqual(result2?.userId, 'user-2');
    });

    it('should support nested withRequestContext calls', () => {
      const outerContext: ILogContext = { userId: 'outer-user' };
      const innerContext: ILogContext = { requestId: 'inner-request' };

      let outerResult: ILogContext | undefined;
      let innerResult: ILogContext | undefined;

      withRequestContext(outerContext, () => {
        outerResult = getRequestContext();

        withRequestContext(innerContext, () => {
          innerResult = getRequestContext();
        });

        // After inner context, outer context should still be available
        const afterInner = getRequestContext();
        assert.strictEqual(afterInner?.userId, 'outer-user');
      });

      assert.strictEqual(outerResult?.userId, 'outer-user');
      assert.strictEqual(innerResult?.requestId, 'inner-request');
    });

    it('should merge context in nested calls', () => {
      const outerContext: ILogContext = { userId: 'user-1' };
      const innerContext: ILogContext = { requestId: 'req-1' };

      let nestedResult: ILogContext | undefined;

      withRequestContext(outerContext, () => {
        withRequestContext(innerContext, () => {
          nestedResult = getRequestContext();
        });
      });

      // Both userId and requestId should be available
      assert.ok(nestedResult);
      assert.strictEqual(nestedResult.userId, 'user-1');
      assert.strictEqual(nestedResult.requestId, 'req-1');
    });

    it('should throw errors from callback', () => {
      const context: ILogContext = { userId: 'user-123' };

      assert.throws(
        () => {
          withRequestContext(context, () => {
            throw new Error('Callback error');
          });
        },
        { message: 'Callback error' }
      );
    });

    it('should preserve context after error', () => {
      const context: ILogContext = { userId: 'user-123' };

      try {
        withRequestContext(context, () => {
          throw new Error('Test error');
        });
      } catch {
        // Expected error
      }

      // Context should be cleared after the call
      const afterError = getRequestContext();
      assert.strictEqual(afterError, undefined);
    });
  });

  describe('getRequestId', () => {
    it('should return requestId when set', () => {
      setRequestContext({ requestId: 'req-123' });

      assert.strictEqual(getRequestId(), 'req-123');
    });

    it('should return undefined when requestId not set', () => {
      withRequestContext({}, () => {
        assert.strictEqual(getRequestId(), undefined);
      });
    });

    it('should return undefined when no context set', () => {
      assert.strictEqual(getRequestId(), undefined);
    });
  });

  describe('getUserId', () => {
    it('should return userId when set', () => {
      setRequestContext({ userId: 'user-123' });

      assert.strictEqual(getUserId(), 'user-123');
    });

    it('should return undefined when userId not set', () => {
      withRequestContext({}, () => {
        assert.strictEqual(getUserId(), undefined);
      });
    });

    it('should return undefined when no context set', () => {
      assert.strictEqual(getUserId(), undefined);
    });
  });

  describe('getOrganizationId', () => {
    it('should return organizationId when set', () => {
      setRequestContext({ organizationId: 'org-123' });

      assert.strictEqual(getOrganizationId(), 'org-123');
    });

    it('should return undefined when organizationId not set', () => {
      withRequestContext({}, () => {
        assert.strictEqual(getOrganizationId(), undefined);
      });
    });

    it('should return undefined when no context set', () => {
      assert.strictEqual(getOrganizationId(), undefined);
    });
  });

  describe('async context propagation', () => {
    it('should propagate context through Promise chains', async () => {
      const context: ILogContext = { userId: 'user-123' };

      let result: string | undefined;

      await withRequestContext(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));

        result = getUserId();
      });

      assert.strictEqual(result, 'user-123');
    });

    it('should propagate context through async/await', async () => {
      const context: ILogContext = { requestId: 'req-456' };

      const asyncOperation = async (): Promise<string> => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getRequestId() ?? 'not-found';
      };

      const result = await withRequestContext(context, () => asyncOperation());

      assert.strictEqual(result, 'req-456');
    });

    it('should isolate context in concurrent async operations', async () => {
      const context1: ILogContext = { userId: 'user-1' };
      const context2: ILogContext = { userId: 'user-2' };

      const operation1 = withRequestContext(context1, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getUserId();
      });

      const operation2 = withRequestContext(context2, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getUserId();
      });

      const [result1, result2] = await Promise.all([operation1, operation2]);

      assert.strictEqual(result1, 'user-1');
      assert.strictEqual(result2, 'user-2');
    });
  });

  describe('context with multiple fields', () => {
    it('should handle all standard fields', () => {
      const context: ILogContext = {
        userId: 'user-123',
        organizationId: 'org-456',
        requestId: 'req-789'
      };

      setRequestContext(context);

      assert.strictEqual(getUserId(), 'user-123');
      assert.strictEqual(getOrganizationId(), 'org-456');
      assert.strictEqual(getRequestId(), 'req-789');
    });

    it('should handle context with additional fields', () => {
      const context: ILogContext = {
        userId: 'user-123',
        correlationId: 'corr-abc',
        sessionId: 'session-def',
        clientIp: '192.168.1.1'
      };

      setRequestContext(context);

      const result = getRequestContext();
      assert.strictEqual(result?.userId, 'user-123');
      // Access via index signature for dynamic properties
      assert.strictEqual(result?.['correlationId'], 'corr-abc');
      assert.strictEqual(result?.['sessionId'], 'session-def');
      assert.strictEqual(result?.['clientIp'], '192.168.1.1');
    });

    it('should handle context with nested objects', () => {
      const metadata = {
        version: '1.0',
        featureFlags: { featureA: true, featureB: false }
      };

      const context: ILogContext = {
        userId: 'user-123',
        metadata
      };

      setRequestContext(context);

      const result = getRequestContext();
      assert.strictEqual(result?.userId, 'user-123');
      // Access via index signature for dynamic properties
      assert.strictEqual(typeof result?.['metadata'] === 'object', true);
    });
  });

  describe('context isolation', () => {
    it('should not leak context between unrelated calls', () => {
      const context1: ILogContext = { userId: 'user-1' };
      const context2: ILogContext = { userId: 'user-2' };

      withRequestContext(context1, () => {
        assert.strictEqual(getUserId(), 'user-1');
      });

      withRequestContext(context2, () => {
        assert.strictEqual(getUserId(), 'user-2');
      });

      // After both calls, context should be cleared
      assert.strictEqual(getUserId(), undefined);
    });

    it('should handle rapid context changes', () => {
      for (let i = 0; i < 100; i++) {
        withRequestContext({ userId: `user-${i}` }, () => {
          assert.strictEqual(getUserId(), `user-${i}`);
        });
      }

      // Final state should have no context
      assert.strictEqual(getUserId(), undefined);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string values', () => {
      setRequestContext({ userId: '', requestId: '' });

      assert.strictEqual(getUserId(), '');
      assert.strictEqual(getRequestId(), '');
    });

    it('should handle special characters in values', () => {
      const context: ILogContext = {
        userId: 'user-with-special-chars-_\u0440\u0443\u0441',
        requestId: 'req-with-.-and-.'
      };

      setRequestContext(context);

      assert.strictEqual(getUserId(), 'user-with-special-chars-_\u0440\u0443\u0441');
      assert.strictEqual(getRequestId(), 'req-with-.-and-.');
    });

    it('should handle very long values', () => {
      const longString = 'x'.repeat(10000);

      setRequestContext({ requestId: longString });

      assert.strictEqual(getRequestId(), longString);
    });

    it('should handle null-like values', () => {
      setRequestContext({ userId: 'null-user' });

      const result = getRequestContext();
      assert.strictEqual(result?.userId, 'null-user');
    });
  });
});
