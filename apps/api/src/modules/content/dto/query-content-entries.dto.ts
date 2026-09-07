import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { CONTENT_SLUG_MAX_LENGTH } from '../utils/content-slug.util';

export const enum ContentQueryScope {
  ORGANIZATION = 'organization',
  PROJECT = 'project'
}

export class QueryContentEntriesDto {
  @ApiPropertyOptional({
    example: 'organization',
    enum: [ContentQueryScope.ORGANIZATION, ContentQueryScope.PROJECT],
    description: 'Explicit content scope filter'
  })
  @IsOptional()
  @IsIn([ContentQueryScope.ORGANIZATION, ContentQueryScope.PROJECT])
  declare scope?: ContentQueryScope;

  @ApiPropertyOptional({ example: 12, description: 'Project scope filter' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare projectId?: number;

  @ApiPropertyOptional({ example: 34, description: 'Optional parent id filter' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare parentId?: number;

  @ApiPropertyOptional({ example: 'getting-started', description: 'Slug lookup within scope' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(CONTENT_SLUG_MAX_LENGTH)
  declare slug?: string;
}
