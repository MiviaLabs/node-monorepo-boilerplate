import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/**
 * User roles and permissions response DTO
 *
 * Response DTO for user role and permission information
 */
export class UserRolesResponseDto {
  @ApiProperty({
    description: 'User roles (e.g., system_owner, tenant_admin)',
    example: ['system_owner', 'tenant_admin'],
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  declare roles: string[];

  @ApiProperty({
    description: 'User permissions (e.g., system:*, tenant:users:read)',
    example: ['system:*', 'tenant:users:read', 'tenant:users:write'],
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  declare permissions: string[];

  /**
   * Create user roles response
   */
  constructor(data: { roles: string[]; permissions: string[] }) {
    this.roles = data.roles;
    this.permissions = data.permissions;
  }

  /**
   * Create from roles and permissions
   */
  static create(roles: string[], permissions: string[]): UserRolesResponseDto {
    return new UserRolesResponseDto({ roles, permissions });
  }
}
