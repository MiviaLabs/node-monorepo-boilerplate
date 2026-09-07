/**
 * @package/events
 *
 * Enterprise event management package providing event bus, outbox pattern,
 * dead letter queues, event replay, versioning, and schema validation.
 *
 * Related packages:
 * - `@package/db-outbox` - Event store database schema and outbox tables
 * - `@package/core` - Error handling and infrastructure utilities
 * - `@package/observability` - Distributed tracing integration
 * - `@package/types` - IEvent and EventMetadata types
 * - `@package/pubsub` - Google Cloud Pub/Sub integration
 *
 * @packageDocumentation
 */

// ====================================================================
// Errors
// {@link EventError} - Base error class for event-related failures
// ====================================================================
export * from './errors';

// ====================================================================
// Configuration
// ====================================================================
export * from './config';

// ====================================================================
// Core Functionality
// {@link EventClient} - HTTP client for event publishing
// {@link EventBus} - Central event dispatch mechanism
// {@link EventHandler} - Base handler for processing events
// {@link EventsModule} - NestJS module for event infrastructure
// ====================================================================
export * from './client';
export * from './event-bus';
export * from './handler';
export * from './events.module';

// ====================================================================
// Logging
// ====================================================================
export * from './logging/logger';

// ====================================================================
// Outbox Pattern
// {@link OutboxService} - Transactional outbox for reliable event delivery
// See `@package/db-outbox` for outbox schema and database tables
// ====================================================================
export * from './outbox';

// ====================================================================
// Integration Bridges
// ====================================================================
export * from './integration';

// ====================================================================
// Event Routing
// ====================================================================
export * from './routing';

// ====================================================================
// Dead Letter Queue
// {@link DeadLetterQueueService} - Failed event handling and reprocessing
// See `@package/queues` for BullMQ dead letter queue integration
// ====================================================================
export * from './dead-letter';

// ====================================================================
// Event Replay
// {@link EventReplayService} - Replay historical events for rebuilding state
// See `@package/db-outbox` for event store queries
// ====================================================================
export * from './replay';

// ====================================================================
// Event Versioning
// {@link EventVersioning} - Schema evolution and backward compatibility
// See `@package/types` for CloudEvents specification types
// ====================================================================
export * from './versioning';

// ====================================================================
// Event Validation
// {@link EventValidator} - Runtime event payload validation
// See `@package/schema` for Zod schema definitions
// ====================================================================
export * from './validation';

// ====================================================================
// Event Schema Registry
// {@link SchemaRegistry} - Event schema versioning and lookup
// See `@package/types` for CloudEvents types
// ====================================================================
export * from './schema';
