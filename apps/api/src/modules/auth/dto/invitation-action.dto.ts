import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InvitationActionDto {
  @ApiProperty({
    description: 'Invitation token from invitation link',
    example: '4d0f87f2-9a84-4f69-a815-1bb2ad2f0c55'
  })
  @IsString()
  @IsNotEmpty()
  declare token: string;

  @ApiPropertyOptional({
    description: 'Organization (tenant) identifier. Optional; backend resolves tenant from token.',
    example: '123'
  })
  @IsOptional()
  @IsString()
  declare tenantId?: string;
}

export class InvitationActionResponseDto {
  @ApiProperty({ example: 'accepted', enum: ['accepted', 'declined'] })
  declare status: 'accepted' | 'declined';

  @ApiProperty({ example: '123' })
  declare tenantId: string;

  @ApiProperty({ example: '77' })
  declare invitationId: string;

  @ApiProperty({ example: true })
  declare membershipCreated: boolean;
}
