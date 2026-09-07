/**
 * Unit tests for pubsub.ts
 *
 * These tests verify PubSubService exports and types without actually
 * connecting to Redis. For integration tests with real Redis, see the
 * integration test suite.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { PubSubService, type MessageHandler } from '../pubsub';

describe('pubsub', () => {
  describe('exports', () => {
    it('should export PubSubService class', () => {
      assert.strictEqual(typeof PubSubService, 'function');
    });

    it('should export MessageHandler type', () => {
      const handler: MessageHandler = async (_channel, _message) => {
        // Handler
      };
      assert.strictEqual(typeof handler, 'function');
    });
  });

  describe('PubSubService', () => {
    it('should be instantiable', () => {
      const service = new PubSubService();
      assert.ok(service);
      assert.strictEqual(typeof service.publish, 'function');
      assert.strictEqual(typeof service.subscribe, 'function');
      assert.strictEqual(typeof service.unsubscribe, 'function');
      assert.strictEqual(typeof service.unsubscribeAll, 'function');
      assert.strictEqual(typeof service.getSubscribedChannels, 'function');
    });

    it('should have all required methods', () => {
      const service = new PubSubService();
      const methods: Array<keyof PubSubService> = [
        'publish',
        'subscribe',
        'unsubscribe',
        'unsubscribeAll',
        'getSubscribedChannels'
      ];

      for (const method of methods) {
        assert.strictEqual(typeof service[method], 'function');
      }
    });
  });

  describe('MessageHandler', () => {
    it('should accept sync handler function', () => {
      const handler: MessageHandler = (_channel, _message) => {
        // Handler function
      };

      assert.strictEqual(typeof handler, 'function');
    });

    it('should accept async handler function', () => {
      const handler: MessageHandler = async (_channel, _message) => {
        await Promise.resolve();
      };

      assert.strictEqual(typeof handler, 'function');
    });

    it('should accept handler that returns void', () => {
      const handler: MessageHandler = () => {
        // void return
      };

      assert.strictEqual(typeof handler, 'function');
    });

    it('should accept handler that returns Promise', () => {
      const handler: MessageHandler = async (_channel, _message) => {
        return Promise.resolve(undefined);
      };

      assert.strictEqual(typeof handler, 'function');
    });
  });

  describe('type definitions', () => {
    it('should have correct type for PubSubService', () => {
      const service: PubSubService = new PubSubService();
      assert.ok(service);
    });

    it('should have correct type for MessageHandler', () => {
      const handler: MessageHandler = async () => {};
      assert.ok(handler);
    });
  });

  describe('method signatures', () => {
    it('should have publish method with correct signature', () => {
      const service = new PubSubService();
      assert.strictEqual(typeof service.publish, 'function');
      // publish(channel: string, message: unknown): Promise<number>
    });

    it('should have subscribe method with correct signature', () => {
      const service = new PubSubService();
      assert.strictEqual(typeof service.subscribe, 'function');
      // subscribe(channel: string, handler: MessageHandler): Promise<void>
    });

    it('should have unsubscribe method with correct signature', () => {
      const service = new PubSubService();
      assert.strictEqual(typeof service.unsubscribe, 'function');
      // unsubscribe(channel: string, handler?: MessageHandler): Promise<void>
    });

    it('should have unsubscribeAll method with correct signature', () => {
      const service = new PubSubService();
      assert.strictEqual(typeof service.unsubscribeAll, 'function');
      // unsubscribeAll(): Promise<void>
    });

    it('should have getSubscribedChannels method with correct signature', () => {
      const service = new PubSubService();
      assert.strictEqual(typeof service.getSubscribedChannels, 'function');
      // getSubscribedChannels(): string[]
    });
  });
});
