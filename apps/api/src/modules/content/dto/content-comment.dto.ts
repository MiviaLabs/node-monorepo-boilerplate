import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ContentCommentDtoShape } from '../types/content.types';

export class ContentCommentDto implements ContentCommentDtoShape {
  @ApiProperty({ example: 91 })
  declare id: number;

  @ApiProperty({ example: 123 })
  declare contentEntryId: number;

  @ApiProperty({ example: 9 })
  declare authorUserId: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare authorDisplayName: string | null;

  @ApiPropertyOptional({
    example: 'https://signed.example.test/avatars/jordan-lee.png',
    nullable: true
  })
  declare authorPhotoUrl: string | null;

  @ApiProperty({ example: 'Looks good. We should add a rollout note here.' })
  declare bodyMarkdown: string;

  @ApiProperty({ example: '2026-03-28T12:00:00.000Z' })
  declare createdAt: string | Date;

  @ApiProperty({ example: '2026-03-28T12:00:00.000Z' })
  declare updatedAt: string | Date;

  @ApiProperty({ example: true })
  declare canDelete: boolean;
}
