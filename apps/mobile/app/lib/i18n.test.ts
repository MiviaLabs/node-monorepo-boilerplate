import { describe, expect, it } from 'vitest';
import { createMemoryDriver } from './storage.test-drivers';
import type { StorageDriver } from './storage';
import { createI18n, DEFAULT_LOCALE, translate } from './i18n';

describe('translate (pure lookup)', () => {
  it('returns the locale string for a known key', () => {
    expect(translate('en', 'settings.title')).toBe('Settings');
  });

  it('returns the translated string for de', () => {
    expect(translate('de', 'settings.title')).toBe('Einstellungen');
  });

  it('falls back to en when the key is missing in the requested locale', () => {
    expect(translate('de', 'login.emailInvalid')).toBe('Please enter a valid email address.');
  });

  it('returns the key itself when unknown in every dictionary', () => {
    expect(translate('de', 'nope.missing' as never)).toBe('nope.missing');
  });
});

describe('createI18n', () => {
  it('defaults to en when nothing is persisted', async () => {
    const i18n = createI18n(createStorageStub(null));
    await expect(i18n.getLocale()).resolves.toBe(DEFAULT_LOCALE);
  });

  it('setLocale persists and getLocale restores (round-trip)', async () => {
    const driver = createMemoryDriver();
    const i18n = createI18n(driver);
    await i18n.setLocale('de');
    const i18n2 = createI18n(driver);
    await expect(i18n2.getLocale()).resolves.toBe('de');
  });

  it('ignores invalid persisted locale values', async () => {
    const i18n = createI18n(createStorageStub('fr'));
    await expect(i18n.getLocale()).resolves.toBe(DEFAULT_LOCALE);
  });

  it('t uses the current locale and falls back to en', async () => {
    const i18n = createI18n(createMemoryDriver());
    await i18n.setLocale('de');
    expect(i18n.t('settings.logout')).toBe('Abmelden');
    expect(i18n.t('login.emailInvalid')).toBe('Please enter a valid email address.');
  });
});

function createStorageStub(stored: unknown): StorageDriver {
  const driver = createMemoryDriver();
  if (stored !== null) {
    void driver.setItem('app.locale', JSON.stringify(stored));
  }
  return driver;
}
