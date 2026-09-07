import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

/**
 * Request Password Reset DTO
 *
 * Validation DTO for requesting a password reset.
 * Only email is required - the system automatically determines the user's organization.
 */
export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Must be a valid email address' })
  declare email: string;
}
