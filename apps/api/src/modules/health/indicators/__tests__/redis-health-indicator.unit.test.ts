/**
 * Unit Tests for RedisHealthIndicator
 *
 * Tests the RedisHealthIndicator health check functionality.
 * Mocks RedisModule to simulate successful and failed health checks.
 */

import { RedisModule } from '@package/redis';

import { IndicatorStatus } from '../../health.constants';
import { RedisHealthIndicator } from '../../indicators/redis-health-indicator';

jest.mock('@package/redis');

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let mockHealthCheck: jest.MockedFunction<typeof RedisModule.healthCheck>;

  beforeEach(() => {
    mockHealthCheck = RedisModule.healthCheck as jest.MockedFunction<
      typeof RedisModule.healthCheck
    >;
    indicator = new RedisHealthIndicator();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    it('should return status UP when Redis health check succeeds', async () => {
      // Arrange
      mockHealthCheck.mockResolvedValueOnce(true);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Up);
      expect(result.message).toBeUndefined();
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });

    it('should return status DOWN when Redis health check returns false', async () => {
      // Arrange
      mockHealthCheck.mockResolvedValueOnce(false);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Redis connection failed');
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });

    it('should return status DOWN with error message when health check throws', async () => {
      // Arrange
      const errorMessage = 'Connection refused: ECONNREFUSED';
      mockHealthCheck.mockRejectedValueOnce(new Error(errorMessage));

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe(errorMessage);
      expect(mockHealthCheck).toHaveBeenCalledTimes(1);
    });

    it('should return status DOWN with generic message for non-error throws', async () => {
      // Arrange
      mockHealthCheck.mockRejectedValueOnce('string error');

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Unknown Redis error');
    });

    it('should return status DOWN when error has no message property', async () => {
      // Arrange
      const errorWithoutMessage = { code: 'ECONNREFUSED' };
      mockHealthCheck.mockRejectedValueOnce(errorWithoutMessage);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Unknown Redis error');
    });

    it('should handle timeout errors', async () => {
      // Arrange
      const timeoutError = new Error('Redis connection timeout');
      timeoutError.name = 'TimeoutError';
      mockHealthCheck.mockRejectedValueOnce(timeoutError);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('Redis connection timeout');
    });

    it('should handle authentication errors', async () => {
      // Arrange
      const authError = new Error('NOAUTH Authentication required');
      mockHealthCheck.mockRejectedValueOnce(authError);

      // Act
      const result = await indicator.check();

      // Assert
      expect(result.status).toBe(IndicatorStatus.Down);
      expect(result.message).toBe('NOAUTH Authentication required');
    });

    describe('edge cases', () => {
      it('should handle multiple consecutive checks', async () => {
        // Arrange
        mockHealthCheck
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(true)
          .mockRejectedValueOnce(new Error('Third check failed'));

        // Act
        const result1 = await indicator.check();
        const result2 = await indicator.check();
        const result3 = await indicator.check();

        // Assert
        expect(result1.status).toBe(IndicatorStatus.Up);
        expect(result2.status).toBe(IndicatorStatus.Up);
        expect(result3.status).toBe(IndicatorStatus.Down);
        expect(mockHealthCheck).toHaveBeenCalledTimes(3);
      });

      it('should handle null return from healthCheck', async () => {
        // Arrange
        mockHealthCheck.mockResolvedValueOnce(null as unknown as boolean);

        // Act
        const result = await indicator.check();

        // Assert - null is falsy, should return down
        expect(result.status).toBe(IndicatorStatus.Down);
        expect(result.message).toBe('Redis connection failed');
      });

      it('should handle undefined return from healthCheck', async () => {
        // Arrange
        mockHealthCheck.mockResolvedValueOnce(undefined as unknown as boolean);

        // Act
        const result = await indicator.check();

        // Assert - undefined is falsy, should return down
        expect(result.status).toBe(IndicatorStatus.Down);
        expect(result.message).toBe('Redis connection failed');
      });
    });
  });
});
