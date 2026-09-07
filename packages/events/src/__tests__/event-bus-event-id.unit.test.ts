/**
 * TDD test for Finding #6: EventBus.publish must preserve a caller-supplied
 * eventId (e.g. when OutboxPollerService publishes an outbox row whose
 * eventId is the original domain event id).
 *
 * Before the fix: EventBus.publish always overwrites the body eventId with
 * a new randomUUID(), so downstream consumers see a different id from the
 * one in the Kafka header (`event-id`) and from the outbox row.
 *
 * Reachability: OutboxPollerService.processEvent calls
 *   eventBus.publish(event.eventType, payload, {
 *     headers: { 'event-id': event.eventId, ... }
 *   })
 * Example real consumer: apps/api/src/modules/users/handlers/consumers/user-created.consumer.ts
 */
import assert from 'node:assert';
import { describe, it, before } from 'node:test';

import { EventBus } from '../event-bus';

type KafkaMessage = {
  key?: string | Buffer;
  value: string | Buffer;
  headers?: Record<string, unknown>;
};
type Sent = { topic: string; messages: KafkaMessage[] };

let captured: Sent[] = [];

// Patch kafkajs.Kafka.prototype.producer() to return a fake producer whose
// send() captures into `captured`. We must also override Producer prototype
// connect() so getProducer() in client.ts does not try to talk to a real
// broker.
before(async () => {
  const kafkajs = await import('kafkajs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Kafka = (kafkajs as any).Kafka;
  const originalProducer = Kafka.prototype.producer;
  Kafka.prototype.producer = function () {
    return {
      on(_event: string, _listener: (...args: unknown[]) => void) {},
      async connect() {
        // no-op
      },
      async disconnect() {
        // no-op
      },
      async send(payload: Sent) {
        captured.push(payload);
      }
    };
  };
  void originalProducer;
});

describe('EventBus publish preserves caller eventId (Finding #6)', () => {
  before(() => {
    captured = [];
  });

  it('uses the eventId supplied by the caller when headers.event-id is set', async () => {
    captured = [];
    const eventBus = new EventBus();
    const callerEventId = '00000000-0000-4000-8000-000000000001';

    await eventBus.publish(
      'user.created',
      { userId: 'u-1' },
      {
        headers: { 'event-id': callerEventId }
      }
    );

    assert.strictEqual(captured.length, 1, 'producer.send should be called once');
    const sent = captured[0];
    assert.strictEqual(sent.topic, 'user-created');
    assert.strictEqual(sent.messages.length, 1);

    const body = JSON.parse(sent.messages[0].value.toString()) as { eventId: string };
    assert.strictEqual(
      body.eventId,
      callerEventId,
      'body eventId must equal caller-supplied eventId (outbox/replay dedup)'
    );

    const headers = sent.messages[0].headers as Record<string, string>;
    assert.strictEqual(headers['event-id'], callerEventId);
  });

  it('generates a new eventId when caller does not supply one', async () => {
    captured = [];
    const eventBus = new EventBus();

    await eventBus.publish('user.created', { userId: 'u-1' });

    const body = JSON.parse(captured[0].messages[0].value.toString()) as { eventId: string };
    assert.ok(body.eventId, 'a new eventId should be generated when not supplied');
    assert.strictEqual(body.eventId.length, 36, 'eventId should be a UUID v4');
  });
});
