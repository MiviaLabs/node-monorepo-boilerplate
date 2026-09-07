# @package/redis

Enterprise-grade Redis integration for NestJS providing high-performance caching, real-time pub/sub messaging, distributed locking, and OpenTelemetry instrumentation.

## Overview

`@package/redis` delivers a production-ready Redis integration layer for NestJS applications. It includes cache-aside patterns, pattern-based cache invalidation, real-time pub/sub channels, distributed mutex locking, connection health monitoring, graceful shutdown hooks, and seamless NestJS dependency injection.

## Features

- **NestJS Module** - Global dynamic module with synchronous and asynchronous dependency injection
- **Caching Service** - High-level cache interface with TTL, pattern invalidation, and `getOrSet` cache-aside support
- **Pub/Sub Service** - Real-time channel messaging with multiple concurrent subscriptions
- **Distributed Locking** - Resilient mutex locking for distributed task synchronization
- **Health Checks** - Built-in connection health monitoring
- **Graceful Shutdown** - Automatic connection cleanup on application teardown
- **ConfigService Integration** - Asynchronous configuration via NestJS ConfigModule
- **Observability** - Built-in OpenTelemetry tracing for cache operations

## Installation

```bash
pnpm install @package/redis
```

## Quick Start

### 1. Register the Module

```typescript
import { Module } from '@nestjs/common';
import { RedisModule } from '@package/redis';

@Module({
  imports: [
    RedisModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      }
    })
  ]
})
export class AppModule {}
```

### 2. Inject and Use Services

```typescript
import { Injectable } from '@nestjs/common';
import { CacheService, PubSubService } from '@package/redis';

@Injectable()
export class UsersService {
  constructor(
    private readonly cache: CacheService,
    private readonly pubSub: PubSubService
  ) {}

  async getUser(id: string) {
    return this.cache.getOrSet(`user:${id}`, () => this.db.findUser(id), { ttl: 300 });
  }

  async publishUserUpdate(user: User) {
    await this.pubSub.publish('user:updated', user);
  }
}
```

## Configuration

### Environment Variables

```bash
# Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=optional_password
REDIS_DB=0

# Module options
REDIS_GRACEFUL_SHUTDOWN=true
```

### Using forRoot()

```typescript
import { RedisModule } from '@package/redis';

@Module({
  imports: [
    RedisModule.forRoot({
      enableGracefulShutdown: true,
      redis: {
        host: 'localhost',
        port: 6379,
        password: 'secret',
        db: 0,
        maxRetriesPerRequest: 5,
        retryStrategy: (times) => Math.min(times * 100, 5000)
      }
    })
  ]
})
export class AppModule {}
```

### Using forRootAsync() with ConfigService

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@package/redis';

@Module({
  imports: [
    ConfigModule.forRoot(),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
          db: config.get('REDIS_DB', 0)
        },
        enableGracefulShutdown: config.get('REDIS_GRACEFUL_SHUTDOWN', 'true') === 'true'
      })
    })
  ]
})
export class AppModule {}
```

## Usage Examples

### Caching with CacheService

```typescript
import { Injectable } from '@nestjs/common';
import { CacheService } from '@package/redis';

@Injectable()
export class ProductsService {
  constructor(private readonly cache: CacheService) {}

  // Cache-aside pattern
  async getProduct(id: string) {
    return this.cache.getOrSet(
      `product:${id}`,
      async () => {
        return await this.db.findProduct(id);
      },
      { ttl: 600 } // 10 minutes
    );
  }

  // Set value with TTL
  async cacheProduct(product: Product) {
    await this.cache.set(`product:${product.id}`, product, { ttl: 600 });
  }

  // Invalidate pattern
  async clearProductCache() {
    await this.cache.invalidatePattern('product:*');
  }

  // Check existence
  async hasProduct(id: string) {
    return this.cache.exists(`product:${id}`);
  }

  // Counter operations
  async incrementViews(productId: string) {
    return this.cache.increment(`product:${productId}:views`);
  }
}
```

### Pub/Sub with PubSubService

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PubSubService, MessageHandler } from '@package/redis';

@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(private readonly pubSub: PubSubService) {}

  onModuleInit() {
    // Subscribe to user events
    this.pubSub.subscribe('user:created', this.handleUserCreated);
    this.pubSub.subscribe('user:updated', this.handleUserUpdated);
  }

  private handleUserCreated: MessageHandler = async (channel, message) => {
    const user = JSON.parse(message);
    await this.sendWelcomeEmail(user.email);
  };

  private handleUserUpdated: MessageHandler = async (channel, message) => {
    const user = JSON.parse(message);
    await this.invalidateUserCache(user.id);
  };

  async publishUserEvent(event: string, user: User) {
    await this.pubSub.publish(`user:${event}`, user);
  }

  async cleanup() {
    await this.pubSub.unsubscribeAll();
  }
}
```

### Health Check Endpoint

```typescript
import { Controller, Get } from '@nestjs/common';
import { RedisModule } from '@package/redis';

@Controller('health')
export class HealthController {
  @Get('redis')
  async checkRedis() {
    const isHealthy = await RedisModule.healthCheck();
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString()
    };
  }
}
```

## API Reference

### RedisModule

#### `forRoot(config: RedisModuleConfig): DynamicModule`

Configures the Redis module synchronously.

**Parameters:**

- `config.enableGracefulShutdown` - Enable graceful shutdown (default: true)
- `config.redis` - Redis connection configuration
- `config.cacheService` - Custom CacheService instance
- `config.pubSubService` - Custom PubSubService instance

#### `forRootAsync(options): DynamicModule`

Configures the Redis module asynchronously with ConfigService support.

**Parameters:**

- `options.useFactory` - Factory function returning config
- `options.inject` - Dependencies to inject
- `options.imports` - Modules to import

#### `healthCheck(): Promise<boolean>`

Static method to check Redis connectivity.

### CacheService

| Method                             | Description                  |
| ---------------------------------- | ---------------------------- |
| `get<T>(key)`                      | Get cached value             |
| `set(key, value, options?)`        | Set value with optional TTL  |
| `delete(key)`                      | Delete a key                 |
| `deleteMultiple(keys[])`           | Delete multiple keys         |
| `invalidatePattern(pattern)`       | Delete keys matching pattern |
| `exists(key)`                      | Check if key exists          |
| `getOrSet(key, factory, options?)` | Cache-aside pattern          |
| `increment(key, by?)`              | Increment counter            |
| `expire(key, ttl)`                 | Set TTL on key               |
| `ttl(key)`                         | Get remaining TTL            |

### PubSubService

| Method                           | Description                     |
| -------------------------------- | ------------------------------- |
| `publish(channel, message)`      | Publish message to channel      |
| `subscribe(channel, handler)`    | Subscribe to channel            |
| `unsubscribe(channel, handler?)` | Unsubscribe from channel        |
| `unsubscribeAll()`               | Unsubscribe from all channels   |
| `getSubscribedChannels()`        | Get list of subscribed channels |

## Advanced Usage

### Custom Services

You can provide custom CacheService or PubSubService instances:

```typescript
import { CacheService, PubSubService } from '@package/redis';

// Custom cache service with serialization
class CustomCacheService extends CacheService {
  async set(key: string, value: unknown) {
    // Custom serialization logic
    await super.set(key, value);
  }
}

// Use custom services
const customCache = new CustomCacheService();
const customPubSub = new PubSubService();

RedisModule.forRoot({
  cacheService: customCache,
  pubSubService: customPubSub
});
```

### Custom Retry Strategy

```typescript
RedisModule.forRoot({
  redis: {
    host: 'localhost',
    port: 6379,
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 5000);
      return delay;
    }
  }
});
```

### Multiple Redis Instances

For multiple Redis instances, create separate modules:

```typescript
// cache.module.ts
@Module({
  imports: [RedisModule.forRoot({ redis: cacheRedisConfig })],
  exports: [RedisModule]
})
export class CacheModule {}

// session.module.ts
@Module({
  imports: [RedisModule.forRoot({ redis: sessionRedisConfig })],
  exports: [RedisModule]
})
export class SessionModule {}
```

## Migration from Old API

### Before (Singleton Pattern)

```typescript
import { cacheService, pubSubService } from '@package/redis';

// Direct usage
await cacheService.set('key', 'value');
await pubSubService.publish('channel', { data });
```

### After (Dependency Injection)

```typescript
import { Injectable } from '@nestjs/common';
import { CacheService, PubSubService } from '@package/redis';

@Injectable()
export class MyService {
  constructor(
    private readonly cache: CacheService,
    private readonly pubSub: PubSubService
  ) {}

  async myMethod() {
    await this.cache.set('key', 'value');
    await this.pubSub.publish('channel', { data });
  }
}
```

**Note:** The old singleton exports (`cacheService`, `pubSubService`) are still available but marked as `@deprecated`.

## Running Tests

```bash
# Run all tests
pnpm run test

# Run unit tests only
pnpm run test:unit

# Run integration tests (requires Redis)
INCLUDE_INTEGRATION_TESTS=1 pnpm run test:integration
```

## Associated Packages

- [`@package/queues`](../queues/) - BullMQ job queues (uses Redis)
- [`@package/events`](../events/) - Kafka events integration
- [`@package/observability`](../observability/) - Logging and metrics
