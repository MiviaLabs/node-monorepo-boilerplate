/**
 * Tests for string/validate.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { isEmail, isUUID, isURL, isEmpty, isNumeric } from './validate.js';

describe('string/validate', () => {
  describe('isEmail', () => {
    it('should return true for valid emails', () => {
      assert.strictEqual(isEmail('test@example.com'), true);
      assert.strictEqual(isEmail('user.name@example.com'), true);
      assert.strictEqual(isEmail('user+tag@example.co.uk'), true);
      assert.strictEqual(isEmail('123@example.com'), true);
    });

    it('should return false for invalid emails', () => {
      assert.strictEqual(isEmail('invalid'), false);
      assert.strictEqual(isEmail('@example.com'), false);
      assert.strictEqual(isEmail('test@'), false);
      assert.strictEqual(isEmail('test@.com'), false);
      assert.strictEqual(isEmail('test..name@example.com'), false);
      assert.strictEqual(isEmail('test@example'), false);
    });

    it('should return false for empty string', () => {
      assert.strictEqual(isEmail(''), false);
    });

    it('should return false for strings with spaces', () => {
      assert.strictEqual(isEmail('test @example.com'), false);
      assert.strictEqual(isEmail('test@ example.com'), false);
    });
  });

  describe('isUUID', () => {
    it('should return true for valid UUID v4', () => {
      assert.strictEqual(isUUID('550e8400-e29b-41d4-a716-446655440000'), true);
      assert.strictEqual(isUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8'), true);
      assert.strictEqual(isUUID('6ba7b811-9dad-11d1-80b4-00c04fd430c8'), true);
      assert.strictEqual(isUUID('ffffffff-ffff-4fff-bfff-ffffffffffff'), true);
    });

    it('should return false for invalid UUIDs', () => {
      assert.strictEqual(isUUID(''), false);
      assert.strictEqual(isUUID('not-a-uuid'), false);
      assert.strictEqual(isUUID('550e8400-e29b-41d4-a716'), false);
      assert.strictEqual(isUUID('550e8400-e29b-41d4-a716-446655440000-extra'), false);
      assert.strictEqual(isUUID('g50e8400-e29b-41d4-a716-446655440000'), false);
      assert.strictEqual(isUUID('550e8400-e29b-01d4-a716-446655440000'), false);
      assert.strictEqual(isUUID('550e8400-e29b-41d4-c716-446655440000'), false);
    });

    it('should be case insensitive', () => {
      assert.strictEqual(isUUID('550E8400-E29B-41D4-A716-446655440000'), true);
      assert.strictEqual(isUUID('550e8400-e29b-41d4-a716-446655440000'), true);
    });

    it('should handle empty string', () => {
      assert.strictEqual(isUUID(''), false);
    });
  });

  describe('isURL', () => {
    it('should return true for valid URLs', () => {
      assert.strictEqual(isURL('https://example.com'), true);
      assert.strictEqual(isURL('http://example.com'), true);
      assert.strictEqual(isURL('https://example.com/path'), true);
      assert.strictEqual(isURL('https://example.com?query=value'), true);
      assert.strictEqual(isURL('https://example.com#anchor'), true);
      assert.strictEqual(isURL('ftp://example.com'), true);
      assert.strictEqual(isURL('file:///path/to/file'), true);
    });

    it('should return false for invalid URLs', () => {
      assert.strictEqual(isURL(''), false);
      assert.strictEqual(isURL('not-a-url'), false);
      assert.strictEqual(isURL('example.com'), false);
      assert.strictEqual(isURL('://example.com'), false);
    });

    it('should handle localhost URLs', () => {
      assert.strictEqual(isURL('http://localhost'), true);
      assert.strictEqual(isURL('http://localhost:3000'), true);
      assert.strictEqual(isURL('http://127.0.0.1'), true);
    });

    it('should handle IP addresses', () => {
      assert.strictEqual(isURL('http://192.168.1.1'), true);
      assert.strictEqual(isURL('https://10.0.0.1:8080'), true);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty string', () => {
      assert.strictEqual(isEmpty(''), true);
    });

    it('should return true for whitespace-only strings', () => {
      assert.strictEqual(isEmpty('   '), true);
      assert.strictEqual(isEmpty('\t'), true);
      assert.strictEqual(isEmpty('\n'), true);
      assert.strictEqual(isEmpty(' \t\n '), true);
    });

    it('should return false for non-empty strings', () => {
      assert.strictEqual(isEmpty('hello'), false);
      assert.strictEqual(isEmpty(' hello '), false);
      assert.strictEqual(isEmpty('a'), false);
    });
  });

  describe('isNumeric', () => {
    it('should return true for numeric strings', () => {
      assert.strictEqual(isNumeric('123'), true);
      assert.strictEqual(isNumeric('123.45'), true);
      assert.strictEqual(isNumeric('-123'), true);
      assert.strictEqual(isNumeric('-123.45'), true);
      assert.strictEqual(isNumeric('0'), true);
      assert.strictEqual(isNumeric('0.0'), true);
      assert.strictEqual(isNumeric('.5'), true);
      assert.strictEqual(isNumeric('1e5'), true);
      assert.strictEqual(isNumeric('1E-5'), true);
    });

    it('should return false for non-numeric strings', () => {
      assert.strictEqual(isNumeric(''), false);
      assert.strictEqual(isNumeric('abc'), false);
      assert.strictEqual(isNumeric('12a3'), false);
      assert.strictEqual(isNumeric('12 3'), false);
      assert.strictEqual(isNumeric('   '), false);
      assert.strictEqual(isNumeric('NaN'), false);
    });

    it('should handle whitespace around numbers', () => {
      assert.strictEqual(isNumeric(' 123 '), true);
      assert.strictEqual(isNumeric('\t123.45\n'), true);
    });

    it('should return false for whitespace-only strings', () => {
      assert.strictEqual(isNumeric('  '), false);
      assert.strictEqual(isNumeric('\t'), false);
    });
  });
});
