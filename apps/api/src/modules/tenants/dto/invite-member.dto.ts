import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * DTO for inviting a member to tenant
 */
export class InviteMemberDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address of the user to invite'
  })
  @IsEmail()
  declare email: string;

  @ApiProperty({
    example: ['tenant_user'],
    description: 'Roles to assign to the invited user',
    required: false
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  declare roles?: string[];

  @ApiProperty({
    example: 'Join our team!',
    description: 'Personalized message for the invitation',
    required: false
  })
  @IsString()
  @IsOptional()
  declare message?: string;
}
