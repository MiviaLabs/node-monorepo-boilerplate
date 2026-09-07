import { ApiProperty } from '@nestjs/swagger';

export class AdminEmailMetricDto {
  @ApiProperty({ example: 'emails_total' })
  declare key: string;

  @ApiProperty({ example: 'Tracked emails' })
  declare label: string;

  @ApiProperty({ example: 42 })
  declare value: number;

  @ApiProperty({ example: '8 need webhook follow-up', required: false })
  declare summary?: string;
}

export class AdminEmailOverviewSummaryDto {
  @ApiProperty({ example: 42 })
  declare total: number;

  @ApiProperty({ example: 4 })
  declare pending: number;

  @ApiProperty({ example: 12 })
  declare accepted: number;

  @ApiProperty({ example: 20 })
  declare delivered: number;

  @ApiProperty({ example: 6 })
  declare failedOrBouncedOrComplained: number;

  @ApiProperty({ example: 8 })
  declare webhookAttention: number;
}

export class AdminEmailSummaryDto {
  @ApiProperty({ example: '2026-03-17T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminEmailMetricDto, isArray: true })
  declare metrics: AdminEmailMetricDto[];

  @ApiProperty({ type: AdminEmailOverviewSummaryDto })
  declare summary: AdminEmailOverviewSummaryDto;
}
