/**
 * Event schema module
 *
 * Provides schema registry, validation integration, and auto-registration
 * for event schemas. This module enables runtime schema validation and
 * maintains a catalog of all event schemas with metadata.
 *
 * @module schema
 */

// ====================================================================
// Services
// ====================================================================
export * from './event-registry.service';

// ====================================================================
// Auto-registration
// ====================================================================
export * from './event-auto-register';
