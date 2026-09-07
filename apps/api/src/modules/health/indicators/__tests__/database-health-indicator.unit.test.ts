/**
 * DatabaseHealthIndicator Unit Tests
 *
 * Tests the DatabaseHealthIndicator health check functionality.
 * Mocks the PostgreSQL Pool to simulate successful and failed queries.
 */

import { Test } from '@nestjs/testing';

import { IndicatorStatus } from '../../health.constants';
import { DatabaseHealthIndicator } from '../../indicators/database-health-indicator';

import type { TestingModule } from '@nestjs/testing';
import type { Pool } from 'pg';

import { DATABASE_PROVIDER } from '@/common/database/database.constants';

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(async () => {
    // Create a mock pool
    mockPool = {
      query: jest.fn()
    } as unknown as jest.Mocked<Pool>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthIndicator,
        {
          provide: DATABASE_PROVIDER,
          useValue: { pool: mockPool }
        }
      ]
    }).compile();

    indicator = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return status UP when database query succeeds', async () => {
      // Arrange
      mockPool.query.mockResolvedValueOnce({ rows: [{ result: 1 }] } as never);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Up);
      expect(result.message).toBeUndefined();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT 1 as result');
    });

    it('should return status DOWN with message when database query fails', async () => {
      // Arrange
      const errorMessage = 'Connection refused';
      mockPool.query.mockRejectedValueOnce(new Error(errorMessage) as never);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe(errorMessage);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should return status DOWN when query returns unexpected result', async () => {
      // Arrange
      mockPool.query.mockResolvedValueOnce({ rows: [{ result: 2 }] } as never);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Database query returned unexpected result');
    });

    it('should return status DOWN when query returns no rows', async () => {
      // Arrange
      mockPool.query.mockResolvedValueOnce({ rows: [] } as never);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Database query returned unexpected result');
    });

    it('should return status DOWN with generic message for unknown errors', async () => {
      // Arrange
      mockPool.query.mockRejectedValueOnce('string error' as never);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Unknown database error');
    });

    it('should return status DOWN when error has no message property', async () => {
      // Arrange
      const errorWithoutMessage = { code: 'ECONNREFUSED' };
      mockPool.query.mockRejectedValueOnce(errorWithoutMessage as never);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Unknown database error');
    });
  });
});
