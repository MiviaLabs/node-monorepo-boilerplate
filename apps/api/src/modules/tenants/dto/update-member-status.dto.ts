import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

/**
 * Member status enumeration
 */
export const MemberStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending'
} as const;

/**
 * DTO for updating a member's status
 */
export class UpdateMemberStatusDto {
  @ApiProperty({
    enum: MemberStatus,
    example: MemberStatus.INACTIVE,
    description: 'New membership status for the member'
  })
  @IsEnum(MemberStatus, {
    message: `Status must be one of: ${Object.values(MemberStatus).join(', ')}`
  })
  declare status: string;
}
