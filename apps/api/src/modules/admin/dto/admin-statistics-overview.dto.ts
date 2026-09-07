import { ApiProperty } from '@nestjs/swagger';

import { AdminOutboxSummaryHighlightsDto } from './admin-outbox-summary.dto';

export class AdminStatisticsDeletionSummaryDto {
  @ApiProperty({ example: 12 })
  declare totalPending: number;

  @ApiProperty({ example: 8 })
  declare pendingUsers: number;

  @ApiProperty({ example: 4 })
  declare pendingOrganizations: number;

  @ApiProperty({ example: 3 })
  declare dueWithin7Days: number;

  @ApiProperty({ example: 1 })
  declare overdueCount: number;

  @ApiProperty({ example: 90 })
  declare retentionDays: number;
}

export class AdminStatisticsOutboxSummaryDto {
  @ApiProperty({ example: 8 })
  declare pending: number;

  @ApiProperty({ example: 3 })
  declare processing: number;

  @ApiProperty({ example: 21 })
  declare published: number;

  @ApiProperty({ example: 5 })
  declare failed: number;

  @ApiProperty({ example: 4 })
  declare retryable: number;

  @ApiProperty({ example: 2 })
  declare deadLettered: number;

  @ApiProperty({ type: AdminOutboxSummaryHighlightsDto })
  declare highlights: AdminOutboxSummaryHighlightsDto;
}

export class AdminStatisticMetricDto {
  @ApiProperty({ example: 'tenant_count' })
  declare key: string;

  @ApiProperty({ example: 'Tenants' })
  declare label: string;

  @ApiProperty({ example: 42 })
  declare value: number;

  @ApiProperty({ example: 'count', required: false })
  declare unit?: string;

  @ApiProperty({ example: 'Real persisted metric from the current data sources.', required: false })
  declare summary?: string;
}

export class AdminStatisticSeriesPointDto {
  @ApiProperty({ example: 'Mar 13' })
  declare label: string;

  @ApiProperty({ example: 12 })
  declare published: number;

  @ApiProperty({ example: 4 })
  declare retries: number;

  @ApiProperty({ example: 1 })
  declare deadLetters: number;
}

export class AdminStatisticBreakdownItemDto {
  @ApiProperty({ example: 'active_users' })
  declare key: string;

  @ApiProperty({ example: 'Active users' })
  declare label: string;

  @ApiProperty({ example: 142 })
  declare value: number;
}

export class AdminStatisticStatusRollupDto {
  @ApiProperty({ example: 'Healthy' })
  declare status: string;

  @ApiProperty({ example: 3 })
  declare value: number;

  @ApiProperty({ example: 'hsl(var(--chart-2))' })
  declare fill: string;
}

export class AdminStatisticSummaryRowDto {
  @ApiProperty({ example: 'Invitations' })
  declare group: string;

  @ApiProperty({ example: 12 })
  declare total: number;

  @ApiProperty({ example: '4 pending and 8 accepted invitations' })
  declare detail: string;

  @ApiProperty({ example: 'Main DB invitations table' })
  declare source: string;
}

export class AdminStatisticsOverviewDto {
  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminStatisticMetricDto, isArray: true })
  declare metrics: AdminStatisticMetricDto[];

  @ApiProperty({ type: AdminStatisticSeriesPointDto, isArray: true })
  declare eventDeliverySeries: AdminStatisticSeriesPointDto[];

  @ApiProperty({ type: AdminStatisticBreakdownItemDto, isArray: true })
  declare volumeBreakdown: AdminStatisticBreakdownItemDto[];

  @ApiProperty({ type: AdminStatisticStatusRollupDto, isArray: true })
  declare deliveryStateRollup: AdminStatisticStatusRollupDto[];

  @ApiProperty({ type: AdminStatisticSummaryRowDto, isArray: true })
  declare summaryRows: AdminStatisticSummaryRowDto[];

  @ApiProperty({ type: AdminStatisticsDeletionSummaryDto })
  declare deletionSummary: AdminStatisticsDeletionSummaryDto;

  @ApiProperty({ type: AdminStatisticsOutboxSummaryDto })
  declare outboxSummary: AdminStatisticsOutboxSummaryDto;
}
