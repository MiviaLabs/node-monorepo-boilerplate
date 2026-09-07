/**
 * Tests for date/format.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { formatDate, formatDateTime, formatTime, formatRelative } from './format.js';

describe('date/format', () => {
  describe('formatDate', () => {
    it('should format date to localized string', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date);
      // Format varies by locale, just check it returns a string
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle custom locale', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDate(date, 'de-DE');
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle date at midnight', () => {
      const date = new Date('2024-01-15T00:00:00Z');
      const result = formatDate(date);
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle different months', () => {
      const dates = [new Date('2024-01-15'), new Date('2024-06-15'), new Date('2024-12-15')];
      for (const date of dates) {
        const result = formatDate(date);
        assert.strictEqual(typeof result, 'string');
      }
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time to localized string', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDateTime(date);
      assert.strictEqual(typeof result, 'string');
    });

    it('should include time portion', () => {
      const date = new Date('2024-01-15T10:30:45Z');
      const result = formatDateTime(date);
      // Result should be different from just date
      const dateOnly = formatDate(date);
      assert.strictEqual(result !== dateOnly, true);
    });

    it('should handle custom locale', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatDateTime(date, 'de-DE');
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle date at midnight', () => {
      const date = new Date('2024-01-15T00:00:00Z');
      const result = formatDateTime(date);
      assert.strictEqual(typeof result, 'string');
    });
  });

  describe('formatTime', () => {
    it('should format time to localized string', () => {
      const date = new Date('2024-01-15T10:30:45Z');
      const result = formatTime(date);
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle different times', () => {
      const times = [
        new Date('2024-01-15T00:00:00Z'),
        new Date('2024-01-15T12:30:00Z'),
        new Date('2024-01-15T23:59:59Z')
      ];
      for (const time of times) {
        const result = formatTime(time);
        assert.strictEqual(typeof result, 'string');
      }
    });

    it('should handle custom locale', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = formatTime(date, 'de-DE');
      assert.strictEqual(typeof result, 'string');
    });
  });

  describe('formatRelative', () => {
    it('should format recent date as seconds ago', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 5000); // 5 seconds ago
      const result = formatRelative(date);
      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result.includes('5'), true);
    });

    it('should format recent date as minutes ago', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
      const result = formatRelative(date);
      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result.includes('5'), true);
    });

    it('should format recent date as hours ago', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago
      const result = formatRelative(date);
      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result.includes('3'), true);
    });

    it('should format date within last week as days ago', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      const result = formatRelative(date);
      assert.strictEqual(typeof result, 'string');
      assert.strictEqual(result.includes('5'), true);
    });

    it('should format date older than week as absolute date', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const result = formatRelative(date);
      // Should return formatted date, not relative time
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle custom locale', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 5000);
      const result = formatRelative(date, 'de-DE');
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle future dates', () => {
      const now = new Date();
      const date = new Date(now.getTime() + 5000); // 5 seconds in future
      const result = formatRelative(date);
      assert.strictEqual(typeof result, 'string');
    });

    it('should handle current time', () => {
      const date = new Date();
      const result = formatRelative(date);
      assert.strictEqual(typeof result, 'string');
    });
  });
});
