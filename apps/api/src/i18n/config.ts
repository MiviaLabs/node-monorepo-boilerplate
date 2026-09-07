/**
 * App Translation Configuration
 *
 * Configures app-specific translations that extend the error registry.
 * This file loads all translations from module-based JSON files.
 *
 * New structure:
 * locales/
 *   [locale]/
 *     [module].json
 *
 * Example:
 * locales/
 *   en/
 *     health.json
 *     tenant.json
 *     api-codes.json
 *   ar-SA/
 *     health.json
 *     tenant.json
 *     api-codes.json
 */

import { TranslationService } from '@package/errors';

import { discoverLocales, loadAllTranslations } from './locale-loader';

import type { ErrorTranslations, Locale } from '@package/errors';

/**
 * App translation configuration
 *
 * Dynamically loaded from module-based JSON files.
 * Add new locales by creating a new directory in locales/.
 */
export const appTranslationsConfig: Record<Locale, ErrorTranslations> = loadAllTranslations();

/**
 * Get all available locales.
 *
 * Discovers locales from the locales directory.
 *
 * @returns Array of locale codes (e.g., ['en', 'ar-SA'])
 */
export function getAvailableLocales(): Locale[] {
  return discoverLocales();
}

/**
 * Initialize app translations.
 *
 * Call this during application startup to merge all app-specific
 * translations with the base translations from TranslationService.
 *
 * This should be called AFTER TranslationService.initialize() but BEFORE
 * any translations are needed.
 *
 * Uses mergeAppTranslations() for efficient batch merging instead of
 * individual addTranslations() calls.
 *
 * @returns void
 *
 * @example
 * ```ts
 * import { ErrorI18nModule } from './common/i18n';
 * import { initializeAppTranslations } from './i18n/config';
 *
 * @Module({
 *   imports: [ErrorI18nModule],
 * })
 * export class AppModule implements OnModuleInit {
 *   onModuleInit() {
 *     initializeAppTranslations();
 *   }
 * }
 * ```
 */
export function initializeAppTranslations(): void {
  // Merge all app translations at once (more efficient than individual calls)
  TranslationService.mergeAppTranslations(appTranslationsConfig);
}
