import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  Matches,
  registerDecorator,
  ValidationArguments,
  ValidationOptions
} from 'class-validator';

function Match(property: string, validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName: String(propertyName),
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return value === relatedValue;
        }
      }
    });
  };
}

/**
 * Reset Password DTO
 *
 * Validation DTO for resetting a password with a token
 */
export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token',
    example: '2f20ea8d-45c3-44f7-a59d-5fcf85fd1f17',
    minLength: 1
  })
  @IsString()
  @MinLength(1, { message: 'Reset token is required' })
  declare token: string;

  @ApiProperty({
    description: 'New password',
    example: 'NewSecurePass123!',
    minLength: 8
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
  })
  declare newPassword: string;

  @ApiProperty({
    description: 'Confirm new password (must match newPassword)',
    example: 'NewSecurePass123!',
    minLength: 8
  })
  @IsString()
  @MinLength(8, { message: 'Password confirmation is required' })
  @Match('newPassword', { message: 'Passwords do not match' })
  declare confirmPassword: string;
}
