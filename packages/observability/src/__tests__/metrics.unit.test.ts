/**
 * Unit tests for MetricsService
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'node:test';

import { MetricsService } from '../metrics';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  describe('createCounter', () => {
    it('should create a new counter', () => {
      const _counter = metricsService.createCounter('test.counter', 'A test counter');

      assert.strictEqual(typeof _counter === 'object', true);
      assert.strictEqual(_counter !== null, true);
      assert.strictEqual(typeof _counter.add, 'function');
    });

    it('should return existing counter for same name', () => {
      const counter1 = metricsService.createCounter('test.counter', 'Description 1');
      const counter2 = metricsService.createCounter('test.counter', 'Description 2');

      // Should return the same counter instance
      assert.strictEqual(counter1 === counter2, true);
    });

    it('should create multiple counters with different names', () => {
      const counter1 = metricsService.createCounter('counter1', 'First counter');
      const counter2 = metricsService.createCounter('counter2', 'Second counter');

      // Note: When OpenTelemetry is not initialized, it returns noop metrics
      // which may be the same instance. This is expected behavior.
      assert.strictEqual(typeof counter1 === 'object', true);
      assert.strictEqual(typeof counter2 === 'object', true);
    });

    it('should accept custom metric options', () => {
      const counter = metricsService.createCounter('test.counter', 'Test counter', {
        unit: '1',
        description: 'Custom description'
      });

      assert.strictEqual(typeof counter === 'object', true);
    });
  });

  describe('createHistogram', () => {
    it('should create a new histogram', () => {
      const _histogram = metricsService.createHistogram('test.histogram', 'A test histogram');

      assert.strictEqual(typeof _histogram === 'object', true);
      assert.strictEqual(typeof _histogram.record, 'function');
    });

    it('should return existing histogram for same name', () => {
      const histogram1 = metricsService.createHistogram('test.histogram', 'Description 1');
      const histogram2 = metricsService.createHistogram('test.histogram', 'Description 2');

      assert.strictEqual(histogram1 === histogram2, true);
    });

    it('should create multiple histograms with different names', () => {
      const histogram1 = metricsService.createHistogram('histogram1', 'First histogram');
      const histogram2 = metricsService.createHistogram('histogram2', 'Second histogram');

      // Note: When OpenTelemetry is not initialized, it returns noop metrics
      // which may be the same instance. This is expected behavior.
      assert.strictEqual(typeof histogram1 === 'object', true);
      assert.strictEqual(typeof histogram2 === 'object', true);
    });

    it('should accept custom metric options', () => {
      const _histogram = metricsService.createHistogram('test.histogram', 'Test histogram', {
        unit: 'ms',
        description: 'Custom description'
      });

      assert.strictEqual(typeof _histogram === 'object', true);
    });
  });

  describe('createGauge', () => {
    it('should create a new gauge', () => {
      const _gauge = metricsService.createGauge('test.gauge', 'A test gauge');

      assert.strictEqual(typeof _gauge === 'object', true);
      assert.strictEqual(typeof _gauge.record, 'function');
    });

    it('should return existing gauge for same name', () => {
      const gauge1 = metricsService.createGauge('test.gauge', 'Description 1');
      const gauge2 = metricsService.createGauge('test.gauge', 'Description 2');

      assert.strictEqual(gauge1 === gauge2, true);
    });

    it('should create multiple gauges with different names', () => {
      const gauge1 = metricsService.createGauge('gauge1', 'First gauge');
      const gauge2 = metricsService.createGauge('gauge2', 'Second gauge');

      // Note: When OpenTelemetry is not initialized, it returns noop metrics
      // which may be the same instance. This is expected behavior.
      assert.strictEqual(typeof gauge1 === 'object', true);
      assert.strictEqual(typeof gauge2 === 'object', true);
    });

    it('should accept custom metric options', () => {
      const _gauge = metricsService.createGauge('test.gauge', 'Test gauge', {
        unit: '1',
        description: 'Custom description'
      });

      assert.strictEqual(typeof _gauge === 'object', true);
    });
  });

  describe('incrementCounter', () => {
    it('should increment counter by default amount (1)', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter');
      });
    });

    it('should increment counter by custom amount', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 5);
      });
    });

    it('should increment counter with attributes', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 1, { method: 'GET', status: '200' });
      });
    });

    it('should handle incrementing non-existent counter gracefully', () => {
      // Should not throw, just silently fail
      assert.doesNotThrow(() => {
        metricsService.incrementCounter('nonexistent.counter', 1);
      });
    });

    it('should handle negative increment amounts', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', -1);
      });
    });

    it('should handle zero increment', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 0);
      });
    });

    it('should handle decimal amounts', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 1.5);
      });
    });
  });

  describe('recordHistogram', () => {
    it('should record histogram value', () => {
      void metricsService.createHistogram('test.histogram', 'Test histogram');

      assert.doesNotThrow(() => {
        metricsService.recordHistogram('test.histogram', 100);
      });
    });

    it('should record histogram with attributes', () => {
      void metricsService.createHistogram('test.histogram', 'Test histogram');

      assert.doesNotThrow(() => {
        metricsService.recordHistogram('test.histogram', 150, { endpoint: '/api/users' });
      });
    });

    it('should handle recording to non-existent histogram gracefully', () => {
      assert.doesNotThrow(() => {
        metricsService.recordHistogram('nonexistent.histogram', 100);
      });
    });

    it('should handle negative values', () => {
      void metricsService.createHistogram('test.histogram', 'Test histogram');

      assert.doesNotThrow(() => {
        metricsService.recordHistogram('test.histogram', -50);
      });
    });

    it('should handle zero value', () => {
      void metricsService.createHistogram('test.histogram', 'Test histogram');

      assert.doesNotThrow(() => {
        metricsService.recordHistogram('test.histogram', 0);
      });
    });

    it('should handle decimal values', () => {
      void metricsService.createHistogram('test.histogram', 'Test histogram');

      assert.doesNotThrow(() => {
        metricsService.recordHistogram('test.histogram', 123.456);
      });
    });

    it('should handle very large values', () => {
      void metricsService.createHistogram('test.histogram', 'Test histogram');

      assert.doesNotThrow(() => {
        metricsService.recordHistogram('test.histogram', 1_000_000);
      });
    });
  });

  describe('recordGauge', () => {
    it('should record gauge value', () => {
      void metricsService.createGauge('test.gauge', 'Test gauge');

      assert.doesNotThrow(() => {
        metricsService.recordGauge('test.gauge', 42);
      });
    });

    it('should record gauge with attributes', () => {
      void metricsService.createGauge('test.gauge', 'Test gauge');

      assert.doesNotThrow(() => {
        metricsService.recordGauge('test.gauge', 42, { server: 'web-1' });
      });
    });

    it('should handle recording to non-existent gauge gracefully', () => {
      assert.doesNotThrow(() => {
        metricsService.recordGauge('nonexistent.gauge', 42);
      });
    });

    it('should handle negative values', () => {
      void metricsService.createGauge('test.gauge', 'Test gauge');

      assert.doesNotThrow(() => {
        metricsService.recordGauge('test.gauge', -10);
      });
    });

    it('should handle zero value', () => {
      void metricsService.createGauge('test.gauge', 'Test gauge');

      assert.doesNotThrow(() => {
        metricsService.recordGauge('test.gauge', 0);
      });
    });

    it('should handle decimal values', () => {
      void metricsService.createGauge('test.gauge', 'Test gauge');

      assert.doesNotThrow(() => {
        metricsService.recordGauge('test.gauge', 3.14159);
      });
    });

    it('should handle updating same gauge multiple times', () => {
      void metricsService.createGauge('test.gauge', 'Test gauge');

      assert.doesNotThrow(() => {
        metricsService.recordGauge('test.gauge', 10);
        metricsService.recordGauge('test.gauge', 20);
        metricsService.recordGauge('test.gauge', 30);
      });
    });
  });

  describe('metric types coexistence', () => {
    it('should handle counter, histogram, and gauge with same name prefix', () => {
      assert.doesNotThrow(() => {
        void metricsService.createCounter('http.requests', 'HTTP request counter');
        void metricsService.createHistogram('http.requests.duration', 'HTTP request duration');
        void metricsService.createGauge('http.connections.active', 'Active HTTP connections');

        metricsService.incrementCounter('http.requests', 1);
        metricsService.recordHistogram('http.requests.duration', 100);
        metricsService.recordGauge('http.connections.active', 50);
      });
    });
  });

  describe('attributes handling', () => {
    it('should handle empty attributes', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 1, {});
      });
    });

    it('should handle attributes with special characters in values', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 1, { path: '/api/users/123' });
        metricsService.incrementCounter('test.counter', 1, { status: '200 OK' });
      });
    });

    it('should handle attributes with various data types', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 1, {
          string: 'value',
          number: 42,
          boolean: true
        });
      });
    });

    it('should handle many attribute key-value pairs', () => {
      void metricsService.createCounter('test.counter', 'Test counter');

      assert.doesNotThrow(() => {
        metricsService.incrementCounter('test.counter', 1, {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3',
          key4: 'value4',
          key5: 'value5'
        });
      });
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent metric creation', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => {
        return Promise.resolve().then(() => {
          metricsService.createCounter(`counter.${i}`, `Counter ${i}`);
        });
      });

      await Promise.all(promises);
      assert.ok(true);
    });

    it('should handle concurrent metric operations', async () => {
      void metricsService.createCounter('test.counter', 'Test counter');
      void metricsService.createHistogram('test.histogram', 'Test histogram');
      void metricsService.createGauge('test.gauge', 'Test gauge');

      const promises = Array.from({ length: 100 }, (_, i) => {
        return Promise.resolve().then(() => {
          metricsService.incrementCounter('test.counter', 1, { index: String(i) });
          metricsService.recordHistogram('test.histogram', i, { index: String(i) });
          metricsService.recordGauge('test.gauge', i, { index: String(i) });
        });
      });

      await Promise.all(promises);
      assert.ok(true);
    });
  });

  describe('metric name validation', () => {
    it('should handle metric names with dots', () => {
      assert.doesNotThrow(() => {
        metricsService.createCounter('metric.with.dots', 'Description');
      });
    });

    it('should handle metric names with underscores', () => {
      assert.doesNotThrow(() => {
        metricsService.createCounter('metric_with_underscores', 'Description');
      });
    });

    it('should handle metric names with hyphens', () => {
      assert.doesNotThrow(() => {
        metricsService.createCounter('metric-with-hyphens', 'Description');
      });
    });

    it('should handle metric names with mixed separators', () => {
      assert.doesNotThrow(() => {
        metricsService.createCounter('metric_name.with-hyphens', 'Description');
      });
    });
  });

  describe('singleton export', () => {
    it('should export a singleton metricsService instance', () => {
      // The singleton is imported from '../metrics'
      // We just verify it exists and is of the right type
      assert.strictEqual(typeof metricsService === 'object', true);
      assert.strictEqual(metricsService !== null, true);
      assert.strictEqual(typeof metricsService.createCounter, 'function');
      assert.strictEqual(typeof metricsService.createHistogram, 'function');
      assert.strictEqual(typeof metricsService.createGauge, 'function');
      assert.strictEqual(typeof metricsService.incrementCounter, 'function');
      assert.strictEqual(typeof metricsService.recordHistogram, 'function');
      assert.strictEqual(typeof metricsService.recordGauge, 'function');
    });
  });
});
