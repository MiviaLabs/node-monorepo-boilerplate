/**
 * Unit tests for core configuration system
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  resolveConfig,
  ConfigResolver,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_HEALTH_CHECK_CONFIG,
  DEFAULT_OPENTELEMETRY_CONFIG,
  type IInfrastructureCoreConfig
} from './config/index.js';

describe('core configuration', () => {
  describe('resolveConfig', () => {
    it('should return default configuration when no input provided', () => {
      const config = resolveConfig(undefined, {});

      assert.strictEqual(config.enableGracefulShutdown, true);
      assert.deepStrictEqual(config.timeouts, DEFAULT_TIMEOUT_CONFIG);
      assert.deepStrictEqual(config.retry, DEFAULT_RETRY_CONFIG);
      assert.deepStrictEqual(config.healthCheck, DEFAULT_HEALTH_CHECK_CONFIG);
      assert.deepStrictEqual(config.openTelemetry, DEFAULT_OPENTELEMETRY_CONFIG);
    });

    it('should merge user configuration with defaults', () => {
      const userConfig: IInfrastructureCoreConfig = {
        enableGracefulShutdown: false,
        timeouts: {
          default: 60000,
          short: 10000
        },
        retry: {
          maxAttempts: 5
        }
      };

      const config = resolveConfig(userConfig, {});

      assert.strictEqual(config.enableGracefulShutdown, false);
      assert.strictEqual(config.timeouts.default, 60000);
      assert.strictEqual(config.timeouts.short, 10000);
      assert.strictEqual(config.timeouts.medium, DEFAULT_TIMEOUT_CONFIG.medium);
      assert.strictEqual(config.timeouts.long, DEFAULT_TIMEOUT_CONFIG.long);
      assert.strictEqual(config.timeouts.veryLong, DEFAULT_TIMEOUT_CONFIG.veryLong);
      assert.strictEqual(config.retry.maxAttempts, 5);
      assert.strictEqual(config.retry.initialDelayMs, DEFAULT_RETRY_CONFIG.initialDelayMs);
      assert.strictEqual(config.retry.maxDelayMs, DEFAULT_RETRY_CONFIG.maxDelayMs);
      assert.strictEqual(config.retry.backoffMultiplier, DEFAULT_RETRY_CONFIG.backoffMultiplier);
    });

    it('should read from environment variables', () => {
      const env = {
        INFRA_TIMEOUT_DEFAULT: '45000',
        INFRA_TIMEOUT_SHORT: '7500',
        INFRA_RETRY_MAX_ATTEMPTS: '7',
        INFRA_HEALTH_CHECK_INTERVAL_MS: '60000',
        INFRA_OTEL_TRACING_ENABLED: 'false'
      };

      const config = resolveConfig({}, env);

      assert.strictEqual(config.timeouts.default, 45000);
      assert.strictEqual(config.timeouts.short, 7500);
      assert.strictEqual(config.timeouts.medium, DEFAULT_TIMEOUT_CONFIG.medium);
      assert.strictEqual(config.retry.maxAttempts, 7);
      assert.strictEqual(config.healthCheck.intervalMs, 60000);
      assert.strictEqual(config.openTelemetry.enableTracing, false);
    });

    it('should parse INFRA_ENABLE_GRACEFUL_SHUTDOWN env var to boolean', () => {
      // Test 'false' string is parsed to boolean false
      const configFalse = resolveConfig({}, { INFRA_ENABLE_GRACEFUL_SHUTDOWN: 'false' });
      assert.strictEqual(configFalse.enableGracefulShutdown, false);

      // Test 'true' string is parsed to boolean true
      const configTrue = resolveConfig({}, { INFRA_ENABLE_GRACEFUL_SHUTDOWN: 'true' });
      assert.strictEqual(configTrue.enableGracefulShutdown, true);
    });

    it('should prioritize user config over environment variables', () => {
      const userConfig: IInfrastructureCoreConfig = {
        timeouts: {
          default: 90000
        }
      };

      const env = {
        INFRA_TIMEOUT_DEFAULT: '45000'
      };

      const config = resolveConfig(userConfig, env);

      assert.strictEqual(config.timeouts.default, 90000);
    });

    it('should parse environment variables correctly', () => {
      const env = {
        INFRA_TIMEOUT_DEFAULT: '12345',
        INFRA_OTEL_TRACING_ENABLED: 'true',
        INFRA_OTEL_METRICS_ENABLED: 'false'
      };

      const config = resolveConfig({}, env);

      assert.strictEqual(config.timeouts.default, 12345);
      assert.strictEqual(config.openTelemetry.enableTracing, true);
      assert.strictEqual(config.openTelemetry.enableMetrics, false);
    });

    it('should support custom environment variable names', () => {
      const userConfig: IInfrastructureCoreConfig = {
        envVarNames: {
          timeoutDefault: 'CUSTOM_TIMEOUT',
          retryMaxAttempts: 'CUSTOM_RETRY'
        }
      };

      const env = {
        CUSTOM_TIMEOUT: '50000',
        CUSTOM_RETRY: '10',
        INFRA_TIMEOUT_DEFAULT: '30000',
        INFRA_RETRY_MAX_ATTEMPTS: '3'
      };

      const config = resolveConfig(userConfig, env);

      assert.strictEqual(config.timeouts.default, 50000);
      assert.strictEqual(config.retry.maxAttempts, 10);
    });
  });

  describe('ConfigResolver', () => {
    it('should resolve timeout configuration', () => {
      const resolver = new ConfigResolver(
        {
          timeouts: {
            default: 60000,
            short: 10000
          }
        },
        {}
      );

      const timeouts = resolver.getTimeoutConfig();

      assert.strictEqual(timeouts.default, 60000);
      assert.strictEqual(timeouts.short, 10000);
      assert.strictEqual(timeouts.medium, DEFAULT_TIMEOUT_CONFIG.medium);
      assert.strictEqual(timeouts.long, DEFAULT_TIMEOUT_CONFIG.long);
      assert.strictEqual(timeouts.veryLong, DEFAULT_TIMEOUT_CONFIG.veryLong);
    });

    it('should resolve retry configuration', () => {
      const resolver = new ConfigResolver(
        {
          retry: {
            maxAttempts: 5,
            initialDelayMs: 2000,
            maxDelayMs: 20000,
            backoffMultiplier: 3
          }
        },
        {}
      );

      const retry = resolver.getRetryConfig();

      assert.strictEqual(retry.maxAttempts, 5);
      assert.strictEqual(retry.initialDelayMs, 2000);
      assert.strictEqual(retry.maxDelayMs, 20000);
      assert.strictEqual(retry.backoffMultiplier, 3);
    });

    it('should resolve health check configuration', () => {
      const resolver = new ConfigResolver(
        {
          healthCheck: {
            intervalMs: 60000,
            timeoutMs: 10000,
            unhealthyThreshold: 5
          }
        },
        {}
      );

      const healthCheck = resolver.getHealthCheckConfig();

      assert.strictEqual(healthCheck.intervalMs, 60000);
      assert.strictEqual(healthCheck.timeoutMs, 10000);
      assert.strictEqual(healthCheck.unhealthyThreshold, 5);
    });

    it('should resolve OpenTelemetry configuration', () => {
      const resolver = new ConfigResolver(
        {
          openTelemetry: {
            enableTracing: false,
            enableMetrics: false,
            tracerName: 'custom-tracer',
            meterName: 'custom-meter',
            serviceName: 'my-service',
            serviceVersion: '1.0.0'
          }
        },
        {}
      );

      const otel = resolver.getOpenTelemetryConfig();

      assert.strictEqual(otel.enableTracing, false);
      assert.strictEqual(otel.enableMetrics, false);
      assert.strictEqual(otel.tracerName, 'custom-tracer');
      assert.strictEqual(otel.meterName, 'custom-meter');
      assert.strictEqual(otel.serviceName, 'my-service');
      assert.strictEqual(otel.serviceVersion, '1.0.0');
    });

    it('should resolve complete configuration', () => {
      const resolver = new ConfigResolver(
        {
          enableGracefulShutdown: false,
          timeouts: {
            default: 60000
          },
          retry: {
            maxAttempts: 5
          }
        },
        {}
      );

      const config = resolver.resolve();

      assert.strictEqual(config.enableGracefulShutdown, false);
      assert.strictEqual(config.timeouts.default, 60000);
      assert.strictEqual(config.retry.maxAttempts, 5);
    });
  });

  describe('Boolean parsing', () => {
    it('should parse boolean values correctly', () => {
      const resolver = new ConfigResolver(
        {},
        {
          INFRA_OTEL_TRACING_ENABLED: 'true',
          INFRA_OTEL_METRICS_ENABLED: 'false',
          INFRA_OTEL_TRACING_ENABLED_UPPER: 'TRUE',
          INFRA_OTEL_TRACING_ENABLED_MIXED: 'True'
        }
      );

      const config = resolver.resolve();

      assert.strictEqual(config.openTelemetry.enableTracing, true);
      assert.strictEqual(config.openTelemetry.enableMetrics, false);
    });
  });

  describe('Number parsing', () => {
    it('should parse number values correctly', () => {
      const config = resolveConfig(
        {},
        {
          INFRA_TIMEOUT_DEFAULT: '12345',
          INFRA_RETRY_MAX_ATTEMPTS: '7',
          INFRA_RETRY_BACKOFF_MULTIPLIER: '3'
        }
      );

      assert.strictEqual(config.timeouts.default, 12345);
      assert.strictEqual(config.retry.maxAttempts, 7);
      assert.strictEqual(config.retry.backoffMultiplier, 3);
    });

    it('should handle invalid number values gracefully with warning', () => {
      // Invalid numbers fall back to the minimum bound to ensure setTimeout
      // always receives a finite number. A warning is logged to console.
      const config = resolveConfig(
        {},
        {
          INFRA_TIMEOUT_DEFAULT: 'invalid'
        }
      );

      // Falls back to minimum bound (100) instead of NaN
      assert.strictEqual(config.timeouts.default, 100);
    });

    it('should clamp all timeout fields to minimums when given invalid values', () => {
      // Test that all timeout fields handle invalid/NaN values by clamping to their minimums
      const config = resolveConfig(
        {},
        {
          INFRA_TIMEOUT_DEFAULT: 'invalid',
          INFRA_TIMEOUT_SHORT: 'NaN',
          INFRA_TIMEOUT_MEDIUM: 'abc',
          INFRA_TIMEOUT_LONG: 'undefined',
          INFRA_TIMEOUT_VERY_LONG: 'null'
        }
      );

      // Each timeout field should be clamped to its respective minimum
      assert.strictEqual(config.timeouts.default, 100); // min: 100
      assert.strictEqual(config.timeouts.short, 100); // min: 100
      assert.strictEqual(config.timeouts.medium, 1000); // min: 1000
      assert.strictEqual(config.timeouts.long, 5000); // min: 5000
      assert.strictEqual(config.timeouts.veryLong, 30000); // min: 30000
    });
  });

  describe('Timeout validation', () => {
    // Table-driven test cases for timeout clamping
    const timeoutClampingCases: Array<{
      fieldName: 'default' | 'short' | 'medium' | 'long' | 'veryLong';
      inputValue: number;
      expectedValue: number;
      description: string;
    }> = [
      // default: min=100, max=600000
      {
        fieldName: 'default',
        inputValue: 50,
        expectedValue: 100,
        description: 'clamp default below minimum to 100'
      },
      {
        fieldName: 'default',
        inputValue: 1000000,
        expectedValue: 600000,
        description: 'clamp default above maximum to 600000'
      },
      {
        fieldName: 'default',
        inputValue: 30000,
        expectedValue: 30000,
        description: 'accept valid default value'
      },
      {
        fieldName: 'default',
        inputValue: 100,
        expectedValue: 100,
        description: 'accept default at boundary minimum'
      },
      {
        fieldName: 'default',
        inputValue: 600000,
        expectedValue: 600000,
        description: 'accept default at boundary maximum'
      },

      // short: min=100, max=30000
      {
        fieldName: 'short',
        inputValue: 50,
        expectedValue: 100,
        description: 'clamp short below minimum to 100'
      },
      {
        fieldName: 'short',
        inputValue: 50000,
        expectedValue: 30000,
        description: 'clamp short above maximum to 30000'
      },
      {
        fieldName: 'short',
        inputValue: 5000,
        expectedValue: 5000,
        description: 'accept valid short value'
      },
      {
        fieldName: 'short',
        inputValue: 100,
        expectedValue: 100,
        description: 'accept short at boundary minimum'
      },
      {
        fieldName: 'short',
        inputValue: 30000,
        expectedValue: 30000,
        description: 'accept short at boundary maximum'
      },

      // medium: min=1000, max=60000
      {
        fieldName: 'medium',
        inputValue: 500,
        expectedValue: 1000,
        description: 'clamp medium below minimum to 1000'
      },
      {
        fieldName: 'medium',
        inputValue: 100000,
        expectedValue: 60000,
        description: 'clamp medium above maximum to 60000'
      },
      {
        fieldName: 'medium',
        inputValue: 15000,
        expectedValue: 15000,
        description: 'accept valid medium value'
      },
      {
        fieldName: 'medium',
        inputValue: 1000,
        expectedValue: 1000,
        description: 'accept medium at boundary minimum'
      },
      {
        fieldName: 'medium',
        inputValue: 60000,
        expectedValue: 60000,
        description: 'accept medium at boundary maximum'
      },

      // long: min=5000, max=300000
      {
        fieldName: 'long',
        inputValue: 1000,
        expectedValue: 5000,
        description: 'clamp long below minimum to 5000'
      },
      {
        fieldName: 'long',
        inputValue: 500000,
        expectedValue: 300000,
        description: 'clamp long above maximum to 300000'
      },
      {
        fieldName: 'long',
        inputValue: 60000,
        expectedValue: 60000,
        description: 'accept valid long value'
      },
      {
        fieldName: 'long',
        inputValue: 5000,
        expectedValue: 5000,
        description: 'accept long at boundary minimum'
      },
      {
        fieldName: 'long',
        inputValue: 300000,
        expectedValue: 300000,
        description: 'accept long at boundary maximum'
      },

      // veryLong: min=30000, max=3600000
      {
        fieldName: 'veryLong',
        inputValue: 10000,
        expectedValue: 30000,
        description: 'clamp veryLong below minimum to 30000'
      },
      {
        fieldName: 'veryLong',
        inputValue: 5000000,
        expectedValue: 3600000,
        description: 'clamp veryLong above maximum to 3600000'
      },
      {
        fieldName: 'veryLong',
        inputValue: 300000,
        expectedValue: 300000,
        description: 'accept valid veryLong value'
      },
      {
        fieldName: 'veryLong',
        inputValue: 30000,
        expectedValue: 30000,
        description: 'accept veryLong at boundary minimum'
      },
      {
        fieldName: 'veryLong',
        inputValue: 3600000,
        expectedValue: 3600000,
        description: 'accept veryLong at boundary maximum'
      }
    ];

    for (const { fieldName, inputValue, expectedValue, description } of timeoutClampingCases) {
      it(`should ${description}`, () => {
        const config = resolveConfig(
          {
            timeouts: { [fieldName]: inputValue }
          },
          {}
        );

        assert.strictEqual(config.timeouts[fieldName], expectedValue);
      });
    }

    it('should clamp environment variable values outside bounds', () => {
      const config = resolveConfig(
        {},
        {
          INFRA_TIMEOUT_DEFAULT: '50', // Below min of 100
          INFRA_TIMEOUT_SHORT: '50000' // Above max of 30000
        }
      );

      assert.strictEqual(config.timeouts.default, 100);
      assert.strictEqual(config.timeouts.short, 30000);
    });

    it('should use defaults when timeout values are missing', () => {
      const config = resolveConfig({}, {});

      assert.strictEqual(config.timeouts.default, DEFAULT_TIMEOUT_CONFIG.default);
      assert.strictEqual(config.timeouts.short, DEFAULT_TIMEOUT_CONFIG.short);
      assert.strictEqual(config.timeouts.medium, DEFAULT_TIMEOUT_CONFIG.medium);
      assert.strictEqual(config.timeouts.long, DEFAULT_TIMEOUT_CONFIG.long);
      assert.strictEqual(config.timeouts.veryLong, DEFAULT_TIMEOUT_CONFIG.veryLong);
    });
  });
});
