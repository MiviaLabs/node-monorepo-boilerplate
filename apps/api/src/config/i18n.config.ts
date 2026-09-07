import { registerAs } from '@nestjs/config';

import type { Locale } from '@package/errors';

/**
 * Default supported locales
 * These are the locales that have translation files in the application
 */
const DEFAULT_SUPPORTED_LOCALES: Locale[] = ['en', 'ar-SA'];

/**
 * Maximum number of allowed locales
 * Configurable via API_MAX_LOCALES environment variable
 */
const MAX_LOCALES = parseInt(process.env['API_MAX_LOCALES'] ?? '100', 10);

export interface I18nConfig {
  /**
   * Default language/locale to use when no locale is specified
   */
  defaultLanguage: Locale;

  /**
   * List of available/active languages for the application
   */
  availableLanguages: Locale[];
}

export default registerAs('i18n', (): I18nConfig => {
  // Parse default language from environment
  const defaultLanguageEnv = process.env['API_DEFAULT_LANGUAGE']?.trim();

  // Parse available languages from environment
  // Format: API_AVAILABLE_LANGUAGES=en,ar-SA
  const availableLanguagesEnv = process.env['API_AVAILABLE_LANGUAGES']?.trim();

  // Use defaults if not provided
  if (!availableLanguagesEnv) {
    return {
      defaultLanguage: (defaultLanguageEnv as Locale) ?? 'en',
      availableLanguages: DEFAULT_SUPPORTED_LOCALES
    };
  }

  // Split and filter empty strings
  const localeSpecs = availableLanguagesEnv
    .split(',')
    .map((locale) => locale.trim())
    .filter((locale) => locale.length > 0);

  // Validate that we have at least one locale
  if (localeSpecs.length === 0) {
    throw new Error(
      'API_AVAILABLE_LANGUAGES must contain at least one locale code.\n' +
        'Example: API_AVAILABLE_LANGUAGES=en,ar-SA'
    );
  }

  // Validate maximum number of locales
  if (localeSpecs.length > MAX_LOCALES) {
    throw new Error(
      `API_AVAILABLE_LANGUAGES exceeds maximum number of locales (${MAX_LOCALES}). ` +
        `Current count: ${localeSpecs.length}`
    );
  }

  // Validate each locale format
  const availableLanguages: Locale[] = localeSpecs.map((locale, index) => {
    // Validate locale format (xx or xx-YY)
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
      throw new Error(
        `Invalid locale code "${locale}" at index ${index}.\n` +
          `Locale codes must follow ISO 639-1 format (e.g., en, ar) ` +
          `or ISO 639-1 + ISO 3166-1 alpha-2 format (e.g., en-US, ar-SA).\n` +
          `Examples: en, ar, ar-SA, en-US, de-DE`
      );
    }
    return locale as Locale;
  });

  // Determine default language
  const defaultLanguage = defaultLanguageEnv
    ? (defaultLanguageEnv as Locale)
    : availableLanguages[0];

  // Validate that default language is in available languages
  if (defaultLanguage !== undefined && !availableLanguages.includes(defaultLanguage)) {
    throw new Error(
      `API_DEFAULT_LANGUAGE "${defaultLanguage}" is not in API_AVAILABLE_LANGUAGES.\n` +
        `Default language must be one of: ${availableLanguages.join(', ')}`
    );
  }

  return {
    defaultLanguage: defaultLanguage ?? availableLanguages[0] ?? 'en',
    availableLanguages
  };
});
