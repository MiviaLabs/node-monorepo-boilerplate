import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { ADMIN_SORT_ORDER_VALUES } from './query-admin-tenants-overview.dto';

export const ADMIN_OUTBOX_STATUS_FILTER_VALUES = [
  'all',
  'pending',
  'processing',
  'published',
  'failed'
] as const;
export const ADMIN_OUTBOX_DEAD_LETTER_FILTER_VALUES = [
  'all',
  'dead_lettered',
  'active'
] as const;
export const ADMIN_OUTBOX_RETRY_FILTER_VALUES = [
  'all',
  'retryable',
  'awaiting_retry',
  'no_retry'
] as const;
export const ADMIN_OUTBOX_SORT_BY_VALUES = [
  'createdAt',
  'status',
  'eventType',
  'retryCount',
  'nextRetryAt',
  'publishedAt'
] as const;

export class QueryAdminOutboxOverviewDto {
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

  @ApiPropertyOptional({ example: 'user.registered' })
  @IsOptional()
  @IsString()
  declare search?: string;

  @ApiPropertyOptional({ enum: ADMIN_OUTBOX_STATUS_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_OUTBOX_STATUS_FILTER_VALUES)
  declare status?: (typeof ADMIN_OUTBOX_STATUS_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_OUTBOX_DEAD_LETTER_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_OUTBOX_DEAD_LETTER_FILTER_VALUES)
  declare deadLetterState?: (typeof ADMIN_OUTBOX_DEAD_LETTER_FILTER_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_OUTBOX_RETRY_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_OUTBOX_RETRY_FILTER_VALUES)
  declare retryState?: (typeof ADMIN_OUTBOX_RETRY_FILTER_VALUES)[number];

  @ApiPropertyOptional({ example: 'user.registered' })
  @IsOptional()
  @IsString()
  declare eventType?: string;

  @ApiPropertyOptional({ example: 'user-123' })
  @IsOptional()
  @IsString()
  declare aggregateId?: string;

  @ApiPropertyOptional({ example: 'tenant-xyz' })
  @IsOptional()
  @IsString()
  declare filterTenantId?: string;

  @ApiPropertyOptional({ enum: ADMIN_OUTBOX_SORT_BY_VALUES, default: 'createdAt' })
  @IsOptional()
  @IsEnum(ADMIN_OUTBOX_SORT_BY_VALUES)
  declare sortBy?: (typeof ADMIN_OUTBOX_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_ORDER_VALUES, default: 'desc' })
  @IsOptional()
  @IsEnum(ADMIN_SORT_ORDER_VALUES)
  declare sortOrder?: (typeof ADMIN_SORT_ORDER_VALUES)[number];
}
