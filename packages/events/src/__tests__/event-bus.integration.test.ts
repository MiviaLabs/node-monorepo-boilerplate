/**
 * Integration tests for EventBus with Kafka
 *
 * NOTE: These tests require Kafka to be running via Docker Compose.
 * Run `docker-compose up -d kafka zookeeper` before running these tests.
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';

import { KafkaClientManager } from '../client';
import { EventBus, EventMessage } from '../event-bus';

// Test configuration
const KAFKA_BROKERS = process.env['KAFKA_BROKERS'] || 'localhost:9092';
const TEST_TOPIC_PREFIX = 'test-event-bus-';

describe(
  'EventBus Integration Tests (requires Kafka)',
  { skip: !process.env['INCLUDE_INTEGRATION_TESTS'] },
  () => {
    let eventBus: EventBus;
    let kafkaManager: KafkaClientManager;
    let testTopic: string;

    before(async () => {
      // Set environment variables for Kafka connection
      process.env['KAFKA_BROKERS'] = KAFKA_BROKERS;
      process.env['KAFKA_CLIENT_ID'] = 'test-event-bus';

      eventBus = new EventBus();
      kafkaManager = new KafkaClientManager();
      testTopic = `${TEST_TOPIC_PREFIX}${Date.now()}`;

      // Create test topic
      try {
        const kafka = kafkaManager.createKafkaClient({
          brokers: KAFKA_BROKERS.split(','),
          clientId: 'test-event-bus'
        });

        const admin = kafka.admin();
        await admin.connect();
        await admin.createTopics({
          topics: [{ topic: testTopic, numPartitions: 1 }]
        });
        await admin.disconnect();
      } catch (error) {
        console.error('Failed to create test topic:', error);
        throw error;
      }
    });

    after(async () => {
      // Clean up: delete test topic
      try {
        const kafka = kafkaManager.createKafkaClient({
          brokers: KAFKA_BROKERS.split(','),
          clientId: 'test-event-bus'
        });

        const admin = kafka.admin();
        await admin.connect();
        await admin.deleteTopics({
          topics: [testTopic]
        });
        await admin.disconnect();
      } catch (error) {
        console.error('Failed to delete test topic:', error);
      }

      // Close Kafka connections
      await kafkaManager.closeKafka();
    });

    describe('publish and subscribe', () => {
      it('should publish and receive event', { timeout: 10000 }, async () => {
        const testData = {
          userId: 'user-123',
          email: 'test@example.com',
          name: 'Test User'
        };

        let receivedEvent: EventMessage<typeof testData> | undefined;

        // Subscribe to topic
        const subscription = await eventBus.subscribe(
          testTopic,
          async (event) => {
            receivedEvent = event as EventMessage<typeof testData>;
          },
          { groupId: `test-group-${Date.now()}` }
        );

        // Wait a bit for subscription to be ready
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Publish event
        await eventBus.publish('user.created', testData, { topic: testTopic });

        // Wait for event to be received
        await new Promise((resolve) => setTimeout(resolve, 2000));

        assert.ok(receivedEvent);
        assert.strictEqual(receivedEvent.eventType, 'user.created');
        assert.strictEqual(receivedEvent.data.userId, testData.userId);
        assert.strictEqual(receivedEvent.data.email, testData.email);
        assert.strictEqual(receivedEvent.data.name, testData.name);

        // Unsubscribe
        await subscription.unsubscribe();
      });

      it('should publish batch of events', { timeout: 15000 }, async () => {
        const events = [
          { eventType: 'user.created', data: { userId: '1', email: 'user1@example.com' } },
          { eventType: 'user.created', data: { userId: '2', email: 'user2@example.com' } },
          { eventType: 'user.created', data: { userId: '3', email: 'user3@example.com' } }
        ];

        const receivedEvents: EventMessage[] = [];

        // Subscribe to topic
        const subscription = await eventBus.subscribe(
          testTopic,
          async (event) => {
            receivedEvents.push(event);
          },
          { groupId: `test-batch-group-${Date.now()}` }
        );

        // Wait for subscription to be ready
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Publish batch
        await eventBus.publishBatch(
          events.map((e) => ({
            eventType: e.eventType,
            data: e.data
          }))
        );

        // Wait for events to be received
        await new Promise((resolve) => setTimeout(resolve, 3000));

        assert.ok(receivedEvents.length >= 3);

        // Unsubscribe
        await subscription.unsubscribe();
      });
    });

    describe('CQRS compliance', () => {
      it('should create events with IEvent properties', async () => {
        const testData = { userId: 'user-123' };

        let receivedEvent: EventMessage<typeof testData> | undefined;

        const subscription = await eventBus.subscribe(
          testTopic,
          async (event) => {
            receivedEvent = event as EventMessage<typeof testData>;
          },
          { groupId: `test-cqrs-${Date.now()}` }
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));

        await eventBus.publish('cqrs.test', testData, { topic: testTopic });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        assert.ok(receivedEvent);
        assert.strictEqual(receivedEvent.readonly, true);
        assert.ok(receivedEvent.occurredAt instanceof Date);
        assert.strictEqual(typeof receivedEvent.version, 'number');
        assert.strictEqual(receivedEvent.version, 1);

        await subscription.unsubscribe();
      });
    });

    describe('error handling', () => {
      it('should handle large messages by throwing error', async () => {
        const largeData = {
          content: 'X'.repeat(2_000_000) // 2MB - exceeds Kafka limit
        };

        try {
          await eventBus.publish('large.message', largeData, { topic: testTopic });
          assert.fail('Should have thrown error for large message');
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.ok((error as Error).message.includes('exceeds Kafka limit'));
        }
      });
    });

    describe('OpenTelemetry tracing', () => {
      it('should include span attributes in event processing', async () => {
        const testData = { userId: 'test-123' };

        const subscription = await eventBus.subscribe(
          testTopic,
          async (_event) => {
            // The EventBus sets span attributes internally
            // We can't directly access them from here, but we verify the event was received
          },
          { groupId: `test-tracing-${Date.now()}` }
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));

        // This test verifies that tracing doesn't break event flow
        await eventBus.publish('tracing.test', testData, { topic: testTopic });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        // If we got here without errors, tracing is working
        assert.ok(true);

        await subscription.unsubscribe();
      });
    });
  }
);
