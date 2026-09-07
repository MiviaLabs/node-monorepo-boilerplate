import { OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { getRedisClient } from './client';
import { traceCacheOperation } from './telemetry';

/**
 * Message handler function type for pub/sub subscriptions
 *
 * @param channel - The channel name
 * @param message - The message payload (string)
 *
 * @example
 * ```typescript
 * const handler: MessageHandler = async (channel, message) => {
 *   const data = JSON.parse(message);
 *   console.log(`Received on ${channel}:`, data);
 * };
 * ```
 */
export type MessageHandler = (channel: string, message: string) => void | Promise<void>;

/**
 * Redis pub/sub service for real-time messaging
 *
 * This service creates TWO Redis connections:
 * - Publisher: Reuses the singleton client from getRedisClient()
 * - Subscriber: Creates a new connection via .duplicate() (required by Redis protocol)
 *
 * NestJS manages this service as a singleton, so only ONE subscriber connection
 * is created for the entire application.
 *
 * Provides a high-level interface for Redis publish/subscribe with support for:
 * - Multiple subscribers per channel
 * - Automatic JSON serialization for published messages
 * - Multiple handlers per channel
 * - Graceful unsubscription
 *
 * @example
 * ```typescript
 * const pubSub = new PubSubService();
 *
 * // Subscribe to messages
 * await pubSub.subscribe('user:updated', async (channel, message) => {
 *   const data = JSON.parse(message);
 *   console.log('User updated:', data);
 * });
 *
 * // Publish messages
 * await pubSub.publish('user:updated', { userId: 123, name: 'John' });
 *
 * // Unsubscribe
 * await pubSub.unsubscribe('user:updated');
 * ```
 */
export class PubSubService implements OnModuleDestroy {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly subscriptions = new Map<string, Set<MessageHandler>>();

  constructor() {
    // Reuse the existing singleton client for publishing
    // Efficient: ONE publisher connection for entire app
    this.publisher = getRedisClient();

    // Create a NEW connection for subscribing
    // Required: Redis protocol forbids mixing pub/sub with other commands
    // .duplicate() creates new connection with same configuration

    // Use lazyConnect to prevent immediate connection attempts during construction
    // The subscriber will connect when first subscription is made
    this.subscriber = getRedisClient().duplicate({ lazyConnect: true });

    // IMPORTANT: Attach error handler immediately to prevent unhandled error events
    this.subscriber.on('error', (err: Error & { code?: string }) => {
      // Silently log connection errors - subscriber will retry automatically
      console.error('[Redis PubSub] Subscriber error:', {
        message: err.message,
        code: err.code,
        name: err.name
      });
    });

    // Attach message handler for this instance's subscriptions
    this.subscriber.on('message', (channel, message) => {
      const handlers = this.subscriptions.get(channel);
      if (handlers) {
        handlers.forEach((handler) => handler(channel, message));
      }
    });
  }

  /**
   * Publishes a message to a channel
   *
   * @param channel - Channel name to publish to
   * @param message - Message to publish (will be JSON serialized if not a string)
   * @returns Number of subscribers that received the message
   *
   * @example
   * ```typescript
   * await pubSub.publish('events', { type: 'user.created', data: { id: 123 } });
   * ```
   */
  async publish(channel: string, message: unknown): Promise<number> {
    return traceCacheOperation('pubsub.publish', channel, async () => {
      const serialized = typeof message === 'string' ? message : JSON.stringify(message);
      return this.publisher.publish(channel, serialized);
    });
  }

  /**
   * Subscribes to a channel with a message handler
   *
   * Multiple handlers can be registered for the same channel. All handlers
   * will be called when a message is received.
   *
   * @param channel - Channel name to subscribe to
   * @param handler - Function to call when messages are received
   *
   * @example
   * ```typescript
   * await pubSub.subscribe('events', async (channel, message) => {
   *   const data = JSON.parse(message);
   *   console.log('Received:', data);
   * });
   * ```
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    // Connect subscriber if not already connected (lazy connect)
    if (!this.subscriber.status || this.subscriber.status === 'end') {
      await this.subscriber.connect().catch(() => {
        // Connection failed, but retry will happen automatically
      });
    }

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      await this.subscriber.subscribe(channel);
    }
    this.subscriptions.get(channel)?.add(handler);
  }

  /**
   * Unsubscribes from a channel
   *
   * If a handler is provided, only that handler is removed.
   * If no handler is provided, all handlers for the channel are removed
   * and the Redis subscription is cancelled.
   *
   * @param channel - Channel name to unsubscribe from
   * @param handler - Optional specific handler to remove
   *
   * @example
   * ```typescript
   * // Unsubscribe specific handler
   * await pubSub.unsubscribe('events', myHandler);
   *
   * // Unsubscribe all handlers from channel
   * await pubSub.unsubscribe('events');
   * ```
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    const handlers = this.subscriptions.get(channel);
    if (!handlers) return;

    if (handler) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        await this.subscriber.unsubscribe(channel);
        this.subscriptions.delete(channel);
      }
    } else {
      await this.subscriber.unsubscribe(channel);
      this.subscriptions.delete(channel);
    }
  }

  /**
   * Unsubscribes from all channels
   *
   * @example
   * ```typescript
   * await pubSub.unsubscribeAll();
   * ```
   */
  async unsubscribeAll(): Promise<void> {
    const channels = Array.from(this.subscriptions.keys());
    await this.subscriber.unsubscribe(...channels);
    this.subscriptions.clear();
  }

  /**
   * Gets list of subscribed channels
   *
   * @returns Array of channel names
   *
   * @example
   * ```typescript
   * const channels = pubSub.getSubscribedChannels();
   * console.log('Subscribed to:', channels);
   * ```
   */
  getSubscribedChannels(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Cleanup method called by NestJS on module destruction
   * Ensures proper cleanup of subscriptions and connections
   *
   * @example
   * ```typescript
   * // Called automatically by NestJS during shutdown
   * await pubSub.onModuleDestroy();
   * ```
   */
  async onModuleDestroy(): Promise<void> {
    await this.unsubscribeAll();
    // Only quit the subscriber - publisher is shared singleton
    await this.subscriber.quit();
  }
}

/**
 * @deprecated Use NestJS dependency injection instead. Import PubSubService from redis.module.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly pubSub: PubSubService) {}
 * }
 * ```
 */
export const pubSubService = new PubSubService();
