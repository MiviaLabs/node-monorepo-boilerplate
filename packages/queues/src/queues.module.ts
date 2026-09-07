import {
  Module,
  Global,
  OnModuleInit,
  OnApplicationShutdown,
  DynamicModule,
  Optional
} from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
// import { Logger } from '@package/observability';

import {
  resolveConfig,
  type IInfrastructureQueuesConfig,
  type IResolvedInfrastructureQueuesConfig
} from './config';
import { healthCheck as queueHealthCheck, setQueueConfig as setQueueConfigInternal } from './queue';
import { setSchedulerConfig as setSchedulerConfigInternal } from './scheduler';
import type { Processor } from './worker';
import { setWorkerConfig as setWorkerConfigInternal } from './worker';

// Import decorator and QueueManager from separate file (no parameter decorators)
import {
  JOB_HANDLER_METADATA,
  JobHandler,
  IJobHandlerOptions,
  QueueManager
} from './queues.decorators';

// Re-export them for consumers
export { JOB_HANDLER_METADATA, JobHandler, QueueManager };
export type { IJobHandlerOptions };

/**
 * Queues module configuration
 */
export interface QueuesModuleConfig extends IInfrastructureQueuesConfig {
  /**
   * Custom queue manager instance (optional)
   */
  readonly queueManager?: QueueManager;
}

/**
 * Global queues module for NestJS
 *
 * This module provides:
 * - Dependency injection for QueueManager
 * - Automatic job handler registration via @JobHandler() decorator
 * - Graceful shutdown handling
 * - Health check support
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [QueuesModule.forRoot()],
 * })
 * export class AppModule {}
 *
 * @Injectable()
 * export class EmailService {
 *   constructor(
 *     private readonly queueManager: QueueManager,
 *   ) {}
 *
 *   sendWelcomeEmail(email: string, name: string) {
 *     // Queue is auto-registered by @JobHandler decorator
 *     return addJob({
 *       queueName: 'emails',
 *       jobName: 'send-welcome',
 *       data: { email, name },
 *     });
 *   }
 *
 *   @JobHandler({ queueName: 'emails', jobName: 'send-welcome' })
 *   async handleSendWelcomeEmail(job: Job) {
 *     await this.sendEmail(job.data.email, job.data.name);
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    {
      provide: QueueManager,
      useValue: new QueueManager()
    }
  ],
  exports: [QueueManager]
})
export class QueuesModule implements OnModuleInit, OnApplicationShutdown {
  static config: IResolvedInfrastructureQueuesConfig | null = null;
  private static gracefulShutdownHandlers: (() => Promise<void>)[] = [];

  constructor(
    private readonly queueManager: QueueManager,
    @Optional() private readonly discovery?: DiscoveryService,
    @Optional() private readonly reflector?: Reflector
  ) {}

  /**
   * Register job handlers from providers with @JobHandler() decorator
   */
  async onModuleInit(): Promise<void> {
    // Skip job handler discovery if DiscoveryService or Reflector are not available
    // This can happen in test environments or when QueuesModule is used without @JobHandler decorators
    if (!this.discovery || !this.reflector) {
      return;
    }

    const providers = this.discovery.getProviders();

    for (const provider of providers) {
      if (!provider.instance || typeof provider.instance !== 'object') {
        continue;
      }

      const instance = provider.instance as Record<string, unknown>;
      const prototype = Object.getPrototypeOf(instance);

      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const method = instance[methodName];

        if (typeof method !== 'function') {
          continue;
        }

        // Check if method has @JobHandler decorator
        const metadata = this.reflector.get<IJobHandlerOptions>(JOB_HANDLER_METADATA, method);

        if (!metadata) {
          continue;
        }

        // Register the queue
        this.queueManager.registerQueue(metadata.queueName);

        // Register the worker
        const handlerFn = method.bind(instance) as Processor;
        this.queueManager.registerWorker(metadata.queueName, handlerFn, metadata.concurrency ?? 1);
      }
    }

    // Setup graceful shutdown if enabled
    if (QueuesModule.config?.enableGracefulShutdown !== false) {
      this.setupGracefulShutdown();
    }
  }

  /**
   * Apply configuration to queue, worker, and scheduler modules
   */
  // private applyConfiguration(config: IResolvedInfrastructureQueuesConfig): void {
  //   // Set configurations using imported functions
  //   setQueueConfigInternal(config.queue);
  //   setWorkerConfigInternal(config.worker);
  //   setSchedulerConfigInternal(config.scheduler);
  // }

  /**
   * Close all queues and workers on application shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    await this.queueManager.closeAll();
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdownHandler = async () => {
      await this.queueManager.closeAll();
    };

    QueuesModule.gracefulShutdownHandlers.push(shutdownHandler);

    process.once('SIGTERM', async () => {
      try {
        await shutdownHandler();
      } catch (error) {
        console.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    });

    process.once('SIGINT', async () => {
      try {
        await shutdownHandler();
      } catch (error) {
        console.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    });
  }

  /**
   * Configure queues module with static options
   *
   * Use `forRoot()` when configuration values are known at compile time.
   * For runtime configuration (environment variables, external config),
   * use `forRootAsync()` instead.
   *
   * @param config - Optional module configuration
   * @returns Dynamic module configuration
   *
   * @example Basic configuration with defaults
   * ```typescript
   * // Use all defaults - suitable for development
   * @Module({
   *   imports: [QueuesModule.forRoot()],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Production configuration with retry and graceful shutdown
   * ```typescript
   * @Module({
   *   imports: [
   *     QueuesModule.forRoot({
   *       enableGracefulShutdown: true, // Clean worker shutdown on SIGTERM/SIGINT
   *       queue: {
   *         defaultJobAttempts: 5,                  // Retry failed jobs 5 times
   *         defaultJobBackoffType: 'exponential',  // Exponential backoff
   *         defaultJobBackoffDelay: 2000,          // Start at 2s, then 4s, 8s, 16s, 32s
   *         enableDeadLetterQueue: true,           // Move failed jobs to DLQ
   *       },
   *       worker: {
   *         defaultConcurrency: 5,  // Process 5 jobs simultaneously
   *         stalledInterval: 30000, // Check for stalled jobs every 30s
   *         maxStalledCount: 2,     // Mark job as stalled after 2 missed checks
   *       },
   *       scheduler: {
   *         defaultTimezone: 'UTC', // Cron jobs run in UTC
   *       },
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @example High-throughput configuration for notification service
   * ```typescript
   * @Module({
   *   imports: [
   *     QueuesModule.forRoot({
   *       enableGracefulShutdown: true,
   *       queue: {
   *         defaultJobAttempts: 3,
   *         defaultJobBackoffType: 'fixed',
   *         defaultJobBackoffDelay: 1000,
   *         removeOnCompleteCount: 1000,  // Keep last 1000 completed jobs
   *         removeOnCompleteAge: 3600,    // Remove completed jobs after 1 hour
   *       },
   *       worker: {
   *         defaultConcurrency: 20, // High concurrency for push notifications
   *       },
   *     }),
   *   ],
   * })
   * export class NotificationModule {}
   * ```
   */
  static forRoot(config: QueuesModuleConfig = {}): DynamicModule {
    // Resolve configuration with defaults
    const resolvedConfig = resolveConfig(config);
    QueuesModule.config = resolvedConfig;

    // Apply configuration to modules
    setQueueConfigInternal(resolvedConfig.queue);
    setWorkerConfigInternal(resolvedConfig.worker);
    setSchedulerConfigInternal(resolvedConfig.scheduler);

    return {
      module: QueuesModule,
      global: true,
      providers: [
        {
          provide: QueueManager,
          useValue: config.queueManager ?? new QueueManager()
        }
      ],
      exports: [QueueManager]
    };
  }

  /**
   * Configure queues module with async configuration
   *
   * Use `forRootAsync()` when configuration depends on runtime values like
   * environment variables, external configuration services, or other modules.
   *
   * @param options - Async module options with factory function
   * @returns Dynamic module configuration
   *
   * @example Configuration from ConfigService (NestJS Config)
   * ```typescript
   * @Module({
   *   imports: [
   *     ConfigModule.forRoot(),
   *     QueuesModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: (config: ConfigService) => ({
   *         enableGracefulShutdown: config.get('QUEUES_GRACEFUL_SHUTDOWN') === 'true',
   *         queue: {
   *           defaultJobAttempts: config.get('QUEUE_JOB_ATTEMPTS', 3),
   *           defaultJobBackoffDelay: config.get('QUEUE_BACKOFF_DELAY', 1000),
   *           enableDeadLetterQueue: config.get('QUEUE_ENABLE_DLQ') === 'true',
   *         },
   *         worker: {
   *           defaultConcurrency: config.get('WORKER_CONCURRENCY', 5),
   *         },
   *         scheduler: {
   *           defaultTimezone: config.get('SCHEDULER_TIMEZONE', 'UTC'),
   *         },
   *       }),
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Environment-specific configuration
   * ```typescript
   * @Module({
   *   imports: [
   *     QueuesModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: (config: ConfigService) => {
   *         const isProduction = config.get('NODE_ENV') === 'production';
   *
   *         return {
   *           enableGracefulShutdown: true,
   *           queue: {
   *             // More retries in production
   *             defaultJobAttempts: isProduction ? 5 : 2,
   *             defaultJobBackoffDelay: isProduction ? 2000 : 500,
   *             // Enable DLQ only in production
   *             enableDeadLetterQueue: isProduction,
   *           },
   *           worker: {
   *             // Higher concurrency in production
   *             defaultConcurrency: isProduction ? 10 : 2,
   *           },
   *         };
   *       },
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   *
   * @example Async configuration from external service
   * ```typescript
   * @Module({
   *   imports: [
   *     QueuesModule.forRootAsync({
   *       imports: [RemoteConfigModule],
   *       inject: [RemoteConfigService],
   *       useFactory: async (remoteConfig: RemoteConfigService) => {
   *         // Fetch configuration from remote service (e.g., Consul, etcd)
   *         const queueConfig = await remoteConfig.getQueueConfig();
   *
   *         return {
   *           enableGracefulShutdown: true,
   *           queue: {
   *             defaultJobAttempts: queueConfig.retryAttempts,
   *             defaultJobBackoffDelay: queueConfig.backoffMs,
   *             enableDeadLetterQueue: queueConfig.enableDLQ,
   *           },
   *           worker: {
   *             defaultConcurrency: queueConfig.workerConcurrency,
   *           },
   *         };
   *       },
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(options: {
    useFactory: (...args: unknown[]) => Promise<QueuesModuleConfig> | QueuesModuleConfig;
    inject?: unknown[];
    imports?: DynamicModule[];
  }): DynamicModule {
    return {
      module: QueuesModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: 'QUEUES_CONFIG',
          useFactory: async (...args: unknown[]) => {
            const config = await options.useFactory(...args);
            // Resolve configuration with defaults
            const resolvedConfig = resolveConfig(config);
            QueuesModule.config = resolvedConfig;

            // Apply configuration to modules
            setQueueConfigInternal(resolvedConfig.queue);
            setWorkerConfigInternal(resolvedConfig.worker);
            setSchedulerConfigInternal(resolvedConfig.scheduler);

            return resolvedConfig;
          },
          inject: (options.inject ?? []) as string[]
        },
        {
          provide: QueueManager,
          useFactory: () => new QueueManager()
        }
      ],
      exports: [QueueManager]
    };
  }

  /**
   * Health check for queue connectivity
   *
   * @returns true if queues are healthy, false otherwise
   *
   * @example
   * ```typescript
   * @Get('health')
   * async healthCheck() {
   *   const isHealthy = await QueuesModule.healthCheck();
   *   return { status: isHealthy ? 'ok' : 'unhealthy' };
   * }
   * ```
   */
  static async healthCheck(): Promise<boolean> {
    return queueHealthCheck();
  }
}
