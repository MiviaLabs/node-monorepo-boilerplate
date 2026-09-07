/**
 * Error Registry Module
 *
 * Central registry of all error definitions used in the application.
 * Provides type-safe error codes and their associated metadata.
 *
 * @packageDocumentation
 */

// Export all types
export * from './error-registry.types';

// Export ERROR_REGISTRY and helper functions
export {
  ERROR_REGISTRY,
  getErrorDefinition,
  isErrorCode,
  getErrorCodesByType,
  validateErrorParameters,
  type ErrorCode
} from './definitions/index';
export {
  USER_ERRORS,
  AUTH_ERRORS,
  VALIDATION_ERRORS,
  DATABASE_ERRORS,
  BUSINESS_ERRORS,
  EXTERNAL_ERRORS,
  FILE_ERRORS,
  SYSTEM_ERRORS
} from './definitions/index';
