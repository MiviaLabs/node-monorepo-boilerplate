/**
 * i18n Translation Parity Tests
 *
 * Ensures all translation keys are present in all supported languages.
 * This prevents missing translations that would cause fallback behavior.
 */

import { appTranslationsConfig } from '../config';
import { validateTranslationParity } from '../locale-loader';

describe('i18n Translation Parity', () => {
  it('should have all English keys in Arabic', () => {
    const enTranslations = appTranslationsConfig['en'];
    const arTranslations = appTranslationsConfig['ar-SA'];

    if (!enTranslations || !arTranslations) {
      throw new Error('Translation configs are missing');
    }

    const enKeys = Object.keys(enTranslations);
    const arKeys = Object.keys(arTranslations);

    const missingInArabic = enKeys.filter((key) => !arKeys.includes(key));

    expect(missingInArabic).toHaveLength(0);
  });

  it('should have all Arabic keys in English', () => {
    const enTranslations = appTranslationsConfig['en'];
    const arTranslations = appTranslationsConfig['ar-SA'];

    if (!enTranslations || !arTranslations) {
      throw new Error('Translation configs are missing');
    }

    const enKeys = Object.keys(enTranslations);
    const arKeys = Object.keys(arTranslations);

    const missingInEnglish = arKeys.filter((key) => !enKeys.includes(key));

    expect(missingInEnglish).toHaveLength(0);
  });

  it('should have the same number of keys in both languages', () => {
    const enTranslations = appTranslationsConfig['en'];
    const arTranslations = appTranslationsConfig['ar-SA'];

    if (!enTranslations || !arTranslations) {
      throw new Error('Translation configs are missing');
    }

    const enKeysCount = Object.keys(enTranslations).length;
    const arKeysCount = Object.keys(arTranslations).length;

    expect(enKeysCount).toBe(arKeysCount);
  });

  it('should have non-empty translation values for all keys', () => {
    const enTranslations = appTranslationsConfig['en'];
    const arTranslations = appTranslationsConfig['ar-SA'];

    if (!enTranslations || !arTranslations) {
      throw new Error('Translation configs are missing');
    }

    const enKeys = Object.keys(enTranslations);
    const arKeys = Object.keys(arTranslations);

    const emptyEnglishValues = enKeys.filter(
      (key) => !enTranslations[key] || enTranslations[key].trim() === ''
    );
    const emptyArabicValues = arKeys.filter(
      (key) => !arTranslations[key] || arTranslations[key].trim() === ''
    );

    expect(emptyEnglishValues).toHaveLength(0);
    expect(emptyArabicValues).toHaveLength(0);
  });

  it('should have consistent placeholder patterns across languages', () => {
    const enTranslations = appTranslationsConfig['en'];
    const arTranslations = appTranslationsConfig['ar-SA'];

    if (!enTranslations || !arTranslations) {
      throw new Error('Translation configs are missing');
    }

    const enKeys = Object.keys(enTranslations);

    // Check for placeholder consistency (e.g., {field}, {version})
    const keysWithPlaceholders = enKeys.filter((key) => {
      const value = enTranslations[key];
      if (!value) return false;
      return /\{[^}]+\}/.test(value);
    });

    // Verify that if a key has placeholders in English, it has the same number in Arabic
    const inconsistentKeys: string[] = [];

    for (const key of keysWithPlaceholders) {
      const arValue = arTranslations[key];
      if (!arValue) continue;

      const enValue = enTranslations[key];
      if (!enValue) continue;

      const enPlaceholderCount = (enValue.match(/\{[^}]+\}/g) ?? []).length;
      const arPlaceholderCount = (arValue.match(/\{[^}]+\}/g) ?? []).length;

      if (enPlaceholderCount !== arPlaceholderCount) {
        inconsistentKeys.push(
          `${key}: EN has ${enPlaceholderCount} placeholders, AR has ${arPlaceholderCount}`
        );
      }
    }

    expect(inconsistentKeys).toHaveLength(0);
  });

  it('should validate translation parity using locale loader', () => {
    const validationResult = validateTranslationParity();

    expect(validationResult.valid).toBe(true);

    if (!validationResult.valid) {
      const missingMessages = Object.entries(validationResult.missing)
        .filter(([_, keys]) => keys.length > 0)
        .map(([locale, keys]) => `  ${locale}: ${keys.join(', ')}`)
        .join('\n');

      throw new Error(`Translation parity validation failed:\nMissing keys:\n${missingMessages}`);
    }
  });

  it('should include all expected translation keys', () => {
    const enTranslations = appTranslationsConfig['en'];

    if (!enTranslations) {
      throw new Error('English translation config is missing');
    }

    // Verify that all original keys from en.ts are present
    const expectedKeys = [
      // Success messages
      'api.success.created',
      'api.success.updated',
      'api.success.deleted',

      // Info messages
      'api.info.welcome',

      // Health check messages
      'api.health.healthy',
      'api.health.degraded',

      // Custom error overrides (VAL_001 override)
      'VAL_001',

      // API-specific error messages
      'api.error.invalidInput',
      'api.error.unauthorized',
      'api.error.forbidden',
      'api.error.notFound',
      'api.error.conflict',
      'api.error.rateLimit',
      'api.error.internal',

      // UI labels
      'api.label.email',
      'api.label.password',
      'api.label.name',
      'api.label.createdAt',
      'api.label.updatedAt',

      // Tenant-related messages
      'api.tenant.invalid',
      'api.tenant.notFound',
      'api.tenant.unauthorized',

      // Validation messages
      'api.validation.email.required',
      'api.validation.email.invalid',
      'api.validation.password.weak',
      'api.validation.password.required',

      // API-specific error codes (API_001-020)
      'API_001',
      'API_002',
      'API_003',
      'API_004',
      'API_005',
      'API_006',
      'API_007',
      'API_008',
      'API_009',
      'API_010',
      'API_011',
      'API_012',
      'API_013',
      'API_014',
      'API_015',
      'API_016',
      'API_017',
      'API_018',
      'API_019',
      'API_020'
    ];

    for (const key of expectedKeys) {
      const value = enTranslations[key];
      expect(value).toBeDefined();
      expect(typeof value).toBe('string');
      expect(value?.trim()).not.toBe('');
    }
  });
});
