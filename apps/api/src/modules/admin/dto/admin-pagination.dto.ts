import { ApiProperty } from '@nestjs/swagger';

export class AdminPaginationDto {
  @ApiProperty({ example: 1 })
  declare page: number;

  @ApiProperty({ example: 20 })
  declare pageSize: number;

  @ApiProperty({ example: 87 })
  declare total: number;

  @ApiProperty({ example: 5 })
  declare totalPages: number;

  @ApiProperty({ example: true })
  declare hasNext: boolean;

  @ApiProperty({ example: false })
  declare hasPrevious: boolean;
}
