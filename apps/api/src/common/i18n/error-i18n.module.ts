/**
 * Error I18n Module
 *
 * Provides internationalization support for error messages in the NestJS API.
 * Integrates the TranslationService from @package/errors package.
 *
 * This module:
 * - Registers TranslationService as a provider
 * - Initializes translation service with dynamic locale discovery
 * - Validates configured locales against available locales
 * - Provides a locale extractor from HTTP requests
 * - Supports Accept-Language header for locale detection
 * - Falls back to configured default locale if not specified
 */

import { Inject, Injectable, Logger, Module, OnModuleInit, Provider, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { TranslationService } from '@package/errors';

import { I18N_CONFIG, TRANSLATION_SERVICE, REQUEST_LOCALE } from './i18n.constants';
import { TranslationHelperService } from './translation-helper.service';
import { initializeAppTranslations } from '../../i18n/config';
import { extractLocaleFromRequest } from '../utils/locale-extractor';

import type { I18nConfig } from '../../config/i18n.config';
import type { Locale } from '@package/errors';
import type { Request } from 'express';

/**
 * I18n Configuration Service
 *
 * Provides access to i18n configuration and validates locales
 * against the configured available languages.
 */
@Injectable()
export class I18nConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Get i18n configuration.
   *
   * @returns The i18n configuration object
   * @throws Error if configuration is missing
   */
  getConfig(): I18nConfig {
    const config = this.configService.get<I18nConfig>('i18n');
    if (!config) {
      throw new Error('I18n configuration is missing. Please check your config file.');
    }
    return config;
  }

  /**
   * Get default language.
   *
   * @returns The configured default locale
   */
  getDefaultLanguage(): Locale {
    return this.getConfig().defaultLanguage;
  }

  /**
   * Get available languages.
   *
   * @returns Array of configured available locales
   */
  getAvailableLanguages(): Locale[] {
    return this.getConfig().availableLanguages;
  }

  /**
   * Check if a locale is in the configured available languages.
   *
   * @param locale - The locale code to check
   * @returns True if the locale is in the configured available languages
   */
  isLocaleAvailable(locale: Locale): boolean {
    return this.getAvailableLanguages().includes(locale);
  }

  /**
   * Validate that a locale is available, throw error if not.
   *
   * @param locale - The locale code to validate
   * @throws Error if the locale is not in available languages
   */
  validateLocaleAvailable(locale: Locale): void {
    if (!this.isLocaleAvailable(locale)) {
      const available = this.getAvailableLanguages().join(', ');
      throw new Error(
        `Locale "${locale}" is not in the configured available languages. ` +
          `Available: ${available}`
      );
    }
  }

  /**
   * Validate that all discovered locales are in the configured available languages.
   *
   * Logs a warning if any discovered locales are not configured.
   *
   * @param discoveredLocales - Array of locales discovered from the filesystem
   */
  validateDiscoveredLocales(discoveredLocales: readonly Locale[]): void {
    const configured = this.getAvailableLanguages();
    const notConfigured = discoveredLocales.filter((locale) => !configured.includes(locale));

    if (notConfigured.length > 0) {
      Logger.warn(
        `Some discovered locales are not in API_AVAILABLE_LANGUAGES and will not be used: ${notConfigured.join(', ')}`,
        'ErrorI18nModule'
      );
    }
  }
}

/**
 * Request-scoped locale provider with config validation
 *
 * Extracts locale from each incoming request and provides it
 * to other services via dependency injection.
 *
 * Uses the configured default language from API_DEFAULT_LANGUAGE
 * instead of the hardcoded TranslationService.defaultLocale.
 */
const requestLocaleProvider: Provider = {
  provide: REQUEST_LOCALE,
  useFactory: (request: Request, i18nConfig: I18nConfigService): Locale => {
    const configuredDefault = i18nConfig.getDefaultLanguage();

    // Extract locale with configured default as fallback
    const locale = extractLocaleFromRequest(request, configuredDefault);

    // Validate that the detected locale is in configured available languages
    if (!i18nConfig.isLocaleAvailable(locale)) {
      // Fall back to configured default if detected locale is not available
      return configuredDefault;
    }

    return locale;
  },
  inject: [REQUEST, I18nConfigService],
  scope: Scope.REQUEST
};

/**
 * Error I18n Module
 *
 * Provides internationalization support for error handling.
 * This module should be imported in AppModule to enable i18n
 * for all error responses.
 *
 * DYNAMIC LOCALE LOADING:
 * This module automatically initializes the TranslationService
 * which discovers all available locales from the locales/ directory.
 * To add a new language:
 * 1. Create a new locale file in the appropriate directory
 * 2. Add the locale code to API_AVAILABLE_LANGUAGES in .env
 * 3. Optionally set API_DEFAULT_LANGUAGE to the new locale
 *
 * @example
 * ```ts
 * import { ErrorI18nModule } from './common/i18n';
 *
 * @Module({
 *   imports: [ErrorI18nModule],
 * })
 * export class AppModule {}
 * ```
 *
 * Features:
 * - Automatic locale detection from Accept-Language header or query parameter
 * - Request-scoped locale provider via REQUEST_LOCALE injection token
 * - TranslationService from @package/errors package with dynamic locale discovery
 * - Fallback to configured default locale if no locale is detected
 * - Validation that detected locales are in configured available languages
 * - Automatic initialization on module load
 *
 * Environment Configuration:
 * - API_DEFAULT_LANGUAGE: Default locale (default: 'en')
 * - API_AVAILABLE_LANGUAGES: Comma-separated list of available locales (default: 'en,ar-SA')
 *
 * @see {@link extractLocaleFromRequest} - Locale extraction logic
 * @see {@link REQUEST_LOCALE} - Locale injection token
 * @see {@link TRANSLATION_SERVICE} - TranslationService injection token
 * @see {@link I18nConfigService} - Configuration service
 */
@Module({
  providers: [
    // I18n configuration
    {
      provide: I18N_CONFIG,
      useFactory: (configService: ConfigService) => {
        const config = configService.get<I18nConfig>('i18n');
        if (!config) {
          throw new Error('I18n configuration is missing. Please check your config file.');
        }
        return config;
      },
      inject: [ConfigService]
    },
    // I18n configuration service
    {
      provide: I18nConfigService,
      useClass: I18nConfigService
    },
    // TranslationService from @package/errors
    {
      provide: TRANSLATION_SERVICE,
      useValue: TranslationService
    },
    // Request-scoped locale provider
    requestLocaleProvider,
    // TranslationHelperService for convenient translation access
    TranslationHelperService
  ],
  exports: [TRANSLATION_SERVICE, REQUEST_LOCALE, I18nConfigService, TranslationHelperService]
})
export class ErrorI18nModule implements OnModuleInit {
  private readonly logger = new Logger(ErrorI18nModule.name);

  constructor(@Inject(I18N_CONFIG) private readonly i18nConfig: I18nConfig) {}

  /**
   * Initialize the translation service
   *
   * This method is called when the module is loaded and ensures
   * all locale translations are discovered and loaded.
   */
  async onModuleInit(): Promise<void> {
    try {
      // Initialize the translation service to load all locales
      await TranslationService.initialize();

      // Merge app-specific translations with base translations
      // This merges API translations with the errors package translations
      // using the efficient mergeAppTranslations() method
      initializeAppTranslations();

      // Get discovered locales from the filesystem
      const discoveredLocales = await TranslationService.getAvailableLocales();

      // Get configured available languages
      const availableLanguages = this.i18nConfig.availableLanguages;
      const defaultLanguage = this.i18nConfig.defaultLanguage;

      // Validate that discovered locales match configuration
      const notConfigured = discoveredLocales.filter(
        (locale) => !availableLanguages.includes(locale)
      );

      if (notConfigured.length > 0) {
        this.logger.warn(
          `Some discovered locales are not in API_AVAILABLE_LANGUAGES and will not be used: ${notConfigured.join(', ')}`
        );
      }

      // Log the configured available locales for debugging
      this.logger.log(
        `I18n initialized with ${availableLanguages.length} configured locales: ${availableLanguages.join(', ')}`
      );
      this.logger.log(`Default language: ${defaultLanguage}`);
    } catch (error) {
      // Log error but don't fail module initialization
      this.logger.error('Failed to initialize translation service:', error);
    }
  }
}
