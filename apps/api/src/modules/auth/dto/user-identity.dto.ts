import { ApiProperty } from '@nestjs/swagger';
import { IdentityProvider, type UserIdentity } from '@package/db-core';

/**
 * User identity DTO
 *
 * Response DTO for user identity information
 */
export class UserIdentityDto {
  @ApiProperty({
    description: 'Identity ID',
    example: 1
  })
  declare id: number;

  @ApiProperty({
    description: 'User ID',
    example: 123
  })
  declare userId: number;

  @ApiProperty({
    description: 'Identity provider',
    example: 'google.com',
    enum: IdentityProvider
  })
  declare provider: IdentityProvider;

  @ApiProperty({
    description: 'Provider user ID (e.g., Firebase UID)',
    example: '123456789'
  })
  declare providerUid: string;

  @ApiProperty({
    description: 'Display name from provider',
    example: 'John Doe',
    required: false
  })
  declare displayName?: string;

  @ApiProperty({
    description: 'Profile photo URL',
    example: 'https://example.com/photo.jpg',
    required: false
  })
  declare photoUrl?: string;

  @ApiProperty({
    description: 'Email verified status',
    example: true
  })
  declare emailVerified: boolean;

  @ApiProperty({
    description: 'Phone verified status',
    example: false
  })
  declare phoneVerified: boolean;

  @ApiProperty({
    description: 'Whether this is the primary identity',
    example: true
  })
  declare isPrimary: boolean;

  @ApiProperty({
    description: 'Last sign in time',
    example: '2024-01-01T12:00:00.000Z',
    required: false
  })
  declare lastSignInAt?: Date;

  /**
   * Create from user identity entity
   */
  static fromEntity(identity: UserIdentity): UserIdentityDto {
    return {
      id: identity.id,
      userId: identity.userId,
      provider: identity.provider as IdentityProvider,
      providerUid: identity.providerUid,
      displayName: identity.displayName ?? '',
      photoUrl: identity.photoUrl ?? '',
      emailVerified: identity.emailVerified,
      phoneVerified: identity.phoneVerified,
      isPrimary: identity.isPrimary,
      lastSignInAt: identity.lastSignInAt ?? new Date()
    };
  }
}
