import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

import { CONTENT_SLUG_MAX_LENGTH } from '../utils/content-slug.util';

export class CreateContentEntryDto {
  @ApiProperty({ example: 'Getting Started', description: 'Content entry title' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @Matches(/\S/, { message: 'title must not be blank' })
  declare title: string;

  @ApiProperty({
    example: '# Getting Started',
    description: 'Raw Markdown body stored for the content entry'
  })
  @IsString()
  @Matches(/\S/, { message: 'contentMarkdown must not be blank' })
  declare contentMarkdown: string;

  @ApiPropertyOptional({ example: 'getting-started', description: 'Explicit slug override' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_SLUG_MAX_LENGTH)
  @Matches(/\S/, { message: 'slug must not be blank' })
  declare slug?: string;

  @ApiPropertyOptional({ example: 12, description: 'Project scope for the content entry' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare projectId?: number;

  @ApiPropertyOptional({ example: 34, description: 'Optional parent entry id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare parentId?: number;

  @ApiPropertyOptional({ example: 0, description: 'Zero-based sibling position override' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  declare position?: number;
}
