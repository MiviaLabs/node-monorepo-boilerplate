import { ApiProperty } from '@nestjs/swagger';

export class ProjectMemberDto {
  @ApiProperty({ example: 42, description: 'User ID' })
  declare userId: number;

  @ApiProperty({
    example: 'Jane Doe',
    description: 'Display name for the assigned member',
    nullable: true
  })
  declare displayName: string | null;

  @ApiProperty({
    example: 'https://cdn.example.com/avatar.png',
    description: 'Profile photo URL for the assigned member',
    nullable: true
  })
  declare photoUrl: string | null;

  @ApiProperty({
    example: true,
    description: 'Whether this member is the project creator'
  })
  declare isCreator: boolean;

  @ApiProperty({
    example: '2026-03-18T10:00:00.000Z',
    description: 'When the member was assigned to the project'
  })
  declare assignedAt: string;
}
