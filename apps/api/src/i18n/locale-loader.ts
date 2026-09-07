/**
 * Locale Loader
 *
 * Dynamically loads and merges translation files from the locales directory.
 * Supports module-based organization with JSON files per feature.
 *
 * Directory structure:
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

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { ErrorTranslations, Locale } from '@package/errors';

/**
 * Translation file module names
 * Each module corresponds to a JSON file in the locale directory
 */
const TRANSLATION_MODULES = [
  'app',
  'health',
  'tenant',
  'validation',
  'label',
  'error',
  'success',
  'api-codes'
] as const;

/**
 * Supported locales
 * Automatically discovered from the locales directory
 */
const SUPPORTED_LOCALES: Locale[] = ['en', 'ar-SA'];

/**
 * Translation key prefix mapping
 * Maps module names to their translation key prefixes
 */
const KEY_PREFIXES: Record<string, string> = {
  app: 'api.info',
  health: 'api.health',
  tenant: 'api.tenant',
  validation: 'api.validation',
  label: 'api.label',
  error: 'api.error',
  success: 'api.success',
  'api-codes': '' // No prefix for API codes (direct code mapping)
};

/**
 * Check if a key is an error code (e.g., VAL_001, API_001, USER_001)
 * Error codes should not have a prefix added
 */
function isErrorCodeKey(key: string): boolean {
  return /^[A-Z]+_\d+$/.test(key);
}

/**
 * Flatten nested object and prefix keys
 *
 * @example
 * ```ts
 * flattenObject({ email: { required: 'Email required' } }, 'api.validation')
 * // => { 'api.validation.email.required': 'Email required' }
 * ```
 */
function flattenObject(obj: Record<string, unknown>, prefix: string = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Don't prefix error code keys (e.g., VAL_001, API_001)
    const shouldSkipPrefix = isErrorCodeKey(key);
    const newKey = prefix && !shouldSkipPrefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else if (typeof value === 'string') {
      result[newKey] = value;
    }
  }

  return result;
}

/**
 * Load a single translation JSON file
 */
function loadTranslationFile(locale: Locale, module: string): Record<string, string> {
  try {
    // Try webpack bundle path first (dist/apps/api/i18n/locales)
    let filePath = join(__dirname, 'locales', locale, `${module}.json`);

    // If not found, try alternative paths for different build scenarios
    try {
      readFileSync(filePath, 'utf-8');
    } catch {
      // Try with i18n prefix (dist/apps/api/i18n/locales)
      filePath = join(__dirname, 'i18n', 'locales', locale, `${module}.json`);
    }

    const fileContent = readFileSync(filePath, 'utf-8');
    const translations = JSON.parse(fileContent) as Record<string, unknown>;

    // Flatten nested objects and apply prefix
    const prefix = KEY_PREFIXES[module] ?? `api.${module}`;
    return flattenObject(translations, prefix);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File not found - return empty object
      return {};
    }
    throw error;
  }
}

/**
 * Load all translation files for a specific locale
 */
function loadLocaleTranslations(locale: Locale): ErrorTranslations {
  const translations: Record<string, string> = {};

  for (const module of TRANSLATION_MODULES) {
    const moduleTranslations = loadTranslationFile(locale, module);
    Object.assign(translations, moduleTranslations);
  }

  // Return as frozen ErrorTranslations
  return Object.freeze(translations) as ErrorTranslations;
}

/**
 * Load all translations for all supported locales
 *
 * @returns Record mapping locale codes to their translations
 */
export function loadAllTranslations(): Record<Locale, ErrorTranslations> {
  const result: Record<Locale, ErrorTranslations> = {};

  for (const locale of SUPPORTED_LOCALES) {
    result[locale] = loadLocaleTranslations(locale);
  }

  return result;
}

/**
 * Discover available locales from the locales directory
 *
 * Scans the locales directory and returns a list of locale codes
 * based on directory names.
 *
 * @returns Array of discovered locale codes
 */
export function discoverLocales(): Locale[] {
  // Try webpack bundle path first
  let localesDir = join(__dirname, 'locales');

  try {
    const entries = readdirSync(localesDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name as Locale);
  } catch {
    // Try alternative path for webpack builds
    try {
      localesDir = join(__dirname, 'i18n', 'locales');
      const entries = readdirSync(localesDir, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name as Locale);
    } catch {
      // If directory doesn't exist yet, return supported locales
      return SUPPORTED_LOCALES;
    }
  }
}

/**
 * Validate translation parity across all locales
 *
 * Ensures all translation keys exist in all locales.
 * Returns missing keys for each locale.
 *
 * @returns Object with validation results
 */
export function validateTranslationParity(): {
  valid: boolean;
  missing: Record<Locale, string[]>;
  baseKeys: string[];
} {
  const translations = loadAllTranslations();
  const locales = Object.keys(translations) as Locale[];

  // Get base locale keys (use 'en' as reference)
  const baseKeys = Object.keys(translations['en'] ?? {}).sort();
  const missing: Record<Locale, string[]> = {} as Record<Locale, string[]>;

  for (const locale of locales) {
    if (locale === 'en') continue;

    const localeKeys = Object.keys(translations[locale] ?? {});
    missing[locale] = baseKeys.filter((key) => !localeKeys.includes(key));
  }

  const valid = Object.values(missing).every((keys) => keys.length === 0);

  return { valid, missing, baseKeys };
}
