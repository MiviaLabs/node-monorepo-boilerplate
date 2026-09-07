import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function normalizeOrganizationSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

export class BootstrapInstallDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  declare email: string;

  @ApiProperty({ example: 'StrongPassword123!', minLength: 8, maxLength: 128 })
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

  @ApiProperty({ example: 'Platform Owner' })
  @IsString()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(50, { message: 'Display name must not exceed 50 characters' })
  declare displayName: string;

  @ApiProperty({ example: 'Acme Admin' })
  @IsString()
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2, { message: 'Organization name must be at least 2 characters' })
  @MaxLength(100, { message: 'Organization name must not exceed 100 characters' })
  declare organizationName: string;

  @ApiProperty({ example: 'acme-admin' })
  @IsString()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? normalizeOrganizationSlug(value) : value
  )
  @MinLength(4, { message: 'Organization slug must be at least 4 characters' })
  @MaxLength(50, { message: 'Organization slug must not exceed 50 characters' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Organization slug can contain only lowercase letters, numbers, and hyphens'
  })
  declare organizationSlug: string;

  @ApiProperty({ example: 'Platform', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({ example: 'Owner', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;
}
