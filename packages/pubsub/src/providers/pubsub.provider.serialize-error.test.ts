/**
 * Tests that PubSubProvider honors the documented InvalidMessageDataError
 * contract when message serialization fails.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PubSubProvider } from '../providers/pubsub.provider';
import { InvalidMessageDataError, PublishFailedError } from '../errors';

describe('PubSubProvider serialization error contract', () => {
  it('rejects circular JSON before sending to GCP', async () => {
    const provider = new PubSubProvider({ projectId: 'test-project' });
    try {
      const circular: Record<string, unknown> = {};
      circular['self'] = circular;

      let caught: unknown = null;
      try {
        await provider.publish('events', circular);
      } catch (err) {
        caught = err;
      }

      // The public API contract (pubsub.provider.ts:893) says publish() throws
      // InvalidMessageDataError when data cannot be serialized. The current
      // implementation throws a raw TypeError that gets wrapped as
      // PublishFailedError by the outer catch.
      assert.ok(
        caught instanceof InvalidMessageDataError,
        `expected InvalidMessageDataError, got ${caught instanceof Error ? caught.constructor.name : typeof caught}`
      );
      // Must NOT be the generic wrapper
      assert.ok(!(caught instanceof PublishFailedError), 'must not wrap as PublishFailedError');
    } finally {
      await provider.dispose();
    }
  });
});
