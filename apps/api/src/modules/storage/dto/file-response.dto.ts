import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FILE_PURPOSE_ENUM, FILE_STATUS_ENUM, FILE_VISIBILITY_ENUM } from '@package/db-core';

import type { IFileMetadata } from '@package/db-core';

export class FileResponseDto {
  @ApiProperty({ example: 101 })
  declare id: number;

  @ApiProperty({ example: 12 })
  declare organizationId: number;

  @ApiProperty({ example: 34 })
  declare uploadedByUserId: number;

  @ApiProperty({ example: 'uploads' })
  declare storageInstance: string;

  @ApiProperty({ example: 'app-uploads' })
  declare bucket: string;

  @ApiProperty({ example: 'org/12/uploads/issue_attachment/101/design-spec.pdf' })
  declare objectKey: string;

  @ApiProperty({ example: 'design-spec.pdf' })
  declare originalFilename: string;

  @ApiPropertyOptional({ example: 'application/pdf', nullable: true })
  declare mimeType: string | null;

  @ApiProperty({ example: 102400 })
  declare byteSize: number;

  @ApiPropertyOptional({ example: null, nullable: true })
  declare checksumSha256: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  declare etag: string | null;

  @ApiProperty({ enum: FILE_STATUS_ENUM })
  declare status: (typeof FILE_STATUS_ENUM)[number];

  @ApiProperty({ enum: FILE_VISIBILITY_ENUM })
  declare visibility: (typeof FILE_VISIBILITY_ENUM)[number];

  @ApiProperty({ enum: FILE_PURPOSE_ENUM })
  declare purpose: (typeof FILE_PURPOSE_ENUM)[number];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  declare metadata: IFileMetadata;

  @ApiPropertyOptional({ example: null, nullable: true })
  declare uploadedAt: string | Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  declare lastAccessedAt: string | Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  declare deletedAt: string | Date | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  declare purgedAt: string | Date | null;

  @ApiProperty()
  declare createdAt: string | Date;

  @ApiProperty()
  declare updatedAt: string | Date;
}
