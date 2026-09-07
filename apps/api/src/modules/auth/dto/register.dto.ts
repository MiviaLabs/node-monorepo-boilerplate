import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches
} from 'class-validator';

function normalizeOrganizationSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace invalid chars with hyphens
    .replace(/^-+/g, '') // Remove leading hyphens
    .replace(/-+$/g, '') // Remove trailing hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .substring(0, 50); // Max 50 chars
}

/**
 * Register DTO
 *
 * Validation DTO for user registration
 */
export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail({}, { message: 'Must be a valid email address' })
  declare email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123!',
    minLength: 8,
    maxLength: 128
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]+$/,
    {
      message: 'Password must contain uppercase, lowercase, number, and special character'
    }
  )
  declare password: string;

  @ApiProperty({
    description: 'Display name (how the user name appears to others)',
    example: 'John Doe',
    required: false
  })
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(50, { message: 'Display name must not exceed 50 characters' })
  displayName?: string;

  @ApiProperty({
    description: 'Organization or team display name (stored as organization name and displayName)',
    example: 'Acme Inc',
    required: false
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2, { message: 'Organization name must be at least 2 characters' })
  @MaxLength(100, { message: 'Organization name must not exceed 100 characters' })
  organizationName?: string;

  @ApiProperty({
    description:
      'Organization slug (readonly client-generated from organization name; lowercase letters, numbers, hyphens)',
    example: 'acme-inc',
    required: false
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? normalizeOrganizationSlug(value) : value
  )
  @MinLength(4, { message: 'Organization slug must be at least 4 characters' })
  @MaxLength(50, { message: 'Organization slug must not exceed 50 characters' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Organization slug can contain only lowercase letters, numbers, and hyphens'
  })
  organizationSlug?: string;

  @ApiProperty({
    description: 'Whether the user email is verified (defaults to true)',
    example: true,
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean = true;

  @ApiProperty({
    description: 'Whether the user account is active (defaults to true)',
    example: true,
    required: false,
    default: true
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @ApiProperty({
    description: 'Invitation token for secure tenant invitation acceptance',
    required: false,
    example: '2f20ea8d-45c3-44f7-a59d-5fcf85fd1f17'
  })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Invitation token must be valid' })
  invitationToken?: string;
}
