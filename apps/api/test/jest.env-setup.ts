/**
 * Jest Environment Setup
 *
 * CRITICAL: This file runs BEFORE any modules are loaded (via setupFiles).
 * It sets environment variables that affect module initialization.
 *
 * Must be in setupFiles, NOT setupFilesAfterEnv, to ensure env vars
 * are set before module imports evaluate.
 */

// Set test mode environment variables
process.env['TEST_MODE'] = 'true';
process.env['NODE_ENV'] = 'test';

// Disable infrastructure that shouldn't be used in unit tests
process.env['EVENTS_ENABLED'] = 'false';
process.env['REDIS_ENABLED'] = 'false';
process.env['THROTTLE_ENABLED'] = 'false';
process.env['OPA_ENABLED'] = 'false';
process.env['OPA_ENFORCEMENT_MODE'] = 'off';

// Disable OpenTelemetry in tests
process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = '';

// Test service metadata
process.env['SERVICE_NAME'] = 'api-test';
process.env['SERVICE_VERSION'] = '1.0.0-test';
