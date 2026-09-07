/**
 * GCP OpenTelemetry Provider Factory
 *
 * Factory for creating GCP-specific OpenTelemetry providers
 * including Cloud Monitoring, Cloud Logging, and Cloud Trace.
 */

import { GcpLoggingProvider } from './gcp-logging.provider';
import { GcpMetricsProvider } from './gcp-metrics.provider';
import { GcpTraceExporter } from './gcp-trace.provider';

import type {
  IGcpMetricsProvider,
  IGcpLoggingProvider,
  IGcpTraceExporter
} from './gcp-provider.interface';
import type { GcpObservabilityConfig } from './gcp-provider.types';

/**
 * GCP Provider Factory
 *
 * Creates and initializes GCP OpenTelemetry providers based on configuration.
 *
 * @example
 * ```typescript
 * const config: GcpObservabilityConfig = {
 *   projectId: 'my-project',
 *   metrics: { enabled: true },
 *   logging: { enabled: true },
 *   tracing: { enabled: true },
 * };
 *
 * const providers = GcpOtelProviderFactory.createProviders(config);
 * await Promise.all([
 *   providers.metrics?.initialize(),
 *   providers.logging?.initialize(),
 *   providers.tracing?.initialize(),
 * ]);
 * ```
 */
export class GcpOtelProviderFactory {
  /**
   * Create all GCP OpenTelemetry providers based on configuration
   */
  static createProviders(config: GcpObservabilityConfig): {
    metrics?: IGcpMetricsProvider;
    logging?: IGcpLoggingProvider;
    tracing?: IGcpTraceExporter;
  } {
    const providers: {
      metrics?: IGcpMetricsProvider;
      logging?: IGcpLoggingProvider;
      tracing?: IGcpTraceExporter;
    } = {};

    // Apply global project ID to all providers if not overridden
    const globalProjectId = config.projectId;

    // Create Metrics Provider
    if (config.metrics?.enabled !== false && config.metrics) {
      const metricsConfig: typeof config.metrics & { projectId?: string } = {
        ...config.metrics
      };
      if (globalProjectId !== undefined && !metricsConfig.projectId) {
        metricsConfig.projectId = globalProjectId;
      }
      providers.metrics = new GcpMetricsProvider(metricsConfig);
    }

    // Create Logging Provider
    if (config.logging?.enabled !== false && config.logging) {
      const loggingConfig: typeof config.logging & { projectId?: string } = {
        ...config.logging
      };
      if (globalProjectId !== undefined && !loggingConfig.projectId) {
        loggingConfig.projectId = globalProjectId;
      }
      providers.logging = new GcpLoggingProvider(loggingConfig);
    }

    // Create Trace Exporter
    if (config.tracing?.enabled !== false && config.tracing) {
      const tracingConfig: typeof config.tracing & { projectId?: string } = {
        ...config.tracing
      };
      if (globalProjectId !== undefined && !tracingConfig.projectId) {
        tracingConfig.projectId = globalProjectId;
      }
      providers.tracing = new GcpTraceExporter(tracingConfig);
    }

    return providers;
  }

  /**
   * Create Metrics Provider only
   */
  static createMetricsProvider(config?: GcpObservabilityConfig): IGcpMetricsProvider | undefined {
    if (!config?.metrics && !config?.projectId) {
      return undefined;
    }

    const metricsConfig = config?.metrics || {};
    return new GcpMetricsProvider({
      ...metricsConfig,
      projectId: metricsConfig.projectId || config?.projectId
    });
  }

  /**
   * Create Logging Provider only
   */
  static createLoggingProvider(config?: GcpObservabilityConfig): IGcpLoggingProvider | undefined {
    if (!config?.logging && !config?.projectId) {
      return undefined;
    }

    const loggingConfig = config?.logging || {};
    return new GcpLoggingProvider({
      ...loggingConfig,
      projectId: loggingConfig.projectId || config?.projectId
    });
  }

  /**
   * Create Trace Exporter only
   */
  static createTraceExporter(config?: GcpObservabilityConfig): IGcpTraceExporter | undefined {
    if (!config?.tracing && !config?.projectId) {
      return undefined;
    }

    const tracingConfig = config?.tracing || {};
    return new GcpTraceExporter({
      ...tracingConfig,
      projectId: tracingConfig.projectId || config?.projectId
    });
  }
}
