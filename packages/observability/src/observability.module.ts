import {
  Module,
  Global,
  OnModuleInit,
  OnApplicationShutdown,
  DynamicModule,
  Provider
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { logger, Logger } from './logger';
import { metricsService, MetricsService } from './metrics';
import { initializeTelemetry, shutdownTelemetry, ITelemetryConfig } from './telemetry';

/**
 * Observability module configuration
 */
export interface ObservabilityModuleConfig {
  /**
   * Telemetry configuration
   */
  readonly telemetry?: ITelemetryConfig;

  /**
   * Enable graceful shutdown for telemetry
   * @default true
   */
  readonly enableGracefulShutdown?: boolean;

  /**
   * Custom logger instance
   * If not provided, the global singleton will be used
   */
  readonly logger?: Logger;

  /**
   * Custom metrics service instance
   * If not provided, the global singleton will be used
   */
  readonly metricsService?: MetricsService;

  /**
   * Enable/disable OpenTelemetry
   * @default process.env.OTEL_ENABLED === 'true'
   */
  readonly telemetryEnabled?: boolean;
}

/**
 * Global observability module for NestJS
 *
 * This module provides:
 * - Dependency injection for Logger and MetricsService
 * - Automatic telemetry initialization
 * - Graceful shutdown handling
 * - OpenTelemetry integration
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     ObservabilityModule.forRoot({
 *       telemetry: {
 *         serviceName: 'api-service',
 *         serviceVersion: '1.0.0',
 *         environment: process.env.NODE_ENV ?? 'development',
 *         exporterUrl: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
 *       },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @Injectable()
 * export class UsersService {
 *   constructor(
 *     private readonly logger: Logger,
 *     private readonly metrics: MetricsService,
 *   ) {}
 *
 *   async createUser(dto: CreateUserDto) {
 *     this.logger.info('Creating user', { email: dto.email });
 *
 *     const counter = this.metrics.createCounter('users.created', 'Users created');
 *     this.metrics.incrementCounter('users.created');
 *
 *     // ... create user logic
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [],
  providers: [
    {
      provide: Logger,
      useValue: logger
    },
    {
      provide: MetricsService,
      useValue: metricsService
    }
  ],
  exports: [Logger, MetricsService]
})
export class ObservabilityModule implements OnModuleInit, OnApplicationShutdown {
  private static config: ObservabilityModuleConfig | null = null;

  constructor(
    // Note: moduleRef and metrics are injected but may not be directly used in all methods
    readonly moduleRef: ModuleRef,
    private readonly logger: Logger,
    readonly metrics: MetricsService
  ) {}

  /**
   * Lifecycle hook called when the module is initialized.
   *
   * This hook initializes the OpenTelemetry SDK if telemetry configuration is provided.
   * It is called automatically by NestJS after all modules are loaded but before
   * the application starts listening for requests.
   *
   * ## Behavior
   *
   * - Initializes OpenTelemetry SDK with the provided configuration
   * - Enables automatic instrumentation for HTTP, databases, and other libraries
   * - Logs initialization status (success or failure)
   * - Throws if initialization fails (prevents application startup with broken telemetry)
   *
   * ## Timing
   *
   * Called after dependency injection is complete but before:
   * - HTTP server starts listening
   * - Message queue consumers start
   * - Scheduled tasks begin execution
   *
   * This ensures all requests are traced from the first one.
   *
   * @throws Error if OpenTelemetry initialization fails
   */
  async onModuleInit(): Promise<void> {
    if (ObservabilityModule.config?.telemetry) {
      try {
        // Pass enabled flag to telemetry config
        const telemetryConfig: typeof ObservabilityModule.config.telemetry & { enabled?: boolean } =
          {
            ...ObservabilityModule.config.telemetry
          };

        if (ObservabilityModule.config.telemetryEnabled !== undefined) {
          telemetryConfig.enabled = ObservabilityModule.config.telemetryEnabled;
        }

        initializeTelemetry(telemetryConfig);

        this.logger.info('OpenTelemetry initialized', {
          serviceName: ObservabilityModule.config.telemetry.serviceName,
          enabled: telemetryConfig.enabled
        });
      } catch (error) {
        this.logger.error('Failed to initialize OpenTelemetry', error);
        throw error;
      }
    }
  }

  /**
   * Lifecycle hook called when the application is shutting down.
   *
   * This hook gracefully shuts down the OpenTelemetry SDK, ensuring all buffered
   * telemetry data (spans, metrics) is flushed to the configured exporters before
   * the process exits.
   *
   * ## Behavior
   *
   * - Flushes all pending spans and metrics to exporters
   * - Closes connections to telemetry backends (OTLP collectors, etc.)
   * - Releases SDK resources
   * - Logs shutdown status (errors are logged but do not throw)
   *
   * ## Configuration
   *
   * Graceful shutdown can be disabled by setting `enableGracefulShutdown: false`
   * in the module configuration. This may be useful in:
   * - Development environments where quick restarts are preferred
   * - Test environments where telemetry export is not needed
   * - Serverless environments with their own flush mechanisms
   *
   * ## Signal Handling
   *
   * This hook responds to NestJS shutdown signals (SIGTERM, SIGINT).
   * Ensure your application has `app.enableShutdownHooks()` called for this to work.
   */
  async onApplicationShutdown(): Promise<void> {
    if (ObservabilityModule.config?.enableGracefulShutdown !== false) {
      try {
        await shutdownTelemetry();
        this.logger.info('OpenTelemetry shut down successfully');
      } catch (error) {
        this.logger.error('Error during OpenTelemetry shutdown', error);
      }
    }
  }

  /**
   * Configure observability module with static configuration.
   *
   * Use this method when configuration values are known at compile time.
   * For dynamic configuration (e.g., from ConfigService), use {@link forRootAsync}.
   *
   * @param config - Static configuration options for the observability module
   * @param config.telemetry - OpenTelemetry configuration including service name, version, and exporter URL
   * @param config.enableGracefulShutdown - Whether to flush telemetry data on application shutdown (default: true)
   * @param config.logger - Custom Logger instance (uses global singleton if not provided)
   * @param config.metricsService - Custom MetricsService instance (uses global singleton if not provided)
   * @param config.telemetryEnabled - Override for OTEL_ENABLED environment variable
   * @returns A configured DynamicModule that can be imported into your application module
   *
   * @example Basic configuration
   * ```typescript
   * @Module({
   *   imports: [
   *     ObservabilityModule.forRoot({
   *       telemetry: {
   *         serviceName: 'api-service',
   *         serviceVersion: '1.0.0',
   *         environment: 'production',
   *         exporterUrl: 'http://otel-collector:4317',
   *       },
   *       enableGracefulShutdown: true,
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Minimal configuration (telemetry disabled)
   * ```typescript
   * @Module({
   *   imports: [
   *     ObservabilityModule.forRoot({
   *       telemetryEnabled: false,
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @see {@link forRootAsync} for async configuration with dependency injection
   */
  static forRoot(config: ObservabilityModuleConfig = {}): DynamicModule {
    ObservabilityModule.config = config;

    const providers: Provider[] = [
      {
        provide: Logger,
        useValue: config.logger ?? logger
      },
      {
        provide: MetricsService,
        useValue: config.metricsService ?? metricsService
      }
    ];

    return {
      module: ObservabilityModule,
      providers,
      exports: [Logger, MetricsService]
    };
  }

  /**
   * Configure observability module with async/dynamic configuration.
   *
   * Use this method when configuration values need to be resolved at runtime,
   * such as when using NestJS ConfigService or other injected dependencies.
   * The factory function is called during module initialization.
   *
   * @param options - Async module configuration options
   * @param options.useFactory - Factory function that returns the module configuration.
   *                             Can be async (return Promise) or sync. Receives injected
   *                             dependencies as arguments in the order specified by `inject`.
   * @param options.inject - Array of injection tokens for dependencies to pass to useFactory.
   *                         Common tokens: ConfigService, custom config providers.
   * @param options.imports - Additional modules to import that provide the injected dependencies.
   *                          Required when inject tokens come from other modules (e.g., ConfigModule).
   * @returns A configured DynamicModule that can be imported into your application module
   *
   * @example Using with ConfigService
   * ```typescript
   * @Module({
   *   imports: [
   *     ConfigModule.forRoot(),
   *     ObservabilityModule.forRootAsync({
   *       imports: [ConfigModule],
   *       useFactory: (config: ConfigService) => ({
   *         telemetry: {
   *           serviceName: config.get('SERVICE_NAME'),
   *           serviceVersion: config.get('SERVICE_VERSION'),
   *           environment: config.get('NODE_ENV'),
   *           exporterUrl: config.get('OTEL_EXPORTER_URL'),
   *         },
   *         telemetryEnabled: config.get('OTEL_ENABLED') === 'true',
   *       }),
   *       inject: [ConfigService],
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Async factory with multiple dependencies
   * ```typescript
   * ObservabilityModule.forRootAsync({
   *   imports: [ConfigModule, SecretsModule],
   *   useFactory: async (config: ConfigService, secrets: SecretsService) => {
   *     const exporterUrl = await secrets.getSecret('OTEL_EXPORTER_URL');
   *     return {
   *       telemetry: {
   *         serviceName: config.get('SERVICE_NAME'),
   *         serviceVersion: config.get('SERVICE_VERSION'),
   *         environment: config.get('NODE_ENV'),
   *         exporterUrl,
   *       },
   *     };
   *   },
   *   inject: [ConfigService, SecretsService],
   * })
   * ```
   *
   * @see {@link forRoot} for static configuration without dependency injection
   */
  static forRootAsync(options: {
    useFactory: (
      ...args: unknown[]
    ) => Promise<ObservabilityModuleConfig> | ObservabilityModuleConfig;
    inject?: unknown[];
    imports?: DynamicModule[];
  }): DynamicModule {
    return {
      module: ObservabilityModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: 'OBSERVABILITY_CONFIG',
          useFactory: async (...args: unknown[]) => {
            const config = await options.useFactory(...args);
            ObservabilityModule.config = config;

            // Initialize telemetry if config is provided
            if (config.telemetry) {
              const telemetryConfig: typeof config.telemetry & { enabled?: boolean } = {
                ...config.telemetry
              };
              if (config.telemetryEnabled !== undefined) {
                telemetryConfig.enabled = config.telemetryEnabled;
              }
              initializeTelemetry(telemetryConfig);
            }

            return config;
          },
          inject: (options.inject ?? []) as string[]
        },
        {
          provide: Logger,
          useFactory: (config: ObservabilityModuleConfig) => config.logger ?? logger,
          inject: ['OBSERVABILITY_CONFIG']
        },
        {
          provide: MetricsService,
          useFactory: (config: ObservabilityModuleConfig) =>
            config.metricsService ?? metricsService,
          inject: ['OBSERVABILITY_CONFIG']
        }
      ],
      exports: [Logger, MetricsService]
    };
  }
}

/**
 * Re-export all types and classes for convenience
 */
export type { ITelemetryConfig };

export { Logger, type ILogContext } from './logger';
export { MetricsService } from './metrics';

export { initializeTelemetry, shutdownTelemetry } from './telemetry';

export {
  setRequestContext,
  getRequestContext,
  withRequestContext,
  getRequestId,
  getUserId,
  getOrganizationId
} from './context';
