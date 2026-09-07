import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

import { PROJECT_VISIBILITY } from '../types/project.types';

export const enum ProjectSortBy {
  Name = 'name',
  CreatedAt = 'createdAt',
  UpdatedAt = 'updatedAt',
  Visibility = 'visibility'
}

export const enum ProjectSortOrder {
  Asc = 'asc',
  Desc = 'desc'
}

export const PROJECT_SORT_BY_VALUES = [
  ProjectSortBy.Name,
  ProjectSortBy.CreatedAt,
  ProjectSortBy.UpdatedAt,
  ProjectSortBy.Visibility
] as const;
export const PROJECT_SORT_ORDER_VALUES = [ProjectSortOrder.Asc, ProjectSortOrder.Desc] as const;

export class QueryProjectsDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  declare page?: number;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  declare pageSize?: number;

  @ApiPropertyOptional({ example: 'atlas' })
  @IsOptional()
  @IsString()
  declare search?: string;

  @ApiPropertyOptional({ enum: Object.values(PROJECT_VISIBILITY) })
  @IsOptional()
  @IsEnum(PROJECT_VISIBILITY)
  declare visibility?: (typeof PROJECT_VISIBILITY)[keyof typeof PROJECT_VISIBILITY];

  @ApiPropertyOptional({ enum: PROJECT_SORT_BY_VALUES, default: 'updatedAt' })
  @IsOptional()
  @IsEnum(PROJECT_SORT_BY_VALUES)
  declare sortBy?: ProjectSortBy;

  @ApiPropertyOptional({ enum: PROJECT_SORT_ORDER_VALUES, default: 'desc' })
  @IsOptional()
  @IsEnum(PROJECT_SORT_ORDER_VALUES)
  declare sortOrder?: ProjectSortOrder;
}
