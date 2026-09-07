import { ApiProperty } from '@nestjs/swagger';

export class AdminOutboxMetricDto {
  @ApiProperty({ example: 'outbox_pending' })
  declare key: string;

  @ApiProperty({ example: 'Pending' })
  declare label: string;

  @ApiProperty({ example: 18 })
  declare value: number;

  @ApiProperty({ example: 'Queued for delivery', required: false })
  declare summary?: string;
}

export class AdminOutboxStatusRollupDto {
  @ApiProperty({ example: 'Pending' })
  declare status: string;

  @ApiProperty({ example: 18 })
  declare value: number;

  @ApiProperty({ example: 'hsl(var(--chart-2))' })
  declare fill: string;
}

export class AdminOutboxSummaryHighlightsDto {
  @ApiProperty({ example: 245 })
  declare oldestPendingAgeMinutes: number;

  @ApiProperty({ example: '2026-03-15T18:10:00.000Z', required: false })
  declare nextRetryAt?: string;

  @ApiProperty({ example: 7 })
  declare retryableNow: number;
}

export class AdminOutboxSummaryDto {
  @ApiProperty({ example: '2026-03-16T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminOutboxMetricDto, isArray: true })
  declare metrics: AdminOutboxMetricDto[];

  @ApiProperty({ type: AdminOutboxStatusRollupDto, isArray: true })
  declare deliveryStateRollup: AdminOutboxStatusRollupDto[];

  @ApiProperty({ type: AdminOutboxSummaryHighlightsDto })
  declare highlights: AdminOutboxSummaryHighlightsDto;
}
