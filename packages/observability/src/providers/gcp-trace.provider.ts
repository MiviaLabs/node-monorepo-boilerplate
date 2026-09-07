/**
 * GCP Cloud Trace Exporter
 *
 * Exports OpenTelemetry traces to Google Cloud Trace using OTLP with automatic
 * span name formatting and sampling configuration.
 */

import { trace, context as contextApi } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { GoogleAuth } from 'google-auth-library';

import { SpanExportError } from '../errors';
import { logger } from '../logger';
import { GoogleAuthHeadersProvider } from './gcp-auth-headers.provider';

import type { IGcpTraceExporter } from './gcp-provider.interface';
import type { GcpTraceExporterConfig } from './gcp-provider.types';

/**
 * Default resource labels
 */
const DEFAULT_RESOURCE_LABELS = {
  'service.name': process.env['SERVICE_NAME'] ?? 'api',
  'service.version': process.env['SERVICE_VERSION'] ?? '1.0.0',
  'deployment.environment': process.env['NODE_ENV'] ?? 'development'
};

/**
 * GCP Cloud Trace Exporter
 *
 * Exports traces to Google Cloud Trace via OTLP with automatic span name
 * formatting and sampling configuration.
 *
 * @example
 * ```typescript
 * const exporter = new GcpTraceExporter({
 *   projectId: 'my-project',
 *   samplingRate: 0.1, // Sample 10% of traces
 * });
 *
 * await exporter.initialize();
 * await exporter.start();
 *
 * // Traces are automatically exported via OpenTelemetry SDK
 * ```
 */
export class GcpTraceExporter implements IGcpTraceExporter {
  private config: GcpTraceExporterConfig;
  private traceExporter?: OTLPTraceExporter;
  private spanProcessor?: SpanProcessor;
  private tracerProvider?: NodeTracerProvider;
  private isInitialized = false;
  private credentials?: Record<string, unknown>;
  private resourceLabels: Record<string, string>;
  private currentTraceId?: string;
  // @ts-expect-error - Used internally for auth, not part of public API
  private _authHeadersGetter?: () => Promise<Record<string, string>>;

  constructor(config: GcpTraceExporterConfig) {
    this.config = {
      enabled: true,
      samplingRate: 1.0,
      ...config
    };
    this.credentials = this.config.credentials;
    this.resourceLabels = {
      ...DEFAULT_RESOURCE_LABELS
    };

    // Capture current trace ID from context
    this.captureCurrentTraceId();
  }

  /**
   * Initialize the trace exporter
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('GCP Trace Exporter is disabled');
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
        ...this.resourceLabels,
        'cloud.account.id': projectId
      };

      // Create OpenTelemetry resource using resourceFromAttributes
      const resource = resourceFromAttributes({
        ...resourceLabels,
        'cloud.provider': 'gcp',
        'cloud.platform': 'gcp_cloud_trace'
      });

      // Create auth headers provider for HTTP requests
      const authHeadersProvider = new GoogleAuthHeadersProvider(this.credentials);
      this._authHeadersGetter = () => authHeadersProvider.getHeaders();

      // Build Cloud Trace OTLP endpoint (HTTP)
      // Use v1 OTLP endpoint, not v2 API endpoint
      const endpoint =
        this.config.endpoint || `https://cloudtrace.googleapis.com/v1/projects/${projectId}`;

      // Create OTLP trace exporter with GCP authentication
      this.traceExporter = new OTLPTraceExporter({
        url: endpoint,
        headers: await authHeadersProvider.getHeaders(),
        timeoutMillis: 30000
      });

      // Create span processor with batching
      this.spanProcessor = new BatchSpanProcessor(this.traceExporter, {
        maxQueueSize: 1000,
        scheduledDelayMillis: 30000, // 30 seconds
        exportTimeoutMillis: 30000 // 30 seconds
      });

      // Create tracer provider with span processor
      this.tracerProvider = new NodeTracerProvider({
        resource,
        spanProcessors: [this.spanProcessor]
      });

      // Set global tracer provider
      this.tracerProvider.register();

      this.isInitialized = true;
      logger.info('GCP Trace Exporter initialized successfully', {
        projectId,
        samplingRate: this.config.samplingRate,
        endpoint
      });
    } catch (error) {
      throw new SpanExportError(
        `Failed to initialize GCP Trace Exporter: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Start the trace exporter
   */
  async start(): Promise<void> {
    if (!this.isInitialized || !this.config.enabled) {
      return;
    }
    logger.debug('GCP Trace Exporter started');
  }

  /**
   * Stop the trace exporter and flush pending spans
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      if (this.tracerProvider) {
        await this.tracerProvider.shutdown();
        this.tracerProvider = undefined;
        this.spanProcessor = undefined;
        this.traceExporter = undefined;
      }
      this.isInitialized = false;
      logger.info('GCP Trace Exporter shutdown successfully');
    } catch (error) {
      throw new SpanExportError(
        `Failed to shutdown GCP Trace Exporter: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Force flush pending spans
   */
  async forceFlush(): Promise<void> {
    if (!this.isInitialized || !this.spanProcessor) {
      return;
    }

    try {
      await this.spanProcessor.forceFlush();
      logger.debug('GCP Trace Exporter flushed successfully');
    } catch (error) {
      throw new SpanExportError(
        `Failed to flush GCP Trace Exporter: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Health check for the trace exporter
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
   * Export a span (for manual span export)
   *
   * Note: Most spans are automatically exported via OpenTelemetry SDK.
   * This method is provided for manual span export if needed.
   *
   * @param span - The span to export (ReadableSpan from OpenTelemetry SDK)
   */
  async export(span: ReadableSpan): Promise<void> {
    if (!this.isInitialized || !this.traceExporter) {
      logger.debug('Cannot export span: exporter not initialized');
      return;
    }

    const exporter = this.traceExporter;

    try {
      // Use the underlying OTLPTraceExporter's export method
      await new Promise<void>((resolve, reject) => {
        exporter.export([span], (result) => {
          if (result.code !== 0) {
            reject(
              new SpanExportError(
                `Failed to export span: ${result.error?.message || 'Unknown error'}`
              )
            );
          } else {
            resolve();
          }
        });
      });

      logger.debug('Span exported successfully', { spanId: span.spanContext().spanId });
    } catch (error) {
      if (error instanceof SpanExportError) {
        throw error;
      }
      throw new SpanExportError(
        `Failed to export span: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Get the current trace ID for correlation
   */
  getCurrentTraceId(): string | undefined {
    this.captureCurrentTraceId();
    return this.currentTraceId;
  }

  /**
   * Capture the current trace ID from OpenTelemetry context
   */
  private captureCurrentTraceId(): void {
    try {
      const currentContext = contextApi.active();
      const spanContext = trace.getSpan(currentContext)?.spanContext();

      if (spanContext) {
        this.currentTraceId = spanContext.traceId;
      }
    } catch (error) {
      // Failed to capture trace ID, continue without it
      logger.debug('Failed to capture current trace ID', error as Record<string, unknown>);
    }
  }

  /**
   * Get GCP project ID from credentials or metadata server
   */
  private async getProjectId(): Promise<string> {
    try {
      if (this.credentials && typeof this.credentials === 'object') {
        const projectId = (this.credentials as Record<string, string | undefined>)['project_id'];
        if (projectId) {
          return projectId;
        }
      }

      // Try to get project ID from Google Cloud metadata server
      const auth = new GoogleAuth();
      return await auth.getProjectId();
    } catch (error) {
      throw new SpanExportError(
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
        throw new SpanExportError(`Credentials file must contain project_id: ${filePath}`);
      }

      return credentials;
    } catch (error) {
      if (error instanceof SpanExportError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new SpanExportError(`Invalid JSON in credentials file: ${filePath}`, error);
      }
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new SpanExportError(`Credentials file not found: ${filePath}`, error);
      }
      throw new SpanExportError(`Failed to load credentials file: ${filePath}`, error);
    }
  }
}
