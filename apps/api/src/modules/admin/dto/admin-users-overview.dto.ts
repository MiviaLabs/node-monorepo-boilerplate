import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ADMIN_ACCESS_SYSTEM_ROLE_VALUES,
  ADMIN_ACCESS_TENANT_STATUS_VALUES
} from './admin-access-overview.dto';
import { AdminPaginationDto } from './admin-pagination.dto';

export const ADMIN_USERS_IDENTITY_FILTER_VALUES = [
  'all',
  'with_identity',
  'without_identity'
] as const;

export const ADMIN_USERS_PRIVILEGE_FILTER_VALUES = ['all', 'privileged', 'standard'] as const;

export const ADMIN_USERS_SORT_BY_VALUES = [
  'displayName',
  'createdAt',
  'lastSignInAt',
  'membershipCount'
] as const;

export const ADMIN_USERS_LIFECYCLE_VALUES = ['active', 'deleted'] as const;

export class AdminUsersMetricDto {
  @ApiProperty({ example: 'users_total' })
  declare key: string;

  @ApiProperty({ example: 'Users' })
  declare label: string;

  @ApiProperty({ example: 42 })
  declare value: number;

  @ApiPropertyOptional({ example: '38 active accounts' })
  declare summary?: string;
}

export class AdminUserInventoryItemDto {
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

  @ApiPropertyOptional({ example: 'Ariana Moore' })
  declare displayName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.png' })
  declare photoUrl?: string;

  @ApiPropertyOptional({ example: 'google.com' })
  declare primaryIdentityProvider?: string;

  @ApiProperty({ example: true })
  declare hasPrimaryIdentity: boolean;

  @ApiPropertyOptional({ example: 20 })
  declare defaultTenantId?: number;

  @ApiPropertyOptional({ example: 'active', enum: ADMIN_ACCESS_TENANT_STATUS_VALUES })
  declare defaultTenantStatus?: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

  @ApiProperty({
    example: 'active',
    enum: ADMIN_USERS_LIFECYCLE_VALUES
  })
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

  @ApiProperty({ example: 3 })
  declare membershipCount: number;

  @ApiProperty({ example: 2 })
  declare activeMembershipCount: number;

  @ApiProperty({ example: 1 })
  declare privilegedMembershipCount: number;

  @ApiProperty({ example: '2026-03-10T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare updatedAt: string;

  @ApiPropertyOptional({ example: '2026-03-14T09:00:00.000Z' })
  declare lastSignInAt?: string;
}

export class AdminUsersOverviewDto {
  @ApiProperty({ example: '2026-03-15T12:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminUsersMetricDto, isArray: true })
  declare metrics: AdminUsersMetricDto[];

  @ApiProperty({ type: AdminUserInventoryItemDto, isArray: true })
  declare users: AdminUserInventoryItemDto[];

  @ApiProperty({ type: AdminPaginationDto })
  declare pagination: AdminPaginationDto;
}
