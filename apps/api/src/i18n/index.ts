/**
 * App i18n Exports
 *
 * Re-exports from common/i18n for convenience.
 * Also exports app-specific translation configuration.
 */

// Re-export common i18n
export * from '../common/i18n';

// Export app translation configuration
export { initializeAppTranslations, appTranslationsConfig } from './config';

// Export message types (for type checking)
export type { ErrorTranslations } from '@package/errors';
