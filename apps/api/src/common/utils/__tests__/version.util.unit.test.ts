/**
 * Tests for version utility functions
 */

import { normalizeSemanticVersion, InvalidVersionError } from '../version.util';

describe('normalizeSemanticVersion', () => {
  describe('valid inputs', () => {
    it('should normalize single number version', () => {
      expect(normalizeSemanticVersion('1')).toBe('1.0.0');
      expect(normalizeSemanticVersion('2')).toBe('2.0.0');
      expect(normalizeSemanticVersion('10')).toBe('10.0.0');
      expect(normalizeSemanticVersion('100')).toBe('100.0.0');
    });

    it('should normalize two-part version', () => {
      expect(normalizeSemanticVersion('1.0')).toBe('1.0.0');
      expect(normalizeSemanticVersion('2.5')).toBe('2.5.0');
      expect(normalizeSemanticVersion('10.20')).toBe('10.20.0');
    });

    it('should return three-part version unchanged', () => {
      expect(normalizeSemanticVersion('1.0.0')).toBe('1.0.0');
      expect(normalizeSemanticVersion('2.5.10')).toBe('2.5.10');
      expect(normalizeSemanticVersion('10.20.30')).toBe('10.20.30');
    });

    it('should handle v prefix (lowercase)', () => {
      expect(normalizeSemanticVersion('v1')).toBe('1.0.0');
      expect(normalizeSemanticVersion('v2.0')).toBe('2.0.0');
      expect(normalizeSemanticVersion('v3.0.0')).toBe('3.0.0');
      expect(normalizeSemanticVersion('v10')).toBe('10.0.0');
    });

    it('should handle V prefix (uppercase)', () => {
      expect(normalizeSemanticVersion('V1')).toBe('1.0.0');
      expect(normalizeSemanticVersion('V2.0')).toBe('2.0.0');
      expect(normalizeSemanticVersion('V3.0.0')).toBe('3.0.0');
    });

    it('should trim whitespace', () => {
      expect(normalizeSemanticVersion(' 1 ')).toBe('1.0.0');
      expect(normalizeSemanticVersion('v1 ')).toBe('1.0.0');
      expect(normalizeSemanticVersion(' 1.0.0 ')).toBe('1.0.0');
    });

    it('should handle zero versions', () => {
      expect(normalizeSemanticVersion('0')).toBe('0.0.0');
      expect(normalizeSemanticVersion('0.0')).toBe('0.0.0');
      expect(normalizeSemanticVersion('0.0.0')).toBe('0.0.0');
    });

    it('should handle large version numbers', () => {
      expect(normalizeSemanticVersion('999')).toBe('999.0.0');
      expect(normalizeSemanticVersion('999.999')).toBe('999.999.0');
      expect(normalizeSemanticVersion('999.999.999')).toBe('999.999.999');
    });
  });

  describe('invalid inputs - type and empty', () => {
    it('should throw InvalidVersionError for empty string', () => {
      expect(() => normalizeSemanticVersion('')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('')).toThrow('non-empty string');
    });

    it('should throw InvalidVersionError for null', () => {
      expect(() => normalizeSemanticVersion(null as unknown as string)).toThrow(
        InvalidVersionError
      );
      expect(() => normalizeSemanticVersion(null as unknown as string)).toThrow('non-empty string');
    });

    it('should throw InvalidVersionError for undefined', () => {
      expect(() => normalizeSemanticVersion(undefined as unknown as string)).toThrow(
        InvalidVersionError
      );
      expect(() => normalizeSemanticVersion(undefined as unknown as string)).toThrow(
        'non-empty string'
      );
    });

    it('should throw InvalidVersionError for number', () => {
      expect(() => normalizeSemanticVersion(1 as unknown as string)).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion(1 as unknown as string)).toThrow('non-empty string');
    });

    it('should throw InvalidVersionError for object', () => {
      expect(() => normalizeSemanticVersion({} as unknown as string)).toThrow(InvalidVersionError);
    });

    it('should throw InvalidVersionError for array', () => {
      expect(() => normalizeSemanticVersion([] as unknown as string)).toThrow(InvalidVersionError);
    });

    it('should throw InvalidVersionError for whitespace only', () => {
      expect(() => normalizeSemanticVersion('   ')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('   ')).toThrow('empty after removing prefix');

      expect(() => normalizeSemanticVersion('  \t  ')).toThrow(InvalidVersionError);
    });

    it('should throw InvalidVersionError for v prefix only', () => {
      expect(() => normalizeSemanticVersion('v')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('v')).toThrow('empty after removing prefix');

      expect(() => normalizeSemanticVersion('V')).toThrow(InvalidVersionError);
    });
  });

  describe('invalid inputs - format issues', () => {
    it('should throw InvalidVersionError for too many parts', () => {
      expect(() => normalizeSemanticVersion('1.0.0.0')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('1.0.0.0')).toThrow('too many parts');

      expect(() => normalizeSemanticVersion('1.2.3.4.5')).toThrow(InvalidVersionError);
    });

    it('should throw InvalidVersionError for non-numeric parts', () => {
      expect(() => normalizeSemanticVersion('1.x.0')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('1.x.0')).toThrow('not a valid number');

      expect(() => normalizeSemanticVersion('a.b.c')).toThrow(InvalidVersionError);
    });

    it('should throw InvalidVersionError for empty parts', () => {
      expect(() => normalizeSemanticVersion('1..0')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('1..0')).toThrow('not a valid number');

      expect(() => normalizeSemanticVersion('.1.0')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('1.0.')).toThrow(InvalidVersionError);
    });

    it('should throw InvalidVersionError for parts with special characters', () => {
      expect(() => normalizeSemanticVersion('1.0-beta')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('1.0.0+build')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('1.0_alpha')).toThrow(InvalidVersionError);
    });

    it('should throw InvalidVersionError for negative numbers', () => {
      expect(() => normalizeSemanticVersion('-1.0.0')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('1.-2.0')).toThrow(InvalidVersionError);
    });

    it('should handle parts with leading zeros (kept as-is)', () => {
      // Leading zeros are kept as-is since they pass the numeric check
      // The regex /^\d+$/ matches numbers with leading zeros
      expect(normalizeSemanticVersion('01.0.0')).toBe('01.0.0');
      expect(normalizeSemanticVersion('1.02.0')).toBe('1.02.0');
    });
  });

  describe('edge cases', () => {
    it('should handle version with multiple v prefixes', () => {
      // Only removes the first v/V, remaining 'v' is invalid
      expect(() => normalizeSemanticVersion('vv1')).toThrow(InvalidVersionError);
      expect(() => normalizeSemanticVersion('VV1')).toThrow(InvalidVersionError);
    });

    it('should handle version with v in the middle', () => {
      expect(() => normalizeSemanticVersion('1v.0.0')).toThrow(InvalidVersionError);
    });

    it('should handle mixed case v', () => {
      expect(normalizeSemanticVersion('v1')).toBe('1.0.0');
      expect(normalizeSemanticVersion('V1')).toBe('1.0.0');
    });

    it('should handle very long version strings', () => {
      expect(normalizeSemanticVersion('1234567890.0.0')).toBe('1234567890.0.0');
    });

    it('should handle version with newlines (trim removes them)', () => {
      // trim() removes leading/trailing whitespace including newlines
      expect(normalizeSemanticVersion('\n1.0.0')).toBe('1.0.0');
      expect(normalizeSemanticVersion('1.0.0\n')).toBe('1.0.0');
    });

    it('should throw error for tabs in version number', () => {
      expect(() => normalizeSemanticVersion('1.\t0.0')).toThrow(InvalidVersionError);
    });
  });

  describe('InvalidVersionError', () => {
    it('should have correct error name', () => {
      let error: Error | undefined;
      try {
        normalizeSemanticVersion('invalid');
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeInstanceOf(InvalidVersionError);
      expect(error?.name).toBe('InvalidVersionError');
    });

    it('should include version in error message', () => {
      expect(() => normalizeSemanticVersion('invalid-version')).toThrow('invalid-version');
    });

    it('should include reason in error message', () => {
      expect(() => normalizeSemanticVersion('')).toThrow('non-empty string');
    });
  });

  describe('real-world examples', () => {
    it('should handle common version formats', () => {
      expect(normalizeSemanticVersion('1')).toBe('1.0.0');
      expect(normalizeSemanticVersion('1.0')).toBe('1.0.0');
      expect(normalizeSemanticVersion('1.0.0')).toBe('1.0.0');
      expect(normalizeSemanticVersion('v1')).toBe('1.0.0');
      expect(normalizeSemanticVersion('v1.0')).toBe('1.0.0');
      expect(normalizeSemanticVersion('v1.0.0')).toBe('1.0.0');
    });

    it('should handle API version prefixes', () => {
      expect(normalizeSemanticVersion('v1')).toBe('1.0.0');
      expect(normalizeSemanticVersion('v2')).toBe('2.0.0');
      expect(normalizeSemanticVersion('v10')).toBe('10.0.0');
      expect(normalizeSemanticVersion('v20')).toBe('20.0.0');
    });

    it('should reject pre-release versions', () => {
      expect(() => normalizeSemanticVersion('1.0.0-alpha')).toThrow();
      expect(() => normalizeSemanticVersion('1.0.0-beta.1')).toThrow();
      expect(() => normalizeSemanticVersion('1.0.0-rc.1')).toThrow();
    });

    it('should reject build metadata', () => {
      expect(() => normalizeSemanticVersion('1.0.0+build')).toThrow();
      expect(() => normalizeSemanticVersion('1.0.0+20130313144700')).toThrow();
    });

    it('should reject ranges', () => {
      expect(() => normalizeSemanticVersion('^1.0.0')).toThrow();
      expect(() => normalizeSemanticVersion('~1.0.0')).toThrow();
      expect(() => normalizeSemanticVersion('>=1.0.0')).toThrow();
      expect(() => normalizeSemanticVersion('1.x')).toThrow();
    });
  });
});
