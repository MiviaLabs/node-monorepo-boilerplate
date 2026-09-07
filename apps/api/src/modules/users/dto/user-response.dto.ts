import { ApiProperty } from '@nestjs/swagger';

import type { User } from '@package/db-core';

/**
 * User response DTO
 *
 * Returns full user details for a single user
 */
export class UserResponseDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  declare id: number;

  @ApiProperty({ description: 'Organization ID', example: 1 })
  declare organizationId: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  declare createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2024-01-01T00:00:00.000Z' })
  declare updatedAt: Date;

  /**
   * Create from database entity
   */
  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.organizationId = user.organizationId ?? 0;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
