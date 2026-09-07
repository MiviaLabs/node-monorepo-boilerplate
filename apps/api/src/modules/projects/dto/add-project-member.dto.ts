import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AddProjectMemberDto {
  @ApiProperty({
    example: 42,
    description: 'Organization member user ID to assign to the project'
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare userId: number;
}
