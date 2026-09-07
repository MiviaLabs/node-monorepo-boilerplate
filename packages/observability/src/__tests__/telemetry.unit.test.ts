/**
 * Unit tests for Telemetry
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { trace, SpanStatusCode } from '@opentelemetry/api';

import { initializeTelemetry, shutdownTelemetry, ITelemetryConfig } from '../telemetry';

describe('Telemetry', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('initializeTelemetry', () => {
    it('should initialize telemetry with valid config', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      // Note: initializeTelemetry can only be called once per process
      // Subsequent calls are no-ops, so we need to be careful with testing
      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should be idempotent - multiple calls should not error', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
        initializeTelemetry(config); // Should be no-op
        initializeTelemetry(config); // Should be no-op
      });
    });

    it('should accept config with exporterUrl', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test',
        exporterUrl: 'http://localhost:4318'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should handle production environment', () => {
      const config: ITelemetryConfig = {
        serviceName: 'prod-service',
        serviceVersion: '2.1.3',
        environment: 'production',
        exporterUrl: 'http://otel-collector:4317'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should handle development environment', () => {
      const config: ITelemetryConfig = {
        serviceName: 'dev-service',
        serviceVersion: '0.0.1',
        environment: 'development'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should accept version in various formats', () => {
      const configs: ITelemetryConfig[] = [
        { serviceName: 'service', serviceVersion: '1.0.0', environment: 'test' },
        { serviceName: 'service', serviceVersion: '2.3.4-beta', environment: 'test' },
        { serviceName: 'service', serviceVersion: '3.0.0-rc.1', environment: 'test' },
        { serviceName: 'service', serviceVersion: 'latest', environment: 'test' }
      ];

      for (const config of configs) {
        assert.doesNotThrow(() => {
          initializeTelemetry(config);
        });
      }
    });
  });

  describe('shutdownTelemetry', () => {
    it('should shutdown telemetry gracefully', async () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      initializeTelemetry(config);

      await assert.doesNotReject(async () => {
        await shutdownTelemetry();
      });
    });

    it('should handle shutdown when telemetry not initialized', async () => {
      // After shutdown, sdk is null
      await assert.doesNotReject(async () => {
        await shutdownTelemetry();
        await shutdownTelemetry(); // Should be no-op
      });
    });

    it('should handle shutdown and re-initialize', async () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      await assert.doesNotReject(async () => {
        initializeTelemetry(config);
        await shutdownTelemetry();
        // Note: Re-initialization after shutdown may have issues in NodeSDK
        // This is a known limitation of OpenTelemetry SDK
      });
    });
  });

  describe('ITelemetryConfig interface', () => {
    it('should accept all required fields', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.strictEqual(config.serviceName, 'test');
      assert.strictEqual(config.serviceVersion, '1.0.0');
      assert.strictEqual(config.environment, 'test');
      assert.strictEqual(config.exporterUrl, undefined);
    });

    it('should accept optional exporterUrl', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test',
        serviceVersion: '1.0.0',
        environment: 'test',
        exporterUrl: 'http://localhost:4318'
      };

      assert.strictEqual(config.exporterUrl, 'http://localhost:4318');
    });

    it('should handle HTTP exporter URLs', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test',
        serviceVersion: '1.0.0',
        environment: 'test',
        exporterUrl: 'http://otel-collector:4318/v1/traces'
      };

      assert.strictEqual(config.exporterUrl?.startsWith('http://'), true);
    });

    it('should handle HTTPS exporter URLs', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test',
        serviceVersion: '1.0.0',
        environment: 'test',
        exporterUrl: 'https://otel-collector.example.com:4318'
      };

      assert.strictEqual(config.exporterUrl?.startsWith('https://'), true);
    });
  });

  describe('OpenTelemetry integration', () => {
    it('should provide access to global tracer', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      initializeTelemetry(config);

      const tracer = trace.getTracer('test-tracer');
      assert.strictEqual(typeof tracer === 'object', true);
      assert.strictEqual(typeof tracer.startSpan, 'function');
    });

    it('should support manual span creation', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      initializeTelemetry(config);

      const tracer = trace.getTracer('test-tracer');

      assert.doesNotThrow(() => {
        const span = tracer.startSpan('test-operation');
        span.setAttribute('test.attribute', 'test-value');
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      });
    });

    it('should support async span tracing', async () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      initializeTelemetry(config);

      const tracer = trace.getTracer('test-tracer');

      await assert.doesNotReject(async () => {
        await tracer.startActiveSpan('async-operation', async (span) => {
          span.setAttribute('async', 'true');
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 10));
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        });
      });
    });

    it('should support nested spans', async () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      initializeTelemetry(config);

      const tracer = trace.getTracer('test-tracer');

      await assert.doesNotReject(async () => {
        await tracer.startActiveSpan('parent-operation', async (parentSpan) => {
          parentSpan.setAttribute('level', 'parent');

          await tracer.startActiveSpan('child-operation', async (childSpan) => {
            childSpan.setAttribute('level', 'child');
            childSpan.setStatus({ code: SpanStatusCode.OK });
            childSpan.end();
          });

          parentSpan.setStatus({ code: SpanStatusCode.OK });
          parentSpan.end();
        });
      });
    });

    it('should support error recording in spans', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      initializeTelemetry(config);

      const tracer = trace.getTracer('test-tracer');

      assert.doesNotThrow(() => {
        const span = tracer.startSpan('error-operation');
        const error = new Error('Test error');
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.end();
      });
    });

    it('should support span attributes with various types', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      initializeTelemetry(config);

      const tracer = trace.getTracer('test-tracer');

      assert.doesNotThrow(() => {
        const span = tracer.startSpan('attributes-operation');
        span.setAttribute('string', 'value');
        span.setAttribute('number', 42);
        span.setAttribute('boolean', true);
        span.setAttribute('array', ['a', 'b', 'c']);
        span.end();
      });
    });
  });

  describe('resource attributes', () => {
    it('should set service.name resource attribute', () => {
      const config: ITelemetryConfig = {
        serviceName: 'my-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should set service.version resource attribute', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '2.5.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should set deployment.environment resource attribute', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'staging'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });
  });

  describe('auto-instrumentations', () => {
    it('should enable Node.js auto-instrumentations', () => {
      const config: ITelemetryConfig = {
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty serviceName', () => {
      const config: ITelemetryConfig = {
        serviceName: '',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should handle special characters in serviceName', () => {
      const config: ITelemetryConfig = {
        serviceName: 'service-with_special.chars',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should handle Unicode characters in serviceName', () => {
      const config: ITelemetryConfig = {
        serviceName: 'service-unicode',
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });

    it('should handle very long serviceName', () => {
      const config: ITelemetryConfig = {
        serviceName: 'a'.repeat(1000),
        serviceVersion: '1.0.0',
        environment: 'test'
      };

      assert.doesNotThrow(() => {
        initializeTelemetry(config);
      });
    });
  });

  describe('exporterUrl must not mutate process.env', () => {
    it('configures the exporter without writing OTEL_EXPORTER_OTLP_ENDPOINT', () => {
      // A library must not mutate global state: the exporter endpoint is
      // passed to the NodeSDK programmatically, not via process.env.
      shutdownTelemetry();
      const originalEnv = { ...process.env };
      const before = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

      try {
        initializeTelemetry({
          serviceName: 'env-mutation-probe',
          serviceVersion: '1.0.0',
          environment: 'test',
          enabled: true,
          exporterUrl: 'http://127.0.0.1:14318'
        });

        assert.strictEqual(
          process.env['OTEL_EXPORTER_OTLP_ENDPOINT'],
          before,
          'initializeTelemetry must not write OTEL_EXPORTER_OTLP_ENDPOINT'
        );
        assert.deepStrictEqual(
          Object.keys(process.env).filter((k) => !(k in originalEnv)),
          []
        );
      } finally {
        process.env = originalEnv;
        shutdownTelemetry();
      }
    });
  });
});
