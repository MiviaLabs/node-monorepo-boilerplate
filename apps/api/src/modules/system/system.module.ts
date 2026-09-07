import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PermissionService, CachedPermissionService } from '@package/auth';
import { EventsModule } from '@package/events';
import { RedisModule, CacheService } from '@package/redis';

import { AuthModule } from '../auth/auth.module';
import { DeadLettersController } from './controllers/dead-letter.controller';
import { InboundMailOpsController } from './controllers/email-webhook-operations.controller';
import { ReplayController } from './controllers/event-replay.controller';
import {
  CreateTenantHandler,
  DeleteTenantHandler,
  UpdateSettingsHandler,
  UpdateTenantHandler
} from './handlers/commands';
import { ListTenantsHandler, GetMetricsHandler, GetSettingsHandler } from './handlers/queries';
import { TenantRepository } from './repositories/tenant.repository';
import { PlatformController } from './system.controller';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * System module
 *
 * Handles system-wide operations including tenant management,
 * system monitoring, and system settings.
 *
 * This module requires authentication and elevated permissions
 * for all operations.
 *
 * Note: EnhancedPermissionsGuard is imported from AuthModule.
 * Reflector is provided globally in AppModule and is accessible to all modules.
 * CachedPermissionService is provided locally for the guard to use.
 */
@Module({
  imports: [
    CqrsModule,
    forwardRef(() => AuthModule),
    RedisModule, // Import RedisModule to get CacheService provider
    EventsModule // Import EventsModule for DeadLettersController
  ],
  controllers: [
    PlatformController,
    DeadLettersController,
    ReplayController,
    InboundMailOpsController
  ],
  providers: [
    // Provide CachedPermissionService locally for the guard
    {
      provide: CachedPermissionService,
      useFactory: (permissionService: PermissionService, cache: CacheService) => {
        return new CachedPermissionService(permissionService, cache, {});
      },
      inject: [PermissionService, CacheService]
    },
    AuditOutboxPublisher,
    // Repository
    TenantRepository,
    // Command Handlers
    CreateTenantHandler,
    UpdateTenantHandler,
    DeleteTenantHandler,
    UpdateSettingsHandler,
    // Query Handlers
    ListTenantsHandler,
    GetMetricsHandler,
    GetSettingsHandler
  ],
  exports: [TenantRepository]
})
export class PlatformModule {}
