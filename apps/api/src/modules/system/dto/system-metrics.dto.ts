import { ApiProperty } from '@nestjs/swagger';

/**
 * Tenant statistics
 */
export class TenantStatsDto {
  @ApiProperty({
    description: 'Total number of tenants',
    example: 10
  })
  declare total: number;

  @ApiProperty({
    description: 'Number of active tenants',
    example: 8
  })
  declare active: number;

  @ApiProperty({
    description: 'Number of suspended tenants',
    example: 2
  })
  declare suspended: number;
}

/**
 * User statistics
 */
export class UserStatsDto {
  @ApiProperty({
    description: 'Total number of users',
    example: 150
  })
  declare total: number;

  @ApiProperty({
    description: 'Number of active users',
    example: 142
  })
  declare active: number;

  @ApiProperty({
    description: 'Number of inactive users',
    example: 8
  })
  declare inactive: number;
}

/**
 * Request statistics
 */
export class RequestStatsDto {
  @ApiProperty({
    description: 'Total number of requests',
    example: 15000
  })
  declare total: number;

  @ApiProperty({
    description: 'Requests per minute',
    example: 250
  })
  declare perMinute: number;
}

/**
 * DTO for system metrics response
 *
 * Contains system-wide monitoring and usage statistics.
 */
export class SystemMetricsDto {
  @ApiProperty({
    description: 'Metrics collection timestamp',
    example: '2024-01-01T12:00:00.000Z'
  })
  declare timestamp: string;

  @ApiProperty({
    description: 'Server uptime in seconds',
    example: 86400
  })
  declare uptime: number;

  declare memory: NodeJS.MemoryUsage;

  @ApiProperty({
    description: 'Tenant statistics',
    type: TenantStatsDto
  })
  declare tenants: TenantStatsDto;

  @ApiProperty({
    description: 'User statistics',
    type: UserStatsDto
  })
  declare users: UserStatsDto;

  @ApiProperty({
    description: 'Request statistics',
    type: RequestStatsDto
  })
  declare requests: RequestStatsDto;
}
