/**
 * Dynamic Locale Loader
 *
 * Automatically discovers and loads locale translation files
 * from the locales directory. This enables adding new languages
 * by creating a locale file and adding a switch case in loadLocaleModule().
 *
 * Note: Due to webpack bundling constraints, new locales require
 * an explicit import in the loadLocaleModule() switch statement.
 *
 * @packageDocumentation
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ErrorTranslations } from './i18n.types';

/**
 * Locale metadata interface
 */
interface LocaleMetadata {
  /** Locale code (e.g., 'en', 'ar-SA') */
  code: string;
  /** File path to the locale module */
  path: string;
}

/**
 * Get the current module's directory path
 *
 * Works in both ESM and CommonJS environments, including webpack bundling scenarios.
 *
 * Strategy:
 * 1. In webpack/CommonJS builds: __dirname is available (Node.js global)
 * 2. In pure ESM (not bundled): Use dynamic import.meta.url via eval to avoid TS errors
 * 3. Last resort: current working directory
 *
 * @returns The directory path of this module
 *
 * @private
 */
function getModuleDir(): string {
  // In webpack builds and CommonJS, __dirname is available
  // Check for it first to avoid TS1343 errors with import.meta
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  // For ESM modules not bundled by webpack, try import.meta.url
  // Use eval to avoid TypeScript parsing import.meta at compile time
  try {
    const getMetaUrl = eval('(0, () => import.meta.url)');
    if (getMetaUrl) {
      const modulePath = fileURLToPath(getMetaUrl());
      return join(modulePath, '..');
    }
  } catch {
    // import.meta.url not available, fall through
  }

  // Last resort: use current working directory (should rarely happen)
  return process.cwd();
}

/**
 * Dynamic locale loader that auto-discovers available locales
 *
 * This class uses dynamic imports to load locale files at runtime,
 * allowing new locales to be added without code changes.
 *
 * @example
 * ```ts
 * const loader = new LocaleLoader();
 * const translations = await loader.loadAllLocales();
 * console.log(translations); // { en: {...}, 'ar-SA': {...} }
 * ```
 */
export class LocaleLoader {
  /**
   * Locales directory path
   * Works in both ESM and CommonJS environments
   */
  private readonly localesDir: string;

  /**
   * Default locale code
   */
  private readonly defaultLocale: string;

  constructor(defaultLocale: string = 'en') {
    // Get the directory path of this module (works in both ESM and webpack)
    const moduleDir = getModuleDir();
    this.localesDir = join(moduleDir, 'locales');
    this.defaultLocale = defaultLocale;
  }

  /**
   * Discover all available locale files in the locales directory
   *
   * @returns Array of locale metadata
   *
   * @example
   * ```ts
   * const locales = await loader.discoverLocales();
   * // Returns: [
   * //   { code: 'en', path: '/path/to/locales/en.ts' },
   * //   { code: 'ar-SA', path: '/path/to/locales/ar-SA.ts' }
   * // ]
   * ```
   */
  async discoverLocales(): Promise<LocaleMetadata[]> {
    try {
      // Dynamic import of filesystem module
      // In Node.js ESM, we use import() with file:// protocol
      const fs = await import('node:fs');
      const path = await import('node:path');

      // Check if locales directory exists before trying to read it
      if (!fs.existsSync(this.localesDir)) {
        // Directory doesn't exist, use fallback silently
        // This is expected in bundled/production environments
        return this.getFallbackLocales();
      }

      // Read the locales directory
      const files = fs.readdirSync(this.localesDir);

      // Filter for .js files in production (bundled) or .ts files in development
      const locales: LocaleMetadata[] = files
        .filter((file: string) => {
          const ext = file.endsWith('.js') ? '.js' : file.endsWith('.ts') ? '.ts' : null;
          return ext && file !== 'index.ts' && file !== 'index.js';
        })
        .map((file: string) => {
          const code = file.replace(/\.(js|ts)$/, '');
          const fullPath = path.join(this.localesDir, file);
          return { code, path: fullPath };
        });

      // If no locales found in filesystem, use fallback
      if (locales.length === 0) {
        return this.getFallbackLocales();
      }

      // Sort: default locale first, then alphabetically
      locales.sort((a, b) => {
        if (a.code === this.defaultLocale) return -1;
        if (b.code === this.defaultLocale) return 1;
        return a.code.localeCompare(b.code);
      });

      return locales;
    } catch {
      // Silently use fallback - filesystem access failures are expected in production
      // This can happen in bundled/minified environments or Docker containers
      return this.getFallbackLocales();
    }
  }

  /**
   * Load a single locale module using webpack-compatible dynamic import
   *
   * Uses a switch statement for all known locales to ensure webpack can
   * statically analyze the imports and avoid "critical dependency" warnings.
   *
   * To add a new locale:
   * 1. Add the locale file to src/i18n/locales/
   * 2. Add a case to this switch statement
   *
   * @param localeCode - The locale code to load
   * @returns The locale module or null if not found
   *
   * @private
   */
  private async loadLocaleModule(localeCode: string): Promise<ErrorTranslations | null> {
    try {
      // Use switch statement for webpack-compatible dynamic imports
      // Webpack can analyze these and create separate chunks
      switch (localeCode) {
        case 'en':
          return (await import('./locales/en')).en;
        case 'ar-SA':
          return (await import('./locales/ar-SA')).arSA;
        default:
          // Unknown locale - log warning and return null
          console.warn(`Unknown locale "${localeCode}". Available locales: en, ar-SA`);
          return null;
      }
    } catch (error) {
      console.warn(`Failed to load locale "${localeCode}":`, error);
      return null;
    }
  }

  /**
   * Load all locale translations
   *
   * @returns Record mapping locale codes to translations
   *
   * @example
   * ```ts
   * const translations = await loader.loadAllLocales();
   * // Returns: {
   * //   en: { USER_001: 'User not found', ... },
   * //   'ar-SA': { USER_001: 'المستخدم غير موجود', ... }
   * // }
   * ```
   */
  async loadAllLocales(): Promise<Record<string, ErrorTranslations>> {
    const locales = await this.discoverLocales();
    const translations: Record<string, ErrorTranslations> = {};

    // Load each locale dynamically using webpack-compatible method
    for (const locale of locales) {
      const localeTranslations = await this.loadLocaleModule(locale.code);

      if (localeTranslations) {
        translations[locale.code] = localeTranslations;
      }
    }

    return translations;
  }

  /**
   * Get available locale codes
   *
   * @returns Array of locale codes
   *
   * @example
   * ```ts
   * const codes = await loader.getAvailableLocaleCodes();
   * // Returns: ['en', 'ar-SA']
   * ```
   */
  async getAvailableLocaleCodes(): Promise<string[]> {
    const locales = await this.discoverLocales();
    return locales.map((locale) => locale.code);
  }

  /**
   * Check if a locale is supported
   *
   * @param code - Locale code to check
   * @returns True if locale exists
   *
   * @example
   * ```ts
   * const isSupported = await loader.isLocaleSupported('fr');
   * // Returns: false (until fr.ts is added)
   * ```
   */
  async isLocaleSupported(code: string): Promise<boolean> {
    const codes = await this.getAvailableLocaleCodes();
    return codes.includes(code);
  }

  /**
   * Get fallback locales when filesystem access fails
   *
   * This ensures the system works in bundled/minified environments
   * where dynamic file system access may not be available.
   *
   * @returns Hardcoded fallback locales
   *
   * @private
   */
  private getFallbackLocales(): LocaleMetadata[] {
    // These are imported statically to ensure they're always available
    return [
      { code: 'en', path: './locales/en.ts' },
      { code: 'ar-SA', path: './locales/ar-SA.ts' }
    ];
  }

  /**
   * Load fallback translations
   *
   * Used when dynamic loading fails
   *
   * @returns Fallback translations
   *
   * @private
   */
  async loadFallbackTranslations(): Promise<Record<string, ErrorTranslations>> {
    const { en } = await import('./locales/en');
    const { arSA } = await import('./locales/ar-SA');

    return {
      en,
      'ar-SA': arSA
    };
  }
}

/**
 * Singleton instance for locale loading
 */
let loaderInstance: LocaleLoader | null = null;

/**
 * Get or create the singleton locale loader instance
 *
 * @param defaultLocale - Default locale code (default: 'en')
 * @returns LocaleLoader instance
 *
 * @example
 * ```ts
 * import { getLocaleLoader } from './locale-loader';
 *
 * const loader = getLocaleLoader();
 * const translations = await loader.loadAllLocales();
 * ```
 */
export function getLocaleLoader(defaultLocale: string = 'en'): LocaleLoader {
  if (!loaderInstance) {
    loaderInstance = new LocaleLoader(defaultLocale);
  }
  return loaderInstance;
}
