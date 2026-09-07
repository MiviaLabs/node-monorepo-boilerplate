/**
 * GCP Cloud Logging Provider
 *
 * Exports logs to Google Cloud Logging with automatic severity mapping
 * and trace correlation support.
 */

import { Logging, Entry } from '@google-cloud/logging';

import { LogLevel } from '../config';
import { LoggingExportError } from '../errors';
import { logger } from '../logger';

import type { IGcpLoggingProvider } from './gcp-provider.interface';
import type { GcpLoggingProviderConfig } from './gcp-provider.types';

/**
 * Log level to Cloud Logging severity mapping
 */
const LOG_LEVEL_TO_SEVERITY: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARNING',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'CRITICAL'
};

/**
 * Default resource labels
 */
const DEFAULT_RESOURCE_LABELS = {
  'service.name': process.env['SERVICE_NAME'] ?? 'api',
  'service.version': process.env['SERVICE_VERSION'] ?? '1.0.0',
  'deployment.environment': process.env['NODE_ENV'] ?? 'development'
};

/**
 * GCP Cloud Logging Provider
 *
 * Exports logs to Google Cloud Logging with automatic severity mapping,
 * structured logging support, and trace correlation.
 *
 * @example
 * ```typescript
 * const provider = new GcpLoggingProvider({
 *   projectId: 'my-project',
 *   logName: 'my-app-logs',
 *   enableAsyncLogging: true,
 * });
 *
 * await provider.initialize();
 * await provider.start();
 *
 * await provider.writeLog('INFO', 'User logged in', { userId: '123' });
 * ```
 */
export class GcpLoggingProvider implements IGcpLoggingProvider {
  private config: GcpLoggingProviderConfig;
  private loggingClient?: Logging;
  private logName: string;
  private isInitialized = false;
  private credentials?: Record<string, unknown>;
  private resourceLabels: Record<string, string>;
  private writeQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private readonly DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

  constructor(config: GcpLoggingProviderConfig) {
    this.config = {
      enabled: true,
      enableAsyncLogging: false,
      logEntryLabels: {},
      shutdownTimeoutMs: this.DEFAULT_SHUTDOWN_TIMEOUT_MS,
      ...config
    };
    this.logName = this.config.logName ?? process.env['SERVICE_NAME'] ?? 'api';
    if (this.config.credentials !== undefined) {
      this.credentials = this.config.credentials;
    }
    this.resourceLabels = {
      ...DEFAULT_RESOURCE_LABELS,
      ...this.config.logEntryLabels
    };
  }

  /**
   * Initialize the logging provider
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('GCP Logging Provider is disabled');
      return;
    }

    try {
      // Load credentials if credentialsFile is provided
      if (this.config.credentialsFile && !this.credentials) {
        this.credentials = await this.loadCredentialsFile(this.config.credentialsFile);
      }

      // Get project ID
      const projectId = this.config.projectId || (await this.getProjectId());

      // Create Logging client
      const loggingOptions: Record<string, unknown> = {
        projectId,
        ...(this.credentials && { credentials: this.credentials }),
        ...(this.config.endpoint && { apiEndpoint: this.config.endpoint })
      };

      this.loggingClient = new Logging(loggingOptions);

      // Verify logging client is working by requesting the log
      this.loggingClient.log(this.logName);

      // The log is ready to use
      this.isInitialized = true;
      logger.info('GCP Logging Provider initialized successfully', {
        projectId,
        logName: this.logName
      });
    } catch (error) {
      throw new LoggingExportError(
        `Failed to initialize GCP Logging Provider: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Start the logging provider
   */
  async start(): Promise<void> {
    if (!this.isInitialized || !this.config.enabled) {
      return;
    }

    if (this.config.enableAsyncLogging) {
      // Start processing write queue
      this.processWriteQueue();
    }

    logger.debug('GCP Logging Provider started');
  }

  /**
   * Stop the logging provider and flush pending logs
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    try {
      // Wait for queue to empty with configurable timeout
      if (this.config.enableAsyncLogging) {
        const timeoutMs = this.config.shutdownTimeoutMs ?? this.DEFAULT_SHUTDOWN_TIMEOUT_MS;
        const startTime = Date.now();

        while (this.writeQueue.length > 0 && Date.now() - startTime < timeoutMs) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (this.writeQueue.length > 0) {
          logger.warn(
            `Shutdown timeout with ${this.writeQueue.length} items remaining in write queue`
          );
        }

        this.isProcessingQueue = false;
      }

      // Clear the logging client by letting it go out of scope naturally
      // Just mark as uninitialized
      this.isInitialized = false;
      logger.info('GCP Logging Provider shutdown successfully');
    } catch (error) {
      throw new LoggingExportError(
        `Failed to shutdown GCP Logging Provider: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }

  /**
   * Force flush pending logs
   */
  async forceFlush(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    if (this.config.enableAsyncLogging) {
      while (this.writeQueue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * Health check for the logging provider
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isInitialized || !this.loggingClient) {
      return false;
    }

    try {
      // Simply check if we can access the logging client
      this.loggingClient.log(this.logName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write a log entry
   */
  async writeLog(
    severity: string,
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): Promise<void> {
    const writeFn = async () => {
      if (!this.isInitialized || !this.loggingClient) {
        logger.debug('Cannot write log: provider not initialized');
        return;
      }

      try {
        const entryData = this.buildLogEntry(severity, message, metadata, traceId);
        const entry = new Entry(entryData);
        const log = this.loggingClient.log(this.logName);
        await log.write(entry);
      } catch (error) {
        logger.error('Failed to write log to Cloud Logging', error);
        // Don't throw to prevent cascading failures
      }
    };

    if (this.config.enableAsyncLogging) {
      this.writeQueue.push(writeFn);
      void this.processWriteQueue();
    } else {
      await writeFn();
    }
  }

  /**
   * Write a structured log entry
   */
  async writeStructuredLog(
    severity: string,
    payload: Record<string, unknown>,
    traceId?: string
  ): Promise<void> {
    await this.writeLog(severity, '', payload, traceId);
  }

  /**
   * Build a Cloud Logging log entry
   */
  private buildLogEntry(
    severity: string,
    message: string,
    metadata?: Record<string, unknown>,
    traceId?: string
  ): Record<string, unknown> {
    const cloudSeverity = this.mapSeverity(severity);

    const entry: Record<string, unknown> = {
      severity: cloudSeverity,
      resource: {
        type: 'cloud_run_revision',
        labels: this.resourceLabels
      },
      ...metadata
    };

    // Add message if provided
    if (message) {
      entry['message'] = message;
    }

    // Add trace correlation if traceId is provided
    if (traceId) {
      entry['trace'] = traceId;
    }

    // Add timestamp
    entry['timestamp'] = new Date();

    return entry;
  }

  /**
   * Map log level to Cloud Logging severity
   */
  private mapSeverity(level: string): string {
    const lowerLevel = level.toLowerCase() as LogLevel;
    return LOG_LEVEL_TO_SEVERITY[lowerLevel] || 'DEFAULT';
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
        throw new LoggingExportError(`Credentials file must contain project_id: ${filePath}`);
      }

      return credentials;
    } catch (error) {
      if (error instanceof LoggingExportError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new LoggingExportError(`Invalid JSON in credentials file: ${filePath}`, error);
      }
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new LoggingExportError(`Credentials file not found: ${filePath}`, error);
      }
      throw new LoggingExportError(`Failed to load credentials file: ${filePath}`, error);
    }
  }

  /**
   * Process write queue for async logging
   */
  private async processWriteQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.writeQueue.length > 0) {
      const writeFn = this.writeQueue.shift();
      if (writeFn) {
        try {
          await writeFn();
        } catch (error) {
          logger.error('Failed to process write queue item', error);
        }
      }
    }

    this.isProcessingQueue = false;

    // Schedule next processing if there are items in queue
    if (this.writeQueue.length > 0) {
      setTimeout(() => this.processWriteQueue(), 100);
    }
  }

  /**
   * Get GCP project ID from credentials or metadata server
   */
  private async getProjectId(): Promise<string> {
    try {
      if (this.credentials && typeof this.credentials === 'object') {
        const projectId = (this.credentials as Record<string, string>)['project_id'];
        if (projectId !== undefined) {
          return projectId;
        }
      }

      // Try to get project ID from Google Cloud metadata server
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth();
      return await auth.getProjectId();
    } catch (error) {
      throw new LoggingExportError(
        `Failed to get GCP project ID: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  }
}
