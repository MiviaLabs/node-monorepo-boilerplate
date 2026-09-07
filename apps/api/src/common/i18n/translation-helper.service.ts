/**
 * Translation Helper Service
 *
 * Convenient service for translating messages in controllers and other services.
 * Injects TranslationService and REQUEST_LOCALE for easy access.
 *
 * @example
 * ```ts
 * import { TranslationHelperService } from './common/i18n';
 *
 * @Controller('users')
 * export class PeopleController {
 *   constructor(private readonly translator: TranslationHelperService) {}
 *
 *   @Get()
 *   async findAll() {
 *     const message = this.translator.translate('api.success.created');
 *     return { message };
 *   }
 * }
 * ```
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { TranslationService } from '@package/errors';

import { TRANSLATION_SERVICE, REQUEST_LOCALE } from './i18n.constants';

import type { ErrorCode, ErrorParameters, Locale, TranslationResult } from '@package/errors';

/**
 * Translation Helper Service
 *
 * Provides convenient methods for translating messages with automatic
 * locale detection from the current request.
 */
@Injectable({ scope: Scope.REQUEST })
export class TranslationHelperService {
  /**
   * Current request locale
   */
  private readonly locale: Locale;

  constructor(
    @Inject(TRANSLATION_SERVICE) private readonly translationService: typeof TranslationService,
    @Inject(REQUEST_LOCALE) locale: Locale
  ) {
    this.locale = locale;
  }

  /**
   * Translate a message with parameters
   *
   * Uses the current request locale automatically.
   *
   * @param code - Translation key or error code
   * @param parameters - Parameters for message interpolation
   * @returns Translated message
   *
   * @example
   * ```ts
   * const message = this.translator.translate('api.error.notFound');
   * // Returns: "The requested resource was not found" (for en locale)
   *
   * const withParams = this.translator.translate('VAL_001', { field: 'email' });
   * // Returns: "Invalid value provided: email"
   * ```
   */
  translate(code: string, parameters?: ErrorParameters): string {
    return this.translationService.translate(code as ErrorCode, parameters, {
      locale: this.locale
    }).message;
  }

  /**
   * Translate a message with full result metadata
   *
   * Returns the full TranslationResult object with locale and fallback information.
   *
   * @param code - Translation key or error code
   * @param parameters - Parameters for message interpolation
   * @returns Translation result with metadata
   *
   * @example
   * ```ts
   * const result = this.translator.translateWithResult('api.error.notFound');
   * console.log(result); // { message: "...", locale: "en", usedFallback: false, code: "..." }
   * ```
   */
  translateWithResult(code: string, parameters?: ErrorParameters): TranslationResult {
    return this.translationService.translate(code as ErrorCode, parameters, {
      locale: this.locale
    });
  }

  /**
   * Translate a message async
   *
   * Async version of translate() for consistency.
   *
   * @param code - Translation key or error code
   * @param parameters - Parameters for message interpolation
   * @returns Translated message
   *
   * @example
   * ```ts
   * const message = await this.translator.translateAsync('api.error.notFound');
   * ```
   */
  async translateAsync(code: string, parameters?: ErrorParameters): Promise<string> {
    const result = await this.translationService.translateAsync(code as ErrorCode, parameters, {
      locale: this.locale
    });
    return result.message;
  }

  /**
   * Get the current request locale
   *
   * @returns Current locale code
   */
  getLocale(): Locale {
    return this.locale;
  }

  /**
   * Check if a translation key exists for the current locale
   *
   * @param code - Translation key to check
   * @returns True if translation exists
   *
   * @example
   * ```ts
   * if (this.translator.hasTranslation('api.error.notFound')) {
   *   // Use the translation
   * }
   * ```
   */
  hasTranslation(code: string): boolean {
    const translation = this.translationService.getTranslation(code, this.locale);
    return translation !== undefined;
  }
}
