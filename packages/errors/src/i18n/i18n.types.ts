/**
 * i18n type definitions for error translations
 *
 * This module defines the types and interfaces used for
 * internationalizing error messages across multiple locales.
 *
 * LOCALE DISCOVERY:
 * Locale files are discovered dynamically from the locales/ directory.
 * To add a new language:
 * 1. Create a new file in locales/ (e.g., fr.ts)
 * 2. Export the translations as default or named export
 * 3. Add a case to the switch statement in locale-loader.ts loadLocaleModule()
 *
 * Note: Step 3 is required because webpack bundling requires explicit import paths.
 */

/**
 * Supported locale codes
 *
 * This is a string type (not a union) to allow dynamic locales.
 * Type safety is maintained at runtime through validation.
 *
 * To add type safety for specific locales at compile time,
 * you can use string literals:
 *
 * @example
 * ```ts
 * import { Locale } from '@package/errors';
 *
 * const locale: Locale = 'ar-SA'; // Type checks
 * const locale: Locale = 'fr'; // Also works if fr.ts exists
 * ```
 */
export type Locale = string;

/**
 * Default locale to use as fallback
 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * All supported locales as an array
 *
 * This is now dynamically populated at runtime from discovered locales.
 * The array below is the initial value before discovery.
 *
 * @deprecated Use TranslationService.getAvailableLocales() instead
 */
export const SUPPORTED_LOCALES: Locale[] = ['en', 'ar-SA'];

/**
 * Translation map for error messages
 *
 * Maps error codes to their translated messages.
 * Each message template can contain placeholders like {userId}.
 *
 * @example
 * ```ts
 * const translations: ErrorTranslations = {
 *   'USER_001': 'User with ID {userId} not found',
 *   'AUTH_001': 'Invalid email or password',
 * };
 * ```
 */
export type ErrorTranslations = Readonly<Record<string, string>>;

/**
 * Complete locale translations map
 *
 * Maps each locale to its complete set of error translations.
 *
 * @example
 * ```ts
 * const allTranslations: LocaleTranslations = {
 *   en: { 'USER_001': 'User not found', ... },
 *   zh: { 'USER_001': '未找到用户', ... },
 *   es: { 'USER_001': 'Usuario no encontrado', ... },
 * };
 * ```
 */
export type LocaleTranslations = Readonly<Record<Locale, ErrorTranslations>>;

/**
 * Translation options
 */
export interface TranslationOptions {
  /**
   * The locale to translate to
   * If not provided, uses DEFAULT_LOCALE
   */
  locale?: Locale;

  /**
   * Whether to use fallback chain if translation is missing
   * Default: true
   */
  useFallback?: boolean;

  /**
   * Custom fallback locale to use before default
   * If not provided, falls back to DEFAULT_LOCALE
   */
  fallbackLocale?: Locale;
}

/**
 * Translation result with metadata
 */
export interface TranslationResult {
  /** The translated message with parameters interpolated */
  message: string;

  /** The locale that was used for translation */
  locale: Locale;

  /** Whether a fallback was used */
  usedFallback: boolean;

  /** The original error code */
  code: string;
}

/**
 * Translation validation result
 */
export interface TranslationValidationResult {
  /** Whether all translations are valid */
  valid: boolean;

  /** Missing translations by locale */
  missing: Readonly<Record<Locale, string[]>>;

  /** Extra translations (not in registry) by locale */
  extra: Readonly<Record<Locale, string[]>>;

  /** Total number of error codes in registry */
  totalCodes: number;
}
