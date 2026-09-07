import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import {
  ADMIN_TENANT_ONBOARDING_STATE_VALUES,
  ADMIN_TENANT_STATUS_VALUES
} from './admin-tenants-overview.dto';

export const ADMIN_TENANTS_SORT_BY_VALUES = [
  'name',
  'createdAt',
  'updatedAt',
  'memberCount',
  'pendingInvitationCount',
  'status'
] as const;

export const ADMIN_SORT_ORDER_VALUES = ['asc', 'desc'] as const;
export const ADMIN_RECORD_STATE_VALUES = ['active', 'deleted', 'all'] as const;

export class QueryAdminTenantsOverviewDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  declare page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  declare pageSize?: number;

  @ApiPropertyOptional({ example: 'acme' })
  @IsOptional()
  @IsString()
  declare search?: string;

  @ApiPropertyOptional({ enum: ADMIN_RECORD_STATE_VALUES, default: 'active' })
  @IsOptional()
  @IsEnum(ADMIN_RECORD_STATE_VALUES)
  declare recordState?: (typeof ADMIN_RECORD_STATE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_TENANT_STATUS_VALUES })
  @IsOptional()
  @IsEnum(ADMIN_TENANT_STATUS_VALUES)
  declare status?: (typeof ADMIN_TENANT_STATUS_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_TENANT_ONBOARDING_STATE_VALUES })
  @IsOptional()
  @IsEnum(ADMIN_TENANT_ONBOARDING_STATE_VALUES)
  declare onboardingState?: (typeof ADMIN_TENANT_ONBOARDING_STATE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_TENANTS_SORT_BY_VALUES, default: 'name' })
  @IsOptional()
  @IsEnum(ADMIN_TENANTS_SORT_BY_VALUES)
  declare sortBy?: (typeof ADMIN_TENANTS_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_ORDER_VALUES, default: 'asc' })
  @IsOptional()
  @IsEnum(ADMIN_SORT_ORDER_VALUES)
  declare sortOrder?: (typeof ADMIN_SORT_ORDER_VALUES)[number];
}
