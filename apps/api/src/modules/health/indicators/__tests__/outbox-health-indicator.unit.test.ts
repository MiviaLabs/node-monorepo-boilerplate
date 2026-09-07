/**
 * Unit Tests for OutboxHealthIndicator
 *
 * Tests the OutboxHealthIndicator health check functionality.
 * Mocks OutboxPollerService to simulate different health states.
 */

import { IndicatorStatus } from '../../health.constants';
import { OutboxHealthIndicator } from '../../indicators/outbox-health-indicator';

import type { OutboxPollerService } from '@package/events';

describe('OutboxHealthIndicator', () => {
  let indicator: OutboxHealthIndicator;
  let mockOutboxPoller: jest.Mocked<OutboxPollerService>;

  beforeEach(() => {
    mockOutboxPoller = {
      getHealth: jest.fn()
    } as unknown as jest.Mocked<OutboxPollerService>;

    indicator = new OutboxHealthIndicator(mockOutboxPoller);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('check', () => {
    describe('healthy status', () => {
      it('should return status UP when no failed events and low pending count', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 5,
          failedCount: 0,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Up);
        expect(result.message).toBeUndefined();
        expect(result.details).toEqual({
          pendingCount: 5,
          failedCount: 0,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });
      });

      it('should return status UP with no events', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 0,
          failedCount: 0,
          isProcessing: false,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Up);
        expect(result.message).toBeUndefined();
      });

      it('should return status UP when pending is just below threshold', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 99,
          failedCount: 0,
          isProcessing: true,
          workerId: 'worker-2',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Up);
      });
    });

    describe('degraded status', () => {
      it('should return DEGRADED with failed events message when failedCount > 0', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 5,
          failedCount: 3,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Degraded);
        expect(result.message).toBe('3 failed events');
        expect(result.details?.['failedCount']).toBe(3);
      });

      it('should return DEGRADED with pending events message at threshold', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 100,
          failedCount: 0,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Degraded);
        expect(result.message).toBe('100 pending events');
        expect(result.details?.['pendingCount']).toBe(100);
      });

      it('should return DEGRADED with pending events message above threshold', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 150,
          failedCount: 0,
          isProcessing: true,
          workerId: 'worker-2',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Degraded);
        expect(result.message).toBe('150 pending events');
      });

      it('should show failed events message when both failed and pending are high', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 120,
          failedCount: 5,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Degraded);
        expect(result.message).toBe('5 failed events');
      });
    });

    describe('down status', () => {
      it('should return DOWN when failed count meets threshold', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 50,
          failedCount: 10,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Down);
        expect(result.message).toBe('Too many failed events (10)');
        expect(result.details?.['failedCount']).toBe(10);
      });

      it('should return DOWN when failed count exceeds threshold', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 200,
          failedCount: 25,
          isProcessing: false,
          workerId: 'worker-2',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Down);
        expect(result.message).toBe('Too many failed events (25)');
      });

      it('should include all details in DOWN status', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 500,
          failedCount: 50,
          isProcessing: false,
          workerId: 'worker-3',
          enabled: false,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Down);
        expect(result.details).toEqual({
          pendingCount: 500,
          failedCount: 50,
          isProcessing: false,
          workerId: 'worker-3',
          enabled: false,
          eventsEnabled: false
        });
      });
    });

    describe('details structure', () => {
      it('should include all health properties in details', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 10,
          failedCount: 0,
          isProcessing: true,
          workerId: 'worker-abc',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.details).toBeDefined();
        expect(result.details?.['pendingCount']).toBe(10);
        expect(result.details?.['failedCount']).toBe(0);
        expect(result.details?.['isProcessing']).toBe(true);
        expect(result.details?.['workerId']).toBe('worker-abc');
        expect(result.details?.['enabled']).toBe(true);
      });

      it('should handle disabled outbox poller', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 0,
          failedCount: 0,
          isProcessing: false,
          workerId: 'none',
          enabled: false,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Up);
        expect(result.details?.['enabled']).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle single failed event', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 0,
          failedCount: 1,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Degraded);
        expect(result.message).toBe('1 failed events');
      });

      it('should handle boundary at FAILED_THRESHOLD - 1', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 0,
          failedCount: 9,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Degraded);
      });

      it('should handle boundary at PENDING_THRESHOLD - 1', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 99,
          failedCount: 0,
          isProcessing: true,
          workerId: 'worker-1',
          enabled: true,
          eventsEnabled: false
        });

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Up);
      });

      it('should handle missing workerId', async () => {
        // Arrange
        mockOutboxPoller.getHealth.mockResolvedValueOnce({
          pendingCount: 0,
          failedCount: 0,
          isProcessing: false,
          workerId: '',
          enabled: true,
          eventsEnabled: false
        } as never);

        // Act
        const result = await indicator.check();

        // Assert
        expect(result.status).toBe(IndicatorStatus.Up);
        expect(result.details?.['workerId']).toBe('');
      });
    });
  });
});
