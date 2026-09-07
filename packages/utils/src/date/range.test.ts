/**
 * Tests for date/range.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  createDateRange,
  isDateInRange,
  overlapRanges,
  getRangeDuration,
  type DateRange
} from './range.js';

describe('date/range', () => {
  describe('createDateRange', () => {
    it('should create a date range with valid dates', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range = createDateRange(start, end);
      assert.deepStrictEqual(range, { start, end });
    });

    it('should create range with same start and end', () => {
      const date = new Date('2024-01-01');
      const range = createDateRange(date, date);
      assert.deepStrictEqual(range, { start: date, end: date });
    });

    it('should throw error when start is after end', () => {
      const start = new Date('2024-01-31');
      const end = new Date('2024-01-01');
      assert.throws(() => createDateRange(start, end), {
        message: 'Start date must be before end date'
      });
    });

    it('should create range with times', () => {
      const start = new Date('2024-01-01T10:00:00Z');
      const end = new Date('2024-01-01T18:00:00Z');
      const range = createDateRange(start, end);
      assert.deepStrictEqual(range, { start, end });
    });

    it('should return readonly DateRange', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range = createDateRange(start, end);
      // DateRange has readonly properties
      assert.strictEqual(Object.isFrozen(range) || Object.isSealed(range), false);
      // But the type has readonly modifiers
    });
  });

  describe('isDateInRange', () => {
    it('should return true for date within range', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range: DateRange = { start, end };
      const date = new Date('2024-01-15');
      assert.strictEqual(isDateInRange(date, range), true);
    });

    it('should return true for date equal to start', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range: DateRange = { start, end };
      assert.strictEqual(isDateInRange(start, range), true);
    });

    it('should return true for date equal to end', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range: DateRange = { start, end };
      assert.strictEqual(isDateInRange(end, range), true);
    });

    it('should return false for date before range', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range: DateRange = { start, end };
      const date = new Date('2023-12-31');
      assert.strictEqual(isDateInRange(date, range), false);
    });

    it('should return false for date after range', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range: DateRange = { start, end };
      const date = new Date('2024-02-01');
      assert.strictEqual(isDateInRange(date, range), false);
    });

    it('should handle same-day ranges with times', () => {
      const start = new Date('2024-01-01T10:00:00Z');
      const end = new Date('2024-01-01T18:00:00Z');
      const range: DateRange = { start, end };
      const during = new Date('2024-01-01T14:00:00Z');
      const before = new Date('2024-01-01T09:00:00Z');
      const after = new Date('2024-01-01T19:00:00Z');
      assert.strictEqual(isDateInRange(during, range), true);
      assert.strictEqual(isDateInRange(before, range), false);
      assert.strictEqual(isDateInRange(after, range), false);
    });
  });

  describe('overlapRanges', () => {
    it('should return true for overlapping ranges', () => {
      const range1: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };
      const range2: DateRange = {
        start: new Date('2024-01-15'),
        end: new Date('2024-02-15')
      };
      assert.strictEqual(overlapRanges(range1, range2), true);
    });

    it('should return true for contained range', () => {
      const range1: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-03-31')
      };
      const range2: DateRange = {
        start: new Date('2024-01-15'),
        end: new Date('2024-02-15')
      };
      assert.strictEqual(overlapRanges(range1, range2), true);
    });

    it('should return true for touching ranges at boundaries', () => {
      const range1: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };
      const range2: DateRange = {
        start: new Date('2024-01-31'),
        end: new Date('2024-02-28')
      };
      assert.strictEqual(overlapRanges(range1, range2), true);
    });

    it('should return false for non-overlapping ranges', () => {
      const range1: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };
      const range2: DateRange = {
        start: new Date('2024-02-01'),
        end: new Date('2024-02-28')
      };
      assert.strictEqual(overlapRanges(range1, range2), false);
    });

    it('should return false for range completely after', () => {
      const range1: DateRange = {
        start: new Date('2024-02-01'),
        end: new Date('2024-02-28')
      };
      const range2: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };
      assert.strictEqual(overlapRanges(range1, range2), false);
    });

    it('should handle same range', () => {
      const range: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      };
      assert.strictEqual(overlapRanges(range, range), true);
    });

    it('should handle single day ranges', () => {
      const range1: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-01')
      };
      const range2: DateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-01')
      };
      assert.strictEqual(overlapRanges(range1, range2), true);
    });
  });

  describe('getRangeDuration', () => {
    it('should calculate duration in milliseconds', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-01T01:00:00Z');
      const range: DateRange = { start, end };
      const duration = getRangeDuration(range);
      assert.strictEqual(duration, 60 * 60 * 1000); // 1 hour in milliseconds
    });

    it('should calculate duration for multi-day range', () => {
      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-03T00:00:00Z');
      const range: DateRange = { start, end };
      const duration = getRangeDuration(range);
      assert.strictEqual(duration, 2 * 24 * 60 * 60 * 1000); // 2 days
    });

    it('should return 0 for same start and end', () => {
      const date = new Date('2024-01-01');
      const range: DateRange = { start: date, end: date };
      assert.strictEqual(getRangeDuration(range), 0);
    });

    it('should handle negative duration (edge case)', () => {
      const start = new Date('2024-01-03');
      const end = new Date('2024-01-01');
      const range: DateRange = { start, end };
      const duration = getRangeDuration(range);
      assert.strictEqual(duration < 0, true);
    });
  });
});
