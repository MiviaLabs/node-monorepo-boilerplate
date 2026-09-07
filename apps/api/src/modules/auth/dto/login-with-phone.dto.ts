import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsPhoneNumber, MinLength, MaxLength } from 'class-validator';

/**
 * Login with phone DTO
 *
 * Validation DTO for phone number login
 */
export class LoginWithPhoneDto {
  @ApiProperty({
    description: 'Phone number in E.164 format',
    example: '+1234567890'
  })
  @IsString()
  @IsPhoneNumber(undefined, { message: 'Must be a valid phone number in E.164 format' })
  declare phoneNumber: string;

  @ApiProperty({
    description: 'Verification code received via SMS',
    example: '123456'
  })
  @IsString()
  @MinLength(4, { message: 'Verification code must be at least 4 digits' })
  @MaxLength(10, { message: 'Verification code must not exceed 10 digits' })
  declare verificationCode: string;
}
