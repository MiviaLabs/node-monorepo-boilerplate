import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateIssueAttachmentDto {
  @ApiProperty({ example: 101 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare fileId: number;
}
