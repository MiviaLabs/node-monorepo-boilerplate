/**
 * @package/core
 *
 * Core infrastructure package providing shared utilities and base classes
 * for all infrastructure packages.
 *
 * Features:
 * - Standardized error classes
 * - OpenTelemetry tracing and metrics utilities
 * - Mock provider base class for testing
 * - {@link Instrumented} decorator for automatic tracing
 * - Common constants and configuration
 *
 * Related packages:
 * - `@package/observability` - Full observability stack
 * - `@package/errors` - Application-level error handling
 * - `@package/constants` - Shared constant values
 *
 * @packageDocumentation
 */

// ====================================================================
// Errors
// ====================================================================
export * from './errors';

// ====================================================================
// OpenTelemetry
// ====================================================================
export * from './opentelemetry';

// ====================================================================
// Testing
// ====================================================================
export * from './testing';

// ====================================================================
// Decorators
// ====================================================================
export * from './decorators';

// ====================================================================
// Constants
// ====================================================================
export * from './constants';

// ====================================================================
// Configuration
// ====================================================================
export * from './config';
