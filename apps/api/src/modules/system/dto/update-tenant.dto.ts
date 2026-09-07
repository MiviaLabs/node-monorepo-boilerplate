import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, MinLength, Matches } from 'class-validator';

/**
 * DTO for updating an existing tenant
 *
 * Used for system-wide tenant update operations.
 * All fields are optional to support partial updates.
 */
export class UpdateTenantDto {
  @ApiProperty({
    description: 'Tenant name',
    example: 'Acme Corporation',
    minLength: 2,
    required: false
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  name?: string;

  @ApiProperty({
    description: 'Tenant status',
    example: 'active',
    enum: ['active', 'suspended', 'deleted'],
    required: false
  })
  @IsEnum(['active', 'suspended', 'deleted'])
  @IsOptional()
  status?: 'active' | 'suspended' | 'deleted';

  @ApiProperty({
    description: 'Tenant slug (URL-friendly identifier)',
    example: 'acme-corp',
    pattern: '^[a-z0-9-]+$',
    required: false
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens'
  })
  slug?: string;
}
