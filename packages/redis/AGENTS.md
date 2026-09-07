# @package/redis

Enterprise-grade Redis integration for NestJS featuring distributed caching, pub/sub messaging, distributed locking, and OpenTelemetry instrumentation.

## Purpose

This package delivers high-performance Redis integration for NestJS applications. It provides cache-aside abstractions, real-time pub/sub channels, distributed mutex locking, and full OpenTelemetry instrumentation, with built-in multi-tenant isolation through key and channel namespacing.

## Structure

```text
src/
├── cache.ts                 # CacheService with TTL, get-or-set, locking
├── pubsub.ts                # PubSubService for real-time messaging
├── client.ts                # Redis client singleton with health checks
├── redis.module.ts          # NestJS module with DI support
├── config/                  # Configuration interfaces and defaults
│   ├── interfaces.ts        # InfrastructureRedisConfig types
│   ├── defaults.ts          # Default configuration values
│   └── config-resolver.ts   # Environment-based config resolution
├── decorators/              # Method decorators
│   └── cached.decorator.ts  # @Cached() for automatic method caching
├── telemetry.ts             # OpenTelemetry tracing integration
├── mock-client.ts           # In-memory mock for local development
├── errors.ts                # Redis-specific error types
└── index.ts                 # Public exports
```

## Usage

```typescript
import { Module } from '@nestjs/common';
import { RedisModule, CacheService, PubSubService, Cached } from '@package/redis';

// Module setup
@Module({
  imports: [
    RedisModule.forRoot({
      config: {
        connection: { host: 'localhost', port: 6379 },
        cache: { defaultTtl: 300 }
      },
      enableGracefulShutdown: true
    })
  ]
})
export class AppModule {}

// Service injection
@Injectable()
export class UsersService {
  constructor(
    private readonly cache: CacheService,
    private readonly pubSub: PubSubService
  ) {}

  // Cache-aside pattern with tenant isolation
  async getUser(tenantId: string, userId: string) {
    return this.cache.getOrSet(
      `tenant:${tenantId}:user:${userId}`,
      () => this.fetchFromDb(tenantId, userId),
      { ttl: 300 }
    );
  }

  // Decorator-based caching
  @Cached({ ttl: 600, keyGenerator: (tid, uid) => `tenant:${tid}:profile:${uid}` })
  async getProfile(tenantId: string, userId: string) {
    return this.fetchProfile(tenantId, userId);
  }

  // Distributed locking
  async createResource(tenantId: string, data: CreateDto) {
    // Use hashed identifier for cache key - data.email is hashed before use
    const hashedEmail = hashEmail(data.email);
    const lockKey = `tenant:${tenantId}:lock:${hashedEmail}`;
    return this.cache.withLock(lockKey, () => this.db.create(data), { expiry: 30 });
  }
}
```

## Key Exports

### Services

- `CacheService` - Cache operations (get, set, getOrSet, invalidatePattern, acquireLock, withLock)
- `PubSubService` - Pub/sub messaging (publish, subscribe, unsubscribe, unsubscribeAll)
- `RedisModule` - NestJS module with forRoot/forRootAsync configuration

### Decorators

- `@Cached()` - Automatic method result caching with TTL and custom key generators

### Configuration

- `InfrastructureRedisConfig` - Connection and cache configuration interface
- `RedisModuleConfig` - Module configuration with graceful shutdown option

### Utilities

- `createRedisClient()` - Create Redis client with retry strategies
- `getRedisClient()` - Get singleton Redis client
- `healthCheck()` - Check Redis connectivity
- `traceCacheOperation()` - OpenTelemetry instrumented operations

### Types

- `CacheOptions` - TTL configuration for cache operations
- `LockOptions` - Distributed lock configuration (timeout, expiry, retryInterval)
- `MessageHandler` - Pub/sub message handler function type
- `CachedOptions` - Decorator configuration (ttl, keyPrefix, keyGenerator)

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |
