/**
 * Jest Environment Setup for encryption package
 *
 * Sets environment variables BEFORE modules are loaded.
 */

process.env['TEST_MODE'] = 'true';
process.env['NODE_ENV'] = 'test';
