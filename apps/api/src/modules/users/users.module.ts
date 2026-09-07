import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PermissionService, CachedPermissionService } from '@package/auth';
import { RedisModule, CacheService } from '@package/redis';

import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../config/config.module';
import { AuthModule } from '../auth/auth.module';
import { SecureVaultModule } from '../encrypted-store/encrypted-store.module';
import {
  UserAddressesAdminController,
  PersonAddressesController
} from './controllers/user-addresses.controller';
import { PeopleController } from './controllers/users.controller';
import {
  CreateUserHandler,
  UpdateUserHandler,
  DeleteUserHandler,
  CreateUserAddressHandler,
  UpdateUserAddressHandler,
  DeleteUserAddressHandler,
  RotateAddressKeyHandler,
  ResumeRotationHandler,
  CancelRotationHandler
} from './handlers/commands';
import { UserCreatedConsumer } from './handlers/consumers';
import {
  GetUserHandler,
  ListUsersHandler,
  GetUserAddressHandler,
  GetUserAddressesHandler,
  GetDefaultAddressHandler
} from './handlers/queries';
import { AddressKeyRotationJob } from './jobs/address-key-rotation.job';
import { ScheduledRotationCheckJob } from './jobs/scheduled-rotation-check.job';
import { CachedUserRepository, UserAddressRepository, UserRepository } from './repositories';
import { AddressKeyRotationService } from './services/address-key-rotation.service';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Users Module
 *
 * Manages user operations including CRUD, authentication,
 * and user profile management.
 *
 * Note: EnhancedPermissionsGuard is imported from AuthModule.
 * Reflector is provided globally in AppModule and is accessible to all modules.
 * CachedPermissionService is provided locally for the guard to use.
 *
 * ## Key Rotation
 * - AddressKeyRotationService handles encrypted-store entry re-encryption.
 * - RotateAddressKeyHandler / ResumeRotationHandler / CancelRotationHandler
 *   are the CQRS command handlers (used by PersonKeyRotationController).
 * - AddressKeyRotationJob processes async BullMQ jobs enqueued by the admin
 *   endpoint.
 * - ScheduledRotationCheckJob registers an hourly cron safety net.
 * - UserAddressesAdminController exposes POST /api/v1/users/addresses/rotate-key.
 *
 * QueuesModule is registered globally in AuthModule; its DiscoveryService
 * auto-discovers @JobHandler-decorated methods in all providers app-wide.
 */
@Module({
  imports: [
    CqrsModule,
    DatabaseModule,
    AppConfigModule,
    AuthModule,
    SecureVaultModule.forRoot(),
    RedisModule // Import RedisModule to get CacheService provider
  ],
  controllers: [PeopleController, PersonAddressesController, UserAddressesAdminController],
  providers: [
    // Provide CachedPermissionService locally for the guard
    {
      provide: CachedPermissionService,
      useFactory: (permissionService: PermissionService, cache: CacheService) => {
        return new CachedPermissionService(permissionService, cache, {});
      },
      inject: [PermissionService, CacheService]
    },
    // Repository
    UserRepository,
    CachedUserRepository,
    UserAddressRepository,
    // Handlers
    GetUserHandler,
    ListUsersHandler,
    GetUserAddressHandler,
    GetUserAddressesHandler,
    GetDefaultAddressHandler,
    AuditOutboxPublisher,
    // User command handlers
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,
    // User address command handlers
    CreateUserAddressHandler,
    UpdateUserAddressHandler,
    DeleteUserAddressHandler,
    // Key rotation command handlers (P0: security-critical; used by PersonKeyRotationController)
    RotateAddressKeyHandler,
    ResumeRotationHandler,
    CancelRotationHandler,
    // Key rotation service (internal; accessed only via command handlers or job processors)
    AddressKeyRotationService,
    // BullMQ job processors (auto-discovered by global QueuesModule via DiscoveryService)
    AddressKeyRotationJob,
    ScheduledRotationCheckJob,
    // Event consumers
    UserCreatedConsumer
  ],
  exports: [UserRepository, CachedUserRepository, UserAddressRepository]
})
export class PeopleModule {}
