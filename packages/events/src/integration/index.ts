/**
 * Integration bridges for events
 *
 * Provides bridges to integrate Kafka events with other infrastructure packages:
 * - queues: Bridge events to job queues
 * - pubsub: Bridge events to Google Cloud Pub/Sub
 * - tasks: Bridge events to Google Cloud Tasks
 */

export * from './queues-bridge';
export * from './pubsub-bridge';
export * from './tasks-bridge';
