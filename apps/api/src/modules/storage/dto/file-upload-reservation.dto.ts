import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { FILE_UPLOAD_TRANSPORT_ENUM } from './create-file-upload.dto';
import { FileResponseDto } from './file-response.dto';

export class FileSignedUrlDto {
  @ApiProperty({ enum: FILE_UPLOAD_TRANSPORT_ENUM })
  declare transport: 'api_proxy' | 'presigned';

  @ApiProperty()
  declare url: string;

  @ApiProperty({ enum: ['PUT', 'GET'] })
  declare method: 'PUT' | 'GET';

  @ApiPropertyOptional()
  declare expiresAt?: string | Date;

  @ApiProperty()
  declare bucket: string;

  @ApiProperty()
  declare key: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  declare headers?: Record<string, string>;
}

export class FileUploadReservationDto {
  @ApiProperty({ type: FileResponseDto })
  declare file: FileResponseDto;

  @ApiProperty({ type: FileSignedUrlDto })
  declare upload: FileSignedUrlDto;
}
