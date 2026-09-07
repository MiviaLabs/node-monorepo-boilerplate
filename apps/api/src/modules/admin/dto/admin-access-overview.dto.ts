import { ApiProperty } from '@nestjs/swagger';

import { AdminPaginationDto } from './admin-pagination.dto';

export const ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES = [
  'active',
  'inactive',
  'suspended',
  'pending'
] as const;

export const ADMIN_ACCESS_INVITATION_STATUS_VALUES = [
  'pending',
  'accepted',
  'expired',
  'cancelled'
] as const;
export const ADMIN_ACCESS_RECORD_LIFECYCLE_VALUES = ['active', 'deleted'] as const;

export const ADMIN_ACCESS_TENANT_ROLE_VALUES = [
  'tenant_owner',
  'tenant_admin',
  'tenant_user',
  'tenant_viewer'
] as const;

export const ADMIN_ACCESS_SYSTEM_ROLE_VALUES = ['system_owner', 'system_admin'] as const;

export const ADMIN_ACCESS_TENANT_TYPE_VALUES = ['organization', 'team', 'individual'] as const;

export const ADMIN_ACCESS_TENANT_STATUS_VALUES = [
  'draft',
  'trial',
  'active',
  'suspended',
  'deleted'
] as const;

export class AdminAccessMetricDto {
  @ApiProperty({ example: 'members_total' })
  declare key: string;

  @ApiProperty({ example: 'Members' })
  declare label: string;

  @ApiProperty({ example: 42 })
  declare value: number;

  @ApiProperty({ example: '36 active', required: false })
  declare summary?: string;
}

export class AdminAccessMembershipDto {
  @ApiProperty({ example: 123 })
  declare userId: number;

  @ApiProperty({ example: 456, required: false })
  declare organizationId?: number;

  @ApiProperty({ example: 'Acme Operations', required: false })
  declare organizationName?: string;

  @ApiProperty({ example: 'Acme Operations', required: false })
  declare organizationDisplayName?: string;

  @ApiProperty({ example: 'acme-ops', required: false })
  declare organizationSlug?: string;

  @ApiProperty({ example: 789 })
  declare tenantId: number;

  @ApiProperty({ example: 'organization', enum: ADMIN_ACCESS_TENANT_TYPE_VALUES })
  declare tenantType: 'organization' | 'team' | 'individual';

  @ApiProperty({ example: 'active', enum: ADMIN_ACCESS_TENANT_STATUS_VALUES })
  declare tenantStatus: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

  @ApiProperty({ example: 'Ariana Moore', required: false })
  declare displayName?: string;

  @ApiProperty({ example: 'tenant_admin', enum: ADMIN_ACCESS_TENANT_ROLE_VALUES })
  declare membershipRole: 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer';

  @ApiProperty({ example: 'active', enum: ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES })
  declare status: 'active' | 'inactive' | 'suspended' | 'pending';

  @ApiProperty({ example: 'active', enum: ADMIN_ACCESS_RECORD_LIFECYCLE_VALUES })
  declare userLifecycle: 'active' | 'deleted';

  @ApiProperty({ example: true })
  declare userActive: boolean;

  @ApiProperty({ example: '2026-03-13T11:45:00.000Z', required: false })
  declare userDeletedAt?: string;

  @ApiProperty({ example: true, required: false })
  declare organizationActive?: boolean;

  @ApiProperty({ example: '2026-03-13T11:45:00.000Z', required: false })
  declare organizationDeletedAt?: string;

  @ApiProperty({ type: String, isArray: true, enum: ADMIN_ACCESS_SYSTEM_ROLE_VALUES })
  declare systemRoles: Array<'system_owner' | 'system_admin'>;

  @ApiProperty({ example: true })
  declare isPrivileged: boolean;

  @ApiProperty({ example: false })
  declare isDefault: boolean;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-13T11:00:00.000Z' })
  declare updatedAt: string;
}

export class AdminAccessInvitationDto {
  @ApiProperty({ example: 321 })
  declare invitationId: number;

  @ApiProperty({ example: 456 })
  declare organizationId: number;

  @ApiProperty({ example: 'Acme Operations' })
  declare organizationName: string;

  @ApiProperty({ example: 'Acme Operations', required: false })
  declare organizationDisplayName?: string;

  @ApiProperty({ example: 'acme-ops' })
  declare organizationSlug: string;

  @ApiProperty({ example: 789 })
  declare tenantId: number;

  @ApiProperty({ example: 'organization', enum: ADMIN_ACCESS_TENANT_TYPE_VALUES })
  declare tenantType: 'organization' | 'team' | 'individual';

  @ApiProperty({ example: 'tenant_admin', enum: ADMIN_ACCESS_TENANT_ROLE_VALUES })
  declare role: 'tenant_owner' | 'tenant_admin' | 'tenant_user' | 'tenant_viewer';

  @ApiProperty({ example: 'pending', enum: ADMIN_ACCESS_INVITATION_STATUS_VALUES })
  declare status: 'pending' | 'accepted' | 'expired' | 'cancelled';

  @ApiProperty({ example: 42, required: false })
  declare invitedByUserId?: number;

  @ApiProperty({ example: 'Bootstrap Owner', required: false })
  declare invitedByDisplayName?: string;

  @ApiProperty({ example: true })
  declare isPrivileged: boolean;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-20T10:00:00.000Z', required: false })
  declare expiresAt?: string;
}

export class AdminAccessOverviewDto {
  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminAccessMetricDto, isArray: true })
  declare metrics: AdminAccessMetricDto[];

  @ApiProperty({ type: AdminAccessMembershipDto, isArray: true })
  declare memberships: AdminAccessMembershipDto[];

  @ApiProperty({ type: AdminPaginationDto })
  declare membershipsPagination: AdminPaginationDto;

  @ApiProperty({ type: AdminAccessInvitationDto, isArray: true })
  declare invitations: AdminAccessInvitationDto[];

  @ApiProperty({ type: AdminPaginationDto })
  declare invitationsPagination: AdminPaginationDto;
}
