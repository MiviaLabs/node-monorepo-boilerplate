import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

import { CreateContentEntryDto } from './create-content-entry.dto';

export class UpdateContentEntryDto extends PartialType(
  OmitType(CreateContentEntryDto, ['projectId'] as const)
) {
  @ApiPropertyOptional({
    example: '2026-03-21T01:00:00.000Z',
    description: 'Optimistic concurrency token from the last known content revision'
  })
  @IsOptional()
  @IsDateString()
  declare baseRevision?: string;
}
