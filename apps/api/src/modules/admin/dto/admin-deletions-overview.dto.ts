import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  AdminDeletionQueueAgeBucketDto,
  AdminDeletionQueueMetricDto
} from './admin-deletion-queue-summary.dto';
import { AdminPaginationDto } from './admin-pagination.dto';

export const ADMIN_DELETION_ENTITY_TYPE_VALUES = ['user', 'organization'] as const;
export const ADMIN_DELETION_PROVIDER_STATE_VALUES = [
  'pending',
  'not_applicable',
  'unknown'
] as const;

export class AdminDeletionOverviewSummaryDto {
  @ApiProperty({ example: 6 })
  declare totalPending: number;

  @ApiProperty({ example: 4 })
  declare pendingUsers: number;

  @ApiProperty({ example: 2 })
  declare pendingOrganizations: number;

  @ApiProperty({ example: 2 })
  declare dueWithin7Days: number;

  @ApiProperty({ example: 1 })
  declare overdueCount: number;

  @ApiProperty({ example: 90 })
  declare retentionDays: number;
}

export class AdminDeletionQueueItemDto {
  @ApiProperty({ enum: ADMIN_DELETION_ENTITY_TYPE_VALUES, example: 'user' })
  declare entityType: 'user' | 'organization';

  @ApiProperty({ example: 77 })
  declare entityId: number;

  @ApiPropertyOptional({ example: 10 })
  declare organizationId?: number;

  @ApiProperty({ example: 'Ariana Moore' })
  declare displayLabel: string;

  @ApiPropertyOptional({ example: 'Acme Operations' })
  declare secondaryLabel?: string;

  @ApiProperty({ example: '2026-03-01T08:00:00.000Z' })
  declare deletedAt: string;

  @ApiProperty({ example: '2026-05-30T08:00:00.000Z' })
  declare purgeDueAt: string;

  @ApiProperty({ example: false })
  declare isOverdue: boolean;

  @ApiProperty({ example: 75 })
  declare daysUntilPurge: number;

  @ApiProperty({ enum: ADMIN_DELETION_PROVIDER_STATE_VALUES, example: 'pending' })
  declare providerCleanupState: 'pending' | 'not_applicable' | 'unknown';

  @ApiPropertyOptional({ example: 'Provider user will be deleted during purge' })
  declare providerContext?: string;

  @ApiPropertyOptional({ example: '/users/77' })
  declare detailHref?: string;
}

export class AdminDeletionsOverviewDto {
  @ApiProperty({ example: '2026-03-16T02:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ example: 90 })
  declare retentionDays: number;

  @ApiProperty({ example: '0 2 * * *' })
  declare purgeCron: string;

  @ApiProperty({ example: 100 })
  declare purgeBatchSize: number;

  @ApiProperty({ example: false })
  declare dryRun: boolean;

  @ApiProperty({ type: AdminDeletionQueueMetricDto, isArray: true })
  declare metrics: AdminDeletionQueueMetricDto[];

  @ApiProperty({ type: AdminDeletionOverviewSummaryDto })
  declare summary: AdminDeletionOverviewSummaryDto;

  @ApiProperty({ type: AdminDeletionQueueAgeBucketDto, isArray: true })
  declare ageBuckets: AdminDeletionQueueAgeBucketDto[];

  @ApiProperty({ type: AdminDeletionQueueItemDto, isArray: true })
  declare items: AdminDeletionQueueItemDto[];

  @ApiProperty({ type: AdminPaginationDto })
  declare pagination: AdminPaginationDto;
}
