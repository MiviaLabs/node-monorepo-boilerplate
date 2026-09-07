import { ApiProperty } from '@nestjs/swagger';

import { AdminPaginationDto } from './admin-pagination.dto';

export const ADMIN_TENANT_STATUS_VALUES = [
  'draft',
  'trial',
  'active',
  'suspended',
  'deleted'
] as const;

export const ADMIN_TENANT_TYPE_VALUES = ['organization', 'team', 'individual'] as const;

export const ADMIN_TENANT_ONBOARDING_STATE_VALUES = [
  'setup',
  'provisioning',
  'invited',
  'ready',
  'attention',
  'archived'
] as const;

export class AdminTenantMetricDto {
  @ApiProperty({ example: 'tenants_total' })
  declare key: string;

  @ApiProperty({ example: 'Tenants' })
  declare label: string;

  @ApiProperty({ example: 42 })
  declare value: number;

  @ApiProperty({ example: '30 active', required: false })
  declare summary?: string;
}

export class AdminTenantDiagnosticsDto {
  @ApiProperty({ example: false })
  declare ssoEnabled: boolean;

  @ApiProperty({ example: true })
  declare apiAccessEnabled: boolean;

  @ApiProperty({ example: false })
  declare hasCustomDomain: boolean;

  @ApiProperty({ example: false })
  declare hasCustomEmail: boolean;

  @ApiProperty({ example: 50, required: false })
  declare maxUsers?: number;

  @ApiProperty({ example: 1000, required: false })
  declare apiRateLimit?: number;
}

export class AdminTenantInventoryItemDto {
  @ApiProperty({ example: 123 })
  declare organizationId: number;

  @ApiProperty({ example: 456 })
  declare tenantId: number;

  @ApiProperty({ example: '71bc9484-13df-4d91-b36f-f2c2b4e55e73' })
  declare publicId: string;

  @ApiProperty({ example: 'Acme Admin' })
  declare name: string;

  @ApiProperty({ example: 'Acme Admin', required: false })
  declare displayName?: string;

  @ApiProperty({ example: 'acme-admin' })
  declare slug: string;

  @ApiProperty({
    example: 'active',
    enum: ADMIN_TENANT_STATUS_VALUES
  })
  declare status: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

  @ApiProperty({
    example: 'organization',
    enum: ADMIN_TENANT_TYPE_VALUES
  })
  declare tenantType: 'organization' | 'team' | 'individual';

  @ApiProperty({ example: true })
  declare organizationActive: boolean;

  @ApiProperty({ example: false })
  declare isDeleted: boolean;

  @ApiProperty({ example: '2026-03-13T11:45:00.000Z', required: false })
  declare deletedAt?: string;

  @ApiProperty({ example: 987, required: false })
  declare ownerUserId?: number;

  @ApiProperty({ example: 'Ariana Moore', required: false })
  declare ownerDisplayName?: string;

  @ApiProperty({ example: true, required: false })
  declare ownerActive?: boolean;

  @ApiProperty({ example: true })
  declare hasOwner: boolean;

  @ApiProperty({ example: 12 })
  declare memberCount: number;

  @ApiProperty({ example: 2 })
  declare adminCount: number;

  @ApiProperty({ example: 1 })
  declare pendingInvitationCount: number;

  @ApiProperty({ example: 'mivialabs-xhltd', required: false })
  declare gcpTenantId?: string;

  @ApiProperty({ example: true })
  declare hasProvisionedAuthTenant: boolean;

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

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-13T11:30:00.000Z' })
  declare updatedAt: string;

  @ApiProperty({ type: AdminTenantDiagnosticsDto })
  declare diagnostics: AdminTenantDiagnosticsDto;
}

export class AdminTenantsOverviewDto {
  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminTenantMetricDto, isArray: true })
  declare metrics: AdminTenantMetricDto[];

  @ApiProperty({ type: AdminTenantInventoryItemDto, isArray: true })
  declare items: AdminTenantInventoryItemDto[];

  @ApiProperty({ type: AdminPaginationDto })
  declare pagination: AdminPaginationDto;
}
