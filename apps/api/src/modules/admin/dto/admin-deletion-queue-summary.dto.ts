import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminDeletionQueueMetricDto {
  @ApiProperty({ example: 'soft_deleted_total' })
  declare key: string;

  @ApiProperty({ example: 'Waiting for deletion' })
  declare label: string;

  @ApiProperty({ example: 42 })
  declare value: number;

  @ApiPropertyOptional({ example: '7 eligible for purge now' })
  declare summary?: string;
}

export class AdminDeletionQueueAgeBucketDto {
  @ApiProperty({ example: '0_7_days' })
  declare key: string;

  @ApiProperty({ example: '0-7d' })
  declare label: string;

  @ApiProperty({ example: 5 })
  declare value: number;
}

export class AdminDeletionQueueHighlightsDto {
  @ApiPropertyOptional({ example: '2026-03-01T08:00:00.000Z' })
  declare oldestDeletedAt?: string;

  @ApiPropertyOptional({ example: '2026-03-18T02:00:00.000Z' })
  declare nextPurgeDueAt?: string;

  @ApiProperty({ example: 3 })
  declare providerTenantCleanupPendingTotal: number;

  @ApiProperty({ example: 8 })
  declare providerUserCleanupPendingTotal: number;
}

export class AdminDeletionQueueSummaryDto {
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

  @ApiProperty({ type: AdminDeletionQueueAgeBucketDto, isArray: true })
  declare ageBuckets: AdminDeletionQueueAgeBucketDto[];

  @ApiProperty({ type: AdminDeletionQueueHighlightsDto })
  declare highlights: AdminDeletionQueueHighlightsDto;
}
