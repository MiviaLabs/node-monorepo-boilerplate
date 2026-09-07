/**
 * Jest setup file for API tests
 *
 * This file runs after the test framework is installed but before tests run.
 * Use it for global cleanup to prevent hanging tests.
 */

import { closeAllRedisClients } from '@package/redis';

// Close all Redis connections after all tests complete
afterAll(async () => {
  await closeAllRedisClients();
});
