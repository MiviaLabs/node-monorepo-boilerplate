import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InvitationPreviewQueryDto {
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

export class InvitationPreviewResponseDto {
  @ApiProperty({ example: 'valid', enum: ['valid'] })
  declare status: 'valid';

  @ApiProperty({ example: 'register', enum: ['register', 'existing_account'] })
  declare acceptanceMode: 'register' | 'existing_account';

  @ApiProperty({ example: 'Acme Corporation' })
  declare tenantName: string;

  @ApiProperty({ example: 'Jane Admin' })
  declare inviterDisplayName: string;

  @ApiProperty({ example: 'j***e@example.com' })
  declare invitedEmailMasked: string;

  @ApiProperty({
    example: '2026-03-10T12:00:00.000Z',
    nullable: true
  })
  declare expiresAt: string | null;
}
