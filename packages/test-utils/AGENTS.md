# @package/test-utils

E2E testing utilities with Testcontainers for PostgreSQL, Redis, and Kafka.

## Purpose

This package provides comprehensive testing utilities for E2E tests using Testcontainers. It handles container lifecycle management, database migrations (both db-core and db-outbox), fixture creation, and test isolation for multi-tenant applications.

## Structure

```text
src/
├── containers/           # Testcontainer management
│   ├── postgres.container.ts   # PostgreSQL container lifecycle
│   ├── redis.container.ts      # Redis container lifecycle
│   └── kafka.container.ts      # Kafka container lifecycle
├── utils/                # Core utilities
│   └── database.ts       # Database creation, migrations, cleanup
├── fixtures/             # Test data factories
│   ├── data-helper.ts    # Unique ID/email/name generators
│   └── user.fixture.ts   # User fixture CRUD operations
├── helpers/              # Setup utilities
│   ├── setup.ts          # Jest-compatible setup/teardown
│   └── kafka.ts          # Kafka E2E helpers
└── index.ts
```

## Usage

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';

describe('My E2E Tests', () => {
  beforeAll(async () => {
    // Use lazy import for Nx module boundary compliance
    const { setupTestDatabaseJest, getTestDb } = await import('@package/test-utils');

    // Database first - runs migrations automatically
    await setupTestDatabaseJest();
  }, 60000);

  afterEach(async () => {
    const { cleanupTestDatabase } = await import('@package/test-utils');
    await cleanupTestDatabase();
  });

  afterAll(async () => {
    const { teardownTestDatabase } = await import('@package/test-utils');
    await teardownTestDatabase();
  }, 60000);

  it('should test something', async () => {
    const { getTestDb } = await import('@package/test-utils');
    const { db } = getTestDb();
    // Use db for queries
  });
});
```

## Key Exports

### Container Management

- `startPostgresContainer(name, options?)` - Start named PostgreSQL container
- `stopPostgresContainer(name?)` - Stop container(s)
- `getPostgresConnectionUrl(name)` - Get connection URL for container
- `getPostgresSuperuserUrl(name)` - Get superuser URL for migrations

### Database Setup (Jest)

- `setupTestDatabaseJest()` - Isolated mode: fresh container per test file
- `setupGlobalTestDatabaseJest()` - Global mode: reuse pre-existing container
- `teardownTestDatabase()` - Stop container and close connections
- `cleanupTestDatabase()` - Drop/recreate schema for test isolation
- `getTestDb()` - Get `ITestDatabase` with Drizzle client and pg Pool
- `isGlobalDatabaseMode()` - Check if using global database

### Database Utilities

- `createTestDatabase(url)` - Create database with migrations
- `runMigrations(testDb)` - Apply db-core and db-outbox migrations
- `cleanTestDatabase(pool)` - Drop and recreate public schema
- `closeTestDatabase(pool)` - Close connection pool

### Fixtures

- `TestDataHelper.uniqueId(prefix)` - Generate unique identifier
- `TestDataHelper.uniqueEmail()` - Generate unique email
- `TestDataHelper.uniqueName(prefix)` - Generate unique display name
- `TestDataHelper.resetCounter()` - Reset counter for test isolation
- `createUserFixture(db, options?)` - Create user with hashed email
- `deleteUserFixture(db, userId)` - Delete user (deprecated)
- `deleteUserFixtureByOrg(db, userId, orgId)` - Delete with tenant scoping

### Types

- `ITestDatabase` - Database instance with `db` (Drizzle) and `pool` (pg)
- `IPostgresContainerOptions` - Container configuration options
- `ICreateUserFixtureOptions` - User fixture options

## Critical Notes

### Service Initialization Order

> **Warning:** Always initialize services in this exact order to avoid container race conditions and NestJS dependency failures.

1. **Database first** - Initialize container and run migrations
2. **Kafka (if needed)** - Start Kafka after database is ready
3. **Server** - Start NestJS application
4. **Wait for services** - Ensure all services are ready

### Standard Timeouts

- **Standard E2E tests**: 60000ms (60 seconds)
- **Tests with Kafka**: 120000ms (120 seconds)
- **Database connection**: 30000ms (increased for CI)

### Dual Migration Pattern

> **Note:** Both `db-core` and `db-outbox` migrations run on the SAME database. This is required for the outbox pattern where transactions must span both business tables and event tables.

### Lazy Imports for Nx

Use lazy imports to comply with Nx module boundary rules:

```typescript
const { setupTestDatabaseJest } = await import('@package/test-utils');
```

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |
