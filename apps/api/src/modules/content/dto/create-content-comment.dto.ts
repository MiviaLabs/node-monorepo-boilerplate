import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateContentCommentDto {
  @ApiProperty({ example: 'Looks good. We should add a rollout note here.' })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  @Matches(/\S/, { message: 'bodyMarkdown should not be empty' })
  declare bodyMarkdown: string;
}
