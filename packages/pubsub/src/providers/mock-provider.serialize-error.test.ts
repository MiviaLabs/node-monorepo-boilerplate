/**
 * Test that message serialization failures throw the documented
 * InvalidMessageDataError — verifying the provider honors its public
 * error contract.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { MockPubSubProvider } from '../providers/mock-provider';
import { InvalidMessageDataError } from '../errors';

describe('MockPubSubProvider serialization error contract', () => {
  let provider: MockPubSubProvider;

  beforeEach(() => {
    provider = new MockPubSubProvider({ projectId: 'test-project' });
  });

  it('publish() wraps JSON serialization errors as InvalidMessageDataError', async () => {
    await provider.createTopic('events');
    // Circular JSON — JSON.stringify will throw TypeError
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    await assert.rejects(provider.publish('events', circular), (err: unknown) => {
      assert.ok(
        err instanceof InvalidMessageDataError,
        `expected InvalidMessageDataError, got ${err instanceof Error ? err.constructor.name : typeof err}`
      );
      return true;
    });
  });

  it('publishBatch() also wraps serialization errors as InvalidMessageDataError', async () => {
    await provider.createTopic('events');
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    await assert.rejects(provider.publishBatch('events', [{ data: circular }]), (err: unknown) => {
      assert.ok(err instanceof InvalidMessageDataError);
      return true;
    });
  });
});
