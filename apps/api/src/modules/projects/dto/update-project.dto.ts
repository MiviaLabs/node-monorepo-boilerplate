import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { PROJECT_VISIBILITY } from '../types/project.types';

/**
 * DTO for updating an existing project
 */
export class UpdateProjectDto {
  @ApiProperty({
    example: 'Updated Project Name',
    description: 'Project name',
    required: false
  })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'name must not be blank' })
  declare name?: string;

  @ApiProperty({
    example: PROJECT_VISIBILITY.PRIVATE,
    description: 'Project visibility within the organization',
    required: false
  })
  @IsString()
  @IsOptional()
  @IsIn(Object.values(PROJECT_VISIBILITY))
  declare visibility?: (typeof PROJECT_VISIBILITY)[keyof typeof PROJECT_VISIBILITY];
}
