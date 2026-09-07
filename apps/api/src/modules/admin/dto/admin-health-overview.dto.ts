import { ApiProperty } from '@nestjs/swagger';

export class AdminHealthServiceDto {
  @ApiProperty({ example: 'database' })
  declare key: string;

  @ApiProperty({ example: 'Database' })
  declare label: string;

  @ApiProperty({ example: 'ok', enum: ['ok', 'degraded', 'error', 'unknown'] })
  declare status: 'ok' | 'degraded' | 'error' | 'unknown';

  @ApiProperty({
    example: 'Primary database connection and dependency reachability.',
    required: false
  })
  declare summary?: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z', required: false })
  declare checkedAt?: string;
}

export class AdminHealthMetricDto {
  @ApiProperty({ example: 'tenants_total' })
  declare key: string;

  @ApiProperty({ example: 'Tenants' })
  declare label: string;

  @ApiProperty({ example: 12 })
  declare value: number;

  @ApiProperty({
    example: '10 active',
    required: false
  })
  declare summary?: string;
}

export class AdminHealthIncidentDto {
  @ApiProperty({ example: 'evt-dead-letter-1' })
  declare id: string;

  @ApiProperty({ example: 'event_failure' })
  declare kind: string;

  @ApiProperty({ example: 'high', enum: ['low', 'medium', 'high'] })
  declare priority: 'low' | 'medium' | 'high';

  @ApiProperty({ example: 'Notification delivery dead-letter queue has pending items.' })
  declare summary: string;

  @ApiProperty({ example: 'open', enum: ['open', 'monitoring', 'resolved'] })
  declare state: 'open' | 'monitoring' | 'resolved';

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare occurredAt: string;
}

export class AdminHealthOverviewDto {
  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ example: 'ok', enum: ['ok', 'degraded', 'error', 'unknown'] })
  declare overallStatus: 'ok' | 'degraded' | 'error' | 'unknown';

  @ApiProperty({ type: AdminHealthMetricDto, isArray: true })
  declare metrics: AdminHealthMetricDto[];

  @ApiProperty({ type: AdminHealthServiceDto, isArray: true })
  declare services: AdminHealthServiceDto[];

  @ApiProperty({ type: AdminHealthIncidentDto, isArray: true })
  declare incidents: AdminHealthIncidentDto[];
}
