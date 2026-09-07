/**
 * @package/pubsub
 *
 * Google Cloud Pub/Sub integration package providing a unified interface
 * for creating and managing Pub/Sub topics and subscriptions.
 *
 * Features:
 * - Topic management (create, delete, get, list)
 * - Subscription management (create, delete, get, list)
 * - Message publishing with ordering keys
 * - Pull subscriptions with message acknowledgment
 * - Dead Letter Queue support
 * - Configuration via environment variables
 * - OpenTelemetry tracing and metrics
 * - Mock provider for testing
 *
 * Related packages:
 * - `@package/observability` - Distributed tracing integration
 * - `@package/core` - Error handling utilities
 * - `@package/queues` - BullMQ queue adapter (alternative to Pub/Sub)
 * - `@package/events` - Event bus integration
 *
 * @packageDocumentation
 */

// ====================================================================
// Configuration
// - PubSubConfig: Pub/Sub configuration options
// - resolveConfig: Configuration resolution from environment
// ====================================================================
export * from './config';

// ====================================================================
// Errors
// - PubSubError: Base Pub/Sub error class
// See @package/core for infrastructure error hierarchy
// ====================================================================
export * from './errors';

// ====================================================================
// Providers
// - PubSubProvider: Google Cloud Pub/Sub provider
// - MockPubSubProvider: Mock provider for testing
// See @package/test-utils for E2E testing utilities
// ====================================================================
export * from './providers';
