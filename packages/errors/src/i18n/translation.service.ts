/**
 * Translation Service
 *
 * Provides translation functionality for error messages with
 * fallback chain support and dynamic locale discovery.
 *
 * DYNAMIC LOCALE LOADING:
 * This service automatically discovers and loads locale files
 * from the locales/ directory. New languages can be added
 * by creating a new locale file and adding a switch case
 * in locale-loader.ts (required for webpack bundling).
 *
 * @packageDocumentation
 */

import { DEFAULT_LOCALE } from './i18n.types';
import { getLocaleLoader } from './locale-loader';
import { getErrorDefinition } from '../registry/definitions';
import { deepFreeze } from '../utils/deep-freeze';

import type {
  Locale,
  ErrorTranslations,
  TranslationOptions,
  TranslationResult,
  TranslationValidationResult
} from './i18n.types';
import type { ErrorParameters, ErrorCode } from '../registry/error-registry.types';

/**
 * Regex pattern cache for interpolation
 * Caches compiled regex patterns to avoid recreating them on every call
 */
const regexCache = new Map<string, RegExp>();

/**
 * Initialize translations promise
 * This is populated asynchronously when the service is first accessed
 */
let translationsPromise: Promise<Record<string, ErrorTranslations>> | null = null;

/**
 * Cached translations once loaded
 */
let cachedTranslations: Record<string, ErrorTranslations> | null = null;

/**
 * Cached locale codes once discovered
 */
let cachedLocales: readonly Locale[] | null = null;

/**
 * Initialize locale codes promise
 * Prevents duplicate loading when called concurrently
 */
let localeCodesPromise: Promise<readonly Locale[]> | null = null;

/**
 * Load all translations dynamically
 *
 * @internal
 */
async function loadTranslations(): Promise<Record<string, ErrorTranslations>> {
  if (cachedTranslations) {
    return cachedTranslations;
  }

  if (!translationsPromise) {
    translationsPromise = getLocaleLoader(DEFAULT_LOCALE).loadAllLocales();
  }

  cachedTranslations = await translationsPromise;
  return cachedTranslations;
}

/**
 * Load locale codes dynamically
 *
 * @internal
 */
async function loadLocaleCodes(): Promise<readonly Locale[]> {
  if (cachedLocales) {
    return cachedLocales;
  }

  if (!localeCodesPromise) {
    localeCodesPromise = getLocaleLoader(DEFAULT_LOCALE)
      .getAvailableLocaleCodes()
      .catch((error) => {
        localeCodesPromise = null; // Reset on failure
        throw error;
      });
  }

  const codes = await localeCodesPromise;
  cachedLocales = Object.freeze(codes);
  return cachedLocales;
}

/**
 * Translation Service Class
 *
 * Handles error message translation with locale fallback support.
 * Supports both synchronous and asynchronous operations.
 *
 * @example
 * ```ts
 * // Initialize during app startup
 * await TranslationService.initialize();
 *
 * // Async usage (recommended for dynamic locales)
 * const message = await TranslationService.translateAsync('USER_001', { userId: '123' }, 'ar-SA');
 *
 * // Sync usage (after initialization)
 * const message = TranslationService.translate('USER_001', { userId: '123' }, 'en');
 * ```
 */
export class TranslationService {
  /**
   * Default locale
   */
  public static readonly defaultLocale: Locale = DEFAULT_LOCALE;

  /**
   * All loaded translations (immutable, cached)
   *
   * This is populated asynchronously on first access.
   */
  private static _translations: Record<string, ErrorTranslations> | null = null;

  /**
   * Initialize the translation service
   *
   * Loads all locale translations. Call this during application startup.
   *
   * @example
   * ```ts
   * // In main.ts or app.module.ts
   * await TranslationService.initialize();
   * ```
   */
  public static async initialize(): Promise<void> {
    if (!this._translations) {
      const translations = await loadTranslations();
      this._translations = deepFreeze(translations);
    }
    // Also load locale codes so sync methods like isLocaleSupported() work
    if (!cachedLocales) {
      await loadLocaleCodes();
    }
  }

  /**
   * Ensure translations are loaded
   *
   * @internal
   */
  private static async ensureInitialized(): Promise<void> {
    if (!this._translations) {
      await this.initialize();
    }
  }

  /**
   * Get all translations (loads dynamically if needed)
   *
   * @returns Translation map for all locales
   *
   * @example
   * ```ts
   * const translations = await TranslationService.getAllTranslations();
   * console.log(translations['en']['USER_001']); // "User with ID {userId} not found"
   * ```
   */
  public static async getAllTranslations(): Promise<Record<string, ErrorTranslations>> {
    await this.ensureInitialized();
    return this._translations ?? {};
  }

  /**
   * Get translations for a specific locale (async)
   *
   * @param locale - Locale code
   * @returns Translation map for the locale
   *
   * @example
   * ```ts
   * const arSATranslations = await TranslationService.getTranslationsAsync('ar-SA');
   * console.log(arSATranslations['USER_001']); // "المستخدم بالمعرف {userId} غير موجود"
   * ```
   */
  public static async getTranslationsAsync(locale: Locale): Promise<ErrorTranslations> {
    const allTranslations = await this.getAllTranslations();
    const translations = allTranslations[locale];
    if (translations !== undefined) {
      return translations;
    }
    const defaultTranslations = allTranslations[this.defaultLocale];
    if (defaultTranslations !== undefined) {
      return defaultTranslations;
    }
    // Fallback to empty translations object
    return {};
  }

  /**
   * Get translations for a specific locale (sync, requires initialization)
   *
   * @param locale - Locale code
   * @returns Translation map for the locale
   * @throws Error if translations not loaded
   *
   * @example
   * ```ts
   * // First, ensure translations are loaded
   * await TranslationService.initialize();
   *
   * // Then use sync version
   * const enTranslations = TranslationService.getTranslations('en');
   * ```
   */
  public static getTranslations(locale: Locale): ErrorTranslations {
    if (!this._translations) {
      throw new Error(
        'TranslationService not initialized. Call await TranslationService.initialize() first.'
      );
    }
    const translations = this._translations[locale];
    if (translations !== undefined) {
      return translations;
    }
    const defaultTranslations = this._translations[this.defaultLocale];
    if (defaultTranslations !== undefined) {
      return defaultTranslations;
    }
    // Fallback to empty translations object
    return {};
  }

  /**
   * Supported locales (dynamically discovered)
   *
   * @returns Array of locale codes
   *
   * @example
   * ```ts
   * const locales = await TranslationService.getAvailableLocales();
   * console.log(locales); // ['en', 'ar-SA', 'tl-PH', ...]
   * ```
   */
  public static async getAvailableLocales(): Promise<readonly Locale[]> {
    return loadLocaleCodes();
  }

  /**
   * Check if a locale is supported (async)
   *
   * @param locale - Locale code to check
   * @returns True if locale is supported
   *
   * @example
   * ```ts
   * if (await TranslationService.isLocaleSupportedAsync('ar-SA')) {
   *   // Use Arabic translations
   * }
   * ```
   */
  public static async isLocaleSupportedAsync(locale: string): Promise<boolean> {
    const locales = await this.getAvailableLocales();
    return locales.includes(locale as Locale);
  }

  /**
   * Check if a locale is supported (sync, requires initialization)
   *
   * @param locale - Locale code to check
   * @returns True if locale is supported
   *
   * @example
   * ```ts
   * if (TranslationService.isLocaleSupported('ar-SA')) {
   *   // Use Arabic translations
   * }
   * ```
   */
  public static isLocaleSupported(locale: string): boolean {
    if (!cachedLocales) {
      throw new Error('Locales not loaded. Call await TranslationService.initialize() first.');
    }
    return cachedLocales.includes(locale as Locale);
  }

  /**
   * Translate an error message (async)
   *
   * Uses fallback chain: requested locale -> fallback locale -> default locale
   *
   * @param code - Error code
   * @param parameters - Parameters for message interpolation
   * @param options - Translation options
   * @returns Translation result with metadata
   *
   * @example
   * ```ts
   * const result = await TranslationService.translateAsync(
   *   'USER_001',
   *   { userId: '123' },
   *   { locale: 'ar-SA' }
   * );
   * // Returns: { message: "المستخدم بالمعرف 123 غير موجود", locale: 'ar-SA', usedFallback: false, code: 'USER_001' }
   * ```
   */
  public static async translateAsync(
    code: ErrorCode,
    parameters: ErrorParameters = {},
    options: TranslationOptions = {}
  ): Promise<TranslationResult> {
    await this.ensureInitialized();

    const {
      locale = this.defaultLocale,
      useFallback = true,
      fallbackLocale = this.defaultLocale
    } = options;

    // Normalize locale
    let normalizedLocale: Locale;
    const locales = cachedLocales || [];

    if (locales.includes(locale)) {
      normalizedLocale = locale;
    } else if (fallbackLocale !== this.defaultLocale && locales.includes(fallbackLocale)) {
      normalizedLocale = fallbackLocale;
    } else {
      normalizedLocale = this.defaultLocale;
    }

    // Try to get translation for requested locale
    let translation = this.getTranslation(code, normalizedLocale);
    let usedFallback = normalizedLocale !== locale;
    let actualLocale = normalizedLocale;

    // If not found and fallback is enabled, try fallback chain
    if (!translation && useFallback) {
      if (fallbackLocale !== normalizedLocale && locales.includes(fallbackLocale)) {
        translation = this.getTranslation(code, fallbackLocale);
        if (translation) {
          actualLocale = fallbackLocale;
          usedFallback = true;
        }
      }

      if (!translation && fallbackLocale !== this.defaultLocale) {
        translation = this.getTranslation(code, this.defaultLocale);
        if (translation) {
          actualLocale = this.defaultLocale;
          usedFallback = true;
        }
      }
    }

    // If still no translation, get from error registry definition
    if (!translation) {
      const definition = getErrorDefinition(code);
      translation = definition?.message || `Error code ${code}`;
      actualLocale = this.defaultLocale;
      usedFallback = true;
    }

    // Interpolate parameters
    const message = this.interpolateMessage(translation, parameters);

    return {
      message,
      locale: actualLocale,
      usedFallback,
      code
    };
  }

  /**
   * Translate an error message (sync, requires initialization)
   *
   * Uses fallback chain: requested locale -> fallback locale -> default locale
   *
   * @param code - Error code
   * @param parameters - Parameters for message interpolation
   * @param options - Translation options
   * @returns Translation result with metadata
   *
   * @example
   * ```ts
   * const result = TranslationService.translate(
   *   'USER_001',
   *   { userId: '123' },
   *   { locale: 'ar-SA' }
   * );
   * // Returns: { message: "المستخدم بالمعرف 123 غير موجود", locale: 'ar-SA', usedFallback: false, code: 'USER_001' }
   * ```
   */
  public static translate(
    code: ErrorCode,
    parameters: ErrorParameters = {},
    options: TranslationOptions = {}
  ): TranslationResult {
    if (!this._translations) {
      throw new Error(
        'TranslationService not initialized. Call await TranslationService.initialize() first.'
      );
    }

    const {
      locale = this.defaultLocale,
      useFallback = true,
      fallbackLocale = this.defaultLocale
    } = options;

    // Normalize locale
    const normalizedLocale = this.normalizeLocale(locale, fallbackLocale);
    const locales = cachedLocales || [];

    // Try to get translation with fallback chain
    const { translation, actualLocale, usedFallback } = this.getTranslationWithFallback(
      code,
      locale,
      normalizedLocale,
      fallbackLocale,
      useFallback,
      locales
    );

    // Interpolate parameters
    const message = this.interpolateMessage(translation, parameters);

    return {
      message,
      locale: actualLocale,
      usedFallback,
      code
    };
  }

  /**
   * Normalize locale to a supported locale code
   *
   * @param locale - Requested locale
   * @param fallbackLocale - Fallback locale
   * @returns Normalized locale code
   *
   * @private
   */
  private static normalizeLocale(locale: Locale, fallbackLocale: Locale): Locale {
    const locales = cachedLocales || [];

    if (locales.includes(locale)) {
      return locale;
    }

    if (fallbackLocale !== this.defaultLocale && locales.includes(fallbackLocale)) {
      return fallbackLocale;
    }

    return this.defaultLocale;
  }

  /**
   * Get translation with fallback chain
   *
   * @param code - Error code
   * @param locale - Requested locale
   * @param normalizedLocale - Normalized locale
   * @param fallbackLocale - Fallback locale
   * @param useFallback - Whether to use fallback chain
   * @param locales - Available locales
   * @returns Translation result with metadata
   *
   * @private
   */
  private static getTranslationWithFallback(
    code: ErrorCode,
    locale: Locale,
    normalizedLocale: Locale,
    fallbackLocale: Locale,
    useFallback: boolean,
    locales: readonly Locale[]
  ): { translation: string; actualLocale: Locale; usedFallback: boolean } {
    // Try normalized locale first
    let translation = this.getTranslation(code, normalizedLocale);
    let usedFallback = normalizedLocale !== locale;
    let actualLocale = normalizedLocale;

    // If not found and fallback is enabled, try fallback chain
    if (!translation && useFallback) {
      if (fallbackLocale !== normalizedLocale && locales.includes(fallbackLocale)) {
        translation = this.getTranslation(code, fallbackLocale);
        if (translation) {
          actualLocale = fallbackLocale;
          usedFallback = true;
        }
      }

      if (!translation && fallbackLocale !== this.defaultLocale) {
        translation = this.getTranslation(code, this.defaultLocale);
        if (translation) {
          actualLocale = this.defaultLocale;
          usedFallback = true;
        }
      }
    }

    // If still no translation, get from error registry definition
    if (!translation) {
      const definition = getErrorDefinition(code);
      translation = definition?.message || `Error code ${code}`;
      actualLocale = this.defaultLocale;
      usedFallback = true;
    }

    return { translation, actualLocale, usedFallback };
  }

  /**
   * Get translation template for an error code
   *
   * @param code - Error code
   * @param locale - Locale code
   * @returns Translation template or undefined if not found
   *
   * @example
   * ```ts
   * const template = TranslationService.getTranslation('USER_001', 'tl-PH');
   * // Returns: "Hindi nakita ang user na may ID {userId}"
   * ```
   */
  public static getTranslation(code: string, locale: Locale): string | undefined {
    if (!this._translations) {
      throw new Error(
        'TranslationService not initialized. Call await TranslationService.initialize() first.'
      );
    }
    const translations = this._translations[locale];
    return translations?.[code];
  }

  /**
   * Interpolate parameters into a message template
   *
   * @param template - Message template with {param} placeholders
   * @param parameters - Parameter values to insert
   * @returns Interpolated message
   *
   * @example
   * ```ts
   * const message = TranslationService.interpolateMessage(
   *   'User {name} has {count} items',
   *   { name: 'John', count: 5 }
   * );
   * // Returns: "User John has 5 items"
   * ```
   */
  public static interpolateMessage(template: string, parameters: ErrorParameters): string {
    let message = template;

    for (const [key, value] of Object.entries(parameters)) {
      // Skip undefined values - leave the placeholder in place rather than
      // substituting the literal string "undefined".
      if (value === undefined) {
        continue;
      }
      const placeholder = `{${key}}`;

      // Get or create cached regex for this placeholder
      let regex = regexCache.get(placeholder);
      if (!regex) {
        regex = new RegExp(placeholder, 'g');
        regexCache.set(placeholder, regex);
      }

      // Escape `$` in the replacement value so the `replace` second-argument
      // special patterns (`$&`, `$'`, `` $` ``, `$$`, `$1`-`$9`) are not
      // expanded against the matched text.
      message = message.replace(regex, String(value).replace(/\$/g, '$$$$'));
    }

    return message;
  }

  /**
   * Validate all translations against the error registry (async)
   *
   * Checks that:
   * - All error codes have translations in all locales
   * - No extra translations exist (codes not in registry)
   *
   * @param registryCodes - All error codes in the registry
   * @returns Validation result
   *
   * @example
   * ```ts
   * const result = await TranslationService.validateTranslationsAsync(
   *   Object.keys(ERROR_REGISTRY)
   * );
   * if (!result.valid) {
   *   console.error('Missing translations:', result.missing);
   * }
   * ```
   */
  public static async validateTranslationsAsync(
    registryCodes: readonly string[]
  ): Promise<TranslationValidationResult> {
    await this.ensureInitialized();

    const locales = await this.getAvailableLocales();
    const missing: Record<string, string[]> = {};
    const extra: Record<string, string[]> = {};

    for (const locale of locales) {
      const translations = this._translations?.[locale];
      const translationCodes = Object.keys(translations || {});

      // Check for missing translations
      const missingCodes = registryCodes.filter((code) => !translationCodes.includes(code));
      if (missingCodes.length > 0) {
        missing[locale] = missingCodes;
      }

      // Check for extra translations
      const extraCodes = translationCodes.filter((code) => !registryCodes.includes(code));
      if (extraCodes.length > 0) {
        extra[locale] = extraCodes;
      }
    }

    return {
      valid: Object.keys(missing).length === 0 && Object.keys(extra).length === 0,
      missing: deepFreeze(missing) as Readonly<Record<Locale, string[]>>,
      extra: deepFreeze(extra) as Readonly<Record<Locale, string[]>>,
      totalCodes: registryCodes.length
    };
  }

  /**
   * Validate all translations against the error registry (sync)
   *
   * Checks that:
   * - All error codes have translations in all locales
   * - No extra translations exist (codes not in registry)
   *
   * @param registryCodes - All error codes in the registry
   * @returns Validation result
   *
   * @example
   * ```ts
   * const result = TranslationService.validateTranslations(
   *   Object.keys(ERROR_REGISTRY)
   * );
   * if (!result.valid) {
   *   console.error('Missing translations:', result.missing);
   * }
   * ```
   */
  public static validateTranslations(
    registryCodes: readonly string[]
  ): TranslationValidationResult {
    if (!this._translations || !cachedLocales) {
      throw new Error(
        'TranslationService not initialized. Call await TranslationService.initialize() first.'
      );
    }

    const missing: Record<string, string[]> = {};
    const extra: Record<string, string[]> = {};

    for (const locale of cachedLocales) {
      const translations = this._translations[locale];
      const translationCodes = Object.keys(translations || {});

      // Check for missing translations
      const missingCodes = registryCodes.filter((code) => !translationCodes.includes(code));
      if (missingCodes.length > 0) {
        missing[locale] = missingCodes;
      }

      // Check for extra translations
      const extraCodes = translationCodes.filter((code) => !registryCodes.includes(code));
      if (extraCodes.length > 0) {
        extra[locale] = extraCodes;
      }
    }

    return {
      valid: Object.keys(missing).length === 0 && Object.keys(extra).length === 0,
      missing: deepFreeze(missing) as Readonly<Record<Locale, string[]>>,
      extra: deepFreeze(extra) as Readonly<Record<Locale, string[]>>,
      totalCodes: registryCodes.length
    };
  }

  /**
   * Add or override translations for a locale
   *
   * This is primarily useful for testing or app-specific overrides.
   * In production, translations should be loaded from locale files.
   *
   * @param locale - Locale code
   * @param translations - Translation map to add/override
   *
   * @example
   * ```ts
   * TranslationService.addTranslations('tl-PH', {
   *   'USER_001': 'Custom na salin: Hindi nakita ang user'
   * });
   * ```
   */
  public static addTranslations(locale: Locale, translations: Record<string, string>): void {
    if (!this._translations) {
      throw new Error(
        'TranslationService not initialized. Call await TranslationService.initialize() first.'
      );
    }

    // Get current translations for locale (or default if not exists)
    const currentTranslations =
      this._translations[locale] || this._translations[this.defaultLocale];

    // Create new object with merged translations (can't modify frozen object)
    // Using Object.assign for better performance with large objects
    const mergedTranslations = Object.assign({}, currentTranslations, translations);

    // Create a shallow copy of the translations object to avoid modifying frozen object
    const newTranslations = { ...this._translations };
    newTranslations[locale] = mergedTranslations as ErrorTranslations;

    // Replace the entire translations object (this is necessary because the original is frozen)
    this._translations = newTranslations;

    // Update cachedLocales to include the new locale if not already present
    if (cachedLocales && !cachedLocales.includes(locale)) {
      cachedLocales = Object.freeze([...cachedLocales, locale]);
    }
  }

  /**
   * Merge app-specific translations for multiple locales
   *
   * This method is used to merge application-specific translations
   * with the base translations loaded from the errors package.
   * It performs an immutable merge (creates new objects without
   * modifying frozen translations).
   *
   * @param appTranslations - Map of locale to translation overrides
   * @throws TypeError if input validation fails
   *
   * @example
   * ```ts
   * // In app module initialization
   * TranslationService.mergeAppTranslations({
   *   'tl-PH': {
   *     'USER_001': 'Custom na salin: Hindi nakita ang user',
   *     'AUTH_001': 'Custom na salin: Maling email o password',
   *   },
   *   'ar-SA': {
   *     'USER_001': 'مخصص: المستخدم غير موجود',
   *   },
   * });
   * ```
   */
  public static mergeAppTranslations(
    appTranslations: Record<Locale, Record<string, string>>
  ): void {
    if (!this._translations) {
      throw new Error(
        'TranslationService not initialized. Call await TranslationService.initialize() first.'
      );
    }

    // Validate input is object
    if (!appTranslations || typeof appTranslations !== 'object') {
      throw new TypeError('appTranslations must be an object');
    }

    // Validate each locale and translation
    for (const [locale, translations] of Object.entries(appTranslations)) {
      if (!locale || typeof locale !== 'string') {
        throw new TypeError(`Invalid locale: "${locale}"`);
      }
      if (!translations || typeof translations !== 'object') {
        throw new TypeError(`Translations for locale "${locale}" must be an object`);
      }
      for (const [code, message] of Object.entries(translations)) {
        if (typeof message !== 'string') {
          throw new TypeError(
            `Translation for "${code}" in locale "${locale}" must be a string, got ${typeof message}`
          );
        }
      }
    }

    // Create new translations object (immutable merge)
    const newTranslations: Record<string, ErrorTranslations> = { ...this._translations };
    const newLocales = cachedLocales ? [...cachedLocales] : [];

    // Merge each locale's translations
    for (const [locale, translations] of Object.entries(appTranslations) as [
      Locale,
      Record<string, string>
    ][]) {
      // Get current translations for locale (or default if not exists)
      const currentTranslations =
        this._translations[locale] || this._translations[this.defaultLocale];

      // Create new object with merged translations (can't modify frozen object)
      const mergedTranslations = Object.assign({}, currentTranslations, translations);

      // Add merged translations to new object
      newTranslations[locale] = mergedTranslations as ErrorTranslations;

      // Add locale to list if not already present
      if (!newLocales.includes(locale)) {
        newLocales.push(locale);
      }
    }

    // Replace the entire translations object (this is necessary because the original is frozen)
    this._translations = newTranslations;

    // Update cached locales
    cachedLocales = Object.freeze(newLocales);
  }
}
