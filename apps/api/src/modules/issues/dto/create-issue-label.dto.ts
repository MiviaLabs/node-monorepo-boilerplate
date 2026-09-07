import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsHexColor, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateIssueLabelDto {
  @ApiProperty({ example: 'Frontend' })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(64)
  declare name: string;

  @ApiPropertyOptional({ example: '#38bdf8', nullable: true })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsHexColor()
  declare color?: string;

  @ApiPropertyOptional({ example: 'Touches UI and browser-side behavior.', nullable: true })
  @Transform(({ value }: { value: string }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  declare description?: string;
}
