/**
 * GCP Cloud Monitoring Metrics Provider
 *
 * Exports OpenTelemetry metrics to Google Cloud Monitoring using OTLP.
 * Provides automatic metric name conversion and resource label management.
 */

import { Meter, Counter, Histogram, Gauge, Attributes } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  MeterProvider,
  MeterProviderOptions,
  PeriodicExportingMetricReader,
  PeriodicExportingMetricReaderOptions
} from '@opentelemetry/sdk-metrics';
import { GoogleAuth } from 'google-auth-library';

import { MetricExportError } from '../errors';
import { logger } from '../logger';
import { GoogleAuthHeadersProvider } from './gcp-auth-headers.provider';

import type { IGcpMetricsProvider } from './gcp-provider.interface';
import type { GcpMetricsProviderConfig } from './gcp-provider.types';

/**
 * Default metric prefix for custom metrics
 */
const DEFAULT_METRIC_PREFIX = 'custom.googleapis.com/';

/**
 * Default resource labels
 */
const DEFAULT_RESOURCE_LABELS = {
  'service.name': process.env['SERVICE_NAME'] ?? 'api',
  'service.version': process.env['SERVICE_VERSION'] ?? '1.0.0',
  'deployment.environment': process.env['NODE_ENV'] ?? 'development'
};

/**
 * GCP Cloud Monitoring Metrics Provider
 *
 * Exports metrics to Google Cloud Monitoring via OTLP with automatic
 * metric name conversion and resource label management.
 *
 * @example
 * ```typescript
 * const provider = new GcpMetricsProvider({
 *   projectId: 'my-project',
 *   metricPrefix: 'custom.googleapis.com/myapp/',
 *   enableDefaultMetrics: true,
 * });
 *
 * await provider.initialize();
 * await provider.start();
 *
 * await provider.incrementCounter('requests', 1, { endpoint: '/api/users' });
 * ```
 */
export class GcpMetricsProvider implements IGcpMetricsProvider {
  private config: GcpMetricsProviderConfig;
  private meterProvider?: MeterProvider;
  private meter?: Meter;
  private counters = new Map<string, Counter>();
  private histograms = new Map<string, Histogram>();
  private gauges = new Map<string, Gauge>();
  private isInitialized = false;
  private credentials?: Record<string, unknown>;
  // @ts-expect-error - Used internally for auth, not part of public API
  private _authHeadersGetter?: () => Promise<Record<string, string>>;

  constructor(config: GcpMetricsProviderConfig) {
    this.config = {
      enabled: true,
      metricPrefix: DEFAULT_METRIC_PREFIX,
      enableDefaultMetrics: false,
      resourceLabels: {},
      ...config
    };
    this.credentials = this.config.credentials;
  }

  /**
   * Initialize the metrics provider
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('GCP Metrics Provider is disabled');
      return;
    }

    try {
      // Load credentials if credentialsFile is provided
      if (this.config.credentialsFile && !this.credentials) {
        this.credentials = await this.loadCredentialsFile(this.config.credentialsFile);
      }

      // Get project ID
      const projectId = this.config.projectId || (await this.getProjectId());

      // Build resource labels
      const resourceLabels = {
        ...DEFAULT_RESOURCE_LABELS,
        ...this.config.resourceLabels,
        'cloud.account.id': projectId
      };

      // Create OpenTelemetry resource using resourceFromAttributes
      const resource = resourceFromAttributes({
        ...resourceLabels,
        'cloud.provider': 'gcp',
        'cloud.platform': 'gcp_cloud_monitoring'
      });

      // Create auth headers provider for HTTP requests
      const authHeadersProvider = new GoogleAuthHeadersProvider(this.credentials);
      this._authHeadersGetter = () => authHeadersProvider.getHeaders();

      // Build Cloud Monitoring OTLP endpoint (HTTP)
      // Use v1 OTLP endpoint, not v2 API endpoint
      const endpoint =
        this.config.endpoint || `https://monitoring.googleapis.com/v1/projects/${projectId}`;

      // Create OTLP metric exporter with GCP authentication
      const exporter = new OTLPMetricExporter({
        url: endpoint,
        headers: await authHeadersProvider.getHeaders(),
        timeoutMillis: 30000
      });

      // Create metric reader
      const readerOptions: PeriodicExportingMetricReaderOptions = {
        exporter,
        exportIntervalMillis: 60000, // Export every 60 seconds
        exportTimeoutMillis: 30000 // Export timeout 30 seconds
      };

      const reader = new PeriodicExportingMetricReader(readerOptions);

      // Create meter provider
      const meterProviderOptions: MeterProviderOptions = {
        resource,
        readers: [reader]
      };

      this.meterProvider = new MeterProvider(meterProviderOptions);
      this.meter = this.meterProvider.getMeter('gcp-metrics-provider', '1.0.0');

      this.isInitialized = true;
      logger.info('GCP Metrics Provider initialized successfully', {
        projectId,
        metricPrefix: this.config.metricPrefix,
        endpoint
      });
    } catch (error) {
      throw new MetricExportError(
        `Failed to initialize GCP Metrics Provider: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Start the metrics provider
   */
  async start(): Promise<void> {
    if (!this.isInitialized || !this.config.enabled) {
      return;
    }
    logger.debug('GCP Metrics Provider started');
  }

  /**
   * Stop the metrics provider and flush pending metrics
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      if (this.meterProvider) {
        await this.meterProvider.shutdown();
        this.meterProvider = undefined;
        this.meter = undefined;
      }
      this.counters.clear();
      this.histograms.clear();
      this.gauges.clear();
      this.isInitialized = false;
      logger.info('GCP Metrics Provider shutdown successfully');
    } catch (error) {
      throw new MetricExportError(
        `Failed to shutdown GCP Metrics Provider: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Force flush pending metrics
   */
  async forceFlush(): Promise<void> {
    if (!this.isInitialized || !this.meterProvider) {
      return;
    }

    try {
      await this.meterProvider.forceFlush();
      logger.debug('GCP Metrics Provider flushed successfully');
    } catch (error) {
      throw new MetricExportError(
        `Failed to flush GCP Metrics Provider: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Health check for the metrics provider
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }

    try {
      await this.forceFlush();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record a metric
   */
  async recordMetric(name: string, value: number, attributes?: Attributes): Promise<void> {
    if (!this.isInitialized || !this.meter) {
      logger.debug('Cannot record metric: provider not initialized');
      return;
    }

    try {
      const counter = this.getOrCreateCounter(name, `Metric: ${name}`);
      counter.add(value, attributes);
    } catch (error) {
      logger.error('Failed to record metric', error);
      throw new MetricExportError(
        `Failed to record metric '${name}': ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Increment a counter
   */
  async incrementCounter(name: string, amount = 1, attributes?: Attributes): Promise<void> {
    if (!this.isInitialized || !this.meter) {
      logger.debug('Cannot increment counter: provider not initialized');
      return;
    }

    try {
      const counter = this.getOrCreateCounter(name, `Counter: ${name}`);
      counter.add(amount, attributes);
    } catch (error) {
      logger.error('Failed to increment counter', error);
      throw new MetricExportError(
        `Failed to increment counter '${name}': ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Record a histogram value
   */
  async recordHistogram(name: string, value: number, attributes?: Attributes): Promise<void> {
    if (!this.isInitialized || !this.meter) {
      logger.debug('Cannot record histogram: provider not initialized');
      return;
    }

    try {
      const histogram = this.getOrCreateHistogram(name, `Histogram: ${name}`);
      histogram.record(value, attributes);
    } catch (error) {
      logger.error('Failed to record histogram', error);
      throw new MetricExportError(
        `Failed to record histogram '${name}': ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Record a gauge value
   */
  async recordGauge(name: string, value: number, attributes?: Attributes): Promise<void> {
    if (!this.isInitialized || !this.meter) {
      logger.debug('Cannot record gauge: provider not initialized');
      return;
    }

    try {
      const gauge = this.getOrCreateGauge(name, `Gauge: ${name}`);
      gauge.record(value, attributes);
    } catch (error) {
      logger.error('Failed to record gauge', error);
      throw new MetricExportError(
        `Failed to record gauge '${name}': ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Get or create a counter
   */
  private getOrCreateCounter(name: string, description: string): Counter {
    if (!this.counters.has(name)) {
      const counter = this.meter!.createCounter(name, { description });
      this.counters.set(name, counter);
    }
    return this.counters.get(name)!;
  }

  /**
   * Get or create a histogram
   */
  private getOrCreateHistogram(name: string, description: string): Histogram {
    if (!this.histograms.has(name)) {
      const histogram = this.meter!.createHistogram(name, { description });
      this.histograms.set(name, histogram);
    }
    return this.histograms.get(name)!;
  }

  /**
   * Get or create a gauge
   */
  private getOrCreateGauge(name: string, description: string): Gauge {
    if (!this.gauges.has(name)) {
      const gauge = this.meter!.createGauge(name, { description });
      this.gauges.set(name, gauge);
    }
    return this.gauges.get(name)!;
  }

  /**
   * Get GCP project ID from credentials or metadata server
   */
  private async getProjectId(): Promise<string> {
    try {
      if (this.credentials) {
        const projectId = (this.credentials as Record<string, string | undefined>)['project_id'];
        if (projectId) {
          return projectId;
        }
      }

      // Try to get project ID from Google Cloud metadata server
      const auth = new GoogleAuth();
      return await auth.getProjectId();
    } catch (error) {
      throw new MetricExportError(
        `Failed to get GCP project ID: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Load credentials from file with proper error handling
   */
  private async loadCredentialsFile(filePath: string): Promise<Record<string, unknown>> {
    try {
      const fs = await import('fs/promises');
      const credentialsContent = await fs.readFile(filePath, 'utf-8');
      const credentials = JSON.parse(credentialsContent);

      // Validate credentials structure
      if (!credentials.project_id) {
        throw new MetricExportError(`Credentials file must contain project_id: ${filePath}`);
      }

      return credentials;
    } catch (error) {
      if (error instanceof MetricExportError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new MetricExportError(`Invalid JSON in credentials file: ${filePath}`, error);
      }
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new MetricExportError(`Credentials file not found: ${filePath}`, error);
      }
      throw new MetricExportError(`Failed to load credentials file: ${filePath}`, error);
    }
  }
}
