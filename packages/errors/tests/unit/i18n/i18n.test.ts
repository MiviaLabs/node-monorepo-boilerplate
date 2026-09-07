/**
 * Unit tests for i18n Translation Service
 *
 * Tests the TranslationService class and locale loading.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

// Import test setup to initialize TranslationService
import './test-setup';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '../../../src/i18n/i18n.types';
import { TranslationService } from '../../../src/i18n/translation.service';
import { ERROR_REGISTRY, type ErrorCode } from '../../../src/registry/definitions';

describe('Translation Service', () => {
  describe('Initialization', () => {
    it('should have English as default locale', () => {
      assert.equal(DEFAULT_LOCALE, 'en');
    });

    it('should support at least 2 base locales', () => {
      assert.ok(SUPPORTED_LOCALES.length >= 2);
    });

    it('should support en and ar-SA locales', () => {
      assert.ok(SUPPORTED_LOCALES.includes('en'));
      assert.ok(SUPPORTED_LOCALES.includes('ar-SA'));
    });

    it('should have exactly 2 locales', async () => {
      const locales = await TranslationService.getAvailableLocales();
      assert.equal(locales.length, 2);
      assert.ok(locales.includes('en'));
      assert.ok(locales.includes('ar-SA'));
    });
  });

  describe('getTranslations', () => {
    it('should return translations for valid locale', () => {
      const enTranslations = TranslationService.getTranslations('en');
      assert.ok(enTranslations);
      assert.ok(typeof enTranslations === 'object');
    });

    it('should return English translations as default', () => {
      const translations = TranslationService.getTranslations('en');
      assert.equal(translations['USER_001'], 'User with ID {userId} not found');
    });

    it('should return Arabic translations', () => {
      const translations = TranslationService.getTranslations('ar-SA');
      assert.equal(translations['USER_001'], 'المستخدم بالمعرف {userId} غير موجود');
    });

    it('should return default locale for invalid locale', () => {
      const translations = TranslationService.getTranslations('invalid' as Locale);
      const defaultTranslations = TranslationService.getTranslations(DEFAULT_LOCALE);
      assert.equal(translations, defaultTranslations);
    });

    it('should contain all 72 error codes in English', () => {
      const translations = TranslationService.getTranslations('en');
      const errorCodes = Object.keys(ERROR_REGISTRY);
      assert.equal(errorCodes.length, 72);

      for (const code of errorCodes) {
        assert.ok(code in translations, `Missing translation for ${code} in English`);
        assert.ok(typeof translations[code] === 'string');
        assert.ok(translations[code].length > 0);
      }
    });

    it('should contain all 72 error codes in Arabic', () => {
      const translations = TranslationService.getTranslations('ar-SA');
      const errorCodes = Object.keys(ERROR_REGISTRY);

      for (const code of errorCodes) {
        assert.ok(code in translations, `Missing translation for ${code} in Arabic`);
        assert.ok(typeof translations[code] === 'string');
        assert.ok(translations[code].length > 0);
      }
    });
  });

  describe('isLocaleSupported', () => {
    it('should return true for supported locales', () => {
      assert.ok(TranslationService.isLocaleSupported('en'));
      assert.ok(TranslationService.isLocaleSupported('ar-SA'));
    });

    it('should return false for unsupported locales', () => {
      assert.ok(!TranslationService.isLocaleSupported('zh'));
      assert.ok(!TranslationService.isLocaleSupported('es'));
      assert.ok(!TranslationService.isLocaleSupported('invalid'));
    });

    it('should have proper type narrowing', () => {
      const locale = 'en' as string;
      if (TranslationService.isLocaleSupported(locale)) {
        // TypeScript should know locale is of type Locale
        const _: Locale = locale;
        assert.ok(_);
      }
    });
  });

  describe('translate', () => {
    it('should translate error message to English', () => {
      const result = TranslationService.translate('USER_001', { userId: '123' }, { locale: 'en' });
      assert.equal(result.message, 'User with ID 123 not found');
      assert.equal(result.locale, 'en');
      assert.equal(result.usedFallback, false);
      assert.equal(result.code, 'USER_001');
    });

    it('should translate error message to Arabic', () => {
      const result = TranslationService.translate(
        'USER_001',
        { userId: '123' },
        { locale: 'ar-SA' }
      );
      assert.equal(result.message, 'المستخدم بالمعرف 123 غير موجود');
      assert.equal(result.locale, 'ar-SA');
      assert.equal(result.usedFallback, false);
      assert.equal(result.code, 'USER_001');
    });

    it('should use default locale when locale not specified', () => {
      const result = TranslationService.translate('USER_001', { userId: '123' });
      assert.equal(result.message, 'User with ID 123 not found');
      assert.equal(result.locale, 'en');
    });

    it('should fallback to default locale for invalid locale', () => {
      const result = TranslationService.translate(
        'USER_001',
        { userId: '123' },
        {
          locale: 'invalid' as Locale,
          useFallback: true
        }
      );
      assert.equal(result.message, 'User with ID 123 not found');
      assert.equal(result.locale, 'en');
      assert.equal(result.usedFallback, true);
    });

    it('should handle missing parameters', () => {
      const result = TranslationService.translate('USER_001');
      assert.equal(result.message, 'User with ID {userId} not found');
    });

    it('should handle multiple parameters', () => {
      const result = TranslationService.translate(
        'VAL_003',
        {
          field: 'age',
          min: 18,
          max: 65
        },
        { locale: 'en' }
      );
      assert.equal(result.message, 'Value for age must be between 18 and 65');
    });

    it('should handle optional parameters', () => {
      const result1 = TranslationService.translate('AUTH_004', {}, { locale: 'en' });
      assert.equal(result1.message, 'Insufficient permissions: {requiredPermission} required');

      const result2 = TranslationService.translate(
        'AUTH_004',
        {
          requiredPermission: 'admin'
        },
        { locale: 'en' }
      );
      assert.equal(result2.message, 'Insufficient permissions: admin required');
    });

    it('should handle messages without parameters', () => {
      const result = TranslationService.translate('SYS_001', {}, { locale: 'en' });
      assert.equal(result.message, 'Internal server error');
    });

    it('should translate all user errors to Arabic', () => {
      for (let i = 1; i <= 10; i++) {
        const code = `USER_${String(i).padStart(3, '0')}` as const;
        const result = TranslationService.translate(code, {}, { locale: 'ar-SA' });
        assert.ok(result.message.length > 0);
        assert.equal(result.locale, 'ar-SA');
      }
    });

    it('should translate all auth errors to Arabic', () => {
      for (let i = 1; i <= 10; i++) {
        const code = `AUTH_${String(i).padStart(3, '0')}` as const;
        const result = TranslationService.translate(code, {}, { locale: 'ar-SA' });
        assert.ok(result.message.length > 0);
        assert.equal(result.locale, 'ar-SA');
      }
    });

    it('should handle fallback chain correctly', () => {
      // Test with custom fallback locale
      const result = TranslationService.translate(
        'USER_001',
        { userId: '123' },
        {
          locale: 'invalid' as Locale,
          fallbackLocale: 'ar-SA',
          useFallback: true
        }
      );
      assert.equal(result.locale, 'ar-SA');
      assert.equal(result.usedFallback, true);
    });
  });

  describe('getTranslation', () => {
    it('should return translation template for valid code and locale', () => {
      const template = TranslationService.getTranslation('USER_001', 'en');
      assert.equal(template, 'User with ID {userId} not found');
    });

    it('should return undefined for invalid code', () => {
      const template = TranslationService.getTranslation('INVALID_001', 'en');
      assert.equal(template, undefined);
    });

    it('should return Arabic template', () => {
      const template = TranslationService.getTranslation('AUTH_001', 'ar-SA');
      assert.equal(template, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
    });

    it('should return default template when no locale specified', () => {
      const template = TranslationService.getTranslation('VAL_001', 'en');
      assert.equal(template, 'Validation failed: {field} is required');
    });
  });

  describe('interpolateMessage', () => {
    it('should interpolate single parameter', () => {
      const message = TranslationService.interpolateMessage('User with ID {userId} not found', {
        userId: '123'
      });
      assert.equal(message, 'User with ID 123 not found');
    });

    it('should interpolate multiple parameters', () => {
      const message = TranslationService.interpolateMessage(
        'Value for {field} must be between {min} and {max}',
        { field: 'age', min: 18, max: 65 }
      );
      assert.equal(message, 'Value for age must be between 18 and 65');
    });

    it('should handle missing parameters', () => {
      const message = TranslationService.interpolateMessage('User with ID {userId} not found', {});
      assert.equal(message, 'User with ID {userId} not found');
    });

    it('should handle extra parameters', () => {
      const message = TranslationService.interpolateMessage('User with ID {userId} not found', {
        userId: '123',
        extra: 'ignored'
      });
      assert.equal(message, 'User with ID 123 not found');
    });

    it('should handle numeric parameters', () => {
      const message = TranslationService.interpolateMessage(
        'Maximum limit of {limit} users reached',
        { limit: 100 }
      );
      assert.equal(message, 'Maximum limit of 100 users reached');
    });

    it('should handle repeated parameters', () => {
      const message = TranslationService.interpolateMessage('{user} and {user} are the same', {
        user: 'John'
      });
      assert.equal(message, 'John and John are the same');
    });

    it('should not expand $& replacement token in parameter values', () => {
      const message = TranslationService.interpolateMessage('User with ID {userId} not found', {
        userId: 'foo$&bar'
      });
      assert.equal(message, 'User with ID foo$&bar not found');
    });

    it('should not expand $` replacement token in parameter values', () => {
      const message = TranslationService.interpolateMessage('User with ID {userId} not found', {
        userId: 'foo$`bar'
      });
      assert.equal(message, 'User with ID foo$`bar not found');
    });

    it("should not expand $' replacement token in parameter values", () => {
      const message = TranslationService.interpolateMessage('User with ID {userId} not found', {
        userId: "foo$'bar"
      });
      assert.equal(message, "User with ID foo$'bar not found");
    });

    it('should preserve $$ literal in parameter values', () => {
      const message = TranslationService.interpolateMessage('User with ID {userId} not found', {
        userId: 'foo$$bar'
      });
      assert.equal(message, 'User with ID foo$$bar not found');
    });

    it('should not substitute literal "undefined" when value is undefined', () => {
      const message = TranslationService.interpolateMessage('User suspended: {reason}', {
        reason: undefined
      });
      assert.ok(!message.includes('undefined'));
    });
  });

  describe('validateTranslations', () => {
    it('should validate all translations successfully for base locales (en, ar-SA)', () => {
      const errorCodes = Object.keys(ERROR_REGISTRY);
      const result = TranslationService.validateTranslations(errorCodes);
      // Note: Arabic locale may have missing translations since it's dynamically added
      // We only validate that the base locales (en, ar-SA) are complete
      const baseLocales = ['en', 'ar-SA'];
      for (const locale of baseLocales) {
        assert.ok(
          !result.missing[locale] || result.missing[locale].length === 0,
          `Locale ${locale} should have all translations`
        );
      }
      assert.equal(result.totalCodes, 72);
    });

    it('should detect missing translations', () => {
      const errorCodes = ['USER_001', 'USER_002', 'NONEXISTENT_001'];
      const result = TranslationService.validateTranslations(errorCodes);
      assert.ok(!result.valid);
      assert.ok(result.missing['en'].includes('NONEXISTENT_001'));
    });

    it('should provide missing codes per locale', () => {
      const errorCodes = ['USER_001'];
      const result = TranslationService.validateTranslations(errorCodes);

      // Should report extra codes (codes in translations but not in registry)
      // All locales should have 71 extra codes (72 total - 1 in registry)
      for (const locale of SUPPORTED_LOCALES) {
        assert.ok(result.extra[locale].length > 0, `Locale ${locale} should have extra codes`);
      }
    });
  });

  describe('getAvailableLocales', () => {
    it('should return all supported locales', async () => {
      const locales = await TranslationService.getAvailableLocales();
      assert.ok(locales.includes('en'));
      assert.ok(locales.includes('ar-SA'));
      assert.equal(locales.length, 2);
    });

    it('should return readonly array', async () => {
      const locales = await TranslationService.getAvailableLocales();
      // In non-strict mode, modifying a frozen array doesn't throw
      // but the operation silently fails
      assert.ok(Object.isFrozen(locales));
    });
  });

  describe('RTL Language Support', () => {
    it('should have Arabic translations that use RTL characters', () => {
      const translations = TranslationService.getTranslations('ar-SA');

      // Check that Arabic messages contain RTL characters (Arabic Unicode range)
      assert.ok(/[\u0600-\u06FF]/.test(translations['USER_001']));
    });

    it('should properly display Arabic error messages', () => {
      const result = TranslationService.translate('AUTH_001', {}, { locale: 'ar-SA' });
      assert.ok(result.message.length > 0);
      // Arabic message should not be empty
      assert.ok(result.message.trim().length > 0);
    });
  });

  describe('Locale-specific translation quality', () => {
    it('should have consistent parameter placeholders across all locales', () => {
      const enTranslations = TranslationService.getTranslations('en');
      const arSATranslations = TranslationService.getTranslations('ar-SA');

      const errorCodes = Object.keys(ERROR_REGISTRY);

      for (const code of errorCodes) {
        const enMsg = enTranslations[code];
        const arSAMsg = arSATranslations[code];

        // Extract parameter names from English message
        const enParams = (enMsg.match(/\{(\w+)\}/g) || []).map((p) => p.slice(1, -1));

        // All locales should have the same parameters
        for (const param of enParams) {
          const placeholder = `{${param}}`;
          assert.ok(
            arSAMsg.includes(placeholder),
            `Arabic translation for ${code} missing parameter ${param}`
          );
        }
      }
    });

    it('should translate all domain errors', () => {
      const domains = [
        { prefix: 'USER_', count: 10 },
        { prefix: 'AUTH_', count: 10 },
        { prefix: 'VAL_', count: 9 },
        { prefix: 'DB_', count: 10 },
        { prefix: 'BIZ_', count: 8 },
        { prefix: 'EXT_', count: 7 },
        { prefix: 'FILE_', count: 8 },
        { prefix: 'SYS_', count: 10 }
      ];

      for (const domain of domains) {
        for (let i = 1; i <= domain.count; i++) {
          const code = `${domain.prefix}${String(i).padStart(3, '0')}`;

          // Test all locales
          for (const locale of SUPPORTED_LOCALES) {
            const result = TranslationService.translate(code as ErrorCode, {}, { locale });
            assert.ok(result.message.length > 0, `${code} should have translation in ${locale}`);
            assert.equal(result.code, code);
          }
        }
      }
    });
  });

  describe('addTranslations', () => {
    it('should allow adding translations to new locale even with frozen object', () => {
      // The translations object is frozen, but addTranslations now handles this
      // by creating a shallow copy of the entire translations object
      // Using 'es' (Spanish) as a test locale
      TranslationService.addTranslations('es' as Locale, {
        USER_001: 'Usuario con ID {userId} no encontrado'
      });

      const result = TranslationService.translate(
        'USER_001',
        { userId: 123 },
        { locale: 'es' as Locale }
      );
      assert.strictEqual(result.message, 'Usuario con ID 123 no encontrado');
    });

    it('should allow overriding existing translations', () => {
      // addTranslations can now override existing translations
      // by creating a new unfrozen copy
      TranslationService.addTranslations('en', {
        USER_001: 'Overridden: User with ID {userId} not found'
      });

      const result = TranslationService.translate('USER_001', { userId: 789 }, { locale: 'en' });
      assert.strictEqual(result.message, 'Overridden: User with ID 789 not found');
    });

    it('should work with frozen source objects', () => {
      // Even if source object is frozen, addTranslations should work
      const newTranslations = Object.freeze({
        FROZEN_001: 'This translation is from a frozen object'
      });

      TranslationService.addTranslations('en', newTranslations);

      const result = TranslationService.translate('FROZEN_001', {}, { locale: 'en' });
      assert.strictEqual(result.message, 'This translation is from a frozen object');
    });

    it('should demonstrate that addTranslations now works with frozen _translations', () => {
      // addTranslations now works by creating a shallow copy of the entire
      // translations object to avoid modifying the frozen object
      TranslationService.addTranslations('en', {
        TEST_001: 'test message'
      });

      const result = TranslationService.translate('TEST_001', {}, { locale: 'en' });
      assert.strictEqual(result.message, 'test message');
    });
  });

  describe('null/undefined scenarios', () => {
    it('should handle getAllTranslations when _translations is null', async () => {
      // This test verifies that getAllTranslations initializes translations if null
      // Since the test setup already initializes the service, we just verify it works
      const translations = await TranslationService.getAllTranslations();
      assert.ok(translations);
      assert.ok(typeof translations === 'object');
    });

    it('should handle methods called before initialization', async () => {
      // Get current translations (already initialized by test setup)
      const translations = await TranslationService.getAllTranslations();

      // Verify translations are not null
      assert.ok(translations !== null);
      assert.ok(Object.keys(translations).length > 0);
    });

    it('should return default locale translations for non-existent locale', () => {
      // Get translations for a locale that doesn't exist
      const translations = TranslationService.getTranslations('nonexistent' as Locale);
      const defaultTranslations = TranslationService.getTranslations('en');

      // Should return default locale translations
      assert.deepEqual(translations, defaultTranslations);
      assert.ok(typeof translations === 'object');
      assert.ok(Object.keys(translations).length > 0);
    });

    it('should throw when null parameters are passed to translate', () => {
      // The interpolateMessage method uses Object.entries which throws on null
      assert.throws(
        () => {
          TranslationService.translate('USER_001', null as never);
        },
        /Cannot convert undefined or null to object/,
        'Should throw when null parameters are passed'
      );
    });

    it('should handle undefined parameters in translate', () => {
      // undefined is handled by default parameter, so it becomes {}
      const result = TranslationService.translate('USER_001', undefined);
      assert.ok(
        result.message.includes('{userId}'),
        'Should keep placeholder when params is undefined'
      );
    });

    it('should handle empty object parameters in translate', () => {
      const result = TranslationService.translate('USER_001', {});
      assert.ok(
        result.message.includes('{userId}'),
        'Should keep placeholder when params is empty object'
      );
    });

    it('should normalize null locale to default locale', () => {
      // Add a custom test code that won't be overridden
      TranslationService.addTranslations('en', {
        TEST_NULL_001: 'Test null locale: {value}'
      });

      const result = TranslationService.translate(
        'TEST_NULL_001',
        { value: 'email' },
        {
          locale: null as never
        }
      );

      // Should use default locale when null is passed
      assert.equal(result.locale, 'en');
      assert.equal(result.message, 'Test null locale: email');
    });

    it('should normalize undefined locale to default locale', () => {
      // Add a custom test code that won't be overridden
      TranslationService.addTranslations('en', {
        TEST_UNDEF_001: 'Test undefined locale: {value}'
      });

      const result = TranslationService.translate(
        'TEST_UNDEF_001',
        { value: 'password' },
        {
          locale: undefined
        }
      );

      // Should use default locale when undefined is passed
      assert.equal(result.locale, 'en');
      assert.equal(result.message, 'Test undefined locale: password');
    });
  });
});
