import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for tenant response
 *
 * Represents a tenant in the system.
 */
export class TenantResponseDto {
  @ApiProperty({
    description: 'Tenant ID',
    example: 1
  })
  declare id: number;

  @ApiProperty({
    description: 'Tenant name',
    example: 'Acme Corp'
  })
  declare name: string;

  @ApiProperty({
    description: 'Tenant slug (URL-friendly identifier)',
    example: 'acme-corp'
  })
  declare slug: string;

  @ApiProperty({
    description: 'Tenant status',
    example: 'active',
    enum: ['draft', 'trial', 'active', 'suspended', 'deleted']
  })
  declare status: 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';

  @ApiProperty({
    description: 'Tenant creation timestamp',
    example: '2024-01-01T00:00:00.000Z'
  })
  declare createdAt: Date;

  @ApiProperty({
    description: 'Tenant last update timestamp',
    example: '2024-01-01T12:00:00.000Z',
    required: false
  })
  declare updatedAt?: Date;

  static fromEntity(data: {
    id: number;
    name: string;
    slug: string;
    status: string;
    createdAt: Date;
    updatedAt?: Date;
  }): TenantResponseDto {
    const dto = new TenantResponseDto();
    dto.id = data.id;
    dto.name = data.name;
    dto.slug = data.slug;
    dto.status = data.status as 'draft' | 'trial' | 'active' | 'suspended' | 'deleted';
    dto.createdAt = data.createdAt;
    if (data.updatedAt !== undefined) {
      dto.updatedAt = data.updatedAt;
    }
    return dto;
  }
}
