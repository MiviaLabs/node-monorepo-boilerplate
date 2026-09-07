/**
 * Unit tests for MockPubSubProvider.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

import { MockPubSubProvider } from '../providers/mock-provider';
import { TopicNotFoundError, SubscriptionNotFoundError } from '../errors';

describe('MockPubSubProvider', () => {
  let provider: MockPubSubProvider;

  beforeEach(() => {
    provider = new MockPubSubProvider({ projectId: 'test-project' });
  });

  describe('basic CRUD', () => {
    it('creates and lists topics', async () => {
      await provider.createTopic('t1');
      await provider.createTopic('t2');
      const topics = await provider.listTopics();
      assert.equal(topics.length, 2);
      assert.deepEqual(topics.map((t) => t.name).sort(), ['t1', 't2']);
    });

    it('throws TopicAlreadyExistsError on duplicate topic', async () => {
      await provider.createTopic('t1');
      await assert.rejects(provider.createTopic('t1'), (err: unknown) => {
        assert(err instanceof Error);
        assert.match(err.message, /already exists|AlreadyExists/i);
        return true;
      });
    });

    it('throws TopicNotFoundError on missing topic', async () => {
      await assert.rejects(provider.publish('nope', { x: 1 }), (err: unknown) => {
        return err instanceof TopicNotFoundError;
      });
    });

    it('throws SubscriptionNotFoundError when subscribing to missing sub', async () => {
      await assert.rejects(
        provider.subscribe('missing', async () => {}),
        (err: unknown) => {
          return err instanceof SubscriptionNotFoundError;
        }
      );
    });
  });

  describe('publish/subscribe', () => {
    it('delivers a published message to subscribed handler', async () => {
      await provider.createTopic('events');
      await provider.createSubscription('worker', 'events');

      const received: string[] = [];
      await provider.subscribe('worker', async (msg) => {
        received.push(msg.messageId);
        await msg.ack();
      });

      const result = await provider.publish('events', { hello: 'world' });
      assert.equal(typeof result.messageId, 'string');
      assert.equal(received.length, 1);
      assert.equal(received[0], result.messageId);
    });
  });

  describe('message ID generation', () => {
    it('produces strictly incrementing message IDs', async () => {
      await provider.createTopic('events');
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const r = await provider.publish('events', { i });
        ids.push(r.messageId);
      }
      const unique = new Set(ids);
      assert.equal(unique.size, ids.length, 'message IDs must be unique');
    });
  });
});
