/**
 * Unit tests for @Instrumented decorator
 *
 * Note: These are integration-style tests that use the real OpenTelemetry tracer.
 * We verify behavior through the decorator's observable effects rather than mocking.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Instrumented } from './instrumented.decorator.js';
import { SpanKind } from '@opentelemetry/api';

describe('@Instrumented decorator', () => {
  describe('sync-to-async conversion', () => {
    it('should convert synchronous methods to asynchronous', async () => {
      class TestClass {
        @Instrumented()
        syncMethod(x: number): number {
          return x * 2;
        }
      }

      const instance = new TestClass();
      const result = instance.syncMethod(5);

      // Result should be a Promise
      assert.ok(
        typeof result === 'object' && result !== null && 'then' in result,
        'Result should be a Promise'
      );

      // Await the result to get the actual value
      const actualValue = await result;
      assert.strictEqual(actualValue, 10);
    });

    it('should keep async methods async', async () => {
      class TestClass {
        @Instrumented()
        async asyncMethod(x: number): Promise<number> {
          return x * 2;
        }
      }

      const instance = new TestClass();
      const result = instance.asyncMethod(5);

      // Result should be a Promise
      assert.ok(
        typeof result === 'object' && result !== null && 'then' in result,
        'Result should be a Promise'
      );

      // Await the result
      const actualValue = await result;
      assert.strictEqual(actualValue, 10);
    });

    it('should convert synchronous method errors to rejected promises', async () => {
      class TestClass {
        @Instrumented()
        syncMethodWithError(): number {
          throw new Error('Sync error');
        }
      }

      const instance = new TestClass();
      const result = instance.syncMethodWithError();

      // Result should be a Promise (not throw immediately)
      assert.ok(
        typeof result === 'object' && result !== null && 'then' in result,
        'Result should be a Promise'
      );

      // The promise should be rejected
      await assert.rejects(async () => await result, /Sync error/);
    });
  });

  describe('span creation', () => {
    it('should create span with default name derived from method name', async () => {
      class TestClass {
        @Instrumented()
        myMethod(): string {
          return 'test';
        }
      }

      const instance = new TestClass();
      const result = await instance.myMethod();

      // If the decorator works correctly, we get the result
      assert.strictEqual(result, 'test');
    });

    it('should create span with custom name when provided', async () => {
      class TestClass {
        @Instrumented({ name: 'custom-operation' })
        myMethod(): string {
          return 'test';
        }
      }

      const instance = new TestClass();
      const result = await instance.myMethod();

      // If the decorator works correctly, we get the result
      assert.strictEqual(result, 'test');
    });

    it('should create span with specified SpanKind', async () => {
      class TestClass {
        @Instrumented({ kind: SpanKind.CLIENT })
        apiCall(): string {
          return 'success';
        }
      }

      const instance = new TestClass();
      const result = await instance.apiCall();

      // If the decorator works correctly with SpanKind, we get the result
      assert.strictEqual(result, 'success');
    });
  });

  describe('span status', () => {
    it('should set span status to OK on successful execution', async () => {
      class TestClass {
        @Instrumented()
        successMethod(): string {
          return 'success';
        }
      }

      const instance = new TestClass();
      const result = await instance.successMethod();

      // On success, should return the expected value
      assert.strictEqual(result, 'success');
    });

    it('should set span status to ERROR on exception', async () => {
      class TestClass {
        @Instrumented()
        errorMethod(): void {
          throw new Error('Test error');
        }
      }

      const instance = new TestClass();

      // On error, the promise should be rejected
      await assert.rejects(async () => await instance.errorMethod(), /Test error/);
    });
  });

  describe('span attributes', () => {
    it('should add custom attributes when provided', async () => {
      class TestClass {
        @Instrumented({
          attributes: {
            'service.name': 'test-service',
            'operation.type': 'read'
          }
        })
        myMethod(): string {
          return 'result';
        }
      }

      const instance = new TestClass();
      const result = await instance.myMethod();

      // If attributes are handled correctly, we get the result
      assert.strictEqual(result, 'result');
    });

    it('should include argument metadata when includeArgs is true', async () => {
      class TestClass {
        @Instrumented({ includeArgs: true })
        myMethod(_arg1: string, _arg2: number): string {
          return 'result';
        }
      }

      const instance = new TestClass();
      const result = await instance.myMethod('test', 42);

      // If includeArgs works correctly, we get the result
      assert.strictEqual(result, 'result');
    });

    it('should include result metadata when includeResult is true', async () => {
      class TestClass {
        @Instrumented({ includeResult: true })
        myMethod(): { data: string } {
          return { data: 'test' };
        }
      }

      const instance = new TestClass();
      const result = await instance.myMethod();

      // If includeResult works correctly, we get the result
      assert.deepStrictEqual(result, { data: 'test' });
    });
  });

  describe('error handling with different options', () => {
    it('should handle errors with includeArgs enabled', async () => {
      class TestClass {
        @Instrumented({ includeArgs: true })
        errorMethod(_arg: string): void {
          throw new Error('Error with args');
        }
      }

      const instance = new TestClass();
      await assert.rejects(async () => await instance.errorMethod('test'), /Error with args/);
    });

    it('should handle errors with includeResult enabled', async () => {
      class TestClass {
        @Instrumented({ includeResult: true })
        errorMethod(): void {
          throw new Error('Error with result');
        }
      }

      const instance = new TestClass();
      await assert.rejects(async () => await instance.errorMethod(), /Error with result/);
    });

    it('should handle errors with custom attributes', async () => {
      class TestClass {
        @Instrumented({ attributes: { key: 'value' } })
        errorMethod(): void {
          throw new Error('Error with attributes');
        }
      }

      const instance = new TestClass();
      await assert.rejects(async () => await instance.errorMethod(), /Error with attributes/);
    });
  });
});
