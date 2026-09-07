import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';

import { IndicatorStatus } from '../health.constants';
import { HealthIndicator, HealthIndicatorResult } from './health-indicator.interface';

import { DATABASE_PROVIDER } from '@/common/database/database.constants';

/**
 * Database Health Indicator
 *
 * Checks PostgreSQL database connectivity by running a simple query.
 * Uses the connection pool from DATABASE_PROVIDER.
 */
@Injectable()
export class DatabaseHealthIndicator implements HealthIndicator {
  constructor(@Inject(DATABASE_PROVIDER) private readonly databaseConnection: { pool: Pool }) {}

  /**
   * Check database connectivity
   *
   * Runs a simple SELECT 1 query to verify the database is reachable.
   *
   * @returns Promise resolving to health indicator result
   */
  async check(): Promise<HealthIndicatorResult> {
    try {
      const result = await this.databaseConnection.pool.query('SELECT 1 as result');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (result.rows[0]?.result === 1) {
        return { status: IndicatorStatus.Up };
      }

      return {
        status: IndicatorStatus.Down,
        message: 'Database query returned unexpected result'
      };
    } catch (error) {
      return {
        status: IndicatorStatus.Down,
        message: error instanceof Error ? error.message : 'Unknown database error'
      };
    }
  }
}
