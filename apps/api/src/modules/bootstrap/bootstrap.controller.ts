import { Body, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { BootstrapService } from './bootstrap.service';
import { Public } from '../auth/guards';
import { BootstrapInstallDto } from './dto/bootstrap-install.dto';
import {
  BootstrapInstallDto as BootstrapInstallResultDto,
  BootstrapStatusDto
} from './dto/bootstrap-response.dto';

import { VersionedController } from '@/common/decorators/version-controller.decorator';

@ApiTags('Setup')
@VersionedController('v1', 'setup')
export class SetupController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Public()
  @Throttle({ bootstrapStatus: {} })
  @Get('status')
  @ApiOperation({
    summary: 'Evaluate initial platform onboarding eligibility',
    description:
      'Reports non-sensitive initialization flags indicating whether an administrative system owner can be provisioned.'
  })
  @ApiResponse({ status: 200, type: BootstrapStatusDto })
  async getStatus(): Promise<BootstrapStatusDto> {
    return this.bootstrapService.getStatus();
  }

  @Public()
  @Throttle({ bootstrapInstall: {} })
  @Post('install')
  @ApiOperation({
    summary: 'Initialize primary platform administrator',
    description:
      'Executes the single-use bootstrap sequence to establish the root system administrator before lock-out.'
  })
  @ApiResponse({ status: 201, type: BootstrapInstallResultDto })
  async install(@Body() dto: BootstrapInstallDto): Promise<BootstrapInstallResultDto> {
    return this.bootstrapService.install(dto);
  }
}
