import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

/**
 * Dead letter event response DTO
 */
export class DeadLetterEventDto {
  @ApiProperty({
    description: 'Event ID',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  eventId!: string;

  @ApiProperty({
    description: 'Event type',
    example: 'user.created'
  })
  eventType!: string;

  @ApiProperty({
    description: 'Aggregate ID',
    example: 'user-123'
  })
  aggregateId!: string;

  @ApiPropertyOptional({
    description: 'Tenant ID',
    example: 'tenant-abc'
  })
  tenantId?: string;

  @ApiProperty({
    description: 'Number of retry attempts',
    example: 5
  })
  retryCount!: number;

  @ApiProperty({
    description: 'Error message (sanitized)',
    example: 'Connection timeout'
  })
  errorMessage!: string;

  @ApiProperty({
    description: 'Date when event was dead-lettered',
    example: '2024-12-31T12:00:00.000Z'
  })
  deadLetteredAt!: Date;

  @ApiProperty({
    description: 'Dead letter reason classification',
    example: 'timeout',
    enum: ['network', 'timeout', 'validation', 'permission', 'unknown']
  })
  reason!: string;
}

/**
 * Replay dead letter event response DTO
 */
export class ReplayDeadLetterResponseDto {
  @ApiProperty({
    description: 'Event ID that was replayed',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  eventId!: string;

  @ApiProperty({
    description: 'Whether replay was successful',
    example: true
  })
  success!: boolean;

  @ApiProperty({
    description: 'Message describing the result',
    example: 'Event queued for replay'
  })
  message!: string;
}

/**
 * Query dead letter events DTO
 */
export class QueryDeadLetterEventsDto {
  @ApiPropertyOptional({
    description: 'Filter by tenant ID',
    example: 'tenant-abc'
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Filter by event type',
    example: 'user.created'
  })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({
    description: 'Filter by reason',
    example: 'timeout',
    enum: ['network', 'timeout', 'validation', 'permission', 'unknown']
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
