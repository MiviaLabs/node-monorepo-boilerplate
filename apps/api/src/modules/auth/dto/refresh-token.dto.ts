import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/**
 * Refresh token DTO
 *
 * Validation DTO for token refresh
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...'
  })
  @IsString()
  @MinLength(1, { message: 'Refresh token is required' })
  declare refreshToken: string;
}
