import { ApiPropertyOptional } from '@nestjs/swagger';
import { EMAIL_MESSAGE_STATUS_ENUM } from '@package/db-core';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { ADMIN_SORT_ORDER_VALUES } from './query-admin-tenants-overview.dto';

export const ADMIN_EMAIL_STATUS_FILTER_VALUES = ['all', ...EMAIL_MESSAGE_STATUS_ENUM] as const;
export const ADMIN_EMAIL_WEBHOOK_ATTENTION_FILTER_VALUES = [
  'all',
  'clear',
  'attention'
] as const;
export const ADMIN_EMAIL_SORT_BY_VALUES = [
  'createdAt',
  'updatedAt',
  'acceptedAt',
  'deliveredAt',
  'failedAt',
  'lastWebhookAt'
] as const;

export class QueryAdminEmailsOverviewDto {
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

  @ApiPropertyOptional({ example: 'invoice' })
  @IsOptional()
  @IsString()
  declare search?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  declare organizationId?: number;

  @ApiPropertyOptional({ enum: ADMIN_EMAIL_STATUS_FILTER_VALUES, default: 'all' })
  @IsOptional()
  @IsEnum(ADMIN_EMAIL_STATUS_FILTER_VALUES)
  declare messageStatus?: (typeof ADMIN_EMAIL_STATUS_FILTER_VALUES)[number];

  @ApiPropertyOptional({ example: 'resend' })
  @IsOptional()
  @IsString()
  declare provider?: string;

  @ApiPropertyOptional({ example: 'delivered' })
  @IsOptional()
  @IsString()
  declare providerStatus?: string;

  @ApiPropertyOptional({ example: 'delivered' })
  @IsOptional()
  @IsString()
  declare normalizedProviderStatus?: string;

  @ApiPropertyOptional({ example: 'invoice' })
  @IsOptional()
  @IsString()
  declare referenceType?: string;

  @ApiPropertyOptional({ example: 'invoice-123' })
  @IsOptional()
  @IsString()
  declare referenceId?: string;

  @ApiPropertyOptional({
    enum: ADMIN_EMAIL_WEBHOOK_ATTENTION_FILTER_VALUES,
    default: 'all'
  })
  @IsOptional()
  @IsEnum(ADMIN_EMAIL_WEBHOOK_ATTENTION_FILTER_VALUES)
  declare webhookAttentionState?: (typeof ADMIN_EMAIL_WEBHOOK_ATTENTION_FILTER_VALUES)[number];

  @ApiPropertyOptional({ example: '2026-03-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  declare dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-03-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  declare dateTo?: string;

  @ApiPropertyOptional({ enum: ADMIN_EMAIL_SORT_BY_VALUES, default: 'createdAt' })
  @IsOptional()
  @IsEnum(ADMIN_EMAIL_SORT_BY_VALUES)
  declare sortBy?: (typeof ADMIN_EMAIL_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: ADMIN_SORT_ORDER_VALUES, default: 'desc' })
  @IsOptional()
  @IsEnum(ADMIN_SORT_ORDER_VALUES)
  declare sortOrder?: (typeof ADMIN_SORT_ORDER_VALUES)[number];
}
