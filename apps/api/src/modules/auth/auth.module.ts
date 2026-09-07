import { Module, ForbiddenException, forwardRef, type DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import {
  AuthModule as InfrastructureAuthModule,
  customJwtAuthConfig,
  googleIdentityPlatformAuthConfig,
  PermissionService,
  RoleService,
  JwtStrategy,
  AUTH_PROVIDER_FACTORY,
  type AuthProviderFactory
} from '@package/auth';
import { QueuesModule } from '@package/queues';
import { CacheService, RedisModule } from '@package/redis';

import { EmailModule } from '../email/email.module';
import { EmailTrackingModule } from '../email-tracking/email-tracking.module';
import { SecureVaultModule } from '../encrypted-store/encrypted-store.module';
import { SecurityModule } from '../security/security.module';
import { GdprAccountController } from './controllers/account.controller';
import { IdentityProbeController } from './controllers/auth-test.controller';
import { IdentityController } from './controllers/auth.controller';
import { CredentialRecoveryController } from './controllers/password-reset.controller';
// Import only custom guards from local guards directory
import { CanDeleteUserGuard, JwtAuthGuard, JwtTenantGuard, HybridPolicyGuard } from './guards';
// Import local wrapper guards and re-exported services
import {
  CachedPermissionService,
  CachedRoleService,
  RolesGuard,
  PermissionsGuard,
  EnhancedPermissionsGuard
} from './guards/auth.guards';
import {
  RegisterHandler,
  LoginHandler,
  LoginWithOAuthHandler,
  LoginWithPhoneHandler,
  AcceptInvitationHandler,
  DeclineInvitationHandler,
  LinkIdentityHandler,
  UnlinkIdentityHandler,
  LogoutHandler,
  RevokeSessionHandler,
  RefreshTokenHandler,
  DeleteAccountHandler,
  ExportUserDataHandler,
  UpdateMyAvatarHandler,
  RemoveMyAvatarHandler,
  UpdateMyProfileHandler,
  ChangeMyPasswordHandler,
  UpdateCurrentUserSettingHandler
} from './handlers/commands';
import { InvitationRepository, UserTenantRepository } from '../tenants/repositories';
import { RequestPasswordResetHandler } from './handlers/commands/request-password-reset.handler';
import { ResetPasswordHandler } from './handlers/commands/reset-password.handler';
import { TransferOwnershipHandler } from './handlers/commands/transfer-ownership.handler';
import { UserRegisteredGcpProvisionConsumer } from './handlers/consumers/user-registered-gcp-provision.consumer';
import { PasswordResetCompletedHandler } from './handlers/events/password-reset-completed.handler';
import { PasswordResetRequestedHandler } from './handlers/events/password-reset-requested.handler';
import { PurgeSoftDeletedAccountsHandler } from './handlers/jobs/purge-soft-deleted-accounts.handler';
import {
  GetUserSessionHandler,
  GetUserRolesHandler,
  GetUserProfileHandler,
  GetAuthBootstrapHandler,
  GetMyOrganizationsHandler,
  ListUserIdentitiesHandler,
  ValidateTokenHandler,
  GetCurrentUserSettingsHandler
} from './handlers/queries';
import { ValidatePasswordResetTokenHandler } from './handlers/queries/validate-password-reset-token.handler';
import { InlineFieldRotationJob } from './jobs/inline-field-rotation.job';
import { PurgeSoftDeletedAccountsJob } from './jobs/purge-soft-deleted-accounts.job';
import { AuthRepository } from './repositories/auth.repository';
import { OrganizationRepository } from './repositories/organization.repository';
import { PasswordResetRepository } from './repositories/password-reset.repository';
import { RoleRepository } from './repositories/role.repository';
import { UserIdentityRepository } from './repositories/user-identity.repository';
import { UserOrganizationSettingsRepository } from './repositories/user-organization-settings.repository';
import { AuthSessionStoreService } from './services/auth-session-store.service';
import { AuthService } from './services/auth.service';
import { AvatarUrlResolverService } from './services/avatar-url-resolver.service';
import { InlineFieldKeyRotationService } from './services/inline-field-key-rotation.service';
import { TokenCleanupService } from './services/token-cleanup.service';
import { UserProfileViewService } from './services/user-profile-view.service';
import { DatabaseBackedJwtStrategy } from './strategies/database-backed-jwt.strategy';
import { FileRepository } from '../storage/repositories/file.repository';
import { DetachedFileCleanupService } from '../storage/services/detached-file-cleanup.service';
import { UserRepository } from '../users/repositories/user.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { EnvironmentGuard } from '@/common/guards/environment.guard';
import { configServiceFromFactoryArgs } from '@/common/utils/config-factory.util';

// Command handlers

// Query handlers

/**
 * Auth Module
 *
 * Provides authentication operations:
 * - User registration and login
 * - Multi-provider OAuth support (Google, Microsoft, Apple, LinkedIn, GitHub, Facebook)
 * - Phone number authentication
 * - Account linking/unlinking
 * - Token management (refresh, validate)
 * - Session management
 *
 * IMPORTANT: Infrastructure guards (RolesGuard, PermissionsGuard, EnhancedPermissionsGuard) from @package/auth
 * require Reflector. These are explicitly provided here, and since Reflector is provided globally in app.module.ts,
 * NestJS will automatically inject it into these guards.
 */
@Module({
  imports: [
    CqrsModule,
    PassportModule,
    RedisModule,
    QueuesModule.forRoot(),
    forwardRef(() => EmailModule),
    forwardRef(() => EmailTrackingModule),
    forwardRef(() => SecureVaultModule),
    SecurityModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret === 'secret-key' || secret.length < 32) {
          throw new ForbiddenException(
            'JWT_SECRET must be configured with a secure value (at least 32 characters)'
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '1h') as '1h'
          }
        };
      }
    }),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    InfrastructureAuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (...args: unknown[]) => {
        const config = configServiceFromFactoryArgs(args);
        const jwtSecret = config.get<string>('JWT_SECRET');
        const authProvider = config.get<string>('AUTH_PROVIDER', 'google-identity-platform');
        if (!jwtSecret || jwtSecret === 'secret-key' || jwtSecret.length < 32) {
          throw new ForbiddenException(
            'JWT_SECRET must be configured with a secure value (at least 32 characters)'
          );
        }
        const useCustomJwt = authProvider.toLowerCase() === 'custom-jwt';

        return {
          providers: [
            useCustomJwt
              ? customJwtAuthConfig({ default: true })
              : googleIdentityPlatformAuthConfig({ default: true })
          ]
          // NOTE: Don't pass jwt config here - we provide DatabaseBackedJwtStrategy below
          // jwt: {
          //   secretOrKey: jwtSecret,
          //   ignoreExpiration: false,
          // },
        };
      }
    }) as DynamicModule
  ] as DynamicModule[],
  controllers: [IdentityController, GdprAccountController, IdentityProbeController, CredentialRecoveryController],
  providers: [
    // Repositories
    AuthRepository,
    RoleRepository,
    UserIdentityRepository,
    UserRepository,
    OrganizationRepository,
    PasswordResetRepository,
    UserOrganizationSettingsRepository,
    InvitationRepository,
    UserTenantRepository,
    FileRepository,
    DetachedFileCleanupService,

    // Services
    AuthService,
    AvatarUrlResolverService,
    AuthSessionStoreService,
    InlineFieldKeyRotationService,
    TokenCleanupService,
    UserProfileViewService,
    AuditOutboxPublisher,
    RoleService,
    PermissionService,
    {
      provide: CachedPermissionService,
      useFactory: (permissionService: PermissionService, cache: CacheService) => {
        return new CachedPermissionService(permissionService, cache, {});
      },
      inject: [PermissionService, CacheService]
    },
    {
      provide: CachedRoleService,
      useFactory: (roleService: RoleService, cache: CacheService) => {
        return new CachedRoleService(roleService, cache, {});
      },
      inject: [RoleService, CacheService]
    },

    // Infrastructure guards - local implementations
    // These local guard classes replicate the functionality from @package/auth
    // and ensure proper DI resolution when used via @UseGuards() decorator.
    // Reflector is explicitly provided in this module to avoid cross-module/token issues.
    Reflector,
    RolesGuard,
    PermissionsGuard,
    EnhancedPermissionsGuard,
    HybridPolicyGuard,

    {
      provide: JwtStrategy,
      useFactory: (config: ConfigService, db: NodePgDatabase) => {
        const jwtSecret = config.get<string>('JWT_SECRET');
        if (!jwtSecret || jwtSecret === 'secret-key' || jwtSecret.length < 32) {
          throw new ForbiddenException(
            'JWT_SECRET must be configured with a secure value (at least 32 characters)'
          );
        }
        // Override default JwtStrategy with DatabaseBackedJwtStrategy
        // This fetches roles from database instead of JWT claims
        return new DatabaseBackedJwtStrategy(
          {
            secretOrKey: jwtSecret,
            ignoreExpiration: false
          },
          db
        );
      },
      inject: [ConfigService, MAIN_DB]
    },

    // Provide AUTH_PROVIDER token for E2E tests and services that need direct provider access
    {
      provide: 'AUTH_PROVIDER',
      useFactory: (factory: AuthProviderFactory) => {
        return factory.getDefaultProvider();
      },
      inject: [AUTH_PROVIDER_FACTORY]
    },

    // Guards
    CanDeleteUserGuard,
    JwtAuthGuard,
    JwtTenantGuard,
    EnvironmentGuard,

    // Command handlers
    RegisterHandler,
    LoginHandler,
    LoginWithOAuthHandler,
    LoginWithPhoneHandler,
    AcceptInvitationHandler,
    DeclineInvitationHandler,
    LinkIdentityHandler,
    UnlinkIdentityHandler,
    LogoutHandler,
    RevokeSessionHandler,
    RefreshTokenHandler,
    DeleteAccountHandler,
    ExportUserDataHandler,
    TransferOwnershipHandler,
    UpdateMyAvatarHandler,
    RemoveMyAvatarHandler,
    UpdateMyProfileHandler,
    ChangeMyPasswordHandler,
    UpdateCurrentUserSettingHandler,
    RequestPasswordResetHandler,
    ResetPasswordHandler,

    // Query handlers
    GetUserSessionHandler,
    GetUserRolesHandler,
    GetUserProfileHandler,
    GetAuthBootstrapHandler,
    GetMyOrganizationsHandler,
    ListUserIdentitiesHandler,
    GetCurrentUserSettingsHandler,
    ValidateTokenHandler,
    ValidatePasswordResetTokenHandler,

    // Event handlers
    PasswordResetCompletedHandler,
    PasswordResetRequestedHandler,

    // Event consumers
    UserRegisteredGcpProvisionConsumer,

    // Job handlers
    InlineFieldRotationJob,
    PurgeSoftDeletedAccountsHandler,
    PurgeSoftDeletedAccountsJob
  ],
  exports: [
    AuthService,
    AvatarUrlResolverService,
    AuthRepository,
    UserIdentityRepository,
    UserRepository,
    OrganizationRepository,
    PasswordResetRepository,
    JwtAuthGuard,
    // Export infrastructure guards for use in other modules
    RolesGuard,
    PermissionsGuard,
    EnhancedPermissionsGuard,
    HybridPolicyGuard,
    // Export permission/role services for use in other modules
    PermissionService,
    RoleService,
    // Export CachedPermissionService for use in other modules (e.g., PlatformModule)
    CachedPermissionService,
    // Export CachedRoleService for use in other modules
    CachedRoleService,
    // Export JwtModule so modules that import AuthModule can use JwtService
    // This is needed for OpsHealthModule which uses JwtAuthGuard
    PassportModule,
    JwtModule
  ]
})
export class AuthModule {}
