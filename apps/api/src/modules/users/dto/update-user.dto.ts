import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Update user DTO
 *
 * Validation DTO for updating an existing user
 * All fields are optional
 */
export class UpdateUserDto {
  @ApiProperty({
    description: 'Whether the user is active',
    example: true,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description: 'Whether the user is verified',
    example: false,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  isVerified?: boolean;
}
