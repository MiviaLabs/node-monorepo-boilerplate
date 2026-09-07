import { ApiProperty } from '@nestjs/swagger';
import { IdentityProvider } from '@package/db-core';
import { IsString, IsEnum } from 'class-validator';

/**
 * Unlink identity DTO
 *
 * Validation DTO for unlinking identity provider
 */
export class UnlinkIdentityDto {
  @ApiProperty({
    description: 'OAuth provider to unlink',
    example: 'google.com',
    enum: IdentityProvider
  })
  @IsEnum(IdentityProvider, { message: 'Must be a valid provider' })
  declare provider: IdentityProvider;

  @ApiProperty({
    description: 'Provider user ID to unlink',
    example: '123456789'
  })
  @IsString()
  declare providerUid: string;
}
