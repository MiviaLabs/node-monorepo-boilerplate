# E2E Tests

This directory contains end-to-end (E2E) tests for the API using **Jest** and **Testcontainers**.

## Overview

E2E tests use a real NestJS server and Testcontainers PostgreSQL database to ensure full integration testing. The tests verify that all components (controllers, CQRS handlers, repositories, middleware) work correctly together.

## Why Jest Instead of node:test?

This repository uses **Jest** for ALL testing (unit, integration, E2E) instead of Node.js's built-in `node:test` runner due to a critical incompatibility with NestJS:

- **Issue**: [nestjs/nest#14130](https://github.com/nestjs/nest/issues/14130) - NestJS `@nestjs/testing` module is incompatible with `node:test`
- **Root Cause**: `node:test` uses a different module resolution system that breaks NestJS's dependency injection
- **Impact**: Tests using `node:test` cannot properly inject `QueryBus`, `CommandBus`, or other NestJS providers
- **Solution**: Jest provides full compatibility with NestJS's testing utilities and DI system

For more details, see the [GitHub issue discussion](https://github.com/nestjs/nest/issues/14130).

## Architecture

### Test Structure

```
test/
├── helpers/                   # Test helper utilities
│   ├── bootstrap.ts          # NestJS server startup/shutdown
│   ├── database.ts           # Database setup/cleanup
│   ├── auth.helper.ts        # Authentication test helpers
│   └── test-database.module.ts # Test database module override
├── fixtures/                  # Test data factories
│   └── user.fixture.ts       # User test data
├── e2e/                       # E2E test files organized by feature
│   ├── auth/                 # Authentication E2E tests
│   ├── health/               # Health check E2E tests
│   ├── tenants/              # Tenants E2E tests
│   └── users/                # Users E2E tests
├── jest.global-setup.ts       # Jest global setup
├── jest.global.d.ts           # Jest global type definitions
├── global-test-db.ts          # Global database manager
└── README.md                  # This file
```

### E2E Test Files

| Test File                                           | Description                    |
| --------------------------------------------------- | ------------------------------ |
| `e2e/auth/auth.e2e.spec.ts`                         | Authentication flow tests      |
| `e2e/auth/account-deletion.e2e.spec.ts`             | Account deletion tests         |
| `e2e/auth/export-user-data.e2e.spec.ts`             | User data export tests         |
| `e2e/auth/tenant-validation.e2e.spec.ts`            | Tenant validation tests        |
| `e2e/auth/transfer-ownership.e2e.spec.ts`           | Ownership transfer tests       |
| `e2e/health/health.e2e.spec.ts`                     | Health check endpoint tests    |
| `e2e/tenants/tenants.e2e.spec.ts`                   | Tenants CRUD tests             |
| `e2e/tenants/migrations/tenants-schema.e2e.spec.ts` | Tenants schema migration tests |
| `e2e/users/users.e2e.spec.ts`                       | Users CRUD tests               |
| `e2e/users/users-events.e2e.spec.ts`                | User domain events tests       |

### Key Components

#### 1. `bootstrap.ts` - NestJS Server Helper

Creates a real NestJS server using `Test.createTestingModule()` to ensure proper DI initialization:

```typescript
import { startTestServer, waitForServiceInitialization } from './helpers/bootstrap';

const server = await startTestServer();
await waitForServiceInitialization(server); // Wait for services like OutboxPoller
const response = await server.request({
  method: 'GET',
  url: '/users',
  headers: { 'x-tenant-id': '123' }
});
await server.close();
```

**Key features:**

- Uses `Test.createTestingModule()` for proper DI (not `NestFactory.create()`)
- Auto-prepends `/api` prefix to all URLs
- Supports all HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Returns `{ status, body }` from requests

#### 2. `database.ts` - Database Helper

Wraps `@package/test-utils` for database operations:

```typescript
import {
  setupE2ETestDatabaseJest,
  getE2ETestDb,
  createTestOrganizationWithTenant,
  cleanupOrganization
} from './helpers/database';

// Setup database in beforeAll()
await setupE2ETestDatabaseJest();

// Get database instance
const { db } = getE2ETestDb();

// Create test organization (creates both tenant + org)
const { tenantId, organizationId } = await createTestOrganizationWithTenant(server.app);

// Clean up organization data
await cleanupOrganization(server.app, organizationId);
```

**Key functions:**

- `setupE2ETestDatabaseJest()` - Auto-detects CI vs local, starts Testcontainers
- `getE2ETestDb()` / `getTestDb()` - Get database instance
- `createTestOrganizationWithTenant(app)` - Creates tenant + organization together
- `createTestOrganization(app)` - Legacy alias (creates tenant + org)
- `createTestTenant(app, type, status)` - Create tenant record
- `createTestUserTenant(app, userId, tenantId, role, isDefault)` - Create user-tenant membership
- `cleanupOrganization(app, orgId)` - Delete org's users
- `cleanupTenant(app, tenantId)` - Delete tenant's data

**App-based vs Db-based functions:**

- App-based (`createTestOrganizationWithTenant(app)`) - Uses NestJS app's connection pool (preferred for E2E)
- Db-based (`createTestOrganizationWithDb(db)`) - Uses provided db instance (may have visibility issues)

#### 3. `auth.helper.ts` - Authentication Helper

Helper class for generating JWT tokens and making authenticated requests:

```typescript
import { createAuthTestHelper, generateMockToken, mockUsers } from './helpers/auth.helper';

const authHelper = createAuthTestHelper(jwtService);

// Generate tokens
const userToken = authHelper.generateUserToken();
const adminToken = authHelper.generateAdminToken();
const customToken = authHelper.generateToken({ sub: '123', tenant_id: '456' });

// Make authenticated requests
const response = await authHelper.authenticatedGet(server.app, '/users', userToken);

// Use mock users
const token = generateMockToken(jwtService, 'admin');
```

**Available functions:**

- `generateToken(payload)` - Generate JWT with custom payload
- `generateUserToken(overrides)` - Generate user token with defaults
- `generateAdminToken(overrides)` - Generate admin token with all permissions
- `generateTenantToken(tenantId, overrides)` - Generate token for specific tenant
- `generateTokenWithRoles(roles, overrides)` - Generate token with specific roles
- `generateTokenWithPermissions(permissions, overrides)` - Generate token with specific permissions
- `authenticatedRequest(app, method, url, token, body)` - Make authenticated request
- `authenticatedGet/Put/Post/Patch/Delete(app, url, token/body)` - HTTP method helpers

#### 4. `global-test-db.ts` - Database Manager

Starts Testcontainers ONCE before all test files. This avoids the overhead of starting/stopping containers for each test file.

## Running Tests

### Global Test Database (Testcontainers)

Start the database once, run all tests, then stop:

```bash
# Terminal 1: Start database
pnpm test:e2e:setup

# Terminal 2: Run tests (can run multiple times)
pnpm test:e2e

# Terminal 1: Stop database
pnpm test:e2e:teardown
```

**Check database status:**

```bash
pnpm test:e2e:status
```

**One-liner for complete test run:**

```bash
pnpm test:e2e:manual
```

Or from root:

```bash
pnpm test:api:e2e
```

## Writing E2E Tests

### Basic Test Structure

```typescript
import { startTestServer, waitForServiceInitialization } from './helpers/bootstrap';
import { setupE2ETestDatabaseJest, createTestOrganizationWithTenant } from './helpers/database';
import { createUserFixture } from './fixtures/user.fixture';

describe('Feature E2E Tests', () => {
  let server;
  let organizationId;
  let tenantId;

  beforeAll(async () => {
    // Setup test database (auto-detects CI vs local, starts Testcontainers)
    await setupE2ETestDatabaseJest();

    // Start test server
    server = await startTestServer();

    // Wait for services to initialize (OutboxPoller, etc.)
    await waitForServiceInitialization(server);

    // Create test organization (creates both tenant + org)
    const orgData = await createTestOrganizationWithTenant(server.app);
    tenantId = orgData.tenantId;
    organizationId = orgData.organizationId;
  });

  afterAll(async () => {
    await server?.close();
  });

  it('should perform action', async () => {
    const response = await server.request({
      method: 'GET',
      url: '/users',
      headers: { 'x-tenant-id': tenantId.toString() }
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();
  });
});
```

### Testing Protected Endpoints

```typescript
it('should return 401 without auth', async () => {
  const response = await server.request({
    method: 'GET',
    url: '/protected'
  });

  expect(response.status).toBe(401);
});

it('should return 200 with valid token', async () => {
  const response = await server.request({
    method: 'GET',
    url: '/protected',
    headers: { Authorization: `Bearer ${token}` }
  });

  expect(response.status).toBe(200);
});
```

### Testing Multi-Tenancy

```typescript
it('should isolate data by tenant', async () => {
  // Create two tenants with organizations
  const org1 = await createTestOrganizationWithTenant(server.app);
  const org2 = await createTestOrganizationWithTenant(server.app);

  // Create user in org1
  const user = await createUserFixture(server.app, { organizationId: org1.organizationId });

  // Query from org2 should not find user
  const response = await server.request({
    method: 'GET',
    url: `/users/${user.id}`,
    headers: { 'x-tenant-id': org2.tenantId.toString() }
  });

  expect(response.status).toBe(404);
});
```

## Test Helpers

### Database Helper

```typescript
import {
  setupE2ETestDatabaseJest,
  getE2ETestDb,
  getTestDb,
  createTestOrganizationWithTenant,
  createTestTenant,
  createTestUserTenant,
  cleanupOrganization,
  cleanupTenant
} from './helpers/database';

// Setup database (call in beforeAll)
await setupE2ETestDatabaseJest();

// Get database instance
const { db } = getE2ETestDb();
// or
const testDb = getTestDb();

// Create test organization (creates both tenant + org)
const { tenantId, organizationId } = await createTestOrganizationWithTenant(server.app);

// Create tenant record
const newTenantId = await createTestTenant(server.app, 'organization', 'active');

// Create user-tenant membership
const membershipId = await createTestUserTenant(server.app, userId, tenantId, 'admin', true);

// Clean up organization data
await cleanupOrganization(server.app, organizationId);

// Clean up tenant data
await cleanupTenant(server.app, tenantId);
```

### User Fixture

```typescript
import {
  createUserFixture,
  deleteUserFixture,
  createMultipleUsersFixture
} from './fixtures/user.fixture';

// Create single user (using app for connection pool consistency)
const user = await createUserFixture(server.app, { organizationId });

// Create multiple users
const users = await createMultipleUsersFixture(server.app, organizationId, 10);

// Delete user
await deleteUserFixture(server.app, organizationId, user.id);
```

**Note:** Use the app-based versions (`createUserFixture(server.app, ...)`) for E2E tests to ensure data visibility. The db-based versions (`createUserFixtureWithDb(db, ...)`) may have connection pool issues.

### Auth Helper

```typescript
import { createAuthTestHelper, generateMockToken, mockUsers } from './helpers/auth.helper';

const authHelper = createAuthTestHelper(jwtService);

// Generate tokens
const userToken = authHelper.generateUserToken();
const adminToken = authHelper.generateAdminToken();

// Make authenticated requests
const response = await authHelper.authenticatedGet(server.app, '/users', userToken);

// Use mock users
const token = generateMockToken(jwtService, 'admin');
```

### Bootstrap Helper

```typescript
import { startTestServer, waitForServiceInitialization } from './helpers/bootstrap';

// Start server
const server = await startTestServer();

// Wait for services to initialize (OutboxPoller, etc.)
await waitForServiceInitialization(server);

// Make requests (note: URL doesn't need /api prefix, it's auto-added)
const response = await server.request({
  method: 'POST',
  url: '/users', // becomes /api/users automatically
  headers: { 'x-tenant-id': tenantId.toString() },
  body: { email: 'test@example.com' }
});

// Close server
await server.close();
```

## Common Test Scenarios

### Testing Pagination

```typescript
it('should return paginated results', async () => {
  const response = await server.request({
    method: 'GET',
    url: '/users?page=1&pageSize=10',
    headers: { 'x-tenant-id': tenantId.toString() }
  });

  expect(response.status).toBe(200);
  expect(Array.isArray(response.body.data)).toBe(true);
  expect(response.body.metadata.pagination.page).toBe(1);
  expect(response.body.metadata.pagination.pageSize).toBe(10);
  expect(response.body.metadata.pagination.total).toBeGreaterThanOrEqual(0);
});
```

### Testing Validation

```typescript
it('should reject invalid input', async () => {
  const response = await server.request({
    method: 'POST',
    url: '/users',
    headers: { 'x-tenant-id': tenantId.toString() },
    body: { email: 'not-an-email' }
  });

  expect(response.status).toBe(400);
});
```

### Testing Error Responses

```typescript
it('should return 404 for non-existent resource', async () => {
  const response = await server.request({
    method: 'GET',
    url: '/users/99999',
    headers: { 'x-tenant-id': tenantId.toString() }
  });

  expect(response.status).toBe(404);
  expect(response.body.data.code).toBe('DB_004');
});
```

## Troubleshooting

### "Global test database not found"

**Problem:** Tests fail with error about global database not running.

**Solution:** Start the global database first:

```bash
pnpm test:e2e:setup
```

### Tests Hang or Timeout

**Problem:** Tests hang indefinitely.

**Solution:**

1. Check if database is running: `pnpm test:e2e:status`
2. Restart database: `pnpm test:e2e:teardown && pnpm test:e2e:setup`

### Port Already in Use

**Problem:** Database port is already in use.

**Solution:**

```bash
# Check if global database is already running
pnpm test:e2e:status

# If running, stop it first
pnpm test:e2e:teardown

# Then start fresh
pnpm test:e2e:setup
```

### Tests Pass Locally but Fail in CI

**Problem:** Tests behave differently in CI.

**Solution:**

1. Ensure CI starts global database before tests
2. Use `test:e2e:manual` script for consistent behavior
3. Check CI environment has Docker available

## Best Practices

### DO ✅

1. **Use global database mode** - Start database once, run many tests
2. **Clean up test data** - Delete fixtures after each test
3. **Test isolation** - Each test should be independent
4. **Use descriptive names** - Test names should clearly describe what they test
5. **Test both success and failure** - Cover happy path and error cases

### DON'T ❌

1. **Don't start database per test** - Too slow
2. **Don't share data between tests** - Tests should be independent
3. **Don't use hardcoded IDs** - Use dynamic test data
4. **Don't forget cleanup** - Always clean up fixtures
5. **Don't test implementation details** - Test behavior, not internals

## CI/CD Integration

For CI/CD pipelines, use the following pattern:

```yaml
# Example GitHub Actions
- name: Start test database
  run: pnpm test:e2e:setup

- name: Run E2E tests
  run: pnpm test:e2e

- name: Stop test database
  if: always()
  run: pnpm test:e2e:teardown
```

Or use the one-liner:

```yaml
- name: Run E2E tests
  run: pnpm test:e2e:manual
```

## Additional Resources

- **Jest Documentation**: https://jestjs.io/docs/getting-started
- **Testcontainers Docs**: https://node.testcontainers.org/
- **NestJS Testing**: https://docs.nestjs.com/fundamentals/testing
- **API Documentation**: ../src/AGENTS.md
