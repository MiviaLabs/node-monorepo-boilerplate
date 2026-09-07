import { ApiProperty } from '@nestjs/swagger';

import {
  ADMIN_TENANT_ONBOARDING_STATE_VALUES,
  ADMIN_TENANT_STATUS_VALUES,
  ADMIN_TENANT_TYPE_VALUES,
  AdminTenantDiagnosticsDto
} from './admin-tenants-overview.dto';

export class AdminTenantOwnerDto {
  @ApiProperty({ example: 42 })
  declare userId: number;

  @ApiProperty({ example: 'Ariana Moore', required: false })
  declare displayName?: string;

  @ApiProperty({ example: 'tenant_owner' })
  declare membershipRole: string;

  @ApiProperty({ example: true })
  declare isActive: boolean;

  @ApiProperty({ example: false })
  declare isDeleted: boolean;

  @ApiProperty({ example: true, required: false })
  declare isDefault?: boolean;

  @ApiProperty({ example: true })
  declare isDesignatedOwner: boolean;

  @ApiProperty({ example: 'google.com', required: false })
  declare primaryIdentityProvider?: string;

  @ApiProperty({ example: true, required: false })
  declare emailVerified?: boolean;

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-12T11:00:00.000Z' })
  declare updatedAt: string;
}

export class AdminTenantIdentityProviderCountDto {
  @ApiProperty({ example: 'email_password' })
  declare provider: string;

  @ApiProperty({ example: 8 })
  declare count: number;
}

export class AdminTenantInvitationStatusCountDto {
  @ApiProperty({ example: 'pending' })
  declare status: string;

  @ApiProperty({ example: 3 })
  declare count: number;
}

export class AdminTenantMembershipStatsDto {
  @ApiProperty({ example: 15 })
  declare totalMembers: number;

  @ApiProperty({ example: 13 })
  declare activeMembers: number;

  @ApiProperty({ example: 2 })
  declare inactiveMembers: number;

  @ApiProperty({ example: 1 })
  declare ownerCount: number;

  @ApiProperty({ example: 3 })
  declare adminCount: number;

  @ApiProperty({ example: 4 })
  declare elevatedAccessCount: number;
}

export class AdminTenantFeatureSettingsDto {
  @ApiProperty({ example: 100, required: false })
  declare maxUsers?: number;

  @ApiProperty({ example: 25, required: false })
  declare maxProjects?: number;

  @ApiProperty({ example: true, required: false })
  declare advancedAnalytics?: boolean;

  @ApiProperty({ example: true, required: false })
  declare apiAccess?: boolean;

  @ApiProperty({ example: true, required: false })
  declare customIntegrations?: boolean;

  @ApiProperty({ example: true, required: false })
  declare sso?: boolean;

  @ApiProperty({ example: 365, required: false })
  declare auditLogRetention?: number;
}

export class AdminTenantBrandingSettingsDto {
  @ApiProperty({ example: 'https://cdn.example.com/logo.svg', required: false })
  declare logo?: string;

  @ApiProperty({ example: '#0f172a', required: false })
  declare primaryColor?: string;

  @ApiProperty({ example: 'app.acme.test', required: false })
  declare customDomain?: string;

  @ApiProperty({ example: true, required: false })
  declare customEmail?: boolean;
}

export class AdminTenantLimitSettingsDto {
  @ApiProperty({ example: 500000, required: false })
  declare monthlyBudget?: number;

  @ApiProperty({ example: 10737418240, required: false })
  declare storageQuota?: number;

  @ApiProperty({ example: 1200, required: false })
  declare apiRateLimit?: number;
}

export class AdminTenantSettingsSnapshotDto {
  @ApiProperty({ type: AdminTenantFeatureSettingsDto, required: false })
  declare features?: AdminTenantFeatureSettingsDto;

  @ApiProperty({ type: AdminTenantBrandingSettingsDto, required: false })
  declare branding?: AdminTenantBrandingSettingsDto;

  @ApiProperty({ type: AdminTenantLimitSettingsDto, required: false })
  declare limits?: AdminTenantLimitSettingsDto;

  @ApiProperty({
    type: Object,
    required: false,
    example: { contractTier: 'enterprise', accountManager: 'Jane Doe' }
  })
  declare metadata?: Record<string, unknown>;
}

export class AdminTenantAuthPostureDto {
  @ApiProperty({ example: 'Google Identity Platform', required: false })
  declare authProvider?: string;

  @ApiProperty({ example: true })
  declare hasProvisionedAuthTenant: boolean;

  @ApiProperty({ example: 'gcp-acme', required: false })
  declare gcpTenantId?: string;

  @ApiProperty({ example: true })
  declare ssoEnabled: boolean;

  @ApiProperty({ example: true })
  declare apiAccessEnabled: boolean;

  @ApiProperty({ type: AdminTenantIdentityProviderCountDto, isArray: true })
  declare providersInUse: AdminTenantIdentityProviderCountDto[];
}

export class AdminTenantDetailDto {
  @ApiProperty({ example: '2026-03-15T12:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ example: 10 })
  declare organizationId: number;

  @ApiProperty({ example: 20 })
  declare tenantId: number;

  @ApiProperty({ example: '71bc9484-13df-4d91-b36f-f2c2b4e55e73' })
  declare publicId: string;

  @ApiProperty({ example: '9d0a6298-5f30-44d4-8ec2-8123f38cb534' })
  declare tenantPublicId: string;

  @ApiProperty({ example: 'Acme Platform' })
  declare name: string;

  @ApiProperty({ example: 'Acme Platform', required: false })
  declare displayName?: string;

  @ApiProperty({ example: 'acme-platform' })
  declare slug: string;

  @ApiProperty({ example: 'organization', enum: ADMIN_TENANT_TYPE_VALUES })
  declare tenantType: 'organization' | 'team' | 'individual';

  @ApiProperty({ example: 'active', enum: ADMIN_TENANT_STATUS_VALUES })
  declare status: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

  @ApiProperty({
    example: 'ready',
    enum: ADMIN_TENANT_ONBOARDING_STATE_VALUES
  })
  declare onboardingState:
    | 'setup'
    | 'provisioning'
    | 'invited'
    | 'ready'
    | 'attention'
    | 'archived';

  @ApiProperty({ example: true })
  declare organizationActive: boolean;

  @ApiProperty({ example: false })
  declare isDeleted: boolean;

  @ApiProperty({ example: '2026-03-13T11:45:00.000Z', required: false })
  declare deletedAt?: string;

  @ApiProperty({ example: 42, required: false })
  declare ownerUserId?: number;

  @ApiProperty({ example: 'Ariana Moore', required: false })
  declare ownerDisplayName?: string;

  @ApiProperty({ example: true })
  declare hasOwner: boolean;

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-12T11:00:00.000Z' })
  declare updatedAt: string;

  @ApiProperty({ type: AdminTenantDiagnosticsDto })
  declare diagnostics: AdminTenantDiagnosticsDto;

  @ApiProperty({ type: AdminTenantMembershipStatsDto })
  declare membership: AdminTenantMembershipStatsDto;

  @ApiProperty({ type: AdminTenantInvitationStatusCountDto, isArray: true })
  declare invitationStatusCounts: AdminTenantInvitationStatusCountDto[];

  @ApiProperty({ type: AdminTenantOwnerDto, isArray: true })
  declare owners: AdminTenantOwnerDto[];

  @ApiProperty({ type: AdminTenantAuthPostureDto })
  declare auth: AdminTenantAuthPostureDto;

  @ApiProperty({ type: AdminTenantSettingsSnapshotDto })
  declare settings: AdminTenantSettingsSnapshotDto;
}
