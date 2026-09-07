import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangeMyPasswordDto {
  @ApiProperty({
    description: 'Current account password',
    example: 'OldPass123!',
    minLength: 8,
    maxLength: 128
  })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  @MinLength(8, { message: 'Current password must be at least 8 characters' })
  @MaxLength(128, { message: 'Current password must not exceed 128 characters' })
  declare currentPassword: string;

  @ApiProperty({
    description: 'New account password',
    example: 'NewStrongPass123!',
    minLength: 8,
    maxLength: 128
  })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(128, { message: 'New password must not exceed 128 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]+$/,
    {
      message: 'New password must contain uppercase, lowercase, number, and special character'
    }
  )
  declare newPassword: string;
}
