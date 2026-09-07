/**
 * Jest Environment Setup for test-utils package
 *
 * Sets environment variables BEFORE modules are loaded.
 */

process.env['TEST_MODE'] = 'true';
process.env['NODE_ENV'] = 'test';
