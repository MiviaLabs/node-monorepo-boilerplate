import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  ADMIN_ACCESS_INVITATION_STATUS_VALUES,
  ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES,
  ADMIN_ACCESS_TENANT_ROLE_VALUES
} from './admin-access-overview.dto';
import {
  ADMIN_RECORD_STATE_VALUES,
  ADMIN_SORT_ORDER_VALUES
} from './query-admin-tenants-overview.dto';

export const ADMIN_ACCESS_PRIVILEGE_FILTER_VALUES = ['all', 'privileged', 'standard'] as const;

export const ADMIN_ACCESS_MEMBERS_SORT_BY_VALUES = [
  'displayName',
  'createdAt',
  'membershipRole',
  'status'
] as const;

export const ADMIN_ACCESS_INVITATIONS_SORT_BY_VALUES = [
  'createdAt',
  'organizationName',
  'role',
  'status'
] as const;

export class QueryAdminAccessOverviewDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  declare memberPage?: number;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  declare memberPageSize?: number;

  @ApiPropertyOptional({ example: 'ariana' })
  @IsOptional()
  @IsString()
  declare memberSearch?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  declare memberOrganizationId?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  declare memberTenantId?: number;

  @ApiPropertyOptional({ enum: ADMIN_RECORD_STATE_VALUES, default: 'active' })
  @IsOptional()
  @IsEnum(ADMIN_RECORD_STATE_VALUES)
  declare memberRecordState?: (typeof ADMIN_RECORD_STATE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES)
  declare memberStatus?: (typeof ADMIN_ACCESS_MEMBERSHIP_STATUS_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_PRIVILEGE_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_PRIVILEGE_FILTER_VALUES)
  declare memberPrivilege?: (typeof ADMIN_ACCESS_PRIVILEGE_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_TENANT_ROLE_VALUES })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_TENANT_ROLE_VALUES)
  declare memberRole?: (typeof ADMIN_ACCESS_TENANT_ROLE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_MEMBERS_SORT_BY_VALUES, default: 'displayName' })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_MEMBERS_SORT_BY_VALUES)
  declare memberSortBy?: (typeof ADMIN_ACCESS_MEMBERS_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_ORDER_VALUES, default: 'asc' })
  @IsOptional()
  @IsEnum(ADMIN_SORT_ORDER_VALUES)
  declare memberSortOrder?: (typeof ADMIN_SORT_ORDER_VALUES)[number];

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  declare invitationPage?: number;

  @ApiPropertyOptional({ example: 10, default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  declare invitationPageSize?: number;

  @ApiPropertyOptional({ example: 'acme' })
  @IsOptional()
  @IsString()
  declare invitationSearch?: string;

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_INVITATION_STATUS_VALUES })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_INVITATION_STATUS_VALUES)
  declare invitationStatus?: (typeof ADMIN_ACCESS_INVITATION_STATUS_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_PRIVILEGE_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_PRIVILEGE_FILTER_VALUES)
  declare invitationPrivilege?: (typeof ADMIN_ACCESS_PRIVILEGE_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_TENANT_ROLE_VALUES })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_TENANT_ROLE_VALUES)
  declare invitationRole?: (typeof ADMIN_ACCESS_TENANT_ROLE_VALUES)[number];

  @ApiPropertyOptional({
    enum: ADMIN_ACCESS_INVITATIONS_SORT_BY_VALUES,
    default: 'createdAt'
  })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_INVITATIONS_SORT_BY_VALUES)
  declare invitationSortBy?: (typeof ADMIN_ACCESS_INVITATIONS_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_ORDER_VALUES, default: 'desc' })
  @IsOptional()
  @IsEnum(ADMIN_SORT_ORDER_VALUES)
  declare invitationSortOrder?: (typeof ADMIN_SORT_ORDER_VALUES)[number];
}
