import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';

import { CreateIssueDto } from './create-issue.dto';

export class UpdateIssueDto extends PartialType(OmitType(CreateIssueDto, ['projectId'] as const)) {
  @ApiPropertyOptional({ example: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  declare estimate?: number | null;

  @ApiPropertyOptional({ example: '2026-03-29T00:00:00.000Z', nullable: true })
  @IsOptional()
  @IsDateString()
  declare dueAt?: string | null;

  @ApiPropertyOptional({
    example: '2026-03-22T01:00:00.000Z',
    description: 'Optimistic concurrency token from the last known issue revision'
  })
  @IsOptional()
  @IsDateString()
  declare baseRevision?: string;
}
