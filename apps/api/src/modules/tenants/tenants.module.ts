import { Module, forwardRef } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';

import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { EmailTrackingModule } from '../email-tracking/email-tracking.module';
import { EncryptedStoreKeyService } from '../encrypted-store/encrypted-store-key.service';
import { PlatformModule } from '../system/system.module';
import {
  UpdateTenantSettingsHandler,
  InviteMemberHandler,
  GenerateInvitationLinkHandler,
  ResendInvitationHandler,
  RevokeInvitationHandler,
  RemoveMemberHandler,
  UpdateMemberRoleHandler,
  UpdateMemberStatusHandler
} from './handlers/commands';
import { ProvisionGcpTenantHandler } from './handlers/commands/provision-gcp-tenant.handler';
import { InvitationEmailConsumer } from './handlers/consumers';
import {
  TenantSettingsUpdatedHandler,
  MemberInvitedHandler,
  MemberRemovedHandler
} from './handlers/events';
import { GetCurrentTenantHandler, GetMembersHandler } from './handlers/queries';
import { GetGcpTenantHandler } from './handlers/queries/get-gcp-tenant.handler';
import { GcpTenantRepository } from './repositories/gcp-tenant.repository';
import { InvitationRepository } from './repositories/invitation.repository';
import { UserTenantRepository } from './repositories/user-tenant.repository';
import { TenantManagementService } from './services/tenant-management.service';
import { TenantService } from './services/tenant.service';
import { WorkspacesController } from './tenants.controller';

// Tenant-scoped CQRS handlers

/**
 * Tenants Module
 *
 * Manages GCP Identity Platform tenant operations:
 * - Provision GCP tenants for organizations
 * - Query GCP tenant information
 * - Link GCP tenants to organizations
 *
 * Also handles tenant-scoped operations for the current tenant:
 * - Tenant settings management
 * - Member management
 * - User invitations
 *
 * Uses transactional safety for multi-step operations.
 *
 * Note: EnhancedPermissionsGuard is imported from AuthModule and requires
 * Reflector to be provided in this module for proper dependency injection.
 */
@Module({
  imports: [
    CqrsModule,
    AuthModule,
    EmailModule,
    EmailTrackingModule,
    forwardRef(() => PlatformModule)
  ],
  controllers: [WorkspacesController],
  providers: [
    Reflector,
    // Repositories
    GcpTenantRepository,
    UserTenantRepository,
    InvitationRepository,

    // Services
    TenantManagementService,
    TenantService,
    EncryptedStoreKeyService,

    // GCP tenant command handlers
    ProvisionGcpTenantHandler,

    // GCP tenant query handlers
    GetGcpTenantHandler,

    // Tenant-scoped command handlers
    UpdateTenantSettingsHandler,
    InviteMemberHandler,
    GenerateInvitationLinkHandler,
    ResendInvitationHandler,
    RevokeInvitationHandler,
    RemoveMemberHandler,
    UpdateMemberRoleHandler,
    UpdateMemberStatusHandler,

    // Tenant-scoped query handlers
    GetCurrentTenantHandler,
    GetMembersHandler,

    // Tenant-scoped event handlers
    TenantSettingsUpdatedHandler,
    MemberInvitedHandler,
    MemberRemovedHandler,

    // Async consumers
    InvitationEmailConsumer
  ],
  exports: [
    GcpTenantRepository,
    UserTenantRepository,
    InvitationRepository,
    TenantManagementService,
    TenantService
  ]
})
export class WorkspacesModule {}
