/**
 * Custom error types for observability
 */

import { InfrastructureError, ConfigurationError, OperationError } from '@package/core';

/**
 * Error thrown when telemetry initialization fails
 */
export class TelemetryInitializationError extends InfrastructureError {
  constructor(message: string, cause?: Error | unknown) {
    super(message, 'TELEMETRY_INIT_ERROR', cause);
    this.name = 'TelemetryInitializationError';
  }
}

/**
 * Error thrown when OTLP endpoint is invalid or unreachable
 */
export class OTLPEndpointError extends ConfigurationError {
  constructor(endpoint: string, reason: string) {
    super(`Invalid OTLP endpoint '${endpoint}': ${reason}`, 'endpoint');
    this.name = 'OTLPEndpointError';
  }
}

/**
 * Error thrown when metric export fails
 */
export class MetricExportError extends OperationError {
  constructor(message: string, cause?: Error | unknown) {
    super('metric-export', message, cause);
    this.name = 'MetricExportError';
  }
}

/**
 * Error thrown when span export fails
 */
export class SpanExportError extends OperationError {
  constructor(message: string, cause?: Error | unknown) {
    super('span-export', message, cause);
    this.name = 'SpanExportError';
  }
}

/**
 * Error thrown when log export fails
 */
export class LoggingExportError extends OperationError {
  constructor(message: string, cause?: Error | unknown) {
    super('logging-export', message, cause);
    this.name = 'LoggingExportError';
  }
}

/**
 * Error thrown when tracer provider is not configured
 */
export class TracerProviderError extends InfrastructureError {
  constructor(message: string) {
    super(message, 'TRACER_PROVIDER_ERROR');
    this.name = 'TracerProviderError';
  }
}

/**
 * Error thrown when logger configuration is invalid
 */
export class LoggerConfigError extends ConfigurationError {
  constructor(message: string) {
    super(message);
    this.name = 'LoggerConfigError';
  }
}

/**
 * Error thrown when health check fails
 */
export class HealthCheckError extends InfrastructureError {
  constructor(service: string, cause?: Error | unknown) {
    super(`Health check failed for service '${service}'`, 'HEALTH_CHECK_ERROR', cause);
    this.name = 'HealthCheckError';
  }
}
