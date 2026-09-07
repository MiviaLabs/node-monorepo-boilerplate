import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateIssueCommentDto {
  @ApiProperty({ example: 'Need API payload confirmation before merge.' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(/\S/, { message: 'bodyMarkdown must not be blank' })
  declare bodyMarkdown: string;

  @ApiPropertyOptional({ example: 11 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  declare parentCommentId?: number;
}
