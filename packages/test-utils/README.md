# @package/test-utils

Comprehensive E2E and integration testing utilities powered by Testcontainers for PostgreSQL, Redis, and Kafka.

## Features

- **Testcontainers Lifecycle**: Automated orchestration of PostgreSQL, Redis, and Kafka disposable test containers
- **Dual Migration Support**: Runs both `db-core` and `db-outbox` schema migrations against a unified test database for outbox pattern validation
- **Isolated & Global Modes**: Supports per-file isolated containers or shared global containers for high-performance execution
- **Data Fixtures & Factories**: Deterministic factories for users, tenants, organizations, and unique test data generation
- **Tenant Isolation Testing**: Built-in helpers to verify multi-tenant data segmentation and access boundaries
- **Jest & Vitest Compatible**: Seamless setup, cleanup, and teardown lifecycle hooks

## Installation

This package is part of the monorepo workspace:

```bash
pnpm add @package/test-utils
```

## Quick Start

### E2E Database Test Setup

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';

describe('User Service E2E', () => {
  beforeAll(async () => {
    // Import lazily for Nx module boundary compliance
    const { setupTestDatabaseJest } = await import('@package/test-utils');
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

  it('queries the test database', async () => {
    const { getTestDb } = await import('@package/test-utils');
    const { db } = getTestDb();
    expect(db).toBeDefined();
  });
});
```

### Kafka Integration Testing

```typescript
describe('Event Streaming E2E', () => {
  beforeAll(async () => {
    const { setupTestDatabaseJest, setupKafkaE2E } = await import('@package/test-utils');

    // 1. Initialize database first
    await setupTestDatabaseJest();

    // 2. Initialize Kafka container
    await setupKafkaE2E();
  }, 120000);

  afterAll(async () => {
    const { teardownKafkaE2E, teardownTestDatabase } = await import('@package/test-utils');
    await teardownKafkaE2E();
    await teardownTestDatabase();
  }, 120000);
});
```

## Key Modules and APIs

### Container Management

- `startPostgresContainer(name, options?)` - Starts an isolated PostgreSQL container
- `stopPostgresContainer(name?)` - Gracefully halts running database containers
- `getPostgresConnectionUrl(name)` - Returns connection string for application pools
- `getPostgresSuperuserUrl(name)` - Returns superuser connection string for migration execution

### Database Setup and Isolation

- `setupTestDatabaseJest()` - Spins up a fresh container and applies all migrations
- `setupGlobalTestDatabaseJest()` - Reuses a pre-existing container across tests
- `teardownTestDatabase()` - Halts container and terminates open connection pools
- `cleanupTestDatabase()` - Drops and recreates the public schema between test cases
- `getTestDb()` - Retrieves the active `ITestDatabase` containing Drizzle client and pg Pool

### Data Factories and Fixtures

- `TestDataHelper.uniqueId(prefix)` - Generates collision-free IDs for isolated test cases
- `TestDataHelper.uniqueEmail()` - Generates unique email addresses
- `TestDataHelper.uniqueName(prefix)` - Generates unique display names
- `TestDataHelper.resetCounter()` - Resets internal sequence counters between test runs
- `createUserFixture(db, options?)` - Seeds a test user with hashed password credentials
- `deleteUserFixtureByOrg(db, userId, orgId)` - Purges a user within tenant scoping boundaries

## Execution Rules

### Service Initialization Order

To prevent container race conditions and connection failures, always follow this order:

1. **Database Container**: Start container and execute schema migrations
2. **Kafka Container**: Start message broker (if required by the tests)
3. **Application Server**: Initialize NestJS or HTTP test server
4. **Health Check**: Await readiness probes before executing assertions

### Timeouts

- **Standard Database E2E**: 60,000 ms
- **Kafka Tests**: 120,000 ms (accounts for JVM container initialization)
- **Database Connection Acquire**: 30,000 ms

## Building and Testing

```bash
# Build package
pnpm nx build test-utils

# Run unit tests
pnpm nx test test-utils
```
