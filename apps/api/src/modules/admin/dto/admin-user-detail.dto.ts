import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES,
  ADMIN_ACCESS_SYSTEM_ROLE_VALUES,
  ADMIN_ACCESS_TENANT_ROLE_VALUES,
  ADMIN_ACCESS_TENANT_STATUS_VALUES,
  ADMIN_ACCESS_TENANT_TYPE_VALUES
} from './admin-access-overview.dto';
import { ADMIN_USERS_LIFECYCLE_VALUES } from './admin-users-overview.dto';

export class AdminUserIdentitySummaryDto {
  @ApiPropertyOptional({ example: 'google.com' })
  declare provider?: string;

  @ApiPropertyOptional({ example: 'Ariana Moore' })
  declare providerDisplayName?: string;

  @ApiProperty({ example: true })
  declare emailVerified: boolean;

  @ApiProperty({ example: false })
  declare phoneVerified: boolean;

  @ApiProperty({ example: true })
  declare hasPrimaryIdentity: boolean;

  @ApiProperty({ type: String, isArray: true, example: ['google.com', 'password'] })
  declare providersInUse: string[];

  @ApiProperty({ example: 2 })
  declare totalIdentities: number;
}

export class AdminUserMembershipSummaryDto {
  @ApiPropertyOptional({ example: 10 })
  declare organizationId?: number;

  @ApiPropertyOptional({ example: 'Acme Operations' })
  declare organizationName?: string;

  @ApiPropertyOptional({ example: 'Acme Ops' })
  declare organizationDisplayName?: string;

  @ApiPropertyOptional({ example: 'acme-ops' })
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

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare updatedAt: string;
}

export class AdminUserMembershipStatsDto {
  @ApiProperty({ example: 3 })
  declare totalMemberships: number;

  @ApiProperty({ example: 2 })
  declare activeMemberships: number;

  @ApiProperty({ example: 1 })
  declare suspendedMemberships: number;

  @ApiProperty({ example: 2 })
  declare privilegedMemberships: number;
}

export class AdminUserDetailDto {
  @ApiProperty({ example: '2026-03-15T12:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ example: 123 })
  declare userId: number;

  @ApiPropertyOptional({ example: 10 })
  declare organizationId?: number;

  @ApiPropertyOptional({ example: 'Acme Operations' })
  declare organizationName?: string;

  @ApiPropertyOptional({ example: 'Acme Ops' })
  declare organizationDisplayName?: string;

  @ApiPropertyOptional({ example: 'acme-ops' })
  declare organizationSlug?: string;

  @ApiPropertyOptional({ example: true })
  declare organizationActive?: boolean;

  @ApiPropertyOptional({ example: '2026-03-13T11:45:00.000Z' })
  declare organizationDeletedAt?: string;

  @ApiPropertyOptional({ example: 'Ariana Moore' })
  declare displayName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png' })
  declare photoUrl?: string;

  @ApiProperty({ example: 'active', enum: ADMIN_USERS_LIFECYCLE_VALUES })
  declare userLifecycle: 'active' | 'deleted';

  @ApiProperty({ example: true })
  declare userActive: boolean;

  @ApiProperty({ example: true })
  declare userVerified: boolean;

  @ApiPropertyOptional({ example: '2026-03-13T11:45:00.000Z' })
  declare userDeletedAt?: string;

  @ApiProperty({
    type: String,
    isArray: true,
    enum: ADMIN_ACCESS_SYSTEM_ROLE_VALUES
  })
  declare systemRoles: Array<'system_owner' | 'system_admin'>;

  @ApiProperty({ example: true })
  declare isPrivileged: boolean;

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare userCreatedAt: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare userUpdatedAt: string;

  @ApiPropertyOptional({ example: '2026-03-14T09:00:00.000Z' })
  declare lastSignInAt?: string;

  @ApiProperty({ type: AdminUserIdentitySummaryDto })
  declare identity: AdminUserIdentitySummaryDto;

  @ApiProperty({ type: AdminUserMembershipStatsDto })
  declare membershipStats: AdminUserMembershipStatsDto;

  @ApiProperty({ type: AdminUserMembershipSummaryDto, isArray: true })
  declare memberships: AdminUserMembershipSummaryDto[];
}
