import { ApiProperty } from '@nestjs/swagger';

/**
 * Session entity interface (stub for future session table)
 */
export interface SessionEntity {
  id: string;
  userId: number;
  tenantId: string;
  tokenId: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
  active: boolean;
}

/**
 * Session DTO
 *
 * Response DTO for session information
 */
export class SessionDto {
  @ApiProperty({
    description: 'Session ID',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  declare id: string;

  @ApiProperty({
    description: 'User ID',
    example: 123
  })
  declare userId: number;

  @ApiProperty({
    description: 'Tenant ID',
    example: 'abc-123'
  })
  declare tenantId: string;

  @ApiProperty({
    description: 'Token ID',
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  declare tokenId: string;

  @ApiProperty({
    description: 'Session creation time',
    example: '2024-01-01T00:00:00.000Z'
  })
  declare createdAt: Date;

  @ApiProperty({
    description: 'Session expiration time',
    example: '2024-01-08T00:00:00.000Z'
  })
  declare expiresAt: Date;

  @ApiProperty({
    description: 'Last activity time',
    example: '2024-01-01T12:00:00.000Z'
  })
  declare lastActivity: Date;

  @ApiProperty({
    description: 'IP address of session creation',
    example: '192.168.1.1',
    required: false
  })
  declare ipAddress?: string;

  @ApiProperty({
    description: 'User agent of session creation',
    example: 'Mozilla/5.0...',
    required: false
  })
  declare userAgent?: string;

  @ApiProperty({
    description: 'Whether session is active',
    example: true
  })
  declare active: boolean;

  /**
   * Create from session entity
   */
  static fromEntity(session: SessionEntity): SessionDto {
    return {
      id: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      tokenId: session.tokenId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      lastActivity: session.lastActivity,
      ...(session.ipAddress !== undefined && { ipAddress: session.ipAddress }),
      ...(session.userAgent !== undefined && { userAgent: session.userAgent }),
      active: session.active
    };
  }
}
