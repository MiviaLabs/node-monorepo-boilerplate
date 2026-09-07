/**
 * Event versioning module
 *
 * This module provides functionality for event schema versioning and
 * compatibility management. It enables producers and consumers to handle
 * different schema versions of events, supporting backward compatibility
 * and graceful schema evolution.
 *
 * @module versioning
 *
 * @example
 * ```typescript
 * import {
 *   VersionCompatibilityChecker,
 *   DEFAULT_COMPATIBILITY_MATRIX,
 *   EventVersioningConfig,
 *   DEFAULT_VERSIONING_CONFIG,
 *   EventVersioningService,
 *   HandleVersion,
 * } from '@package/events';
 *
 * // Check compatibility
 * const checker = new VersionCompatibilityChecker();
 * const isCompatible = checker.isCompatible('user.created', '1.1', '1.0');
 *
 * // Validate consumer
 * const result = checker.validateConsumer('user.created', ['1.0'], '1.1');
 *
 * // Get compatible versions
 * const versions = checker.getCompatibleVersions('user.created', '1.1');
 *
 * // Register schemas and migrations
 * const versioningService = new EventVersioningService();
 * versioningService.registerSchema('user.created', {
 *   version: '1.0',
 *   schema: userCreatedV1Schema,
 * });
 * ```
 */

// ====================================================================
// Types
// ====================================================================
export * from './event-versioning.types';

// ====================================================================
// Validation
// ====================================================================
export * from './version-validation';

// ====================================================================
// Configuration
// ====================================================================
export * from './versioning.config';

// ====================================================================
// Services
// ====================================================================
export * from './event-versioning.service';
export * from './consumer-version-handler';
