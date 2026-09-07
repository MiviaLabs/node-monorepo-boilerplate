/**
 * Health E2E Tests
 *
 * Tests the health check endpoint with real database connection.
 * Validates the monitoring endpoint that external systems depend on.
 */

import { IndicatorStatus } from '../../../src/modules/health/health.constants';
import { DatabaseHealthIndicator } from '../../../src/modules/health/indicators/database-health-indicator';
import { startTestServer } from '../../helpers/bootstrap';
import { setupE2ETestDatabaseJest } from '../../helpers/database';

import type { HealthStatus } from '../../../src/modules/health/health.constants';
import type { TestServer } from '../../helpers/bootstrap';

/**
 * Type guard for health response data
 */
function isHealthResponseData(data: unknown): data is HealthResponseData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    'message' in data &&
    'version' in data &&
    'timestamp' in data
  );
}

interface HealthResponseData {
  status: HealthStatus;
  message: string;
  version: string;
  timestamp: string;
  details?: Record<
    string,
    {
      status: IndicatorStatus;
      message?: string;
    }
  >;
}

describe('Health E2E Tests', () => {
  let server: TestServer;

  beforeAll(async () => {
    // CRITICAL: Setup test database FIRST
    await setupE2ETestDatabaseJest();

    // CRITICAL: Start server SECOND
    server = await startTestServer();
  });

  afterAll(async () => {
    await server?.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return healthy status when database is up', async () => {
      // Act
      const response = await server.request({
        method: 'GET',
        url: '/v1/ops/health'
      });

      // Assert
      expect(response.status).toBe(200);
      expect(isHealthResponseData(response.body.data)).toBe(true);

      const data = response.body.data as HealthResponseData;

      // Validate core health fields
      expect(data.status).toBe('ok');
      expect(typeof data.message).toBe('string');
      expect(data.message.length).toBeGreaterThan(0);

      // Validate version is a semantic version string
      expect(data.version).toMatch(/^\d+\.\d+\.\d+$/);

      // Validate timestamp is ISO 8601
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);

      // Validate database health indicator is up
      expect(data.details).toBeDefined();
      expect(data.details?.['database']).toBeDefined();
      expect(data.details?.['database']?.status).toBe('up');
    });

    it('should return error status when database is down', async () => {
      // Arrange - Mock DatabaseHealthIndicator to simulate database failure
      const databaseHealthIndicator =
        server.app.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);

      const originalCheck = databaseHealthIndicator.check;
      jest.spyOn(databaseHealthIndicator, 'check').mockResolvedValueOnce({
        status: IndicatorStatus.Down,
        message: 'Connection refused'
      });

      try {
        // Act
        const response = await server.request({
          method: 'GET',
          url: '/v1/ops/health'
        });

        // Assert
        expect(response.status).toBe(200);
        expect(isHealthResponseData(response.body.data)).toBe(true);

        const data = response.body.data as HealthResponseData;

        // Health endpoint still returns 200, but status is "error"
        expect(data.status).toBe('error');

        // Validate database indicator reports down
        expect(data.details?.['database']).toBeDefined();
        expect(data.details?.['database']?.status).toBe('down');
        expect(data.details?.['database']?.message).toBe('Connection refused');
      } finally {
        // Restore original method
        databaseHealthIndicator.check = originalCheck;
      }
    });
  });
});
