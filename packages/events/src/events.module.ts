import {
  Module,
  Global,
  OnModuleInit,
  OnApplicationShutdown,
  DynamicModule,
  Provider
} from '@nestjs/common';
import { DiscoveryService, Reflector, DiscoveryModule } from '@nestjs/core';
import { db as eventsDb } from '@package/db-outbox';

import { setupGracefulShutdown, closeKafka, healthCheck, setKafkaConfig } from './client';
import { resolveConfig, type InfrastructureEventsConfig } from './config';
import { DeadLetterService } from './dead-letter';
import { EventBus, EventMessage, PublishOptions, SubscribeOptions } from './event-bus';
import { MessageHandler, MessageHandlerFn, MessageHandlerOptions } from './handler';
import { OutboxRepository, OutboxPollerService, outboxPollerConfig } from './outbox';
import { EventReplayService } from './replay';
// Versioning and validation imports
import { registerAllEventSchemas } from './schema/event-auto-register';
import { EventRegistryService } from './schema/event-registry.service';
import { EventValidationService } from './validation/event-validation.service';
import { EventVersioningService } from './versioning/event-versioning.service';

import type { EventVersioningConfig } from './versioning/versioning.config';

/**
 * Event handler decorator
 *
 * Use this decorator to mark methods as event handlers.
 * The decorator stores metadata that the EventsModule uses to register handlers.
 *
 * @example
 * ```typescript
 * @EventHandler('user-created')
 * async handleUserCreated(event: EventMessage<UserCreatedEvent>) {
 *   await this.sendWelcomeEmail(event.data.email);
 * }
 * ```
 */
export const EVENT_HANDLER_METADATA = 'eventHandler';

/**
 * Event handler decorator
 *
 * @param eventType - Event type to handle
 * @returns Method decorator that registers the method as an event handler
 */
export const EventHandler = (eventType: string): MethodDecorator => {
  return (_target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(EVENT_HANDLER_METADATA, { eventType, propertyKey }, descriptor.value);
    return descriptor;
  };
};

/**
 * Events module configuration
 *
 * This configuration interface allows complete customization of the
 * events package behavior. All options can be overridden
 * via input configuration, with environment variables as fallback.
 */
export interface EventsModuleConfig extends InfrastructureEventsConfig {
  /**
   * Custom event bus instance
   * If not provided, a global singleton will be used
   */
  readonly eventBus?: EventBus;

  /**
   * Custom message handler instance
   * If not provided, a global singleton will be used
   */
  readonly messageHandler?: MessageHandler;

  /**
   * Event versioning configuration
   * Controls schema versioning and compatibility behavior
   */
  readonly versioning?: Partial<EventVersioningConfig>;

  /**
   * Enable automatic schema validation
   * When true, events are validated against registered schemas
   * @default true
   */
  readonly schemaValidationEnabled?: boolean;

  /**
   * Auto-register default event schemas
   * When true, registers common event schemas automatically
   * @default true
   */
  readonly autoRegisterSchemas?: boolean;

  /**
   * Append topic name to configured consumerGroupId for handler subscriptions.
   * Keeps per-topic consumers isolated to avoid cross-topic rebalances.
   * @default false
   */
  readonly consumerGroupPerTopic?: boolean;
}

/**
 * Global events module for NestJS
 *
 * This module provides:
 * - Dependency injection for EventBus and MessageHandler
 * - Automatic event handler registration via @EventHandler() decorator
 * - Outbox pattern support for transactional event publishing
 * - Graceful shutdown handling
 * - Health check support
 * - OpenTelemetry tracing integration
 *
 * @example
 * ```typescript
 * @Module({
 *   imports: [EventsModule],
 * })
 * export class AppModule {}
 *
 * @Controller('users')
 * export class UsersController {
 *   constructor(
 *     private readonly eventBus: EventBus,
 *   ) {}
 *
 *   @Post()
 *   async create(@Body() dto: CreateUserDto) {
 *     const user = await this.usersService.create(dto);
 *
 *     // Publish event
 *     await this.eventBus.publish('user.created', user);
 *
 *     return user;
 *   }
 * }
 *
 * @Injectable()
 * export class UsersService {
 *   @EventHandler('user.created')
 *   async handleUserCreated(event: EventMessage<{ userId: string }>) {
 *     console.log('User created:', event.data.userId);
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    {
      provide: EventBus,
      useValue: new EventBus()
    },
    {
      provide: MessageHandler,
      useValue: new MessageHandler()
    },
    {
      provide: OutboxRepository,
      useFactory: () => new OutboxRepository(eventsDb)
    },
    {
      provide: OutboxPollerService,
      useFactory: (eventBus: EventBus, outboxRepo: OutboxRepository) => {
        return new OutboxPollerService(
          eventBus,
          outboxRepo,
          outboxPollerConfig as typeof outboxPollerConfig & { eventsEnabled: boolean }
        );
      },
      inject: [EventBus, OutboxRepository]
    },
    // Event versioning service
    {
      provide: EventVersioningService,
      useClass: EventVersioningService
    },
    // Event validation service
    {
      provide: EventValidationService,
      useFactory: () => new EventValidationService(true)
    },
    // Event registry service
    {
      provide: EventRegistryService,
      useClass: EventRegistryService
    },
    // Dead letter service
    {
      provide: DeadLetterService,
      useFactory: (eventBus: EventBus, outboxRepo: OutboxRepository) => {
        return new DeadLetterService(
          eventBus,
          outboxRepo,
          // Default dead letter config (will be overridden in forRoot)
          {
            enabled: true,
            maxRetries: 5,
            deadLetterTopic: 'dead-letter',
            alertOnFailure: true,
            retentionDays: 30,
            cleanupInterval: 86400000
          }
        );
      },
      inject: [EventBus, OutboxRepository]
    },
    // Event replay service
    {
      provide: EventReplayService,
      useFactory: (eventBus: EventBus, outboxRepo: OutboxRepository) => {
        return new EventReplayService(
          eventBus,
          outboxRepo,
          // Default replay config (will be overridden in forRoot)
          {
            enabled: true,
            maxParallel: 10,
            batchSize: 50,
            stopOnError: false,
            retentionDays: 90,
            cleanupInterval: 86400000
          }
        );
      },
      inject: [EventBus, OutboxRepository]
    }
  ],
  exports: [
    EventBus,
    MessageHandler,
    OutboxRepository,
    OutboxPollerService,
    EventVersioningService,
    EventValidationService,
    EventRegistryService,
    DeadLetterService,
    EventReplayService
  ]
})
export class EventsModule implements OnModuleInit, OnApplicationShutdown {
  private static config:
    | (InfrastructureEventsConfig & {
        versioning?: Partial<EventVersioningConfig>;
        schemaValidationEnabled?: boolean;
        autoRegisterSchemas?: boolean;
        consumerGroupPerTopic?: boolean;
      })
    | null = null;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly reflector: Reflector,
    // Note: eventBus is injected but may not be directly used in all methods
    readonly eventBus: EventBus,
    private readonly messageHandler: MessageHandler,
    // Versioning and validation services (injected for DI, used in onModuleInit)
    private readonly _eventValidationService: EventValidationService,
    private readonly _eventRegistryService: EventRegistryService
    // Note: EventVersioningService is provided via DI but not directly used
    // It's available for injection by other modules that need versioning
  ) {}

  /**
   * Register event handlers from providers with @EventHandler() decorator
   * and optionally auto-register event schemas
   */
  async onModuleInit(): Promise<void> {
    // Skip initialization if events are disabled
    if (EventsModule.config?.enabled === false) {
      return;
    }

    // Auto-register default event schemas if enabled
    if (EventsModule.config?.autoRegisterSchemas !== false) {
      registerAllEventSchemas(this._eventValidationService, this._eventRegistryService);
    }

    // Register event handlers after all modules are initialized
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

        // Check if method has @EventHandler decorator
        const metadata = this.reflector.get<{ eventType: string }>(EVENT_HANDLER_METADATA, method);

        if (!metadata) {
          continue;
        }

        // Register the handler
        const topic = metadata.eventType.replace(/\./g, '-');
        const handlerFn = method.bind(instance) as MessageHandlerFn;

        const baseGroupId = EventsModule.config?.consumerGroupId;
        const groupId = baseGroupId
          ? EventsModule.config?.consumerGroupPerTopic
            ? `${baseGroupId}-${topic}`
            : baseGroupId
          : `${metadata.eventType}-handler`;

        await this.messageHandler.register(
          {
            topic,
            // Scope group id by topic so per-topic consumers don't rebalance each other
            groupId
          },
          handlerFn
        );
      }
    }
  }

  /**
   * Close Kafka connections on application shutdown
   */
  async onApplicationShutdown(): Promise<void> {
    // Skip shutdown if events were never initialized
    if (EventsModule.config?.enabled === false) {
      return;
    }

    await this.messageHandler.unregisterAll();
    await closeKafka();
  }

  /**
   * Configure events module
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [EventsModule.forRoot({
   *     enableGracefulShutdown: true,
   *     kafka: {
   *       brokers: ['localhost:9092'],
   *       ssl: false,
   *     },
   *     consumer: {
   *       sessionTimeout: 60000,
   *     },
   *     outbox: {
   *       enabled: true,
   *       pollInterval: 5000,
   *     },
   *   })],
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(config: EventsModuleConfig = {}): DynamicModule {
    EventsModule.config = config;

    // Resolve configuration with defaults
    resolveConfig(config);

    // Merge outbox config with defaults
    const outboxConfig = { ...outboxPollerConfig, ...config.outbox };

    const providers: Provider[] = [
      {
        provide: EventBus,
        useValue: config.eventBus ?? new EventBus()
      },
      {
        provide: MessageHandler,
        useValue: config.messageHandler ?? new MessageHandler()
      },
      {
        provide: OutboxRepository,
        useFactory: () => new OutboxRepository(eventsDb)
      },
      {
        provide: OutboxPollerService,
        useFactory: (eventBus: EventBus, outboxRepo: OutboxRepository) => {
          const configWithEnabled = {
            ...outboxConfig,
            eventsEnabled: true
          } as typeof outboxConfig & { eventsEnabled: boolean };
          return new OutboxPollerService(eventBus, outboxRepo, configWithEnabled);
        },
        inject: [EventBus, OutboxRepository]
      },
      // Event versioning service
      {
        provide: EventVersioningService,
        useClass: EventVersioningService
      },
      // Event validation service
      {
        provide: EventValidationService,
        useFactory: () => new EventValidationService(config.schemaValidationEnabled !== false)
      },
      // Event registry service
      {
        provide: EventRegistryService,
        useClass: EventRegistryService
      },
      // Dead letter service
      {
        provide: DeadLetterService,
        useFactory: (eventBus: EventBus, outboxRepo: OutboxRepository) => {
          const resolved = resolveConfig(config);
          return new DeadLetterService(eventBus, outboxRepo, resolved.deadLetter);
        },
        inject: [EventBus, OutboxRepository]
      },
      // Event replay service
      {
        provide: EventReplayService,
        useFactory: (eventBus: EventBus, outboxRepo: OutboxRepository) => {
          const resolved = resolveConfig(config);
          return new EventReplayService(eventBus, outboxRepo, resolved.replay);
        },
        inject: [EventBus, OutboxRepository]
      }
    ];

    if (config.enableGracefulShutdown !== false) {
      // Setup graceful shutdown when module is initialized
      setupGracefulShutdown();
    }

    // Set Kafka config (resolves with env vars and defaults)
    setKafkaConfig(config);

    // Set handler config
    if (config.handler) {
      MessageHandler.setConfig(config);
    }

    return {
      module: EventsModule,
      imports: [DiscoveryModule],
      providers,
      exports: [
        EventBus,
        MessageHandler,
        OutboxRepository,
        OutboxPollerService,
        EventVersioningService,
        EventValidationService,
        EventRegistryService,
        DeadLetterService,
        EventReplayService
      ]
    };
  }

  /**
   * Configure events module with async configuration
   *
   * @example
   * ```typescript
   * @Module({
   *   imports: [
   *     EventsModule.forRootAsync({
   *       imports: [ConfigModule],
   *       inject: [ConfigService],
   *       useFactory: (config: ConfigService) => ({
   *         enableGracefulShutdown: config.get('KAFKA_GRACEFUL_SHUTDOWN', 'true') === 'true',
   *         kafka: {
   *           brokers: config.get('KAFKA_BROKERS', 'localhost:9092').split(','),
   *           clientId: config.get('KAFKA_CLIENT_ID'),
   *           ssl: config.get('KAFKA_SSL', 'false') === 'true',
   *           sasl: config.get('KAFKA_SASL_MECHANISM') ? {
   *             mechanism: config.get('KAFKA_SASL_MECHANISM'),
   *             username: config.get('KAFKA_SASL_USERNAME'),
   *             password: config.get('KAFKA_SASL_PASSWORD'),
   *           } : undefined,
   *         },
   *         consumer: {
   *           sessionTimeout: config.get('KAFKA_CONSUMER_SESSION_TIMEOUT', 30000),
   *           heartbeatInterval: config.get('KAFKA_CONSUMER_HEARTBEAT_INTERVAL', 3000),
   *         },
   *         producer: {
   *           acks: config.get('KAFKA_PRODUCER_ACKS', 1),
   *           timeout: config.get('KAFKA_PRODUCER_TIMEOUT', 30000),
   *         },
   *         outbox: {
   *           enabled: config.get('OUTBOX_ENABLED', 'true') === 'true',
   *           pollInterval: config.get('OUTBOX_POLL_INTERVAL', 1000),
   *           batchSize: config.get('OUTBOX_BATCH_SIZE', 10),
   *         },
   *       }),
   *     }),
   *   ],
   * })
   * export class AppModule {}
   * ```
   */
  static forRootAsync(options: {
    useFactory: (...args: unknown[]) => Promise<EventsModuleConfig> | EventsModuleConfig;
    inject?: unknown[];
    imports?: DynamicModule[];
  }): DynamicModule {
    return {
      module: EventsModule,
      imports: [DiscoveryModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: 'EVENTS_CONFIG',
          useFactory: async (...args: unknown[]) => {
            const config = await options.useFactory(...args);
            EventsModule.config = config;

            // Resolve configuration with defaults
            resolveConfig(config);

            // Setup graceful shutdown if enabled
            if (config.enableGracefulShutdown !== false) {
              setupGracefulShutdown();
            }

            // Set Kafka config (resolves with env vars and defaults)
            setKafkaConfig(config);

            // Set handler config
            if (config.handler) {
              MessageHandler.setConfig(config);
            }

            return config;
          },
          inject: (options.inject ?? []) as string[]
        },
        {
          provide: EventBus,
          useFactory: (config: EventsModuleConfig) => config.eventBus ?? new EventBus(),
          inject: ['EVENTS_CONFIG']
        },
        {
          provide: MessageHandler,
          useFactory: (config: EventsModuleConfig) => config.messageHandler ?? new MessageHandler(),
          inject: ['EVENTS_CONFIG']
        },
        {
          provide: OutboxRepository,
          useFactory: () => new OutboxRepository(eventsDb)
        },
        {
          provide: OutboxPollerService,
          useFactory: (
            eventBus: EventBus,
            outboxRepo: OutboxRepository,
            config: EventsModuleConfig
          ) => {
            const outboxConfig = {
              ...outboxPollerConfig,
              ...config.outbox,
              eventsEnabled: config.enabled ?? true
            };
            return new OutboxPollerService(eventBus, outboxRepo, outboxConfig);
          },
          inject: [EventBus, OutboxRepository, 'EVENTS_CONFIG']
        },
        // Event versioning service
        {
          provide: EventVersioningService,
          useClass: EventVersioningService
        },
        // Event validation service
        {
          provide: EventValidationService,
          useFactory: (config: EventsModuleConfig) =>
            new EventValidationService(config.schemaValidationEnabled !== false),
          inject: ['EVENTS_CONFIG']
        },
        // Event registry service
        {
          provide: EventRegistryService,
          useClass: EventRegistryService
        },
        // Dead letter service
        {
          provide: DeadLetterService,
          useFactory: (
            eventBus: EventBus,
            outboxRepo: OutboxRepository,
            config: EventsModuleConfig
          ) => {
            const resolved = resolveConfig(config);
            return new DeadLetterService(eventBus, outboxRepo, resolved.deadLetter);
          },
          inject: [EventBus, OutboxRepository, 'EVENTS_CONFIG']
        },
        // Event replay service
        {
          provide: EventReplayService,
          useFactory: (
            eventBus: EventBus,
            outboxRepo: OutboxRepository,
            config: EventsModuleConfig
          ) => {
            const resolved = resolveConfig(config);
            return new EventReplayService(eventBus, outboxRepo, resolved.replay);
          },
          inject: [EventBus, OutboxRepository, 'EVENTS_CONFIG']
        }
      ],
      exports: [
        EventBus,
        MessageHandler,
        OutboxRepository,
        OutboxPollerService,
        EventVersioningService,
        EventValidationService,
        EventRegistryService,
        DeadLetterService,
        EventReplayService
      ]
    };
  }

  /**
   * Health check for Kafka connectivity
   *
   * @returns true if Kafka is healthy, false otherwise
   */
  static async healthCheck(): Promise<boolean> {
    return healthCheck();
  }
}

/**
 * Re-export all types and classes for convenience
 */
export type {
  EventMessage,
  PublishOptions,
  SubscribeOptions,
  MessageHandlerOptions,
  MessageHandlerFn
};

export { ConsumerSubscription } from './event-bus';

export {
  createKafkaClient,
  getProducer,
  createConsumer,
  closeProducer,
  closeKafka,
  healthCheck,
  setupGracefulShutdown,
  setKafkaConfig
} from './client';

export type { KafkaConfig } from './client';

// Export configuration types
export * from './config';
