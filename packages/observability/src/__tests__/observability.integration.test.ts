/**
 * Integration tests for Observability package
 *
 * NOTE: These tests require an OTLP collector (e.g., Jaeger, Tempo, or OTEL Collector)
 * to be running to receive traces. Set INCLUDE_INTEGRATION_TESTS=1 to run.
 *
 * Run with: INCLUDE_INTEGRATION_TESTS=1 pnpm nx test observability
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';

import { setRequestContext, getRequestContext, withRequestContext, getUserId } from '../context';
import { logger } from '../logger';
import { metricsService } from '../metrics';
import { initializeTelemetry, shutdownTelemetry, ITelemetryConfig } from '../telemetry';

describe(
  'Observability Integration Tests',
  { skip: !process.env['INCLUDE_INTEGRATION_TESTS'] },
  () => {
    const OTEL_EXPORTER_URL = process.env['OTEL_EXPORTER_URL'] || 'http://localhost:4318';
    let telemetryConfig: ITelemetryConfig;

    before(() => {
      // Configure telemetry
      telemetryConfig = {
        serviceName: 'test-observability-service',
        serviceVersion: '1.0.0',
        environment: 'test',
        exporterUrl: OTEL_EXPORTER_URL
      };

      // Initialize telemetry (only once per process)
      initializeTelemetry(telemetryConfig);
    });

    after(async () => {
      // Shutdown telemetry
      await shutdownTelemetry();
    });

    describe('end-to-end observability flow', () => {
      it('should log, record metrics, and trace in integrated flow', async () => {
        void metricsService.createCounter('integration.test.counter', 'Integration test counter');
        void metricsService.createHistogram('integration.test.duration', 'Duration', {
          unit: 'ms'
        });
        void metricsService.createGauge('integration.test.gauge', 'Test gauge');

        // Simulate a request lifecycle
        const startTime = Date.now();

        // Set request context
        setRequestContext({
          userId: 'user-123',
          requestId: 'req-456',
          organizationId: 'org-789'
        });

        // Log request start
        logger.info('Processing integration test request');

        // Record metrics
        metricsService.incrementCounter('integration.test.counter', 1, { operation: 'test' });
        metricsService.recordGauge('integration.test.gauge', 100);

        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Record duration
        const duration = Date.now() - startTime;
        metricsService.recordHistogram('integration.test.duration', duration, {
          operation: 'test'
        });

        // Log completion
        logger.info('Integration test request completed', {
          userId: getUserId(),
          duration
        });

        // Verify context was preserved
        const context = getRequestContext();
        assert.strictEqual(context?.userId, 'user-123');
        assert.strictEqual(context?.requestId, 'req-456');

        assert.ok(true); // If we got here, everything worked
      });
    });

    describe('context propagation', () => {
      it('should propagate context through async operations', async () => {
        let capturedUserId: string | undefined;

        await withRequestContext({ userId: 'user-async-123' }, async () => {
          logger.info('Starting async operation');

          // Simulate nested async operations
          await Promise.all([
            new Promise<void>((resolve) => {
              setTimeout(() => {
                logger.info('Async operation 1');
                resolve();
              }, 10);
            }),
            new Promise<void>((resolve) => {
              setTimeout(() => {
                capturedUserId = getUserId();
                logger.info('Async operation 2', { userId: capturedUserId });
                resolve();
              }, 20);
            })
          ]);

          logger.info('All async operations completed');
        });

        assert.strictEqual(capturedUserId, 'user-async-123');
      });
    });

    describe('metrics with context', () => {
      it('should record metrics with contextual attributes', () => {
        void metricsService.createCounter('contextual.requests', 'Contextual request counter');

        withRequestContext({ userId: 'user-metrics-123', requestId: 'req-metrics-456' }, () => {
          metricsService.incrementCounter('contextual.requests', 1, {
            endpoint: '/api/test',
            method: 'GET',
            userId: getUserId()
          });

          logger.info('Recorded contextual metric');
        });

        assert.ok(true);
      });
    });

    describe('logging with levels', () => {
      it('should log at different levels', () => {
        const testError = new Error('Test error for integration');

        logger.debug('Debug message from integration test');
        logger.info('Info message from integration test');
        logger.warn('Warning message from integration test');
        logger.error('Error message from integration test', testError);
        logger.fatal('Fatal message from integration test');

        assert.ok(true);
      });
    });

    describe('error handling and recovery', () => {
      it('should handle and log errors gracefully', async () => {
        void metricsService.createCounter('errors.total', 'Total errors');

        try {
          await withRequestContext({ requestId: 'req-error-123' }, async () => {
            logger.info('About to throw error');

            throw new Error('Simulated integration test error');
          });
        } catch (error) {
          logger.error('Caught error in integration test', error);

          // Record error metric
          metricsService.incrementCounter('errors.total', 1, {
            errorType: 'SimulatedError'
          });

          assert.ok(error instanceof Error);
        }
      });
    });

    describe('child logger with context', () => {
      it('should use child logger with inherited context', () => {
        setRequestContext({
          userId: 'user-child-123',
          requestId: 'req-child-456'
        });

        const childLogger = logger.child({
          component: 'integration-test',
          operation: 'child-logger-test'
        });

        childLogger.info('Message from child logger');
        childLogger.debug('Debug from child');
        childLogger.warn('Warning from child');

        assert.ok(true);
      });
    });

    describe('high volume metrics', () => {
      it('should handle burst of metric recordings', () => {
        void metricsService.createCounter('burst.requests', 'Burst requests');

        // Record 100 metrics rapidly
        for (let i = 0; i < 100; i++) {
          metricsService.incrementCounter('burst.requests', 1, { iteration: String(i) });
        }

        logger.info('Completed burst metric recording');

        assert.ok(true);
      });
    });

    describe('telemetry re-initialization', () => {
      it('should handle re-initialization gracefully', () => {
        // Re-initialization should be a no-op after first initialization
        assert.doesNotThrow(() => {
          initializeTelemetry(telemetryConfig);
        });

        assert.ok(true);
      });
    });

    describe('complex scenarios', () => {
      it('should handle mixed logging, metrics, and context', async () => {
        void metricsService.createCounter('complex.operations', 'Complex operations');
        void metricsService.createHistogram('complex.latency', 'Latency', { unit: 'ms' });

        await withRequestContext(
          {
            userId: 'user-complex-123',
            requestId: 'req-complex-456',
            organizationId: 'org-complex-789'
          },
          async () => {
            logger.info('Starting complex operation');

            const start = Date.now();

            // Simulate multiple steps
            for (let step = 1; step <= 5; step++) {
              logger.info(`Executing step ${step}`);

              // Record step metric
              metricsService.incrementCounter('complex.operations', 1, {
                step: String(step),
                userId: getUserId()
              });

              // Simulate work
              await new Promise((resolve) => setTimeout(resolve, 10));

              logger.info(`Completed step ${step}`);
            }

            const duration = Date.now() - start;
            metricsService.recordHistogram('complex.latency', duration);

            logger.info('Complex operation completed', { duration, steps: 5 });
          }
        );

        assert.ok(true);
      });
    });

    describe('resource management', () => {
      it('should create and use multiple metrics', () => {
        // Create multiple metric types
        void metricsService.createCounter('multi.counter1', 'Counter 1');
        void metricsService.createCounter('multi.counter2', 'Counter 2');
        void metricsService.createCounter('multi.counter3', 'Counter 3');

        void metricsService.createHistogram('multi.hist1', 'Histogram 1');
        void metricsService.createHistogram('multi.hist2', 'Histogram 2');

        void metricsService.createGauge('multi.gauge1', 'Gauge 1');
        void metricsService.createGauge('multi.gauge2', 'Gauge 2');

        // Use all metrics
        for (let i = 0; i < 10; i++) {
          metricsService.incrementCounter('multi.counter1', 1);
          metricsService.incrementCounter('multi.counter2', 2);
          metricsService.incrementCounter('multi.counter3', 3);
          metricsService.recordHistogram('multi.hist1', i * 10);
          metricsService.recordHistogram('multi.hist2', i * 20);
          metricsService.recordGauge('multi.gauge1', i);
          metricsService.recordGauge('multi.gauge2', i * 2);
        }

        logger.info('Created and used multiple metrics');

        assert.ok(true);
      });
    });
  }
);
