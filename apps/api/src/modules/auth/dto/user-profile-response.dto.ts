import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

/**
 * User profile response DTO
 *
 * Response DTO for /auth/me endpoint containing user profile information
 * including roles and permissions for authorization decisions.
 */
export class UserProfileResponseDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '123456789'
  })
  @IsString()
  declare userId: string;

  @ApiProperty({
    description: 'Tenant (organization) unique identifier',
    example: '123456789'
  })
  @IsString()
  declare tenantId: string;

  @ApiProperty({
    description: 'Actor ID for audit and operations tracking',
    example: '123456789'
  })
  @IsString()
  declare actorId: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    required: false
  })
  @IsOptional()
  @IsString()
  declare email?: string;

  @ApiProperty({
    description: 'User display name',
    example: 'John Doe',
    required: false
  })
  @IsOptional()
  @IsString()
  declare name?: string;

  @ApiProperty({
    description: 'Authoritative display name from persisted user profile',
    example: 'John Doe',
    required: false
  })
  @IsOptional()
  @IsString()
  declare displayName?: string;

  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+14155552671',
    required: false
  })
  @IsOptional()
  @IsString()
  declare phoneNumber?: string;

  @ApiProperty({
    description: 'Resolved profile photo URL',
    example: 'https://cdn.example.com/avatar.png',
    required: false,
    nullable: true
  })
  @IsOptional()
  @IsString()
  declare photoUrl?: string | null;

  @ApiProperty({
    description: 'Attached avatar storage file id',
    example: 301,
    required: false,
    nullable: true
  })
  @IsOptional()
  declare avatarFileId?: number | null;

  @ApiProperty({
    description: 'Whether the user account is active in database',
    example: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  declare isActive?: boolean;

  @ApiProperty({
    description: 'Whether the user account is verified in database',
    example: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  declare isVerified?: boolean;

  @ApiProperty({
    description: 'Whether the primary identity email is verified',
    example: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  declare emailVerified?: boolean;

  @ApiProperty({
    description: 'User roles for authorization',
    example: ['user', 'admin'],
    isArray: true
  })
  @IsArray()
  @IsString({ each: true })
  declare roles: string[];

  @ApiProperty({
    description: 'User permissions for fine-grained authorization',
    example: ['read:own', 'write:own'],
    isArray: true
  })
  @IsArray()
  @IsString({ each: true })
  declare permissions: string[];

  /**
   * Create from user data object
   *
   * Factory method to create DTO from CurrentUserData or similar objects
   */
  static fromUserData(userData: {
    userId: string;
    tenantId: string;
    actorId: string;
    email?: string;
    displayName?: string;
    phoneNumber?: string;
    photoUrl?: string | null;
    avatarFileId?: number | null;
    isActive?: boolean;
    isVerified?: boolean;
    emailVerified?: boolean;
    name?: string;
    username?: string;
    roles?: string[] | Set<string>;
    permissions?: string[] | Set<string>;
  }): UserProfileResponseDto {
    const dto = new UserProfileResponseDto();
    dto.userId = userData.userId;
    dto.tenantId = userData.tenantId;
    dto.actorId = userData.actorId;
    dto.email = userData.email;
    dto.name = userData.displayName ?? userData.name ?? userData.username ?? 'User';
    dto.displayName = userData.displayName ?? dto.name;
    dto.phoneNumber = userData.phoneNumber;
    if (Object.prototype.hasOwnProperty.call(userData, 'photoUrl')) {
      dto.photoUrl = userData.photoUrl;
    }
    if (Object.prototype.hasOwnProperty.call(userData, 'avatarFileId')) {
      dto.avatarFileId = userData.avatarFileId;
    }
    if (userData.isActive !== undefined) {
      dto.isActive = userData.isActive;
    }
    if (userData.isVerified !== undefined) {
      dto.isVerified = userData.isVerified;
    }
    if (userData.emailVerified !== undefined) {
      dto.emailVerified = userData.emailVerified;
    }
    dto.roles = Array.from(userData.roles ?? []);
    dto.permissions = Array.from(userData.permissions ?? []);
    return dto;
  }
}
