import { ApiProperty } from '@nestjs/swagger';

export class AdminInboxItemDto {
  @ApiProperty({ example: 'evt-dead-letter-1' })
  declare id: string;

  @ApiProperty({ example: 'event_failure' })
  declare kind: string;

  @ApiProperty({ example: 'high', enum: ['low', 'medium', 'high'] })
  declare priority: 'low' | 'medium' | 'high';

  @ApiProperty({ example: 'Notification delivery requires operator review' })
  declare title: string;

  @ApiProperty({ example: 'Derived from existing persisted/event operational data.' })
  declare summary: string;

  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare createdAt: string;

  @ApiProperty({ example: '/health', required: false })
  declare href?: string;
}

export class AdminInboxOverviewDto {
  @ApiProperty({ example: '2026-03-13T10:00:00.000Z' })
  declare generatedAt: string;

  @ApiProperty({ type: AdminInboxItemDto, isArray: true })
  declare items: AdminInboxItemDto[];
}
