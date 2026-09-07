import { STORAGE_KEYS, type AppStorage } from './storage';
import { createStorage } from './storage';

export const LOCALES = ['en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const en = {
  'index.title': 'Home',
  'login.title': 'Sign in',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.emailInvalid': 'Please enter a valid email address.',
  'login.passwordRequired': 'Please enter your password.',
  'settings.title': 'Settings',
  'settings.email': 'Signed in as',
  'settings.language': 'Language',
  'settings.logout': 'Log out'
} as const;

export type TranslationKey = keyof typeof en;

// Secondary locales may omit keys; translate() falls back to en.
const de: Partial<Record<TranslationKey, string>> = {
  'index.title': 'Start',
  'login.title': 'Anmelden',
  'login.email': 'E-Mail',
  'login.password': 'Passwort',
  'login.submit': 'Anmelden',
  'login.emailInvalid': undefined,
  'login.passwordRequired': 'Bitte geben Sie Ihr Passwort ein.',
  'settings.title': 'Einstellungen',
  'settings.email': 'Angemeldet als',
  'settings.language': 'Sprache',
  'settings.logout': 'Abmelden'
};

const dictionaries: Record<Locale, Partial<Record<TranslationKey, string>>> = { en, de };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Pure translation lookup with fallback to en, then the key itself. */
export function translate(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
}

export interface I18n {
  /** Loads the persisted locale into memory (call once at startup). */
  init(): Promise<Locale>;
  getLocale(): Promise<Locale>;
  setLocale(locale: Locale): Promise<void>;
  t(key: TranslationKey): string;
}

export function createI18n(driver: Parameters<typeof createStorage>[0]): I18n {
  const storage: AppStorage = createStorage(driver);
  let current: Locale = DEFAULT_LOCALE;
  return {
    async init(): Promise<Locale> {
      current = await this.getLocale();
      return current;
    },
    async getLocale(): Promise<Locale> {
      const stored = await storage.get<Locale>(STORAGE_KEYS.locale);
      return isLocale(stored) ? stored : DEFAULT_LOCALE;
    },
    async setLocale(locale: Locale): Promise<void> {
      current = locale;
      await storage.set(STORAGE_KEYS.locale, locale);
    },
    t(key: TranslationKey): string {
      return translate(current, key);
    }
  };
}
