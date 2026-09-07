import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PermissionService, CachedPermissionService } from '@package/auth';
import { RedisModule, CacheService } from '@package/redis';

import { SpacesController } from './controllers/projects.controller';
import {
  AddProjectMemberHandler,
  CreateProjectHandler,
  DeleteProjectHandler,
  RemoveProjectMemberHandler,
  UpdateProjectHandler
} from './handlers/commands';
import { ProjectMemberRepository, ProjectRepository } from './repositories';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsService } from './services/projects.service';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Projects module
 *
 * Handles project management operations within a tenant,
 * including CRUD operations and project-specific settings.
 *
 * Note: EnhancedPermissionsGuard is imported from AuthModule.
 * Reflector is provided globally in AppModule and is accessible to all modules.
 * CachedPermissionService is provided locally for the guard to use.
 */
@Module({
  imports: [
    CqrsModule,
    DatabaseModule,
    AuthModule,
    RedisModule // Import RedisModule to get CacheService provider
  ],
  controllers: [SpacesController],
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
    ProjectRepository,
    ProjectMemberRepository,
    ProjectsService,
    AddProjectMemberHandler,
    CreateProjectHandler,
    UpdateProjectHandler,
    DeleteProjectHandler,
    RemoveProjectMemberHandler
  ],
  exports: [ProjectsService, ProjectRepository, ProjectMemberRepository]
})
export class SpacesModule {}
