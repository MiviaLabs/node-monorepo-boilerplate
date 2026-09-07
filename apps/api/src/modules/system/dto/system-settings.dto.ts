import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from 'class-validator';

/**
 * Password policy configuration
 */
export class PasswordPolicyDto {
  @ApiProperty({
    description: 'Minimum password length',
    example: 8,
    default: 8,
    required: false
  })
  @IsNumber()
  @IsOptional()
  @Min(8)
  minLength?: number;

  @ApiProperty({
    description: 'Require uppercase letters',
    example: true,
    default: true,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  requireUppercase?: boolean;

  @ApiProperty({
    description: 'Require lowercase letters',
    example: true,
    default: true,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  requireLowercase?: boolean;

  @ApiProperty({
    description: 'Require numbers',
    example: true,
    default: true,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  requireNumbers?: boolean;

  @ApiProperty({
    description: 'Require special characters',
    example: false,
    default: false,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  requireSpecialChars?: boolean;
}

/**
 * DTO for system-wide settings
 *
 * Used for system configuration management.
 * All fields are optional to support partial updates.
 */
export class SystemSettingsDto {
  @ApiProperty({
    description: 'Allow new user registration',
    example: true,
    default: true,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  allowRegistration?: boolean;

  @ApiProperty({
    description: 'Require email verification for new accounts',
    example: true,
    default: true,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  requireEmailVerification?: boolean;

  @ApiProperty({
    description: 'Default role for new users',
    example: 'tenant_user',
    default: 'tenant_user',
    required: false
  })
  @IsString()
  @IsOptional()
  defaultUserRole?: string;

  @ApiProperty({
    description: 'Maximum number of tenants per user',
    example: 1,
    default: 1,
    required: false
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxTenantsPerUser?: number;

  @ApiProperty({
    description: 'Session timeout in seconds',
    example: 3600,
    default: 3600,
    required: false
  })
  @IsNumber()
  @IsOptional()
  @Min(60)
  sessionTimeout?: number;

  @ApiProperty({
    description: 'Password policy configuration',
    type: PasswordPolicyDto,
    required: false
  })
  @IsObject()
  @ValidateNested()
  @Type(() => PasswordPolicyDto)
  @IsOptional()
  passwordPolicy?: Partial<PasswordPolicyDto>;
}
