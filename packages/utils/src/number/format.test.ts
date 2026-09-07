/**
 * Tests for number/format.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { formatCurrency, formatPercent, formatNumber } from './format.js';

describe('number/format', () => {
  describe('formatCurrency', () => {
    it('should format number as USD currency by default', () => {
      assert.strictEqual(formatCurrency(1234.56), '$1,234.56');
    });

    it('should handle different currencies', () => {
      assert.strictEqual(formatCurrency(1234.56, 'EUR'), '\u20AC1,234.56');
      assert.strictEqual(formatCurrency(1234.56, 'GBP'), '\u00A31,234.56');
      assert.strictEqual(formatCurrency(1234.56, 'JPY'), '\u00A51,235');
    });

    it('should handle different locales', () => {
      assert.strictEqual(formatCurrency(1234.56, 'USD', 'de-DE'), '1.234,56\xA0$');
    });

    it('should handle integers', () => {
      assert.strictEqual(formatCurrency(100), '$100.00');
    });

    it('should handle small decimals', () => {
      assert.strictEqual(formatCurrency(0.01), '$0.01');
      assert.strictEqual(formatCurrency(0.99), '$0.99');
    });

    it('should handle zero', () => {
      assert.strictEqual(formatCurrency(0), '$0.00');
    });

    it('should handle negative numbers', () => {
      assert.strictEqual(formatCurrency(-1234.56), '-$1,234.56');
    });

    it('should handle large numbers', () => {
      assert.strictEqual(formatCurrency(1234567.89), '$1,234,567.89');
    });

    it('should handle very large numbers', () => {
      assert.strictEqual(formatCurrency(1e15), '$1,000,000,000,000,000.00');
    });
  });

  describe('formatPercent', () => {
    it('should format number as percentage with default 2 decimals', () => {
      assert.strictEqual(formatPercent(0.1234), '12.34%');
    });

    it('should handle custom decimal places', () => {
      assert.strictEqual(formatPercent(0.1234, 0), '12%');
      assert.strictEqual(formatPercent(0.1234, 1), '12.3%');
      assert.strictEqual(formatPercent(0.1234, 3), '12.340%');
    });

    it('should handle different locales', () => {
      assert.strictEqual(formatPercent(0.1234, 2, 'de-DE'), '12,34\xA0%');
    });

    it('should handle whole numbers', () => {
      assert.strictEqual(formatPercent(1), '100%');
      assert.strictEqual(formatPercent(0.5), '50%');
    });

    it('should handle zero', () => {
      assert.strictEqual(formatPercent(0), '0%');
    });

    it('should handle negative percentages', () => {
      assert.strictEqual(formatPercent(-0.1234), '-12.34%');
    });

    it('should handle percentages greater than 1', () => {
      assert.strictEqual(formatPercent(1.5), '150%');
      assert.strictEqual(formatPercent(2), '200%');
    });

    it('should handle small percentages', () => {
      assert.strictEqual(formatPercent(0.001), '0.10%');
      assert.strictEqual(formatPercent(0.0001, 4), '0.0100%');
    });

    it('should handle rounding', () => {
      assert.strictEqual(formatPercent(0.125), '12.5%');
      assert.strictEqual(formatPercent(0.126), '12.6%');
    });
  });

  describe('formatNumber', () => {
    it('should format number with thousand separators', () => {
      assert.strictEqual(formatNumber(1234.56), '1,234.56');
    });

    it('should handle integers', () => {
      assert.strictEqual(formatNumber(1234), '1,234');
    });

    it('should handle different locales', () => {
      assert.strictEqual(formatNumber(1234.56, 'de-DE'), '1.234,56');
    });

    it('should handle large numbers', () => {
      assert.strictEqual(formatNumber(1234567.89), '1,234,567.89');
      assert.strictEqual(formatNumber(1234567890), '1,234,567,890');
    });

    it('should handle very large numbers', () => {
      assert.strictEqual(formatNumber(1e15), '1,000,000,000,000,000');
    });

    it('should handle negative numbers', () => {
      assert.strictEqual(formatNumber(-1234.56), '-1,234.56');
    });

    it('should handle zero', () => {
      assert.strictEqual(formatNumber(0), '0');
    });

    it('should handle decimals', () => {
      assert.strictEqual(formatNumber(0.1234), '0.1234');
    });

    it('should handle numbers with many decimal places', () => {
      assert.strictEqual(formatNumber(1234.123456789), '1,234.123456789');
    });
  });
});
