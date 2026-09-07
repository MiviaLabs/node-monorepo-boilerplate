/**
 * Event routing system
 *
 * Flexible event routing system that allows events to be published
 * to multiple destinations simultaneously.
 *
 * @example
 * ```typescript
 * import { EventRouter, resolveRoutingConfig } from '@package/events/routing';
 *
 * const config = resolveRoutingConfig({
 *   enabled: true,
 *   routes: [
 *     {
 *       eventType: 'user.created',
 *       destinations: [
 *         { type: 'kafka' },
 *         { type: 'pubsub' },
 *       ],
 *     },
 *   ],
 * });
 *
 * const router = new EventRouter(config);
 * await router.initialize();
 *
 * await router.publish(event);
 * ```
 */

export * from './interfaces';
export * from './config';
export * from './router';
export * from './destinations';
