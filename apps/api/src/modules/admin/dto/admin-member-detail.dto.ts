import { ApiProperty } from '@nestjs/swagger';

import {
  ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES,
  ADMIN_ACCESS_SYSTEM_ROLE_VALUES,
  ADMIN_ACCESS_TENANT_ROLE_VALUES,
  ADMIN_ACCESS_TENANT_STATUS_VALUES,
  ADMIN_ACCESS_TENANT_TYPE_VALUES
} from './admin-access-overview.dto';

export class AdminMemberIdentityDto {
  @ApiProperty({ example: 'google.com', required: false })
  declare provider?: string;

  @ApiProperty({ example: 'Ariana Moore', required: false })
  declare providerDisplayName?: string;

  @ApiProperty({ example: true })
  declare emailVerified: boolean;

  @ApiProperty({ example: false })
  declare phoneVerified: boolean;

  @ApiProperty({ example: true })
  declare hasPrimaryIdentity: boolean;
}

export class AdminMemberMembershipSummaryDto {
  @ApiProperty({ example: 10, required: false })
  declare organizationId?: number;

  @ApiProperty({ example: 'Acme Operations', required: false })
  declare organizationName?: string;

  @ApiProperty({ example: 'Acme Operations', required: false })
  declare organizationDisplayName?: string;

  @ApiProperty({ example: 'acme-ops', required: false })
  declare organizationSlug?: string;

  @ApiProperty({ example: 20 })
  declare tenantId: number;

  @ApiProperty({ example: 'organization', enum: ADMIN_ACCESS_TENANT_TYPE_VALUES })
  declare tenantType: 'organization' | 'team' | 'individual';

  @ApiProperty({ example: 'active', enum: ADMIN_ACCESS_TENANT_STATUS_VALUES })
  declare tenantStatus: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

  @ApiProperty({ example: 'tenant_admin', enum: ADMIN_ACCESS_TENANT_ROLE_VALUES })
  declare membershipRole: 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer';

  @ApiProperty({ example: 'active', enum: ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES })
  declare status: 'active' | 'inactive' | 'suspended' | 'pending';

  @ApiProperty({ example: true })
  declare isPrivileged: boolean;

  @ApiProperty({ example: false })
  declare isDefault: boolean;

  @ApiProperty({ example: false })
  declare isCurrent: boolean;

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare updatedAt: string;
}

export class AdminMemberMembershipStatsDto {
  @ApiProperty({ example: 2 })
  declare totalMemberships: number;

  @ApiProperty({ example: 1 })
  declare activeMemberships: number;

  @ApiProperty({ example: 1 })
  declare suspendedMemberships: number;

  @ApiProperty({ example: 2 })
  declare privilegedMemberships: number;
}

export class AdminMemberDetailDto {
  @ApiProperty({ example: '2026-03-15T12:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ example: 123 })
  declare userId: number;

  @ApiProperty({ example: 10, required: false })
  declare organizationId?: number;

  @ApiProperty({ example: 'Acme Operations', required: false })
  declare organizationName?: string;

  @ApiProperty({ example: 'Acme Operations', required: false })
  declare organizationDisplayName?: string;

  @ApiProperty({ example: 'acme-ops', required: false })
  declare organizationSlug?: string;

  @ApiProperty({ example: true, required: false })
  declare organizationActive?: boolean;

  @ApiProperty({ example: '2026-03-13T11:45:00.000Z', required: false })
  declare organizationDeletedAt?: string;

  @ApiProperty({ example: 20 })
  declare tenantId: number;

  @ApiProperty({ example: 'organization', enum: ADMIN_ACCESS_TENANT_TYPE_VALUES })
  declare tenantType: 'organization' | 'team' | 'individual';

  @ApiProperty({ example: 'active', enum: ADMIN_ACCESS_TENANT_STATUS_VALUES })
  declare tenantStatus: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

  @ApiProperty({ example: 'Ariana Moore', required: false })
  declare displayName?: string;

  @ApiProperty({ example: 'https://cdn.example.com/avatar.png', required: false })
  declare photoUrl?: string;

  @ApiProperty({ example: 'tenant_admin', enum: ADMIN_ACCESS_TENANT_ROLE_VALUES })
  declare membershipRole: 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer';

  @ApiProperty({ example: 'active', enum: ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES })
  declare status: 'active' | 'inactive' | 'suspended' | 'pending';

  @ApiProperty({ example: 'active', enum: ['active', 'deleted'] })
  declare userLifecycle: 'active' | 'deleted';

  @ApiProperty({ example: true })
  declare userActive: boolean;

  @ApiProperty({ example: true })
  declare userVerified: boolean;

  @ApiProperty({ example: '2026-03-13T11:45:00.000Z', required: false })
  declare userDeletedAt?: string;

  @ApiProperty({ type: String, isArray: true, enum: ADMIN_ACCESS_SYSTEM_ROLE_VALUES })
  declare systemRoles: Array<'system_owner' | 'system_admin'>;

  @ApiProperty({ example: true })
  declare isPrivileged: boolean;

  @ApiProperty({ example: false })
  declare isDefault: boolean;

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare userCreatedAt: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare userUpdatedAt: string;

  @ApiProperty({ example: '2026-03-14T09:00:00.000Z', required: false })
  declare lastSignInAt?: string;

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare membershipCreatedAt: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare membershipUpdatedAt: string;

  @ApiProperty({ type: AdminMemberIdentityDto })
  declare identity: AdminMemberIdentityDto;

  @ApiProperty({ type: AdminMemberMembershipStatsDto })
  declare membershipStats: AdminMemberMembershipStatsDto;

  @ApiProperty({ type: AdminMemberMembershipSummaryDto, isArray: true })
  declare otherMemberships: AdminMemberMembershipSummaryDto[];
}
