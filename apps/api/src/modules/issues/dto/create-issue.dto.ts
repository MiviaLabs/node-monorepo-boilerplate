import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ISSUE_PRIORITY_ENUM, ISSUE_STATUS_ENUM } from '@package/db-core';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min
} from 'class-validator';

export class CreateIssueDto {
  @ApiProperty({ example: 'Restore standalone issue details page' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @Matches(/\S/, { message: 'title must not be blank' })
  declare title: string;

  @ApiPropertyOptional({
    example: 'Bring back the previous issue details route on the canonical issues page.'
  })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  declare descriptionMarkdown?: string;

  @ApiPropertyOptional({ enum: ISSUE_STATUS_ENUM, example: 'backlog' })
  @IsOptional()
  @IsEnum(ISSUE_STATUS_ENUM)
  declare status?: (typeof ISSUE_STATUS_ENUM)[number];

  @ApiPropertyOptional({ enum: ISSUE_PRIORITY_ENUM, example: 'medium' })
  @IsOptional()
  @IsEnum(ISSUE_PRIORITY_ENUM)
  declare priority?: (typeof ISSUE_PRIORITY_ENUM)[number];

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare projectId?: number;

  @ApiPropertyOptional({ example: 77 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare parentIssueId?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  declare position?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  declare estimate?: number | null;

  @ApiPropertyOptional({ example: '2026-03-29T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  declare dueAt?: string | null;
}
