import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CachedPermissionService, PermissionService } from '@package/auth';
import { CacheService, RedisModule } from '@package/redis';

import { ConsoleController } from './admin.controller';
import {
  GetAdminAccessOverviewHandler,
  GetAdminEmailDetailHandler,
  GetAdminEmailSummaryHandler,
  GetAdminEmailsOverviewHandler,
  GetAdminDeletionQueueSummaryHandler,
  GetAdminDeletionsOverviewHandler,
  GetAdminMemberDetailHandler,
  GetAdminOutboxOverviewHandler,
  GetAdminOutboxSummaryHandler,
  GetAdminUserDetailHandler,
  GetAdminHealthOverviewHandler,
  GetAdminInboxOverviewHandler,
  GetAdminStatisticsOverviewHandler,
  GetAdminTenantDetailHandler,
  GetAdminTenantsOverviewHandler,
  GetAdminUsersOverviewHandler
} from './handlers';
import { AuthModule } from '../auth/auth.module';
import { OpsHealthModule } from '../health/health.module';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

@Module({
  imports: [CqrsModule, forwardRef(() => AuthModule), RedisModule, OpsHealthModule],
  controllers: [ConsoleController],
  providers: [
    {
      provide: CachedPermissionService,
      useFactory: (permissionService: PermissionService, cache: CacheService) => {
        return new CachedPermissionService(permissionService, cache, {});
      },
      inject: [PermissionService, CacheService]
    },
    AuditOutboxPublisher,
    GetAdminHealthOverviewHandler,
    GetAdminStatisticsOverviewHandler,
    GetAdminEmailDetailHandler,
    GetAdminEmailSummaryHandler,
    GetAdminEmailsOverviewHandler,
    GetAdminDeletionQueueSummaryHandler,
    GetAdminDeletionsOverviewHandler,
    GetAdminOutboxSummaryHandler,
    GetAdminOutboxOverviewHandler,
    GetAdminTenantsOverviewHandler,
    GetAdminTenantDetailHandler,
    GetAdminAccessOverviewHandler,
    GetAdminMemberDetailHandler,
    GetAdminUsersOverviewHandler,
    GetAdminUserDetailHandler,
    GetAdminInboxOverviewHandler
  ]
})
export class ConsoleModule {}
