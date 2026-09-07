import { Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Action, Resource } from '@package/opa';

import { HealthResponseDto } from '../dto/health-response.dto';
import { HealthService } from '../services/health.service';

import { OPA_ACTIONS, OPA_RESOURCES } from '@/common/constants';
import { VersionedController } from '@/common/decorators/version-controller.decorator';
import { ApiVersion } from '@/common/decorators/version.decorator';
import { HybridPolicyGuard, JwtAuthGuard } from '@/modules/auth/guards';
import { Public } from '@/modules/auth/guards/public.decorator';

/**
 * Health Controller
 *
 * This controller demonstrates proper use of version decorators.
 *
 * The health check endpoint uses @VersionedController to set the version prefix,
 * and @ApiVersion to specify which semantic versions are supported.
 *
 * @example
 * GET /api/v1/health - Returns health status for API version v1
 *
 * The health response includes:
 * - status: Overall health status (ok/error)
 * - version: Semantic version from VersionService
 * - timestamp: ISO timestamp of the check
 * - details: Optional health indicator results
 */
@ApiTags('health')
@VersionedController('v1', 'ops/health')
@ApiVersion('1.0')
export class OpsHealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Verify service health and runtime status',
    description:
      'Provides operational vitality indicators alongside semantic version telemetry from the runtime version manager.'
  })
  @ApiOkResponse({
    description: 'Service operational status paired with semantic build identifiers',
    type: HealthResponseDto
  })
  @HttpCode(HttpStatus.OK)
  async health(): Promise<HealthResponseDto> {
    return this.healthService.getHealth();
  }

  /**
   * Liveness probe endpoint
   *
   * Kubernetes liveness probe: Checks if the application is running.
   * Returns 200 if the app is alive, regardless of dependency health.
   * Used by Kubernetes to detect deadlocks and restart the container.
   *
   * @example
   * GET /api/v1/health/live
   *
   * Response: { status: 'ok' }
   */
  @Get('live')
  @Public()
  @ApiOperation({
    summary: 'Kubernetes container liveness probe',
    description:
      'Verifies the application process is alive and executing, uncoupled from auxiliary downstream dependencies.'
  })
  @ApiOkResponse({
    description: 'Process execution heartbeat confirmation',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' }
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  liveness(): { status: string } {
    // Liveness probe: Just check if the app is running
    // No dependency checks - those are for readiness probe
    return { status: 'ok' };
  }

  /**
   * Readiness probe endpoint
   *
   * Kubernetes readiness probe: Checks if the application is ready to serve traffic.
   * Returns 200 if all critical dependencies (database, redis) are healthy.
   * Used by Kubernetes to remove pods from service when not ready.
   *
   * @example
   * GET /api/v1/health/ready
   *
   * Response: { status: 'ok', details: { database: { status: 'up' }, redis: { status: 'up' } } }
   */
  @Get('ready')
  @Public()
  @ApiOperation({
    summary: 'Kubernetes dependency readiness probe',
    description:
      'Validates that upstream and downstream dependencies such as database clusters and cache nodes are available to accept traffic.'
  })
  @ApiOkResponse({
    description: 'Traffic readiness state including granular subsystem evaluations',
    type: HealthResponseDto
  })
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<HealthResponseDto> {
    return this.healthService.getReadiness();
  }

  /**
   * Startup probe endpoint
   *
   * Kubernetes startup probe: Checks if the application has started.
   * Similar to readiness but used during initial startup to give slow-starting apps time.
   *
   * @example
   * GET /api/v1/health/startup
   *
   * Response: { status: 'ok' }
   */
  @Get('startup')
  @Public()
  @ApiOperation({
    summary: 'Kubernetes application startup probe',
    description:
      'Confirms that bootstrap routines, data layer migrations, and service initializers have completed before serving traffic.'
  })
  @ApiOkResponse({
    description: 'Initialization lifecycle status',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        started: { type: 'boolean', example: true }
      }
    }
  })
  @HttpCode(HttpStatus.OK)
  startup(): { status: string; started: boolean } {
    // Startup probe: Check if app has initialized
    // This would check things like:
    // - Database migrations applied
    // - Cache warmed up
    // - Initial data loaded
    return { status: 'ok', started: true };
  }

  /**
   * Protected health endpoint
   *
   * Tests: JWT authentication
   * Used in E2E tests to verify JWT authentication is working.
   * Returns same health data but requires valid JWT token.
   */
  @Get('iam')
  @UseGuards(JwtAuthGuard, HybridPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Authenticated operational health probe',
    description:
      'Validates health status requiring valid bearer token authorization, exercising security pipelines for end-to-end verification.'
  })
  @ApiOkResponse({
    description: 'Authenticated health overview report',
    type: HealthResponseDto
  })
  @Resource({ type: OPA_RESOURCES.SYSTEM_MONITOR, scope: 'system' })
  @Action(OPA_ACTIONS.READ)
  @HttpCode(HttpStatus.OK)
  async healthAuth(): Promise<HealthResponseDto> {
    return this.healthService.getHealth();
  }
}
