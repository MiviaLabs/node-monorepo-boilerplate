import { ApiProperty } from '@nestjs/swagger';

import { AdminOutboxMetricDto } from './admin-outbox-summary.dto';
import { AdminPaginationDto } from './admin-pagination.dto';

export const ADMIN_OUTBOX_STATUS_VALUES = [
  'pending',
  'processing',
  'published',
  'failed'
] as const;

export class AdminOutboxOverviewSummaryDto {
  @ApiProperty({ example: 42 })
  declare total: number;

  @ApiProperty({ example: 8 })
  declare pending: number;

  @ApiProperty({ example: 3 })
  declare processing: number;

  @ApiProperty({ example: 21 })
  declare published: number;

  @ApiProperty({ example: 10 })
  declare failed: number;

  @ApiProperty({ example: 4 })
  declare retryable: number;

  @ApiProperty({ example: 2 })
  declare deadLettered: number;
}

export class AdminOutboxItemDto {
  @ApiProperty({ example: 'f96f2b5e-c554-4adb-ae1a-07c2ab1261cb' })
  declare eventId: string;

  @ApiProperty({ example: 'user.registered' })
  declare eventType: string;

  @ApiProperty({ example: 'user-123' })
  declare aggregateId: string;

  @ApiProperty({ example: 'tenant-xyz' })
  declare tenantId: string;

  @ApiProperty({ enum: ADMIN_OUTBOX_STATUS_VALUES, example: 'failed' })
  declare status: (typeof ADMIN_OUTBOX_STATUS_VALUES)[number];

  @ApiProperty({ example: 2 })
  declare retryCount: number;

  @ApiProperty({ example: true })
  declare isRetryable: boolean;

  @ApiProperty({ example: false })
  declare isDeadLettered: boolean;

  @ApiProperty({ example: 1420 })
  declare ageSeconds: number;

  @ApiProperty({ example: '2026-03-16T08:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '2026-03-16T08:12:00.000Z', required: false })
  declare publishedAt?: string;

  @ApiProperty({ example: '2026-03-16T08:07:00.000Z', required: false })
  declare lastRetryAt?: string;

  @ApiProperty({ example: '2026-03-16T08:17:00.000Z', required: false })
  declare nextRetryAt?: string;

  @ApiProperty({ example: '2026-03-16T08:22:00.000Z', required: false })
  declare deadLetteredAt?: string;

  @ApiProperty({ example: 'max_retries', required: false })
  declare deadLetterReason?: string;

  @ApiProperty({ example: 'Kafka publish timeout', required: false })
  declare errorSummary?: string;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['userId', 'registeredAt']
  })
  declare payloadKeys?: string[];

  @ApiProperty({ example: 128, required: false })
  declare payloadSizeBytes?: number;

  @ApiProperty({ example: '0a5b4d57-d85a-4284-8ec0-5ce4ea1e4044', required: false })
  declare correlationId?: string;

  @ApiProperty({ example: 'f96f2b5e-c554-4adb-ae1a-07c2ab1261cb', required: false })
  declare causationId?: string;
}

export class AdminOutboxOverviewDto {
  @ApiProperty({ example: '2026-03-16T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminOutboxMetricDto, isArray: true })
  declare metrics: AdminOutboxMetricDto[];

  @ApiProperty({ type: AdminOutboxOverviewSummaryDto })
  declare summary: AdminOutboxOverviewSummaryDto;

  @ApiProperty({ type: AdminOutboxItemDto, isArray: true })
  declare items: AdminOutboxItemDto[];

  @ApiProperty({ type: AdminPaginationDto })
  declare pagination: AdminPaginationDto;
}
