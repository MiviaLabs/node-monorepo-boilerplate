import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { AppService } from './app.service';

import { Public } from '@/modules/auth/guards/public.decorator';

/**
 * Root application controller
 * Provides basic health/status endpoints
 */
@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Retrieve application status',
    description: 'Returns top-level service liveness and localized greeting message.'
  })
  getStatus(): { status: string; message: string } {
    return this.appService.getStatus();
  }
}
