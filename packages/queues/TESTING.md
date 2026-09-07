# Running Tests - Queues Package

This guide details testing strategies, runner considerations, and best practices for the `@package/queues` package.

## Test Execution

Includes fast in-memory unit tests and full integration tests against running broker/store instances (BullMQ/Redis, Google Cloud Tasks, Pub/Sub).

### Unit Tests

Run tests:

```bash
pnpm nx test queues
```

### Module and Decorator Tests

When testing NestJS modules that use parameter decorators (such as `@Optional()`), execute tests using a runner with parameter decorator support:

```bash
# Using Jest with ts-jest
npx jest packages/queues/src/__tests__/queues.module.unit.test.ts

# Or compile and execute via Node test runner
pnpm nx build queues && node --experimental-loader ts-node/esm node --test packages/queues/src/__tests__/queues.module.unit.test.ts
```

### Integration Tests

Integration tests verify actual queue and worker behavior against live Redis and Google Cloud instances:

```bash
INCLUDE_INTEGRATION_TESTS=1 pnpm nx test queues
```

Ensure the backing service dependencies (`REDIS_HOST`, `PUBSUB_PROJECT_ID`, or Cloud Tasks credentials) are configured in the test environment before executing integration tests.

## Best Practices

1. **Mock Providers for Isolated Unit Tests**: Use mocked queue adapters to isolate business logic from network and storage latencies.
2. **Worker Isolation**: In integration tests, assign unique queue names (e.g., suffixed with a UUID or timestamp) to prevent cross-test job collisions.
3. **Graceful Teardown**: Always call `closeAllQueues()` and `closeAllWorkers()` in `afterEach` or `afterAll` hooks to prevent open handle leaks.
