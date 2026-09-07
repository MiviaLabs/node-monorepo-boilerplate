import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO for updating tenant settings
 */
export class UpdateTenantSettingsDto {
  @ApiProperty({
    example: 'Acme Corp',
    description: 'Editable tenant display name used in UI',
    required: false
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @IsOptional()
  displayName?: string;

  @ApiProperty({
    example: true,
    description: 'Whether the tenant is active',
    required: false
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    example: { theme: 'light', language: 'en' },
    description: 'Additional tenant settings as key-value pairs',
    required: false
  })
  @IsOptional()
  settings?: Record<string, unknown>;
}
