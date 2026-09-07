import { ApiProperty } from '@nestjs/swagger';

export class BootstrapStatusDto {
  @ApiProperty({ example: false })
  initialized!: boolean;

  @ApiProperty({ example: false })
  systemOwnerExists!: boolean;

  @ApiProperty({ example: true })
  installAllowed!: boolean;
}

export class BootstrapInstallDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: true })
  requiresLogin!: boolean;
}
