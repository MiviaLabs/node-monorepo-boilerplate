import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

import {
  FILE_UPLOAD_TRANSPORT_ENUM,
  type FileUploadTransport
} from '../../storage/dto/create-file-upload.dto';

export class CreateIssueAttachmentUploadDto {
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
    enum: FILE_UPLOAD_TRANSPORT_ENUM,
    description:
      'Upload transport to use. Defaults to api_proxy, which streams bytes through the API.'
  })
  @IsOptional()
  @IsString()
  @IsIn(FILE_UPLOAD_TRANSPORT_ENUM)
  declare transport?: FileUploadTransport;
}
