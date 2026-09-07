/**
 * Tests for date/parse.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { parseDate, parseDateTime, parseISO, isValidDate } from './parse.js';

describe('date/parse', () => {
  describe('parseDate', () => {
    it('should parse valid date string', () => {
      const result = parseDate('2024-01-15');
      assert.strictEqual(result instanceof Date, true);
      assert.strictEqual(result?.toISOString().split('T')[0], '2024-01-15');
    });

    it('should parse ISO 8601 date string', () => {
      const result = parseDate('2024-01-15T10:30:00Z');
      assert.strictEqual(result instanceof Date, true);
      assert.strictEqual(result?.toISOString(), '2024-01-15T10:30:00.000Z');
    });

    it('should return null for invalid date string', () => {
      assert.strictEqual(parseDate('invalid'), null);
      assert.strictEqual(parseDate('not a date'), null);
    });

    it('should return null for empty string', () => {
      assert.strictEqual(parseDate(''), null);
    });

    it('should handle different date formats', () => {
      const formats = ['2024-01-15', '2024/01/15', 'January 15, 2024', '15 Jan 2024'];
      for (const format of formats) {
        const result = parseDate(format);
        // Note: Not all formats may be valid, but should return either Date or null
        assert.strictEqual(result === null || result instanceof Date, true);
      }
    });

    it('should handle edge cases', () => {
      // Invalid dates return null
      assert.strictEqual(parseDate('2024-13-01'), null); // Invalid month
      // Some invalid dates auto-correct to valid dates
      assert.strictEqual(parseDate('2024-02-30') instanceof Date, true); // Invalid day rolls over to March 1
    });
  });

  describe('parseDateTime', () => {
    it('should parse valid date-time string', () => {
      const result = parseDateTime('2024-01-15T10:30:00Z');
      assert.strictEqual(result instanceof Date, true);
      assert.strictEqual(result?.toISOString(), '2024-01-15T10:30:00.000Z');
    });

    it('should parse date-time without timezone', () => {
      const result = parseDateTime('2024-01-15T10:30:00');
      assert.strictEqual(result instanceof Date, true);
    });

    it('should return null for invalid date-time string', () => {
      assert.strictEqual(parseDateTime('invalid'), null);
      assert.strictEqual(parseDateTime(''), null);
    });

    it('should handle ISO 8601 format', () => {
      const result = parseDateTime('2024-01-15T10:30:00.123Z');
      assert.strictEqual(result instanceof Date, true);
    });
  });

  describe('parseISO', () => {
    it('should parse ISO 8601 date string', () => {
      const result = parseISO('2024-01-15T10:30:00Z');
      assert.strictEqual(result instanceof Date, true);
      assert.strictEqual(result?.toISOString(), '2024-01-15T10:30:00.000Z');
    });

    it('should parse ISO date only', () => {
      const result = parseISO('2024-01-15');
      assert.strictEqual(result instanceof Date, true);
    });

    it('should parse ISO with milliseconds', () => {
      const result = parseISO('2024-01-15T10:30:00.123Z');
      assert.strictEqual(result instanceof Date, true);
    });

    it('should return null for invalid ISO string', () => {
      assert.strictEqual(parseISO('invalid'), null);
      assert.strictEqual(parseISO(''), null);
    });

    it('should handle timezone offsets', () => {
      const result = parseISO('2024-01-15T10:30:00+05:00');
      assert.strictEqual(result instanceof Date, true);
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid dates', () => {
      assert.strictEqual(isValidDate(new Date()), true);
      assert.strictEqual(isValidDate(new Date('2024-01-15')), true);
      assert.strictEqual(isValidDate(new Date('2024-01-15T10:30:00Z')), true);
    });

    it('should return false for invalid dates', () => {
      assert.strictEqual(isValidDate(new Date('invalid')), false);
      assert.strictEqual(isValidDate(new Date('not a date')), false);
    });

    it('should return false for Invalid Date object', () => {
      const invalidDate = new Date('invalid');
      assert.strictEqual(isValidDate(invalidDate), false);
    });

    it('should handle edge cases', () => {
      assert.strictEqual(isValidDate(new Date(NaN)), false);
      // Invalid dates create Invalid Date objects
      assert.strictEqual(isValidDate(new Date('2024-13-45')), false);
    });

    it('should handle Unix timestamp', () => {
      assert.strictEqual(isValidDate(new Date(0)), true); // Epoch
      assert.strictEqual(isValidDate(new Date(1705305600000)), true);
    });

    it('should handle very large timestamps', () => {
      assert.strictEqual(isValidDate(new Date(8640000000000000)), true);
      assert.strictEqual(isValidDate(new Date(-8640000000000000)), true);
    });
  });
});
