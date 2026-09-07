import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
  Global,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR, APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { EncryptionModule, envVarConfig, type EncryptionModuleOptions } from '@package/encryption';
import {
  EventsModule,
  type EventsModuleConfig,
  type SaslConfig,
  CompressionCodec
} from '@package/events';
import { ObservabilityModule, type ObservabilityModuleConfig } from '@package/observability';
import { OpaModule } from '@package/opa';

import { AppController } from './app/app.controller';
import { AppService } from './app/app.service';
import { DatabaseModule } from './common/database';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ErrorI18nModule } from './common/i18n';
import { InfrastructureModule } from './common/infrastructure/infrastructure.module';
import {
  VersionInterceptor,
  UserContextInterceptor,
  LoggingInterceptor
} from './common/interceptors';
import { LocaleContextMiddleware, TenantMiddleware } from './common/middleware';
import { configServiceFromFactoryArgs } from './common/utils/config-factory.util';
import { VersionModule } from './common/version/version.module';
import { AppConfigModule } from './config/config.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantGuard } from './modules/auth/guards';
import { ConsoleModule } from './modules/admin/admin.module';
import { SetupModule } from './modules/bootstrap/bootstrap.module';
import { PagesModule } from './modules/content/content.module';
import { InboundMailModule } from './modules/email-webhooks/email-webhooks.module';
import { OpsHealthModule } from './modules/health/health.module';
import { TicketsModule } from './modules/issues/issues.module';
import { SecureVaultModule } from './modules/encrypted-store/encrypted-store.module';
import { SpacesModule } from './modules/projects/projects.module';
import { SecurityModule } from './modules/security/security.module';
import { StorageModule } from './modules/storage/storage.module';
import { PlatformModule } from './modules/system/system.module';
import { WorkspacesModule } from './modules/tenants/tenants.module';
import { PeopleModule } from './modules/users/users.module';

const OPA_ENABLED = process.env['OPA_ENABLED'] !== 'false';
const SCHEDULER_ENABLED = process.env['SCHEDULER_ENABLED'] !== 'false';

@Global()
@Module({
  imports: [
    AppConfigModule,
    CqrsModule.forRoot(),
    ...(SCHEDULER_ENABLED ? [ScheduleModule.forRoot()] : []),
    DatabaseModule,
    VersionModule,
    InfrastructureModule,
    ...(OPA_ENABLED
      ? [
          // OPA Module for policy-based authorization
          OpaModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (...args: unknown[]) => {
              const configService = configServiceFromFactoryArgs(args);
              return {
                url: configService.get<string>('OPA_URL', 'http://localhost:8181'),
                policyPath: configService.get<string>('OPA_POLICY_PATH', '/v1/data/authz/allow'),
                timeout: configService.get<number>('OPA_TIMEOUT', 5000)
              };
            }
          })
        ]
      : []),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const throttlerEnabled = configService.get<string>('THROTTLE_ENABLED', 'true') === 'true';

        if (!throttlerEnabled) {
          return [];
        }

        const getNumber = (key: string, defaultValue: number): number => {
          const value = configService.get<string>(key);
          if (value === undefined) return defaultValue;
          const parsed = Number.parseInt(value, 10);
          return Number.isNaN(parsed) ? defaultValue : parsed;
        };

        const redisEnabled = configService.get<string>('REDIS_ENABLED', 'false') === 'true';

        // If Redis is enabled, use Redis-backed throttler storage for distributed rate limiting
        let storage: ThrottlerStorageRedisService | undefined;
        if (redisEnabled) {
          const redisOptions: { host: string; port: number; db: number; password?: string } = {
            host: configService.get<string>('REDIS_HOST', 'localhost') ?? 'localhost',
            port: configService.get<number>('REDIS_PORT', 6379) ?? 6379,
            db: configService.get<number>('REDIS_DB', 0) ?? 0
          };

          const password = configService.get<string>('REDIS_PASSWORD');
          if (password !== undefined) {
            redisOptions.password = password;
          }

          storage = new ThrottlerStorageRedisService(redisOptions);
        }

        return [
          {
            name: 'login',
            ttl: getNumber('THROTTLE_LOGIN_TTL', 900) * 1000, // Convert seconds to ms
            limit: getNumber('THROTTLE_LOGIN_LIMIT', 5),
            storage
          },
          {
            name: 'registration',
            ttl: getNumber('THROTTLE_REGISTRATION_TTL', 3600) * 1000,
            limit: getNumber('THROTTLE_REGISTRATION_LIMIT', 3),
            storage
          },
          {
            name: 'refreshToken',
            ttl: getNumber('THROTTLE_REFRESH_TOKEN_TTL', 300) * 1000,
            limit: getNumber('THROTTLE_REFRESH_TOKEN_LIMIT', 10),
            storage
          },
          {
            name: 'oauth',
            ttl: getNumber('THROTTLE_OAUTH_TTL', 300) * 1000,
            limit: getNumber('THROTTLE_OAUTH_LIMIT', 10),
            storage
          },
          {
            name: 'phoneLogin',
            ttl: getNumber('THROTTLE_PHONE_LOGIN_TTL', 900) * 1000,
            limit: getNumber('THROTTLE_PHONE_LOGIN_LIMIT', 5),
            storage
          },
          {
            name: 'validateToken',
            ttl: getNumber('THROTTLE_VALIDATE_TOKEN_TTL', 60) * 1000,
            limit: getNumber('THROTTLE_VALIDATE_TOKEN_LIMIT', 100),
            storage
          },
          {
            name: 'invitationPreview',
            ttl: getNumber('THROTTLE_INVITATION_PREVIEW_TTL', 60) * 1000,
            limit: getNumber('THROTTLE_INVITATION_PREVIEW_LIMIT', 20),
            storage
          },
          {
            name: 'passwordReset',
            ttl: getNumber('THROTTLE_PASSWORD_RESET_TTL', 3600) * 1000,
            limit: getNumber('THROTTLE_PASSWORD_RESET_LIMIT', 3),
            storage
          },
          {
            name: 'bootstrapStatus',
            ttl: getNumber('THROTTLE_BOOTSTRAP_STATUS_TTL', 60) * 1000,
            limit: getNumber('THROTTLE_BOOTSTRAP_STATUS_LIMIT', 30),
            storage
          },
          {
            name: 'bootstrapInstall',
            ttl: getNumber('THROTTLE_BOOTSTRAP_INSTALL_TTL', 3600) * 1000,
            limit: getNumber('THROTTLE_BOOTSTRAP_INSTALL_LIMIT', 5),
            storage
          }
        ];
      }
    }),
    ObservabilityModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (...args: unknown[]): ObservabilityModuleConfig => {
        const _configService = configServiceFromFactoryArgs(args);
        const telemetryConfig: ObservabilityModuleConfig['telemetry'] = {
          serviceName: _configService.get<string>('SERVICE_NAME', 'api') ?? 'api',
          serviceVersion: _configService.get<string>('SERVICE_VERSION', '1.0.0') ?? '1.0.0',
          environment: _configService.get<string>('NODE_ENV', 'development') ?? 'development'
        };

        const exporterUrl = _configService.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT');
        if (exporterUrl !== undefined) {
          (telemetryConfig as unknown as Record<string, unknown>)['exporterUrl'] = exporterUrl;
        }

        const result: ObservabilityModuleConfig = {
          telemetry: telemetryConfig,
          enableGracefulShutdown: true
        };

        return result;
      }
    }),
    EventsModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (...args: unknown[]): EventsModuleConfig => {
        const configService = configServiceFromFactoryArgs(args);
        const eventsEnabledRaw = configService.get<string>('EVENTS_ENABLED', 'false');
        const eventsEnabled = eventsEnabledRaw?.trim().toLowerCase() === 'true';
        Logger.log(
          `EventsModule enabled=${eventsEnabled} (EVENTS_ENABLED="${eventsEnabledRaw ?? ''}")`,
          'AppModule'
        );

        // If events are disabled, return a minimal config that prevents connections
        if (!eventsEnabled) {
          return {
            enabled: false,
            kafka: {
              brokers: [],
              clientId: 'disabled'
            },
            outbox: {
              enabled: false
            }
          };
        }

        const saslMechanism = configService.get<string>('KAFKA_SASL_MECHANISM') as
          | 'plain'
          | 'scram-sha-256'
          | 'scram-sha-512'
          | 'aws'
          | undefined;

        let saslConfig: SaslConfig | undefined = undefined;

        if (saslMechanism && saslMechanism !== 'aws') {
          const username = configService.get<string>('KAFKA_SASL_USERNAME', '');
          const password = configService.get<string>('KAFKA_SASL_PASSWORD', '');

          if (username && password) {
            saslConfig = {
              mechanism: saslMechanism as 'plain' | 'scram-sha-256' | 'scram-sha-512',
              username,
              password
            };
          }
        }

        const getNumber = (key: string, defaultValue: number): number => {
          const value = configService.get<string>(key);
          if (value === undefined) return defaultValue;
          const parsed = Number.parseInt(value, 10);
          return Number.isNaN(parsed) ? defaultValue : parsed;
        };

        const isTest = configService.get<string>('NODE_ENV', 'development') === 'test';

        return {
          enableGracefulShutdown:
            configService.get<string>('ENABLE_GRACEFUL_SHUTDOWN', 'true') === 'true',
          kafka: {
            brokers: configService.get<string>('KAFKA_BROKERS', 'localhost:9092')?.split(',') ?? [
              'localhost:9092'
            ],
            clientId: configService.get<string>('KAFKA_CLIENT_ID', 'api') ?? 'api',
            ssl: configService.get<string>('KAFKA_SSL', 'false') === 'true',
            ...(saslConfig !== undefined && { sasl: saslConfig }),
            connectionTimeout: getNumber('KAFKA_CONNECTION_TIMEOUT', 10000),
            requestTimeout: getNumber('KAFKA_REQUEST_TIMEOUT', 30000),
            retryInterval: getNumber('KAFKA_RETRY_INTERVAL', 5000),
            maxRetries: getNumber('KAFKA_MAX_RETRIES', 5),
            replicationFactor: getNumber('KAFKA_REPLICATION_FACTOR', 1)
          },
          consumer: {
            sessionTimeout: getNumber('KAFKA_CONSUMER_SESSION_TIMEOUT', 30000),
            heartbeatInterval: getNumber('KAFKA_CONSUMER_HEARTBEAT_INTERVAL', 3000)
          },
          producer: {
            acks: getNumber('KAFKA_PRODUCER_ACKS', 1) as -1 | 0 | 1,
            timeout: getNumber('KAFKA_PRODUCER_TIMEOUT', 30000),
            compression:
              configService.get<CompressionCodec>('KAFKA_PRODUCER_COMPRESSION') ??
              CompressionCodec.None
          },
          handler: {
            maxRetries: getNumber('KAFKA_HANDLER_MAX_RETRIES', 3),
            retryDelay: getNumber('KAFKA_HANDLER_RETRY_DELAY', 1000)
          },
          outbox: {
            enabled: configService.get<string>('OUTBOX_ENABLED', 'true') === 'true',
            pollInterval: getNumber('OUTBOX_POLL_INTERVAL', 1000),
            batchSize: getNumber('OUTBOX_BATCH_SIZE', 10),
            maxRetries: getNumber('OUTBOX_MAX_RETRIES', 5),
            retryBackoffMultiplier: getNumber('OUTBOX_RETRY_BACKOFF_MULTIPLIER', 2),
            initialRetryDelay: getNumber('OUTBOX_INITIAL_RETRY_DELAY', 1000),
            cleanupInterval: getNumber('OUTBOX_CLEANUP_INTERVAL', 3600000),
            retentionDays: getNumber('OUTBOX_RETENTION_DAYS', 7)
          },
          // Use unique consumer group ID in tests to avoid conflicts between test suites
          // In production, all instances should share the same consumer group ID for load balancing
          consumerGroupId: isTest
            ? 'api-test-' + Date.now() + '-' + Math.random()
            : (configService.get<string>('SERVICE_NAME', 'api') ?? 'api'),
          consumerGroupPerTopic:
            configService
              .get<string>('KAFKA_CONSUMER_GROUP_PER_TOPIC', 'true')
              ?.trim()
              .toLowerCase() === 'true'
        };
      }
    }),
    EncryptionModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (...args: unknown[]): EncryptionModuleOptions => {
        const configService = configServiceFromFactoryArgs(args);
        const isTest = configService.get<string>('NODE_ENV') === 'test';
        const encryptionProvider = configService.get<string>('ENCRYPTION_PROVIDER')?.toLowerCase();
        const forceEnvVarProvider = encryptionProvider === 'env-var';

        // Load tenant keys dynamically from ENCRYPTION_KEY_{keyId} variables.
        const envVarTenantKeys: Record<string, string> = {};
        for (const [envVarName, envVarValue] of Object.entries(process.env)) {
          if (!envVarName.startsWith('ENCRYPTION_KEY_') || !envVarValue) {
            continue;
          }

          const keyId = envVarName.slice('ENCRYPTION_KEY_'.length);
          if (!keyId) {
            continue;
          }

          envVarTenantKeys[keyId] = envVarValue;
        }

        // For tests, or when ENCRYPTION_PROVIDER=env-var is explicitly configured,
        // use EnvVarProvider which doesn't require cloud KMS credentials.
        if (isTest || forceEnvVarProvider) {
          const logger = new Logger('EncryptionModule');
          const tenantKeyIds = Object.keys(envVarTenantKeys);
          const defaultEnvKeyPresent = Boolean(process.env['ENCRYPTION_KEY']);
          logger.log(
            'Using EnvVarProvider (reason=' +
              (isTest ? 'test-env' : 'ENCRYPTION_PROVIDER=env-var') +
              ', defaultKey=' +
              defaultEnvKeyPresent +
              ', tenantKeys=' +
              tenantKeyIds.length +
              ')'
          );

          return {
            providers: [
              envVarConfig({
                default: true,
                allowProduction: true,
                keys: tenantKeyIds.length > 0 ? envVarTenantKeys : undefined
              })
            ]
          };
        }

        // For production/development, resolve KMS providers from environment variables
        return {
          // Empty config - KMS providers will be resolved from environment variables
        };
      }
    }),
    StorageModule,
    ApiKeysModule,
    InboundMailModule,
    OpsHealthModule,
    PeopleModule,
    AuthModule,
    ConsoleModule,
    SetupModule,
    PagesModule,
    TicketsModule,
    PlatformModule,
    WorkspacesModule,
    SpacesModule,
    SecurityModule,
    SecureVaultModule.forRoot(),
    ErrorI18nModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    Reflector, // Global provider for guards to access decorator metadata
    {
      provide: APP_INTERCEPTOR,
      useClass: UserContextInterceptor
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: VersionInterceptor
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter
    },
    {
      provide: APP_GUARD,
      useClass: TenantGuard
    }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(LocaleContextMiddleware, TenantMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
