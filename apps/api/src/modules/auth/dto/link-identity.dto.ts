import { ApiProperty } from '@nestjs/swagger';
import { IdentityProvider } from '@package/db-core';
import { IsString, IsEnum, IsOptional } from 'class-validator';

/**
 * Link identity DTO
 *
 * Validation DTO for linking identity provider
 */
export class LinkIdentityDto {
  @ApiProperty({
    description: 'OAuth provider',
    example: 'google.com',
    enum: IdentityProvider
  })
  @IsEnum(IdentityProvider, { message: 'Must be a valid provider' })
  declare provider: IdentityProvider;

  @ApiProperty({
    description: 'Provider user ID',
    example: '123456789'
  })
  @IsString()
  declare providerUid: string;

  @ApiProperty({
    description: 'OAuth ID token from provider',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
    required: false
  })
  @IsString()
  @IsOptional()
  idToken?: string;

  @ApiProperty({
    description: 'OAuth access token (optional)',
    example: 'ya29.a0AfH6SMBx...',
    required: false
  })
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiProperty({
    description: 'Display name from provider',
    example: 'John Doe',
    required: false
  })
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiProperty({
    description: 'Profile photo URL from provider',
    example: 'https://example.com/photo.jpg',
    required: false
  })
  @IsString()
  @IsOptional()
  photoUrl?: string;
}
