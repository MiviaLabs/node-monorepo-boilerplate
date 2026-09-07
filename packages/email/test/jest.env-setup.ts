/**
 * Jest Environment Setup
 *
 * Sets TEST_MODE=true before any modules are loaded.
 * This prevents infrastructure from initializing real connections.
 */

process.env['TEST_MODE'] = 'true';
