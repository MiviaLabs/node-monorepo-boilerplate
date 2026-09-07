/**
 * GCP OpenTelemetry Provider Types
 *
 * Configuration types for GCP-specific OpenTelemetry providers
 * including Cloud Monitoring, Cloud Logging, and Cloud Trace.
 */

/**
 * GCP Cloud Monitoring provider configuration
 */
export interface GcpMetricsProviderConfig {
  /** GCP project ID */
  projectId?: string;
  /** Enable/disable metrics export */
  enabled?: boolean;
  /** Metric prefix for custom metrics (default: 'custom.googleapis.com/') */
  metricPrefix?: string;
  /** Enable default metrics (CPU, memory, etc.) */
  enableDefaultMetrics?: boolean;
  /** Resource labels to attach to all metrics */
  resourceLabels?: Record<string, string>;
  /** Path to service account credentials JSON file */
  credentialsFile?: string;
  /** Credentials object (alternative to credentialsFile) */
  credentials?: Record<string, unknown>;
  /** Custom endpoint for testing */
  endpoint?: string;
}

/**
 * GCP Cloud Logging provider configuration
 */
export interface GcpLoggingProviderConfig {
  /** GCP project ID */
  projectId?: string;
  /** Log name (default: SERVICE_NAME) */
  logName?: string;
  /** Enable/disable logging export */
  enabled?: boolean;
  /** Enable async logging for better performance */
  enableAsyncLogging?: boolean;
  /** Labels to attach to all log entries */
  logEntryLabels?: Record<string, string>;
  /** Path to service account credentials JSON file */
  credentialsFile?: string;
  /** Credentials object (alternative to credentialsFile) */
  credentials?: Record<string, unknown>;
  /** Custom endpoint for testing */
  endpoint?: string;
  /** Shutdown timeout in milliseconds (default: 5000) */
  shutdownTimeoutMs?: number;
}

/**
 * GCP Cloud Trace exporter configuration
 */
export interface GcpTraceExporterConfig {
  /** GCP project ID */
  projectId?: string;
  /** Enable/disable trace export */
  enabled?: boolean;
  /** Sampling rate (0.0 to 1.0, default: 1.0) */
  samplingRate?: number;
  /** Path to service account credentials JSON file */
  credentialsFile?: string;
  /** Credentials object (alternative to credentialsFile) */
  credentials?: Record<string, unknown>;
  /** Custom endpoint for testing */
  endpoint?: string;
}

/**
 * GCP Observability configuration
 *
 * Main configuration interface for all GCP observability providers
 */
export interface GcpObservabilityConfig {
  /** GCP project ID (applies to all providers if not overridden) */
  projectId?: string;
  /** Cloud Monitoring configuration */
  metrics?: GcpMetricsProviderConfig;
  /** Cloud Logging configuration */
  logging?: GcpLoggingProviderConfig;
  /** Cloud Trace configuration */
  tracing?: GcpTraceExporterConfig;
  /** Enable/disable all GCP providers */
  enabled?: boolean;
}

/**
 * Provider type enumeration
 */
export enum GcpProviderType {
  METRICS = 'gcp-metrics',
  LOGGING = 'gcp-logging',
  TRACE = 'gcp-trace'
}

/**
 * Provider configuration mapping
 */
export interface GcpProviderConfigMapping {
  [GcpProviderType.METRICS]: GcpMetricsProviderConfig;
  [GcpProviderType.LOGGING]: GcpLoggingProviderConfig;
  [GcpProviderType.TRACE]: GcpTraceExporterConfig;
}
