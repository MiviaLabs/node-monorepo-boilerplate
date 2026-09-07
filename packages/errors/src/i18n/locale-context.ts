/**
 * Locale Context Storage
 *
 * Provides request-scoped locale storage using AsyncLocalStorage.
 * This allows the translation system to automatically use the correct
 * locale for each request without manual passing.
 *
 * @packageDocumentation
 */

import { AsyncLocalStorage } from 'node:async_hooks';

import { DEFAULT_LOCALE } from './i18n.types';

import type { Locale } from './i18n.types';

/**
 * Locale context data interface
 */
interface LocaleContextData {
  readonly locale: Locale;
}

/**
 * Async local storage for locale context
 * Each request gets its own isolated storage
 */
const localeStorage = new AsyncLocalStorage<LocaleContextData>();

/**
 * Locale Context Class
 *
 * Provides request-scoped locale management for automatic translation.
 *
 * @example
 * ```ts
 * // In middleware
 * import { LocaleContext } from '@package/errors';
 *
 * app.use((req, res, next) => {
 *   const locale = extractLocaleFromRequest(req);
 *   LocaleContext.run(locale, next);
 * });
 *
 * // In error handling
 * throw new RegisteredError('USER_001', { userId: '123' });
 * // error.translated will automatically use the request locale
 * ```
 */
export class LocaleContext {
  /**
   * Run a callback with a specific locale context
   *
   * This is typically called in middleware to wrap each request.
   *
   * @param locale - Locale code for this context
   * @param callback - Function to run within this context
   * @returns Return value of the callback
   *
   * @example
   * ```ts
   * LocaleContext.run('ar-SA', () => {
   *   // All code here will use 'ar-SA' for translations
   *   const error = new RegisteredError('USER_001', { userId: '123' });
   *   console.log(error.translated); // Arabic translation
   * });
   * ```
   */
  static run<T>(locale: Locale, callback: () => T): T {
    const context: LocaleContextData = { locale };
    return localeStorage.run(context, callback);
  }

  /**
   * Get the current locale from the context
   *
   * Returns the locale set by LocaleContext.run() or the default locale
   * if no context is set.
   *
   * @returns Current locale code or default locale
   *
   * @example
   * ```ts
   * const locale = LocaleContext.getLocale();
   * console.log(locale); // 'ar-SA' or DEFAULT_LOCALE
   * ```
   */
  static getLocale(): Locale {
    const context = localeStorage.getStore();
    return context?.locale ?? DEFAULT_LOCALE;
  }

  /**
   * Set locale for the current context
   *
   * This can be used to override the locale mid-request if needed.
   *
   * @param locale - New locale code
   * @throws Error if no context is active
   *
   * @example
   * ```ts
   * // Change locale mid-request
   * LocaleContext.setLocale('en');
   * ```
   */
  static setLocale(locale: Locale): void {
    const store = localeStorage.getStore();
    if (!store) {
      throw new Error(
        'Cannot set locale: No active LocaleContext. Ensure LocaleContext.run() was called.'
      );
    }
    // Create new context with updated locale
    const newContext: LocaleContextData = { locale };
    Object.assign(store, newContext);
  }

  /**
   * Check if a locale context is currently set
   *
   * @returns True if a context exists, false otherwise
   *
   * @example
   * ```ts
   * if (LocaleContext.hasContext()) {
   *   const locale = LocaleContext.getLocale();
   *   console.log('Current locale:', locale);
   * }
   * ```
   */
  static hasContext(): boolean {
    return localeStorage.getStore() !== undefined;
  }

  /**
   * Export storage for advanced use cases
   *
   * @internal
   */
  static readonly storage = localeStorage;
}
