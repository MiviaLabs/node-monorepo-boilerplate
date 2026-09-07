import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  ContentAttachmentDtoShape,
  ContentEntryDtoShape,
  ContentSidebarEntryDtoShape
} from '../types/content.types';

export class ContentEntryDto implements ContentEntryDtoShape {
  @ApiProperty({ example: 1 })
  declare id: number;

  @ApiProperty({ example: 12 })
  declare organizationId: number;

  @ApiPropertyOptional({ example: 44, nullable: true })
  declare projectId: number | null;

  @ApiPropertyOptional({ example: 2, nullable: true })
  declare parentId: number | null;

  @ApiProperty({ example: 'Getting Started' })
  declare title: string;

  @ApiProperty({ example: 'getting-started' })
  declare slug: string;

  @ApiProperty({ example: '2026-03-21T01:00:00.000Z' })
  declare revision: string;

  @ApiProperty({ example: '# Getting Started' })
  declare contentMarkdown: string;

  @ApiProperty({ example: 0 })
  declare position: number;

  @ApiProperty({ example: 9 })
  declare createdBy: number;

  @ApiProperty({ example: 9 })
  declare updatedBy: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare updatedByDisplayName: string | null;

  @ApiPropertyOptional({
    example: 'https://signed.example.test/avatars/jordan-lee.png',
    nullable: true
  })
  declare updatedByPhotoUrl: string | null;

  @ApiProperty({ example: '2026-03-21T00:00:00.000Z' })
  declare createdAt: string | Date;

  @ApiProperty({ example: '2026-03-21T01:00:00.000Z' })
  declare updatedAt: string | Date;
}

export class ContentSidebarEntryDto implements ContentSidebarEntryDtoShape {
  @ApiProperty({ example: 1 })
  declare id: number;

  @ApiProperty({ example: 12 })
  declare organizationId: number;

  @ApiPropertyOptional({ example: 44, nullable: true })
  declare projectId: number | null;

  @ApiPropertyOptional({ example: 2, nullable: true })
  declare parentId: number | null;

  @ApiProperty({ example: 'Getting Started' })
  declare title: string;

  @ApiProperty({ example: 'getting-started' })
  declare slug: string;

  @ApiProperty({ example: 0 })
  declare position: number;

  @ApiProperty({ example: 9 })
  declare updatedBy: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare updatedByDisplayName: string | null;

  @ApiPropertyOptional({
    example: 'https://signed.example.test/avatars/jordan-lee.png',
    nullable: true
  })
  declare updatedByPhotoUrl: string | null;

  @ApiProperty({ example: '2026-03-21T01:00:00.000Z' })
  declare updatedAt: string | Date;
}

export class ContentAttachmentDto implements ContentAttachmentDtoShape {
  @ApiProperty({ example: 51 })
  declare id: number;

  @ApiProperty({ example: 123 })
  declare contentEntryId: number;

  @ApiProperty({ example: 101 })
  declare fileId: number;

  @ApiProperty({ example: 9 })
  declare attachedByUserId: number;

  @ApiPropertyOptional({ example: 'Jordan Lee', nullable: true })
  declare attachedByDisplayName: string | null;

  @ApiPropertyOptional({ example: 9, nullable: true })
  declare uploadedByUserId: number | null;

  @ApiProperty({ example: 'getting-started.pdf' })
  declare originalFilename: string;

  @ApiPropertyOptional({ example: 'application/pdf', nullable: true })
  declare mimeType: string | null;

  @ApiProperty({ example: 1024 })
  declare byteSize: number;

  @ApiPropertyOptional({ example: 'ready', nullable: true })
  declare status: ContentAttachmentDtoShape['status'];

  @ApiPropertyOptional({ example: 'private', nullable: true })
  declare visibility: ContentAttachmentDtoShape['visibility'];

  @ApiPropertyOptional({ example: 'uploads', nullable: true })
  declare storageInstance: string | null;

  @ApiPropertyOptional({ example: 'app-uploads', nullable: true })
  declare bucket: string | null;

  @ApiPropertyOptional({
    example: 'org/12/uploads/content_upload/101/getting-started.pdf',
    nullable: true
  })
  declare objectKey: string | null;

  @ApiProperty({ example: '2026-03-21T01:00:00.000Z' })
  declare createdAt: string | Date;
}
