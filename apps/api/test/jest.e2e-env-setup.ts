/**
 * Jest E2E Environment Setup
 *
 * Runs before E2E test modules are loaded.
 */

process.env['TEST_MODE'] = 'true';
process.env['NODE_ENV'] = 'test';
