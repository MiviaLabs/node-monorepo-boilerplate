/**
 * Legacy seed entry point
 *
 * This file now delegates to the new seed data system.
 * For advanced usage, use the seed-runner directly.
 *
 * @see packages/db-core/src/seed/index.ts
 */

// Re-export the new seed system for backward compatibility
export * from './seed';
