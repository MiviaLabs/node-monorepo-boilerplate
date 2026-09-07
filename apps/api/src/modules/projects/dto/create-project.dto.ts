import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { PROJECT_VISIBILITY } from '../types/project.types';

/**
 * DTO for creating a new project
 */
export class CreateProjectDto {
  @ApiProperty({
    example: 'My Project',
    description: 'Project name'
  })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/\S/, { message: 'name must not be blank' })
  declare name: string;

  @ApiProperty({
    example: PROJECT_VISIBILITY.PUBLIC,
    description: 'Project visibility within the organization'
  })
  @IsString()
  @IsIn(Object.values(PROJECT_VISIBILITY))
  declare visibility: (typeof PROJECT_VISIBILITY)[keyof typeof PROJECT_VISIBILITY];
}
