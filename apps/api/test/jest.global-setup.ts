/**
 * Jest Global Setup/Teardown for E2E Tests
 *
 * Handles cleanup of Testcontainers after all tests complete.
 * This is specifically for CI environments where Testcontainers
 * is started directly in the test process.
 *
 * @packageDocumentation
 */

// CRITICAL: Set environment variables BEFORE any imports
// This must be at the top level to execute before module imports
process.env['TEST_MODE'] = 'true';
process.env['NODE_ENV'] = 'test';
process.env['EVENTS_ENABLED'] = 'false';
process.env['REDIS_ENABLED'] = 'false';
process.env['THROTTLE_ENABLED'] = 'false';
process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = '';
process.env['SERVICE_NAME'] = 'api-test';
process.env['SERVICE_VERSION'] = '1.0.0-test';

export default async function globalTeardown(): Promise<void> {
  // Run cleanup if registered (CI mode)
  if (globalThis.__E2E_TEST_CLEANUP__) {
    // eslint-disable-next-line no-console
    console.log('[E2E] Running global cleanup - stopping Testcontainers...');
    try {
      await globalThis.__E2E_TEST_CLEANUP__();
      // eslint-disable-next-line no-console
      console.log('[E2E] Testcontainers stopped');
    } catch (error) {
      // Log cleanup errors but don't fail the teardown
      // eslint-disable-next-line no-console
      console.error('[E2E] Error during cleanup:', error);
    }
  }
  // eslint-disable-next-line no-console
  console.log('[E2E] Global teardown complete');
}
