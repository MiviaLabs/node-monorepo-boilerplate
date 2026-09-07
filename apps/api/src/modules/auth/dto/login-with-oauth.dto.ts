import { ApiProperty } from '@nestjs/swagger';
import { IdentityProvider } from '@package/db-core';
import { IsString, IsEnum, IsOptional } from 'class-validator';

/**
 * Login with OAuth DTO
 *
 * Validation DTO for OAuth login
 */
export class LoginWithOAuthDto {
  @ApiProperty({
    description: 'OAuth provider',
    example: 'google.com',
    enum: IdentityProvider
  })
  @IsEnum(IdentityProvider, { message: 'Must be a valid provider' })
  declare provider: IdentityProvider;

  @ApiProperty({
    description: 'OAuth ID token from provider',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...'
  })
  @IsString()
  declare idToken: string;

  @ApiProperty({
    description: 'OAuth access token (optional)',
    example: 'ya29.a0AfH6SMBx...',
    required: false
  })
  @IsString()
  @IsOptional()
  accessToken?: string;
}
