/**
 * Unit tests for OpenTelemetry metrics utilities
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { createCounter, incrementCounter } from './metrics.js';

describe('metrics', () => {
  describe('incrementCounter', () => {
    it('should increment counter with default value of 1', () => {
      const counter = createCounter('test.counter');
      // Should not throw
      incrementCounter(counter);
    });

    it('should increment counter with positive value', () => {
      const counter = createCounter('test.counter.positive');
      // Should not throw
      incrementCounter(counter, 5);
    });

    it('should increment counter with zero value', () => {
      const counter = createCounter('test.counter.zero');
      // Zero is non-negative, should not throw
      incrementCounter(counter, 0);
    });

    it('should increment counter with attributes', () => {
      const counter = createCounter('test.counter.attrs');
      // Should not throw
      incrementCounter(counter, 1, { status: 'success', count: 42 });
    });

    it('should throw RangeError for negative value', () => {
      const counter = createCounter('test.counter.negative');

      assert.throws(() => incrementCounter(counter, -1), {
        name: 'RangeError',
        message: 'incrementCounter value must be non-negative, received: -1'
      });
    });

    it('should throw RangeError for negative decimal value', () => {
      const counter = createCounter('test.counter.negative.decimal');

      assert.throws(() => incrementCounter(counter, -0.5), {
        name: 'RangeError',
        message: 'incrementCounter value must be non-negative, received: -0.5'
      });
    });
  });
});
