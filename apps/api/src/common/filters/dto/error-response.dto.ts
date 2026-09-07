import { ApiProperty } from '@nestjs/swagger';

/**
 * Error code type
 */
type ErrorCode = string;

/**
 * Standard error response format
 */
export class ErrorResponseDto {
  @ApiProperty({
    example: 'VALIDATION_001',
    description: 'Application error code'
  })
  declare readonly code: ErrorCode;

  @ApiProperty({
    example: 'Validation failed',
    description: 'Human-readable error message'
  })
  declare readonly message: string;

  @ApiProperty({
    example: '2024-12-31T12:00:00.000Z',
    description: 'Error timestamp'
  })
  declare readonly timestamp: string;

  @ApiProperty({
    example: 'abc123-def456-ghi789',
    description: 'Unique request ID for tracing',
    required: false
  })
  readonly requestId?: string;

  @ApiProperty({
    example: ['Email is required', 'Password must be at least 8 characters'],
    description: 'Detailed validation errors',
    required: false
  })
  readonly errors?: string[];

  @ApiProperty({
    example: '/api/v1/people',
    description: 'Request path',
    required: false
  })
  readonly path?: string;

  @ApiProperty({
    example: { stack: 'Error:...', timestamp: '2024-12-31T12:00:00.000Z' },
    description: 'Debugging metadata (only in non-production)',
    required: false
  })
  readonly metadata?: Record<string, unknown>;
}
