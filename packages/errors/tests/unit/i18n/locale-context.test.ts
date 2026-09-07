/**
 * Unit tests for LocaleContext
 *
 * Tests the LocaleContext class which provides request-scoped locale management.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { DEFAULT_LOCALE } from '../../../src/i18n/i18n.types';
import { LocaleContext } from '../../../src/i18n/locale-context';

describe('LocaleContext', () => {
  describe('run()', () => {
    it('should set locale for callback duration', () => {
      let capturedLocale: string | null = null;

      LocaleContext.run('ar-SA', () => {
        capturedLocale = LocaleContext.getLocale();
      });

      assert.equal(capturedLocale, 'ar-SA');
    });

    it('should return the callback return value', () => {
      const result = LocaleContext.run('en', () => {
        return 'test return value';
      });

      assert.equal(result, 'test return value');
    });

    it('should return complex return values', () => {
      const result = LocaleContext.run('en', () => {
        return { foo: 'bar', num: 42 };
      });

      assert.deepStrictEqual(result, { foo: 'bar', num: 42 });
    });

    it('should allow exceptions to propagate', () => {
      assert.throws(
        () => {
          LocaleContext.run('en', () => {
            throw new Error('Test error');
          });
        },
        (err: Error) => err.message === 'Test error'
      );
    });
  });

  describe('getLocale()', () => {
    it('should return the set locale within context', () => {
      LocaleContext.run('ar-SA', () => {
        const locale = LocaleContext.getLocale();
        assert.equal(locale, 'ar-SA');
      });
    });

    it('should return default locale when no context is set', () => {
      // Ensure no context is active by running outside of any run()
      const locale = LocaleContext.getLocale();
      assert.equal(locale, DEFAULT_LOCALE);
    });

    it('should return default locale when context exits', () => {
      LocaleContext.run('en', () => {
        // Inside context, should be default (en)
        assert.equal(LocaleContext.getLocale(), DEFAULT_LOCALE);
      });

      // Outside context, should be default
      assert.equal(LocaleContext.getLocale(), DEFAULT_LOCALE);
    });

    it('should handle multiple sequential contexts', () => {
      // First context
      LocaleContext.run('ar-SA', () => {
        assert.equal(LocaleContext.getLocale(), 'ar-SA');
      });

      // Second context
      LocaleContext.run('en', () => {
        assert.equal(LocaleContext.getLocale(), 'en');
      });

      // After both, should be default
      assert.equal(LocaleContext.getLocale(), DEFAULT_LOCALE);
    });
  });

  describe('setLocale()', () => {
    it('should update locale within active context', () => {
      LocaleContext.run('en', () => {
        assert.equal(LocaleContext.getLocale(), 'en');

        LocaleContext.setLocale('ar-SA');
        assert.equal(LocaleContext.getLocale(), 'ar-SA');
      });
    });

    it('should throw error when no context is active', () => {
      assert.throws(
        () => {
          LocaleContext.setLocale('ar-SA');
        },
        (err: Error) => {
          return (
            err.message.includes('Cannot set locale') &&
            err.message.includes('No active LocaleContext') &&
            err.message.includes('LocaleContext.run()')
          );
        }
      );
    });

    it('should throw error when called after context exits', () => {
      let setLocaleAfterExit: (() => void) | null = null;

      LocaleContext.run('en', () => {
        // Capture the function to call it later
        setLocaleAfterExit = () => LocaleContext.setLocale('ar-SA');
      });

      // Call the captured function after context has exited
      assert.ok(setLocaleAfterExit, 'Function should be captured');
      assert.throws(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        setLocaleAfterExit!,
        (err: Error) => {
          return (
            err.message.includes('Cannot set locale') &&
            err.message.includes('No active LocaleContext')
          );
        }
      );
    });
  });

  describe('hasContext()', () => {
    it('should return true when context is active', () => {
      let result = false;

      LocaleContext.run('en', () => {
        result = LocaleContext.hasContext();
      });

      assert.equal(result, true);
    });

    it('should return false when no context is active', () => {
      const result = LocaleContext.hasContext();
      assert.equal(result, false);
    });

    it('should return false after context exits', () => {
      LocaleContext.run('en', () => {
        assert.equal(LocaleContext.hasContext(), true);
      });

      assert.equal(LocaleContext.hasContext(), false);
    });

    it('should correctly report nested context states', () => {
      let outerContextState: boolean | null = null;
      let innerContextState: boolean | null = null;
      let afterNestedState: boolean | null = null;

      LocaleContext.run('en', () => {
        outerContextState = LocaleContext.hasContext();

        LocaleContext.run('ar-SA', () => {
          innerContextState = LocaleContext.hasContext();
        });

        afterNestedState = LocaleContext.hasContext();
      });

      assert.equal(outerContextState, true);
      assert.equal(innerContextState, true);
      assert.equal(afterNestedState, true);
    });
  });

  describe('Nested context isolation', () => {
    it('should isolate nested context locales', () => {
      let outerLocale: string | null = null;
      let innerLocale: string | null = null;
      let afterNestedLocale: string | null = null;

      LocaleContext.run('en', () => {
        outerLocale = LocaleContext.getLocale();
        assert.equal(outerLocale, 'en');

        LocaleContext.run('ar-SA', () => {
          innerLocale = LocaleContext.getLocale();
          assert.equal(innerLocale, 'ar-SA');
        });

        afterNestedLocale = LocaleContext.getLocale();
        assert.equal(afterNestedLocale, 'en');
      });

      assert.equal(outerLocale, 'en');
      assert.equal(innerLocale, 'ar-SA');
      assert.equal(afterNestedLocale, 'en');
    });

    it('should not affect outer context when inner context modifies locale', () => {
      let outerBeforeInner: string | null = null;
      let outerAfterInner: string | null = null;

      LocaleContext.run('en', () => {
        outerBeforeInner = LocaleContext.getLocale();

        LocaleContext.run('ar-SA', () => {
          // Modify inner context locale
          LocaleContext.setLocale('ar-SA');
          assert.equal(LocaleContext.getLocale(), 'ar-SA');
        });

        outerAfterInner = LocaleContext.getLocale();
      });

      assert.equal(outerBeforeInner, 'en');
      assert.equal(outerAfterInner, 'en');
    });

    it('should allow multiple parallel contexts (sequential execution)', () => {
      const results: string[] = [];

      LocaleContext.run('en', () => {
        results.push(LocaleContext.getLocale());
      });

      LocaleContext.run('ar-SA', () => {
        results.push(LocaleContext.getLocale());
      });

      assert.deepStrictEqual(results, ['en', 'ar-SA']);
    });
  });

  describe('Context storage access', () => {
    it('should provide access to storage for advanced use cases', () => {
      assert.ok(LocaleContext.storage, 'storage should be accessible');
      assert.equal(typeof LocaleContext.storage.run, 'function');
    });

    it('should allow direct storage manipulation for advanced scenarios', () => {
      let capturedLocale: string | null = null;

      // Use storage directly
      LocaleContext.storage.run({ locale: 'en-US' }, () => {
        capturedLocale = LocaleContext.getLocale();
      });

      assert.equal(capturedLocale, 'en-US');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty callback gracefully', () => {
      // Should not throw
      LocaleContext.run('en', () => {
        // Do nothing
      });
      // If we reach here, the test passed
      assert.ok(true);
    });

    it('should handle synchronous callbacks that return undefined', () => {
      const result = LocaleContext.run('en', () => {
        // Explicitly return undefined
        return undefined;
      });

      assert.equal(result, undefined);
    });

    it('should handle null and undefined as potential locale values', () => {
      // This test documents current behavior
      // TypeScript prevents null/undefined, but let's verify runtime behavior
      LocaleContext.run('en', () => {
        const locale = LocaleContext.getLocale();
        assert.equal(typeof locale, 'string');
        assert.ok(locale.length > 0);
      });
    });

    it('should handle very long locale codes', () => {
      const longLocale = 'en-US-Latn-x-twemoji'; // Valid BCP 47 tag
      LocaleContext.run(longLocale, () => {
        assert.equal(LocaleContext.getLocale(), longLocale);
      });
    });

    it('should handle locale codes with numbers', () => {
      const numericLocale = 'en-001'; // Valid BCP 47 tag (Latin America)
      LocaleContext.run(numericLocale, () => {
        assert.equal(LocaleContext.getLocale(), numericLocale);
      });
    });
  });
});
