/**
 * Unit tests for @package/i18n
 *
 * Comprehensive test suite covering:
 * - loadTranslations() - basic loading and merge semantics
 * - t() - interpolation, fallback behavior, locale selection
 * - useTranslation() - hook functionality
 * - Security - prototype pollution protection
 * - Edge cases - null/undefined params, missing keys, empty locales
 *
 * Coverage target: 80%+ (lines, branches, functions, statements)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

import {
  loadTranslations,
  t,
  useTranslation,
  i18n,
  clearTranslations,
  __translationStore,
  type TranslationParams
} from '../../index';

describe('@package/i18n', () => {
  describe('loadTranslations', () => {
    beforeEach(() => {
      // Reset translation store before each test to ensure test isolation
      clearTranslations();
    });

    it('should load basic translations for a locale', () => {
      loadTranslations('en', { 'test.basic': 'Basic test' });
      expect(t('test.basic')).toBe('Basic test');
    });

    it('should merge translations for the same locale', () => {
      loadTranslations('en', { 'merge.key1': 'Value 1' });
      loadTranslations('en', { 'merge.key2': 'Value 2' });

      expect(t('merge.key1')).toBe('Value 1');
      expect(t('merge.key2')).toBe('Value 2');
    });

    it('should overwrite existing keys when loading translations', () => {
      loadTranslations('en', { 'overwrite.key': 'Original' });
      loadTranslations('en', { 'overwrite.key': 'Updated' });

      expect(t('overwrite.key')).toBe('Updated');
    });

    it('should support multiple locales independently', () => {
      loadTranslations('en', { 'multi.greeting': 'Hello' });
      loadTranslations('fr', { 'multi.greeting': 'Bonjour' });
      loadTranslations('es', { 'multi.greeting': 'Hola' });

      expect(t('multi.greeting', undefined, 'en')).toBe('Hello');
      expect(t('multi.greeting', undefined, 'fr')).toBe('Bonjour');
      expect(t('multi.greeting', undefined, 'es')).toBe('Hola');
    });
  });

  describe('t() - Translation function', () => {
    beforeEach(() => {
      clearTranslations();
      // Load test translations
      loadTranslations('en', {
        'simple.key': 'Simple value',
        'param.greeting': 'Hello, {{name}}!',
        'param.multiple': '{{greeting}}, {{name}}! You have {{count}} messages.',
        'param.optional': 'Name: {{name}}, Age: {{age}}',
        'english.only': 'English only value'
      });
      loadTranslations('fr', {
        'param.greeting': 'Bonjour, {{name}}!',
        'param.multiple': '{{greeting}}, {{name}}! Vous avez {{count}} messages.'
      });
    });

    describe('Basic translation', () => {
      it('should return translation for existing key', () => {
        expect(t('simple.key')).toBe('Simple value');
      });

      it('should return the key itself if translation not found', () => {
        expect(t('missing.key')).toBe('missing.key');
      });

      it('should default to English locale when no locale specified', () => {
        expect(t('simple.key')).toBe('Simple value');
      });
    });

    describe('Parameter interpolation', () => {
      it('should interpolate single parameter', () => {
        expect(t('param.greeting', { name: 'Alice' })).toBe('Hello, Alice!');
      });

      it('should interpolate multiple parameters', () => {
        const result = t('param.multiple', {
          greeting: 'Hi',
          name: 'Bob',
          count: 5
        });
        expect(result).toBe('Hi, Bob! You have 5 messages.');
      });

      it('should handle numeric parameters', () => {
        const result = t('param.multiple', {
          greeting: 'Hello',
          name: 'Charlie',
          count: 42
        });
        expect(result).toContain('42');
      });

      it('should handle boolean parameters', () => {
        loadTranslations('en', { 'bool.test': 'Active: {{isActive}}' });
        expect(t('bool.test', { isActive: true })).toBe('Active: true');
        expect(t('bool.test', { isActive: false })).toBe('Active: false');
      });

      it('should handle null parameters as empty string', () => {
        const result = t('param.optional', { name: 'Alice', age: null });
        expect(result).toBe('Name: Alice, Age: ');
      });

      it('should handle undefined parameters as empty string', () => {
        const result = t('param.optional', { name: 'Bob', age: undefined });
        expect(result).toBe('Name: Bob, Age: ');
      });

      it('should leave unmatched placeholders unchanged when params missing', () => {
        expect(t('param.greeting')).toBe('Hello, {{name}}!');
      });

      it('should leave placeholders unchanged when specific param missing', () => {
        const result = t('param.multiple', { greeting: 'Hi', name: 'Eve' });
        expect(result).toBe('Hi, Eve! You have {{count}} messages.');
      });
    });

    describe('Parameter interpolation - security ($-token injection)', () => {
      it('should not expand $& replacement token in parameter values', () => {
        const result = t('param.greeting', { name: '$&world' });
        expect(result).toBe('Hello, $&world!');
      });

      it('should preserve $$ literal in parameter values', () => {
        const result = t('param.greeting', { name: '$$world' });
        expect(result).toBe('Hello, $$world!');
      });

      it('should not expand $` replacement token in parameter values', () => {
        const result = t('param.greeting', { name: '$`world' });
        expect(result).toBe('Hello, $`world!');
      });

      it("should not expand $' replacement token in parameter values", () => {
        const result = t('param.greeting', { name: "$'world" });
        expect(result).toBe("Hello, $'world!");
      });
    });

    describe('Fallback behavior', () => {
      it('should fall back to English when translation missing in requested locale', () => {
        // 'english.only' exists in 'en' but not in 'fr'
        const result = t('english.only', undefined, 'fr');
        expect(result).toBe('English only value');
      });

      it('should return key when translation missing in both requested locale and English', () => {
        const result = t('completely.missing.key', undefined, 'de');
        expect(result).toBe('completely.missing.key');
      });

      it('should use English fallback with parameter interpolation', () => {
        // 'param.greeting' exists in both 'en' and 'fr', but if we use a locale without it
        const result = t('english.only', { name: 'Test' }, 'es');
        expect(result).toBe('English only value');
      });
    });

    describe('Locale selection', () => {
      it('should use specified locale when provided', () => {
        expect(t('param.greeting', { name: 'Marie' }, 'fr')).toBe('Bonjour, Marie!');
      });

      it('should default to English when locale parameter omitted', () => {
        expect(t('param.greeting', { name: 'John' })).toBe('Hello, John!');
      });

      it('should handle empty string locale as English', () => {
        expect(t('simple.key', undefined, '')).toBe('Simple value');
      });
    });

    describe('Edge cases', () => {
      it('should handle null params object', () => {
        expect(t('simple.key', null as unknown as TranslationParams)).toBe('Simple value');
      });

      it('should handle undefined params object', () => {
        expect(t('simple.key', undefined)).toBe('Simple value');
      });

      it('should handle empty params object', () => {
        expect(t('param.greeting', {})).toBe('Hello, {{name}}!');
      });

      it('should handle keys with special characters', () => {
        loadTranslations('en', { 'special.key-with_chars.123': 'Special value' });
        expect(t('special.key-with_chars.123')).toBe('Special value');
      });

      it('should handle empty key', () => {
        expect(t('')).toBe('');
      });

      it('should handle very long keys', () => {
        const longKey = 'a'.repeat(1000);
        expect(t(longKey)).toBe(longKey);
      });
    });
  });

  describe('useTranslation', () => {
    beforeEach(() => {
      clearTranslations();
      loadTranslations('en', { 'hook.test': 'Hook test {{value}}' });
      loadTranslations('fr', { 'hook.test': 'Test de crochet {{value}}' });
    });

    it('should return translation function and locale', () => {
      const { t: hookT, locale } = useTranslation();
      expect(typeof hookT).toBe('function');
      expect(locale).toBe('en');
    });

    it('should return translation function bound to specified locale', () => {
      const { t: hookT } = useTranslation('fr');
      expect(hookT('hook.test', { value: 'test' })).toBe('Test de crochet test');
    });

    it('should default to English locale when no locale specified', () => {
      const { t: hookT, locale } = useTranslation();
      expect(locale).toBe('en');
      expect(hookT('hook.test', { value: 'test' })).toBe('Hook test test');
    });

    it('should allow calling t without params', () => {
      const { t: hookT } = useTranslation('en');
      expect(hookT('hook.test')).toBe('Hook test {{value}}');
    });

    it('should handle multiple hook instances with different locales', () => {
      const enHook = useTranslation('en');
      const frHook = useTranslation('fr');

      expect(enHook.t('hook.test', { value: 'A' })).toBe('Hook test A');
      expect(frHook.t('hook.test', { value: 'B' })).toBe('Test de crochet B');
    });
  });

  describe('Security: Prototype pollution protection', () => {
    beforeEach(() => {
      clearTranslations();
    });

    it('should not pollute Object.prototype via __proto__ locale', () => {
      const originalProto = Object.prototype;
      const testObj: Record<string, unknown> = {};

      // Attempt to pollute via __proto__ as locale name
      loadTranslations('__proto__', { polluted: 'malicious value' });

      // Verify prototype not polluted
      expect(Object.prototype).toBe(originalProto);
      expect(testObj['polluted']).toBeUndefined();
    });

    it('should not pollute Object.prototype via constructor locale', () => {
      const testObj: Record<string, unknown> = {};

      loadTranslations('constructor', { polluted: 'malicious value' });

      expect(testObj['polluted']).toBeUndefined();
    });

    it('should not pollute Object.prototype via prototype locale', () => {
      const testObj: Record<string, unknown> = {};

      loadTranslations('prototype', { polluted: 'malicious value' });

      expect(testObj['polluted']).toBeUndefined();
    });

    it('should not pollute Object.prototype via __proto__ in translation key', () => {
      const testObj: Record<string, unknown> = {};

      loadTranslations('en', { '__proto__.polluted': 'malicious value' });

      expect(testObj['polluted']).toBeUndefined();
    });

    it('should handle __proto__ locale without throwing error', () => {
      expect(() => {
        loadTranslations('__proto__', { test: 'value' });
        t('test', undefined, '__proto__');
      }).not.toThrow();
    });
  });

  describe('i18n namespace export', () => {
    it('should export i18n namespace with all functions', () => {
      expect(typeof i18n.t).toBe('function');
      expect(typeof i18n.useTranslation).toBe('function');
      expect(typeof i18n.loadTranslations).toBe('function');
    });
  });

  describe('Real-world usage patterns', () => {
    beforeEach(() => {
      clearTranslations();
      loadTranslations('en', {
        'error.notFound': 'Resource not found',
        'error.unauthorized': 'Unauthorized access',
        'error.validation': 'Validation failed: {{field}}',
        'user.greeting': 'Welcome back, {{username}}!',
        'user.accountAge': 'Member since {{year}}',
        'notification.count': 'You have {{count}} new notification{{plural}}'
      });
    });

    it('should handle error messages', () => {
      expect(t('error.notFound')).toBe('Resource not found');
      expect(t('error.validation', { field: 'email' })).toBe('Validation failed: email');
    });

    it('should handle user greetings', () => {
      expect(t('user.greeting', { username: 'alice@example.com' })).toBe(
        'Welcome back, alice@example.com!'
      );
    });

    it('should handle numeric data', () => {
      expect(t('user.accountAge', { year: 2020 })).toBe('Member since 2020');
    });

    it('should handle conditional pluralization params', () => {
      expect(t('notification.count', { count: 1, plural: '' })).toBe('You have 1 new notification');
      expect(t('notification.count', { count: 5, plural: 's' })).toBe(
        'You have 5 new notifications'
      );
    });
  });

  describe('Immutability - Object.freeze() protection', () => {
    it('should freeze translations after loading to prevent mutations', () => {
      loadTranslations('en', { 'freeze.test': 'Test value' });

      // Attempt to modify a translation value (should fail in strict mode)
      expect(() => {
        (__translationStore as any).en['freeze.test'] = 'Modified value';
      }).toThrow(TypeError);
    });

    it('should prevent adding new keys to loaded locale', () => {
      loadTranslations('en', { 'freeze.existing': 'Existing' });

      // Attempt to add a new key to an existing locale (should fail)
      expect(() => {
        (__translationStore as any).en['freeze.new'] = 'New value';
      }).toThrow(TypeError);
    });

    it('should allow loading new locales (store itself is not frozen)', () => {
      loadTranslations('en', { 'freeze.en': 'English' });

      // Should be able to load a new locale without errors
      expect(() => {
        loadTranslations('fr', { 'freeze.fr': 'Français' });
      }).not.toThrow();

      expect(t('freeze.fr', undefined, 'fr')).toBe('Français');
    });

    it('should allow merging translations for same locale', () => {
      loadTranslations('en', { 'freeze.key1': 'Value 1' });

      // Should be able to load more translations for the same locale
      expect(() => {
        loadTranslations('en', { 'freeze.key2': 'Value 2' });
      }).not.toThrow();

      expect(t('freeze.key1')).toBe('Value 1');
      expect(t('freeze.key2')).toBe('Value 2');
    });

    it('should freeze merged translations', () => {
      loadTranslations('en', { 'freeze.original': 'Original' });
      loadTranslations('en', { 'freeze.added': 'Added' });

      // Attempt to modify the merged object (should fail)
      expect(() => {
        (__translationStore as any).en['freeze.original'] = 'Modified';
      }).toThrow(TypeError);
    });
  });
});
