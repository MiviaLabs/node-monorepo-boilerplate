import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

/**
 * DTO for creating a new tenant
 *
 * Used for system-wide tenant creation operations.
 * Requires elevated system permissions.
 */
export class CreateTenantDto {
  @ApiProperty({
    description: 'Tenant name',
    example: 'Acme Corp',
    minLength: 2
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  declare name: string;

  @ApiProperty({
    description: 'Tenant slug (URL-friendly identifier)',
    example: 'acme-corp',
    pattern: '^[a-z0-9-]+$'
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens'
  })
  declare slug: string;
}
