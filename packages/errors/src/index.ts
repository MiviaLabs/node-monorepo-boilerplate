/**
 * @package/errors
 *
 * Framework-agnostic error handling package with centralized registry,
 * type-safe factory methods, and i18n support.
 *
 * Related packages:
 * - `@package/constants` - ErrorCode and ErrorType constants
 * - `@package/core` - Infrastructure error classes
 * - `@package/schema` - Validation error handling
 * - `@package/observability` - Error logging integration
 *
 * @packageDocumentation
 */

/**
 * Core registry and types.
 * {@link ErrorRegistry} - Centralized error code registry
 *
 * See also: `@package/constants` for ERROR_CODES constant
 */
export * from './registry/error-registry';

/**
 * i18n support.
 * {@link TranslationService} - Error message translation
 * {@link LocaleContext} - Request-scoped locale context
 */
export * from './i18n/i18n.types';
export { TranslationService } from './i18n/translation.service';
export { LocaleContext } from './i18n/locale-context';

/**
 * Exception classes.
 * {@link RegisteredError} - Base registered error class
 * {@link Errors} - Type-safe error factory methods
 *
 * See also: `@package/core` for InfrastructureError hierarchy
 */
export * from './exceptions';

/**
 * Error data types for unified responses.
 * {@link ErrorData} - Unified error response format
 *
 * See also: `@package/types` for IApiError interface
 */
export * from './types/error-data.types';

/**
 * Re-export ERROR_REGISTRY and ErrorCode type for convenience.
 * Note: These are also available via the './registry/error-registry' export.
 */
