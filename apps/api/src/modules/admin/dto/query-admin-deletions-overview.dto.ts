import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { ADMIN_SORT_ORDER_VALUES } from './query-admin-tenants-overview.dto';

export const ADMIN_DELETION_QUERY_ENTITY_TYPE_VALUES = [
  'all',
  'user',
  'organization'
] as const;
export const ADMIN_DELETION_PURGE_STATE_VALUES = [
  'all',
  'pending',
  'eligible',
  'overdue',
  'within_7_days'
] as const;
export const ADMIN_DELETION_PROVIDER_FILTER_VALUES = [
  'all',
  'pending',
  'not_applicable',
  'unknown'
] as const;
export const ADMIN_DELETION_SORT_BY_VALUES = [
  'deletedAt',
  'scheduledPurgeAt',
  'displayName',
  'entityType'
] as const;

export class QueryAdminDeletionsOverviewDto {
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

  @ApiPropertyOptional({ enum: ADMIN_DELETION_QUERY_ENTITY_TYPE_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_DELETION_QUERY_ENTITY_TYPE_VALUES)
  declare entityType?: (typeof ADMIN_DELETION_QUERY_ENTITY_TYPE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_DELETION_PURGE_STATE_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_DELETION_PURGE_STATE_VALUES)
  declare purgeState?: (typeof ADMIN_DELETION_PURGE_STATE_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_DELETION_PROVIDER_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_DELETION_PROVIDER_FILTER_VALUES)
  declare providerState?: (typeof ADMIN_DELETION_PROVIDER_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_DELETION_SORT_BY_VALUES, default: 'scheduledPurgeAt' })
  @IsOptional()
  @IsEnum(ADMIN_DELETION_SORT_BY_VALUES)
  declare sortBy?: (typeof ADMIN_DELETION_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_ORDER_VALUES, default: 'asc' })
  @IsOptional()
  @IsEnum(ADMIN_SORT_ORDER_VALUES)
  declare sortOrder?: (typeof ADMIN_SORT_ORDER_VALUES)[number];
}
