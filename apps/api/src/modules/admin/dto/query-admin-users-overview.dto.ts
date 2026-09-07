import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { ADMIN_ACCESS_SYSTEM_ROLE_VALUES } from './admin-access-overview.dto';
import {
  ADMIN_USERS_IDENTITY_FILTER_VALUES,
  ADMIN_USERS_PRIVILEGE_FILTER_VALUES,
  ADMIN_USERS_SORT_BY_VALUES
} from './admin-users-overview.dto';
import {
  ADMIN_RECORD_STATE_VALUES,
  ADMIN_SORT_ORDER_VALUES
} from './query-admin-tenants-overview.dto';

export class QueryAdminUsersOverviewDto {
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

  @ApiPropertyOptional({ example: 'ariana' })
  @IsOptional()
  @IsString()
  declare search?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  declare userTenantId?: number;

  @ApiPropertyOptional({ enum: ADMIN_RECORD_STATE_VALUES, default: 'active' })
  @IsOptional()
  @IsEnum(ADMIN_RECORD_STATE_VALUES)
  declare recordState?: (typeof ADMIN_RECORD_STATE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_USERS_IDENTITY_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_USERS_IDENTITY_FILTER_VALUES)
  declare identityState?: (typeof ADMIN_USERS_IDENTITY_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_USERS_PRIVILEGE_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_USERS_PRIVILEGE_FILTER_VALUES)
  declare privilege?: (typeof ADMIN_USERS_PRIVILEGE_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_ACCESS_SYSTEM_ROLE_VALUES })
  @IsOptional()
  @IsEnum(ADMIN_ACCESS_SYSTEM_ROLE_VALUES)
  declare systemRole?: (typeof ADMIN_ACCESS_SYSTEM_ROLE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_USERS_SORT_BY_VALUES, default: 'displayName' })
  @IsOptional()
  @IsEnum(ADMIN_USERS_SORT_BY_VALUES)
  declare sortBy?: (typeof ADMIN_USERS_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_ORDER_VALUES, default: 'asc' })
  @IsOptional()
  @IsEnum(ADMIN_SORT_ORDER_VALUES)
  declare sortOrder?: (typeof ADMIN_SORT_ORDER_VALUES)[number];
}
