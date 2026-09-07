/**
 * Unit Tests for HealthResponseDto
 *
 * Tests health response DTO factory methods and data structure.
 */

import { HealthStatus } from '../../health.constants';
import { HealthResponseDto } from '../health-response.dto';

import type { HealthData } from '../health-response.dto';

describe('HealthResponseDto', () => {
  describe('healthy', () => {
    it('should create a healthy response with all required fields', () => {
      // Arrange
      const message = 'API is healthy';
      const version = '1.0.0';
      const details = {
        database: { status: 'up' },
        redis: { status: 'up' }
      };

      // Act
      const result = HealthResponseDto.healthy(message, version, details);

      // Assert
      expect(result).toBeInstanceOf(HealthResponseDto);
      expect(result.data).toEqual({
        status: HealthStatus.Ok,
        message,
        version,
        timestamp: expect.any(String),
        details
      });
      expect(result.metadata).toEqual({
        timestamp: expect.any(String)
      });
    });

    it('should create a healthy response without details', () => {
      // Arrange
      const message = 'API is healthy';
      const version = '2.5.0';

      // Act
      const result = HealthResponseDto.healthy(message, version);

      // Assert
      expect(result.data.status).toBe(HealthStatus.Ok);
      expect(result.data.message).toBe(message);
      expect(result.data.version).toBe(version);
      expect(result.data.details).toBeUndefined();
    });

    it('should include valid ISO timestamp', () => {
      // Arrange
      const before = new Date();
      const result = HealthResponseDto.healthy('OK', '1.0.0');
      const after = new Date();

      // Act
      const timestamp = new Date(result.data.timestamp);

      // Assert
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(result.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include timestamp in metadata', () => {
      // Arrange & Act
      const result = HealthResponseDto.healthy('OK', '1.0.0');

      // Assert
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('unhealthy', () => {
    it('should create an unhealthy response with all required fields', () => {
      // Arrange
      const message = 'Database connection failed';
      const details = {
        database: { status: 'down', message: 'Connection refused' },
        redis: { status: 'up' }
      };
      const version = '1.0.0';

      // Act
      const result = HealthResponseDto.unhealthy(message, details, version);

      // Assert
      expect(result).toBeInstanceOf(HealthResponseDto);
      expect(result.data).toEqual({
        status: HealthStatus.Error,
        message,
        version,
        timestamp: expect.any(String),
        details
      });
    });

    it('should default version to unknown when not provided', () => {
      // Arrange
      const message = 'Service unavailable';

      // Act
      const result = HealthResponseDto.unhealthy(message);

      // Assert
      expect(result.data.version).toBe('unknown');
    });

    it('should create an unhealthy response without details', () => {
      // Arrange
      const message = 'Critical error';

      // Act
      const result = HealthResponseDto.unhealthy(message);

      // Assert
      expect(result.data.status).toBe(HealthStatus.Error);
      expect(result.data.message).toBe(message);
      expect(result.data.details).toBeUndefined();
    });

    it('should include valid ISO timestamp', () => {
      // Arrange
      const before = new Date();
      const result = HealthResponseDto.unhealthy('Error');
      const after = new Date();

      // Act
      const timestamp = new Date(result.data.timestamp);

      // Assert
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('fromData', () => {
    it('should create response from health data', () => {
      // Arrange
      const data: HealthData = {
        status: HealthStatus.Ok,
        message: 'All systems operational',
        version: '3.2.1',
        timestamp: '2024-01-15T10:30:00.000Z',
        details: {
          database: { status: 'up' }
        }
      };

      // Act
      const result = HealthResponseDto.fromData(data);

      // Assert
      expect(result).toBeInstanceOf(HealthResponseDto);
      expect(result.data).toEqual(data);
      expect(result.metadata).toEqual({
        timestamp: data.timestamp
      });
    });

    it('should handle minimal health data', () => {
      // Arrange
      const data: HealthData = {
        status: HealthStatus.Error,
        message: 'System down',
        version: '1.0.0',
        timestamp: '2024-01-15T10:30:00.000Z'
      };

      // Act
      const result = HealthResponseDto.fromData(data);

      // Assert
      expect(result.data).toEqual(data);
      expect(result.data.details).toBeUndefined();
    });
  });

  describe('BaseResponseDto integration', () => {
    it('should extend BaseResponseDto with proper typing', () => {
      // Arrange
      const result = HealthResponseDto.healthy('OK', '1.0.0');

      // Assert
      expect(result.data).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(typeof result.data).toBe('object');
      expect(typeof result.metadata).toBe('object');
    });

    it('should handle complex details structure', () => {
      // Arrange
      const details = {
        database: {
          status: 'up',
          details: {
            latency: 5,
            connections: 10
          }
        },
        redis: {
          status: 'degraded',
          message: 'High memory usage',
          details: {
            memory: '85%',
            keys: 150000
          }
        }
      };

      // Act
      const result = HealthResponseDto.healthy('OK', '1.0.0', details);

      // Assert
      expect(result.data.details).toEqual(details);
    });
  });
});
