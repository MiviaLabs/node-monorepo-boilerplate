/**
 * @package/redis
 *
 * Enterprise-grade Redis integration for NestJS, providing caching, pub/sub
 * messaging, distributed locking, and session management with OpenTelemetry
 * instrumentation and multi-tenant support.
 *
 * ## Features
 *
 * - **Cache Service**: {@link CacheService} with TTL, cache-aside pattern, and distributed locking
 * - **Pub/Sub Messaging**: {@link PubSubService} for real-time event broadcasting
 * - **Method Caching**: {@link Cached} decorator for automatic method result caching
 * - **NestJS Integration**: {@link RedisModule} with dependency injection and graceful shutdown
 * - **OpenTelemetry**: Automatic tracing and metrics via {@link traceCacheOperation}
 * - **Connection Management**: Singleton client with health checks and retry strategies
 * - **Mock Support**: In-memory mock client for testing without Redis
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                      Application Layer                              │
 * │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
 * │  │ Controllers  │  │   Services   │  │  @Cached() Decorated      │ │
 * │  │              │  │              │  │       Methods             │ │
 * │  └──────┬───────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
 * └─────────┼─────────────────┼────────────────────────┼───────────────┘
 *           │                 │                        │
 *           ▼                 ▼                        ▼
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                       Redis Services                                │
 * │  ┌──────────────────┐           ┌──────────────────────────────┐   │
 * │  │   CacheService   │           │      PubSubService           │   │
 * │  │  - get/set       │           │  - publish                   │   │
 * │  │  - getOrSet      │           │  - subscribe/unsubscribe     │   │
 * │  │  - acquireLock   │           │  - multiple handlers         │   │
 * │  │  - withLock      │           │                              │   │
 * │  └────────┬─────────┘           └────────────┬─────────────────┘   │
 * │           │                                  │                     │
 * │           └──────────────┬───────────────────┘                     │
 * │                          ▼                                         │
 * │  ┌─────────────────────────────────────────────────────────────┐   │
 * │  │                    Redis Client                             │   │
 * │  │  - createRedisClient() / getRedisClient()                   │   │
 * │  │  - Connection pooling, retry strategies                     │   │
 * │  │  - Mock client for testing                                  │   │
 * │  └─────────────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────────┘
 *                          │
 *                          ▼
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    OpenTelemetry                                    │
 * │  - Span tracing for cache operations                               │
 * │  - Cache hit/miss metrics                                          │
 * │  - Operation duration histograms                                   │
 * └─────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Module Setup
 *
 * ```typescript
 * import { Module } from '@nestjs/common';
 * import { RedisModule } from '@package/redis';
 * import { ConfigModule, ConfigService } from '@nestjs/config';
 *
 * @Module({
 *   imports: [
 *     RedisModule.forRootAsync({
 *       imports: [ConfigModule],
 *       inject: [ConfigService],
 *       useFactory: (config: ConfigService) => ({
 *         config: {
 *           connection: {
 *             host: config.get('REDIS_HOST', 'localhost'),
 *             port: config.get('REDIS_PORT', 6379),
 *             password: config.get('REDIS_PASSWORD'),
 *             db: config.get('REDIS_DB', 0),
 *           },
 *           cache: {
 *             defaultTtl: config.get('REDIS_DEFAULT_TTL', 300),
 *           },
 *         },
 *         enableGracefulShutdown: true,
 *       }),
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * ## Caching Example (Multi-Tenant)
 *
 * **Important:** Always prefix cache keys with tenant ID to prevent cross-tenant
 * data leakage. The CacheService does not automatically scope keys by tenant.
 *
 * ```typescript
 * import { Injectable } from '@nestjs/common';
 * import { CacheService, Cached } from '@package/redis';
 *
 * @Injectable()
 * export class UsersService {
 *   constructor(private readonly cache: CacheService) {}
 *
 *   // Programmatic caching with tenant isolation
 *   async getUser(tenantId: string, userId: string) {
 *     return this.cache.getOrSet(
 *       `tenant:${tenantId}:user:${userId}`,
 *       () => this.fetchUserFromDb(tenantId, userId),
 *       { ttl: 300 }
 *     );
 *   }
 *
 *   // Decorator-based caching with tenant-prefixed key generator
 *   @Cached({
 *     ttl: 600,
 *     keyGenerator: (tenantId: string, userId: string) =>
 *       `tenant:${tenantId}:user:profile:${userId}`
 *   })
 *   async getUserProfile(tenantId: string, userId: string): Promise<UserProfile> {
 *     return this.fetchProfileFromDb(tenantId, userId);
 *   }
 *
 *   // Distributed locking with tenant isolation
 *   async createUniqueResource(tenantId: string, data: CreateDto) {
 *     return this.cache.withLock(
 *       `tenant:${tenantId}:lock:create:${data.email}`,
 *       async () => {
 *         return this.db.create(tenantId, data);
 *       },
 *       { expiry: 30 }
 *     );
 *   }
 * }
 * ```
 *
 * ## Pub/Sub Example
 *
 * **Important:** Use tenant-scoped channels (e.g., `tenant:{tenantId}:events`) for tenant-specific
 * events to ensure proper isolation. Use global channels (e.g., `system:events`) only for
 * cross-tenant broadcasts like system-wide notifications or admin events.
 *
 * ```typescript
 * import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
 * import { PubSubService } from '@package/redis';
 *
 * @Injectable()
 * export class EventsService implements OnModuleInit, OnModuleDestroy {
 *   constructor(private readonly pubSub: PubSubService) {}
 *
 *   async onModuleInit() {
 *     // Tenant-scoped subscription for isolated events
 *     await this.pubSub.subscribe('tenant:123:user:events', async (channel, message) => {
 *       const event = JSON.parse(message);
 *       console.log('Tenant user event:', event);
 *     });
 *   }
 *
 *   async publishUserEvent(tenantId: string, event: UserEvent) {
 *     // Always include tenantId in channel for tenant isolation
 *     await this.pubSub.publish(`tenant:${tenantId}:user:events`, event);
 *   }
 *
 *   async onModuleDestroy() {
 *     await this.pubSub.unsubscribeAll();
 *   }
 * }
 * ```
 *
 * @see {@link CacheService} for caching operations
 * @see {@link PubSubService} for pub/sub messaging
 * @see {@link Cached} for method caching decorator
 * @see {@link RedisModule} for NestJS module configuration
 *
 * Related packages:
 * - `@package/auth` - Session management integration
 * - `@package/observability` - Tracing configuration
 *
 * @packageDocumentation
 */

// ====================================================================
// Errors
// ====================================================================
export * from './errors';

// ====================================================================
// Configuration
// ====================================================================
export * from './config';

// ====================================================================
// Core Redis client and configuration
// ====================================================================
export * from './client';

// ====================================================================
// Cache service
// ====================================================================
export * from './cache';

// ====================================================================
// Pub/Sub service
// ====================================================================
export * from './pubsub';

// ====================================================================
// OpenTelemetry
// ====================================================================
export * from './telemetry';

// ====================================================================
// Decorators
// ====================================================================
export * from './decorators';

// ====================================================================
// Mock Client
// ====================================================================
export * from './mock-client';

// ====================================================================
// NestJS Module
// ====================================================================
export * from './redis.module';
