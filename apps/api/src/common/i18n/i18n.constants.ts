/**
 * I18n Module Constants
 *
 * Provides injection tokens and constants for the internationalization system.
 */

/**
 * Injection token for TranslationService provider
 *
 * @example
 * ```ts
 * constructor(
 *   @Inject(TRANSLATION_SERVICE) private translation: TranslationService
 * ) {}
 * ```
 */
export const TRANSLATION_SERVICE = 'TRANSLATION_SERVICE';

/**
 * Injection token for request-scoped locale provider
 *
 * Provides the detected locale for the current request.
 * The locale is extracted from Accept-Language header or query parameter.
 *
 * @example
 * ```ts
 * constructor(
 *   @Inject(REQUEST_LOCALE) private locale: Locale
 * ) {}
 * ```
 */
export const REQUEST_LOCALE = 'REQUEST_LOCALE';

/**
 * Injection token for I18n configuration
 *
 * @example
 * ```ts
 * constructor(
 *   @Inject(I18N_CONFIG) private i18nConfig: I18nConfig
 * ) {}
 * ```
 */
export const I18N_CONFIG = 'I18N_CONFIG';
