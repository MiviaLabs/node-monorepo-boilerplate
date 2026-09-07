import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class UpdateMyAvatarDto {
  @ApiProperty({
    description: 'Ready storage file id to attach as the current user avatar',
    example: 101
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? Number.parseInt(value, 10) : value
  )
  @IsInt()
  @Min(1)
  declare fileId: number;
}
