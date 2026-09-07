import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * User organization membership DTO for workspace switching.
 */
export class UserOrganizationDto {
  @ApiProperty({ description: 'Organization ID used as x-tenant-id', example: '123' })
  @IsString()
  declare organizationId: string;

  @ApiProperty({ description: 'Underlying tenant ID', example: '45' })
  @IsString()
  declare tenantId: string;

  @ApiProperty({ description: 'Organization name', example: 'Acme Corp' })
  @IsString()
  declare name: string;

  @ApiProperty({ description: 'Organization display name', example: 'Acme', required: false })
  @IsOptional()
  @IsString()
  declare displayName?: string;

  @ApiProperty({ description: 'Organization slug', example: 'acme-corp' })
  @IsString()
  declare slug: string;

  @ApiProperty({ description: 'Membership role', example: 'tenant_admin' })
  @IsString()
  declare role: string;

  @ApiProperty({ description: 'Whether this membership is default', example: true })
  @IsBoolean()
  declare isDefault: boolean;

  @ApiProperty({ description: 'Whether membership and organization are active', example: true })
  @IsBoolean()
  declare isActive: boolean;
}
