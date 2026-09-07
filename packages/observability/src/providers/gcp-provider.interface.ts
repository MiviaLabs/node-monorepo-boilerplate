/**
 * GCP OpenTelemetry Provider Interfaces
 *
 * Defines the contracts for GCP-specific OpenTelemetry providers
 * including Cloud Monitoring, Cloud Logging, and Cloud Trace.
 */

import type { Attributes } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

/**
 * GCP Metrics Provider Interface
 */
export interface IGcpMetricsProvider {
  /**
   * Initialize the metrics provider
   */
  initialize(): Promise<void>;

  /**
   * Start the metrics provider
   */
  start(): Promise<void>;

  /**
   * Stop the metrics provider and flush pending metrics
   */
  shutdown(): Promise<void>;

  /**
   * Force flush pending metrics
   */
  forceFlush(): Promise<void>;

  /**
   * Health check for the metrics provider
   */
  healthCheck(): Promise<boolean>;

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, attributes?: Attributes): Promise<void>;

  /**
   * Increment a counter
   */
  incrementCounter(name: string, amount?: number, attributes?: Attributes): Promise<void>;

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number, attributes?: Attributes): Promise<void>;

  /**
   * Record a gauge value
   */
  recordGauge(name: string, value: number, attributes?: Attributes): Promise<void>;
}

/**
 * GCP Logging Provider Interface
 */
export interface IGcpLoggingProvider {
  /**
   * Initialize the logging provider
   */
  initialize(): Promise<void>;

  /**
   * Start the logging provider
   */
  start(): Promise<void>;

  /**
   * Stop the logging provider and flush pending logs
   */
  shutdown(): Promise<void>;

  /**
   * Force flush pending logs
   */
  forceFlush(): Promise<void>;

  /**
   * Health check for the logging provider
   */
  healthCheck(): Promise<boolean>;

  /**
   * Write a log entry
   */
  writeLog(
    severity: string,
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): Promise<void>;

  /**
   * Write a structured log entry
   */
  writeStructuredLog(
    severity: string,
    payload: Record<string, unknown>,
    traceId?: string
  ): Promise<void>;
}

/**
 * GCP Trace Exporter Interface
 */
export interface IGcpTraceExporter {
  /**
   * Initialize the trace exporter
   */
  initialize(): Promise<void>;

  /**
   * Start the trace exporter
   */
  start(): Promise<void>;

  /**
   * Stop the trace exporter and flush pending spans
   */
  shutdown(): Promise<void>;

  /**
   * Force flush pending spans
   */
  forceFlush(): Promise<void>;

  /**
   * Health check for the trace exporter
   */
  healthCheck(): Promise<boolean>;

  /**
   * Export a span (for manual span export)
   */
  export(span: ReadableSpan): Promise<void>;

  /**
   * Get the current trace ID for correlation
   */
  getCurrentTraceId(): string | undefined;
}
