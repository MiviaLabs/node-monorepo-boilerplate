/**
 * @package/i18n
 *
 * Lightweight internationalization (i18n) utilities for the Node Monorepo Boilerplate.
 * Provides template-based translation with parameter interpolation.
 *
 * Related packages:
 * - `@package/errors` - Localized error messages
 * - `@package/constants` - Locale identifiers
 *
 * @packageDocumentation
 */

/**
 * Parameters for translation string interpolation.
 *
 * A key-value map where keys are parameter names matching placeholders in translation
 * templates (e.g., `{{name}}`) and values are the data to interpolate.
 *
 * @remarks
 * - Keys correspond to placeholder names in translation strings (without the `{{` `}}` wrapper)
 * - Values of type `string`, `number`, or `boolean` are converted to string and inserted
 * - Values of `null` or `undefined` indicate optional or missing parameters and render as empty string
 *
 * @example
 * ```typescript
 * // Given template: "Hello, {{name}}! You have {{count}} messages."
 * const params: TranslationParams = {
 *   name: 'Alice',
 *   count: 5
 * };
 * t('greeting', params); // "Hello, Alice! You have 5 messages."
 *
 * // Optional param renders as empty string
 * const params2: TranslationParams = { name: null };
 * t('greeting', params2); // "Hello, ! You have  messages."
 * ```
 */
export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Translation storage using null-prototype object for security.
 *
 * Uses `Object.create(null)` to prevent prototype pollution attacks via
 * malicious locale keys like '__proto__', 'constructor', or 'prototype'.
 *
 * @security Defense-in-depth measure against prototype pollution
 * @internal Module-internal storage
 */
const translationStore: Record<string, Record<string, string>> = Object.create(null);

/**
 * Clears all loaded translations from the internal store.
 *
 * Removes all locale entries while preserving the store object identity.
 *
 * @internal For test isolation only. Not part of the stable public API.
 *
 * @example
 * ```typescript
 * // In test setup
 * beforeEach(() => {
 *   clearTranslations();
 * });
 * ```
 */
export function clearTranslations(): void {
  for (const locale of Object.keys(translationStore)) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete translationStore[locale];
  }
}

/**
 * Loads translations for a specific locale.
 *
 * Translations are merged with existing translations for the same locale.
 * Later calls overwrite earlier translations for the same keys.
 * The loaded translations are frozen to prevent accidental mutations.
 *
 * @param locale - Locale identifier (e.g., 'en', 'fr', 'ar-SA')
 * @param translations - Record of translation key-value pairs
 *
 * @security Locale parameter should be validated in production to prevent
 * unexpected keys. Built-in protection via Object.create(null) storage.
 *
 * @remarks
 * **Thread Safety**: In multi-threaded environments (Node.js worker threads),
 * load all translations in the main thread before spawning workers.
 * Translations are frozen after loading to prevent mutations.
 *
 * @example
 * ```typescript
 * loadTranslations('en', {
 *   'greeting.hello': 'Hello, {{name}}!',
 *   'common.yes': 'Yes'
 * });
 * ```
 */
export function loadTranslations(locale: string, translations: Record<string, string>): void {
  translationStore[locale] = Object.freeze({
    ...(translationStore[locale] ?? {}),
    ...translations
  });
}

/**
 * Translates a key with optional parameter interpolation.
 *
 * Implements a fallback chain for missing translations:
 * 1. Requested locale translation
 * 2. English ('en') translation (if locale !== 'en')
 * 3. Raw key as fallback
 *
 * @param key - Translation key (e.g., 'greeting.hello')
 * @param params - Optional parameters for `{{placeholder}}` interpolation
 * @param locale - Target locale (defaults to 'en'). Empty string treated as 'en'.
 * @returns Translated string with interpolated parameters
 *
 * @example
 * ```typescript
 * t('greeting.hello', { name: 'Alice' }, 'fr')
 * // Returns French translation if available, else English, else 'greeting.hello'
 * ```
 */
export function t(key: string, params?: TranslationParams, locale = 'en'): string {
  // Normalize empty locale to 'en'
  const normalizedLocale = locale || 'en';

  // Fallback chain: requested locale → 'en' → raw key
  const template =
    translationStore[normalizedLocale]?.[key] ??
    (normalizedLocale !== 'en' ? translationStore['en']?.[key] : undefined) ??
    key;

  if (!params) {
    return template;
  }

  return Object.entries(params).reduce((value, [paramKey, paramValue]) => {
    // Escape $-tokens in the replacement string. JavaScript's
    // String.replaceAll interprets `$&`, `` $` ``, `$'`, `$$`, and `$1`-`$9`
    // as special tokens in the replacement; without escaping, a parameter
    // value containing `$&` would leak the matched substring, `$$` would
    // collapse to `$`, and `` $` `` / `$'` would leak the before/after-match
    // context into the output. Standard idiom: replace `$` with `$$$$`.
    return value.replaceAll(`{{${paramKey}}}`, String(paramValue ?? '').replace(/\$/g, '$$$$'));
  }, template);
}

export function useTranslation(locale = 'en'): {
  t: (key: string, params?: TranslationParams) => string;
  locale: string;
} {
  return {
    t: (key: string, params?: TranslationParams): string => t(key, params, locale),
    locale
  };
}

export const i18n = { t, useTranslation, loadTranslations };

/**
 * **INTERNAL USE ONLY - DO NOT USE IN PRODUCTION CODE**
 *
 * Test-only export for verifying Object.freeze() immutability behavior.
 * This exposes the internal translation store for testing purposes.
 *
 * **WARNING**: This is NOT part of the stable public API and may be removed
 * or changed without notice. Consumer code should NEVER import this.
 *
 * @internal For unit tests only
 * @deprecated Use clearTranslations() for test isolation instead
 */
export { translationStore as __translationStore };
