/**
 * Locale Extraction Utility
 *
 * Provides centralized locale extraction logic for internationalization.
 * Used by ErrorI18nModule and GlobalExceptionFilter to ensure consistent
 * locale detection across the application.
 *
 * Priority:
 * 1. Query parameter `locale` (e.g., ?locale=ar-SA)
 * 2. Accept-Language header (e.g., "ar-SA,en-US;q=0.9")
 * 3. Default locale (from config or TranslationService)
 *
 * Note: This function works synchronously and relies on TranslationService
 * being initialized beforehand by ErrorI18nModule.
 */

import { TranslationService } from '@package/errors';

import type { Locale } from '@package/errors';
import type { Request } from 'express';

/**
 * Extract locale from Accept-Language header or query parameter
 *
 * Priority:
 * 1. Query parameter `locale` (e.g., ?locale=ar-SA)
 * 2. Accept-Language header (e.g., "ar-SA,en-US;q=0.9")
 * 3. Default locale (from config parameter, or TranslationService.defaultLocale as fallback)
 *
 * Features:
 * - Handles both string and array query parameters
 * - Parses quality values with NaN protection
 * - Supports language-only fallback (e.g., "ar" from "ar-SA")
 * - Runtime validation before type assertion
 * - Configurable default locale via parameter
 *
 * @param request - HTTP request
 * @param defaultLocale - Optional configured default locale (falls back to TranslationService.defaultLocale)
 * @returns Detected and validated locale code
 */
export function extractLocaleFromRequest(request: Request, defaultLocale?: Locale): Locale {
  // Try query parameter first (explicit override)
  const queryLocale = request.query === undefined ? undefined : request.query['locale'];

  // Handle both string and array query parameters
  const queryLocaleStr = Array.isArray(queryLocale) ? queryLocale[0] : queryLocale;

  if (typeof queryLocaleStr === 'string') {
    try {
      if (TranslationService.isLocaleSupported(queryLocaleStr)) {
        return queryLocaleStr as Locale;
      }
    } catch {
      // TranslationService not initialized yet, fall through to other checks
    }
  }

  // Try Accept-Language header
  const acceptLanguage = request.headers['accept-language'];

  if (acceptLanguage && typeof acceptLanguage === 'string') {
    // Parse Accept-Language header
    // Format: "ar-SA,en-US;q=0.9,en;q=0.8"
    const locales = acceptLanguage
      .split(',')
      .map((lang) => {
        const [locale, qValue] = lang.trim().split(';q=');

        // Quality value parsing with NaN protection
        // - parseFloat() can return NaN for malformed values
        // - We clamp to valid range [0.0, 1.0]
        // - Default to 1.0 if missing or invalid
        const quality = qValue ? Math.max(0, Math.min(1, parseFloat(qValue) || 1.0)) : 1.0;

        return {
          locale: locale as Locale,
          quality
        };
      })
      .sort((a, b) => b.quality - a.quality);

    // Find first supported locale
    for (const { locale } of locales) {
      try {
        // Try exact match with runtime validation
        if (TranslationService.isLocaleSupported(locale)) {
          return locale as Locale;
        }

        // Try language-only match (e.g., "ar" from "ar-SA")
        const localeStr = locale as string;
        const langPrefix = localeStr.split('-')[0] as Locale;

        if (TranslationService.isLocaleSupported(langPrefix)) {
          return langPrefix;
        }
      } catch {
        // TranslationService not initialized yet, continue to next locale
        continue;
      }
    }
  }

  // Fall back to default locale
  // Priority: parameter > TranslationService.defaultLocale
  return defaultLocale ?? TranslationService.defaultLocale;
}
