import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FILE_PURPOSE_ENUM, FILE_VISIBILITY_ENUM } from '@package/db-core';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min
} from 'class-validator';

import type { FilePurpose, FileVisibility } from '@package/db-core';

export const FILE_UPLOAD_TRANSPORT_ENUM = ['api_proxy', 'presigned'] as const;

export type FileUploadTransport = (typeof FILE_UPLOAD_TRANSPORT_ENUM)[number];

export class CreateFileUploadDto {
  @ApiProperty({
    enum: FILE_PURPOSE_ENUM,
    description: 'Logical purpose for storage routing and later domain attachment.'
  })
  @IsString()
  @IsIn(FILE_PURPOSE_ENUM)
  declare purpose: FilePurpose;

  @ApiProperty({
    example: 'design-spec.pdf',
    description: 'Original client filename used for display and key sanitization.'
  })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @Matches(/\S/, { message: 'originalFilename must not be blank' })
  declare originalFilename: string;

  @ApiProperty({
    example: 'application/pdf',
    description: 'Requested content type for the upload.'
  })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @Matches(/\S/, { message: 'mimeType must not be blank' })
  declare mimeType: string;

  @ApiProperty({
    example: 102400,
    description: 'Expected object size in bytes.'
  })
  @IsInt()
  @Min(1)
  declare byteSize: number;

  @ApiPropertyOptional({
    enum: FILE_VISIBILITY_ENUM,
    description: 'Visibility hint for future download behavior. Defaults to private.'
  })
  @IsOptional()
  @IsString()
  @IsIn(FILE_VISIBILITY_ENUM)
  declare visibility?: FileVisibility;

  @ApiPropertyOptional({
    enum: FILE_UPLOAD_TRANSPORT_ENUM,
    description:
      'Upload transport to use. Defaults to api_proxy, which streams bytes through the API.'
  })
  @IsOptional()
  @IsString()
  @IsIn(FILE_UPLOAD_TRANSPORT_ENUM)
  declare transport?: FileUploadTransport;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Optional JSON metadata stored on the file row.'
  })
  @IsOptional()
  @IsObject()
  declare metadata?: Record<string, unknown>;
}
