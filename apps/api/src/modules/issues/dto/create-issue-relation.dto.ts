import { ApiProperty } from '@nestjs/swagger';
import { ISSUE_RELATION_TYPE_ENUM } from '@package/db-core';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, Min } from 'class-validator';

export class CreateIssueRelationDto {
  @ApiProperty({ example: 91 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare targetIssueId: number;

  @ApiProperty({ enum: ISSUE_RELATION_TYPE_ENUM, example: 'blocks' })
  @IsEnum(ISSUE_RELATION_TYPE_ENUM)
  declare relationType: (typeof ISSUE_RELATION_TYPE_ENUM)[number];
}
