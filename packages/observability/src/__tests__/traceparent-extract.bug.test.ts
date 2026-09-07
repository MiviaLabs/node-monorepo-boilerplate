import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { extractTraceParent } from '../patterns';

describe('extractTraceParent header lookup', () => {
  it('extracts traceparent header when keyed lowercase (Node HTTP default)', () => {
    const ctx = extractTraceParent({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    });
    assert.deepStrictEqual(ctx, {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true
    });
  });

  it('extracts traceparent header when keyed in mixed case (e.g. fetch wrappers, third-party clients)', () => {
    // Real-world callers may pass headers with non-lowercase keys
    // (custom fetch wrappers, gRPC interceptors, manually-constructed test fixtures,
    // cloud SDKs that preserve original case). Node's built-in HTTP parser
    // lowercases headers, but the public API accepts a generic Record and should
    // handle common case variations to avoid silently dropping the trace context.
    const ctx = extractTraceParent({
      Traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    });
    assert.ok(
      ctx !== undefined,
      'expected trace context to be extracted from Traceparent header (mixed case)'
    );
    assert.deepStrictEqual(ctx, {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      sampled: true
    });
  });

  it('still returns undefined for missing or malformed headers', () => {
    assert.strictEqual(extractTraceParent({}), undefined);
    assert.strictEqual(extractTraceParent({ traceparent: 'not-valid' }), undefined);
  });
});
