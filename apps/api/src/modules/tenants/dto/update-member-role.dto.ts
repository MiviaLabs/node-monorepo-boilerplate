import { ApiProperty } from '@nestjs/swagger';
import { TENANT_ROLE } from '@package/constants';
import { IsEnum } from 'class-validator';

/**
 * DTO for updating a member's role
 */
export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: TENANT_ROLE,
    example: TENANT_ROLE.ADMIN,
    description: 'New role to assign to the member'
  })
  @IsEnum(TENANT_ROLE, {
    message: `Role must be one of: ${Object.values(TENANT_ROLE).join(', ')}`
  })
  declare role: string;
}
