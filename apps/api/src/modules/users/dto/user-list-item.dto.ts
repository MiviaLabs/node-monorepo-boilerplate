import { ApiProperty } from '@nestjs/swagger';

import type { User } from '@package/db-core';

/**
 * User list item DTO
 *
 * Simplified user representation for list views
 */
export class UserListItemDto {
  @ApiProperty({ description: 'User ID', example: 1 })
  declare id: number;

  @ApiProperty({ description: 'Organization ID', example: 1 })
  declare organizationId: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  declare createdAt: Date;

  /**
   * Create from database entity
   */
  static fromEntity(user: User): UserListItemDto {
    const dto = new UserListItemDto();
    dto.id = user.id;
    dto.organizationId = user.organizationId ?? 0;
    dto.createdAt = user.createdAt;
    return dto;
  }
}
