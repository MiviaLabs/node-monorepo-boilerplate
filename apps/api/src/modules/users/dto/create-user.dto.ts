import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Create user DTO
 *
 * Validation DTO for creating a new user
 */
export class CreateUserDto {
  @ApiProperty({
    description: 'Whether the user is active',
    example: true,
    default: true,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  declare isActive?: boolean;

  @ApiProperty({
    description: 'Whether the user is verified',
    example: false,
    default: false,
    required: false
  })
  @IsBoolean()
  @IsOptional()
  declare isVerified?: boolean;
}
