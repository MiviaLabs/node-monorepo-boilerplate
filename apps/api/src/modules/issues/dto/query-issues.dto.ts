import { ApiPropertyOptional } from '@nestjs/swagger';
import { ISSUE_PRIORITY_ENUM, ISSUE_STATUS_ENUM } from '@package/db-core';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const ISSUE_SORT_BY_VALUES = [
  'updatedAt',
  'createdAt',
  'priority',
  'dueAt',
  'position'
] as const;
export const ISSUE_SORT_ORDER_VALUES = ['asc', 'desc'] as const;

export type IssueSortBy = (typeof ISSUE_SORT_BY_VALUES)[number];
export type IssueSortOrder = (typeof ISSUE_SORT_ORDER_VALUES)[number];

export class QueryIssuesDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare pageSize?: number;

  @ApiPropertyOptional({ example: 12, description: 'Restrict issues to one project' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare projectId?: number;

  @ApiPropertyOptional({ example: 3, description: 'Restrict issues to one label' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare labelId?: number;

  @ApiPropertyOptional({ example: 9, description: 'Restrict issues to one assignee user id' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare assigneeUserId?: number;

  @ApiPropertyOptional({
    example: 9,
    description: 'Restrict issues to one explicit watcher user id'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare watcherUserId?: number;

  @ApiPropertyOptional({
    example: 9,
    description: 'Restrict issues to those with activity authored by one user'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare activityActorUserId?: number;

  @ApiPropertyOptional({ example: 'Onboarding' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  declare search?: string;

  @ApiPropertyOptional({ enum: ISSUE_STATUS_ENUM })
  @IsOptional()
  @IsEnum(ISSUE_STATUS_ENUM)
  declare status?: (typeof ISSUE_STATUS_ENUM)[number];

  @ApiPropertyOptional({ enum: ISSUE_PRIORITY_ENUM })
  @IsOptional()
  @IsEnum(ISSUE_PRIORITY_ENUM)
  declare priority?: (typeof ISSUE_PRIORITY_ENUM)[number];

  @ApiPropertyOptional({ enum: ISSUE_SORT_BY_VALUES, example: 'updatedAt' })
  @IsOptional()
  @IsEnum(ISSUE_SORT_BY_VALUES)
  declare sortBy?: IssueSortBy;

  @ApiPropertyOptional({ enum: ISSUE_SORT_ORDER_VALUES, example: 'desc' })
  @IsOptional()
  @IsEnum(ISSUE_SORT_ORDER_VALUES)
  declare sortOrder?: IssueSortOrder;
}
