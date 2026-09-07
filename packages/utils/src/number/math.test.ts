/**
 * Tests for number/math.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { clamp, round, floor, ceil, safeDivide } from './math.js';

describe('number/math', () => {
  describe('clamp', () => {
    it('should return value within bounds', () => {
      assert.strictEqual(clamp(5, 0, 10), 5);
      assert.strictEqual(clamp(0, 0, 10), 0);
      assert.strictEqual(clamp(10, 0, 10), 10);
    });

    it('should clamp value to min when below', () => {
      assert.strictEqual(clamp(-5, 0, 10), 0);
      assert.strictEqual(clamp(-100, 0, 10), 0);
    });

    it('should clamp value to max when above', () => {
      assert.strictEqual(clamp(15, 0, 10), 10);
      assert.strictEqual(clamp(100, 0, 10), 10);
    });

    it('should handle negative ranges', () => {
      assert.strictEqual(clamp(-5, -10, -1), -5);
      assert.strictEqual(clamp(-15, -10, -1), -10);
      assert.strictEqual(clamp(5, -10, -1), -1);
    });

    it('should handle decimal values', () => {
      assert.strictEqual(clamp(5.5, 0.5, 10.5), 5.5);
      assert.strictEqual(clamp(0.2, 0.5, 10.5), 0.5);
      assert.strictEqual(clamp(15.5, 0.5, 10.5), 10.5);
    });

    it('should handle min equals max', () => {
      assert.strictEqual(clamp(5, 10, 10), 10);
      assert.strictEqual(clamp(0, 10, 10), 10);
      assert.strictEqual(clamp(20, 10, 10), 10);
    });

    it('should handle zero range', () => {
      assert.strictEqual(clamp(0, 0, 0), 0);
    });

    it('should throw RangeError when min > max', () => {
      assert.throws(() => clamp(5, 10, 0), {
        name: 'RangeError',
        message: 'clamp: min (10) must be less than or equal to max (0)'
      });
    });
  });

  describe('round', () => {
    it('should round to integer by default', () => {
      assert.strictEqual(round(5.4), 5);
      assert.strictEqual(round(5.5), 6);
      assert.strictEqual(round(5.6), 6);
    });

    it('should round to specified decimal places', () => {
      assert.strictEqual(round(5.456, 2), 5.46);
      assert.strictEqual(round(5.454, 2), 5.45);
      assert.strictEqual(round(5.4567, 3), 5.457);
    });

    it('should handle zero decimal places', () => {
      assert.strictEqual(round(5.7, 0), 6);
      assert.strictEqual(round(5.2, 0), 5);
    });

    it('should handle negative decimals (rounds to left of decimal)', () => {
      assert.strictEqual(round(567, -1), 570);
      assert.strictEqual(round(567, -2), 600);
    });

    it('should handle very small decimals', () => {
      assert.strictEqual(round(0.0004, 3), 0);
      assert.strictEqual(round(0.0005, 3), 0.001);
    });

    it('should handle edge case of .5 rounding', () => {
      assert.strictEqual(round(2.5), 3);
      assert.strictEqual(round(3.5), 4);
      assert.strictEqual(round(-2.5), -2);
      assert.strictEqual(round(-3.5), -3);
    });

    it('should handle very large numbers', () => {
      assert.strictEqual(round(1234567.89, 1), 1234567.9);
    });
  });

  describe('floor', () => {
    it('should round down to nearest integer', () => {
      assert.strictEqual(floor(5.7), 5);
      assert.strictEqual(floor(5.2), 5);
      assert.strictEqual(floor(5.0), 5);
    });

    it('should handle negative numbers', () => {
      assert.strictEqual(floor(-5.2), -6);
      assert.strictEqual(floor(-5.7), -6);
    });

    it('should handle integers', () => {
      assert.strictEqual(floor(5), 5);
      assert.strictEqual(floor(-5), -5);
    });

    it('should handle very small decimals', () => {
      assert.strictEqual(floor(0.1), 0);
      assert.strictEqual(floor(-0.1), -1);
    });
  });

  describe('ceil', () => {
    it('should round up to nearest integer', () => {
      assert.strictEqual(ceil(5.2), 6);
      assert.strictEqual(ceil(5.7), 6);
      assert.strictEqual(ceil(5.0), 5);
    });

    it('should handle negative numbers', () => {
      assert.strictEqual(ceil(-5.2), -5);
      assert.strictEqual(ceil(-5.7), -5);
    });

    it('should handle integers', () => {
      assert.strictEqual(ceil(5), 5);
      assert.strictEqual(ceil(-5), -5);
    });

    it('should handle very small decimals', () => {
      assert.strictEqual(ceil(0.1), 1);
      assert.strictEqual(ceil(-0.1), 0);
    });
  });

  describe('safeDivide', () => {
    it('should divide two numbers', () => {
      assert.strictEqual(safeDivide(10, 2), 5);
      assert.strictEqual(safeDivide(7, 2), 3.5);
    });

    it('should return fallback on division by zero', () => {
      assert.strictEqual(safeDivide(10, 0), 0);
      assert.strictEqual(safeDivide(10, 0, 42), 42);
    });

    it('should handle custom fallback values', () => {
      assert.strictEqual(safeDivide(10, 0, -1), -1);
      assert.strictEqual(safeDivide(10, 0, Number.NaN), Number.NaN);
    });

    it('should handle negative numbers', () => {
      assert.strictEqual(safeDivide(-10, 2), -5);
      assert.strictEqual(safeDivide(10, -2), -5);
      assert.strictEqual(safeDivide(-10, -2), 5);
    });

    it('should handle zero numerator', () => {
      assert.strictEqual(safeDivide(0, 5), 0);
    });

    it('should handle decimal values', () => {
      assert.strictEqual(safeDivide(1.5, 0.5), 3);
    });

    it('should handle very small denominator', () => {
      assert.strictEqual(safeDivide(1, 0.0001), 10000);
    });

    it('should use default fallback of 0', () => {
      assert.strictEqual(safeDivide(10, 0), 0);
    });
  });
});
