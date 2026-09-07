import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf
} from 'class-validator';

/**
 * Update my profile DTO
 *
 * Validation DTO for current authenticated user's profile updates.
 */
export class UpdateMyProfileDto {
  @ApiProperty({
    description: 'Display name for the current user profile',
    example: 'Jane Doe',
    minLength: 2,
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(50, { message: 'Display name must not exceed 50 characters' })
  declare displayName?: string;

  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+14155552671',
    required: false
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  @ValidateIf((_object, value) => value !== '')
  @IsPhoneNumber(undefined, { message: 'Must be a valid phone number in E.164 format' })
  declare phoneNumber?: string;
}
