import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { OpsHealthController } from './controllers/health.controller';
import { DatabaseHealthIndicator } from './indicators/database-health-indicator';
import { EncryptionHealthIndicator } from './indicators/encryption-health-indicator';
import { OutboxHealthIndicator } from './indicators/outbox-health-indicator';
import { RedisHealthIndicator } from './indicators/redis-health-indicator';
import { HealthService } from './services/health.service';

import { databaseProviders } from '@/common/database/database.providers';
import { ErrorI18nModule } from '@/common/i18n/error-i18n.module';
import { AuthModule } from '@/modules/auth/auth.module';

/**
 * Health Module
 *
 * Provides health check endpoints for the API.
 * Imports ErrorI18nModule to enable translated health messages
 * based on Accept-Language header.
 *
 * Note: EventsModule, RedisModule are imported globally in AppModule/InfrastructureModule
 * Do not import them again here to avoid duplicate connections.
 *
 * Note: AuthModule is imported for JwtAuthGuard which is used by the /health/auth endpoint.
 * JwtModule configuration is provided by AuthModule, so we don't duplicate it here.
 */
@Module({
  imports: [ErrorI18nModule, AuthModule],
  controllers: [OpsHealthController],
  providers: [
    HealthService,
    DatabaseHealthIndicator,
    EncryptionHealthIndicator,
    OutboxHealthIndicator,
    RedisHealthIndicator,
    Reflector,
    ...databaseProviders
  ],
  exports: [
    HealthService,
    DatabaseHealthIndicator,
    EncryptionHealthIndicator,
    OutboxHealthIndicator,
    RedisHealthIndicator
  ]
})
export class OpsHealthModule {}
