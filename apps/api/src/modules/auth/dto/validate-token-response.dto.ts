import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for password reset token validation
 *
 * Indicates whether the token is valid and provides context
 * about its state (expired, used, or not found).
 */
export class ValidateTokenResponseDto {
  @ApiProperty({
    description: 'Whether the token is valid and can be used',
    example: true
  })
  declare isValid: boolean;

  @ApiProperty({
    description: 'Token status',
    enum: ['valid', 'expired', 'used', 'not-found'],
    example: 'valid'
  })
  declare status: 'valid' | 'expired' | 'used' | 'not-found';

  @ApiProperty({
    description: 'Token expiration timestamp',
    example: '2024-01-01T12:00:00.000Z',
    required: false,
    nullable: true
  })
  expiresAt?: Date;
}
