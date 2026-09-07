/**
 * Tests for string/transform.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { truncate, ellipsize, normalizeWhitespace, clean } from './transform.js';

describe('string/transform', () => {
  describe('truncate', () => {
    it('should truncate string to max length with suffix', () => {
      assert.strictEqual(truncate('hello world', 8), 'hello...');
      assert.strictEqual(truncate('hello world', 10), 'hello w...');
    });

    it('should return original string if shorter than max length', () => {
      assert.strictEqual(truncate('hello', 10), 'hello');
      assert.strictEqual(truncate('hello', 5), 'hello');
    });

    it('should handle custom suffix', () => {
      assert.strictEqual(truncate('hello world', 8, '---'), 'hello---');
      assert.strictEqual(truncate('hello world', 10, '>>'), 'hello w>>');
    });

    it('should handle empty string', () => {
      assert.strictEqual(truncate('', 5), '');
      assert.strictEqual(truncate('', 5, '...'), '');
    });

    it('should handle edge case where suffix equals max length', () => {
      assert.strictEqual(truncate('hello', 3, '...'), '...');
    });

    it('should handle max length less than suffix length', () => {
      assert.strictEqual(truncate('hello world', 2, '...'), '...');
    });
  });

  describe('ellipsize', () => {
    it('should ellipsize from the middle', () => {
      assert.strictEqual(ellipsize('hello world', 8), 'hel...ld');
      assert.strictEqual(ellipsize('hello world', 10), 'hell...rld');
    });

    it('should return original string if shorter than max length', () => {
      assert.strictEqual(ellipsize('hello', 10), 'hello');
      assert.strictEqual(ellipsize('hello', 5), 'hello');
    });

    it('should handle empty string', () => {
      assert.strictEqual(ellipsize('', 5), '');
    });

    it('should handle very short max length', () => {
      assert.strictEqual(ellipsize('hello', 1), '.');
      assert.strictEqual(ellipsize('hello', 2), '..');
      assert.strictEqual(ellipsize('hello', 3), '...');
      assert.strictEqual(ellipsize('hello', 4), 'h...');
    });

    it('should handle max length of 3 (minimum for ellipsis)', () => {
      assert.strictEqual(ellipsize('hello world', 3), '...');
    });

    it('should handle even and odd max lengths', () => {
      assert.strictEqual(ellipsize('abcdefghij', 7), 'ab...ij');
      assert.strictEqual(ellipsize('abcdefghij', 8), 'abc...ij');
    });

    it('should respect maxLength constraint', () => {
      // Verify output is exactly maxLength when input exceeds it
      assert.strictEqual(ellipsize('hello world', 8).length, 8);
      assert.strictEqual(ellipsize('abcdefghij', 7).length, 7);
      assert.strictEqual(ellipsize('hello', 4).length, 4);
    });
  });

  describe('normalizeWhitespace', () => {
    it('should normalize multiple spaces to single space', () => {
      assert.strictEqual(normalizeWhitespace('hello  world'), 'hello world');
      assert.strictEqual(normalizeWhitespace('hello    world'), 'hello world');
    });

    it('should normalize tabs and newlines', () => {
      assert.strictEqual(normalizeWhitespace('hello\tworld'), 'hello world');
      assert.strictEqual(normalizeWhitespace('hello\nworld'), 'hello world');
      assert.strictEqual(normalizeWhitespace('hello\r\nworld'), 'hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      assert.strictEqual(normalizeWhitespace('  hello world  '), 'hello world');
      assert.strictEqual(normalizeWhitespace('\thello world\t'), 'hello world');
    });

    it('should handle empty string', () => {
      assert.strictEqual(normalizeWhitespace(''), '');
    });

    it('should handle strings with only whitespace', () => {
      assert.strictEqual(normalizeWhitespace('   '), '');
      assert.strictEqual(normalizeWhitespace('\t\n '), '');
    });

    it('should handle mixed whitespace types', () => {
      assert.strictEqual(normalizeWhitespace('hello  \t\n  world'), 'hello world');
    });
  });

  describe('clean', () => {
    it('should remove extra spaces and trim', () => {
      assert.strictEqual(clean('hello  world'), 'hello world');
      assert.strictEqual(clean('  hello  world  '), 'hello world');
    });

    it('should normalize tabs and newlines', () => {
      assert.strictEqual(clean('hello\t\tworld'), 'hello world');
      assert.strictEqual(clean('hello\n\nworld'), 'hello world');
    });

    it('should trim leading and trailing whitespace', () => {
      assert.strictEqual(clean('  hello world  '), 'hello world');
      assert.strictEqual(clean('\thello world\t'), 'hello world');
    });

    it('should handle empty string', () => {
      assert.strictEqual(clean(''), '');
    });

    it('should handle strings with only whitespace', () => {
      assert.strictEqual(clean('   '), '');
      assert.strictEqual(clean('\t\n '), '');
    });

    it('should work like normalizeWhitespace', () => {
      const str = '  hello   world  ';
      assert.strictEqual(clean(str), normalizeWhitespace(str));
    });
  });
});
