import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

/**
 * Transfer Ownership DTO
 *
 * Request body for transferring organization ownership
 */
export class TransferOwnershipDto {
  @ApiProperty({
    description: 'User ID of the new owner',
    example: '123',
    pattern: '^[0-9]+$'
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]+$/, { message: 'newOwnerId must be a numeric string' })
  declare newOwnerId: string;

  @ApiPropertyOptional({
    description: 'Reason for ownership transfer',
    example: 'Organizational restructuring'
  })
  @IsString()
  @IsOptional()
  declare reason?: string;
}
