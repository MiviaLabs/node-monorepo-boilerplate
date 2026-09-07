/**
 * ReplayController Unit Tests
 *
 * Tests event replay controller endpoints with mocked service.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - POST /v1/events/replay - start event replay
 * - GET /v1/events/replay/:replayId - get replay status
 * - POST /v1/events/replay/:replayId/cancel - cancel replay
 * - Actor ID extraction
 * - Error handling
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Mock objects require any type */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventReplayService, ReplayStatus } from '@package/events';

import { ReplayController, StartReplayDto } from '../event-replay.controller';

import type { TestingModule } from '@nestjs/testing';
import type { ReplaySession } from '@package/events';

import { MAIN_DB } from '@/common/database/database.constants';
import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { JwtAuthGuard, EnhancedPermissionsGuard } from '@/modules/auth/guards';

// Mock EventReplayService
const mockReplayService = {
  startReplay: jest.fn(),
  getReplayStatus: jest.fn(),
  cancelReplay: jest.fn()
};

const mockAuditOutbox = {
  insert: jest.fn().mockResolvedValue(undefined)
};

describe('ReplayController', () => {
  let controller: ReplayController;
  let replayService: jest.Mocked<EventReplayService>;

  // Test data
  const actorId = 'user-123';
  const replayId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReplayController],
      providers: [
        {
          provide: EventReplayService,
          useValue: mockReplayService
        },
        {
          provide: AuditOutboxPublisher,
          useValue: mockAuditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: {}
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EnhancedPermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReplayController>(ReplayController);
    replayService = module.get(EventReplayService) as jest.Mocked<EventReplayService>;

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startReplay', () => {
    it('should start replay and return success response', async () => {
      // Arrange
      const dto = new StartReplayDto();
      dto.aggregateId = 'user-123';

      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 0,
        totalCount: 100,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date()
      };

      replayService.startReplay.mockResolvedValue(mockSession);

      // Act
      const result = await controller.startReplay(actorId, dto);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data.replayId).toBe(replayId);
      expect(result.data.status).toBe(ReplayStatus.IN_PROGRESS);
      expect(replayService.startReplay).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateId: 'user-123'
        })
      );
    });

    it('should convert date strings to Date objects', async () => {
      // Arrange
      const dto = new StartReplayDto();
      dto.startDate = '2024-01-01T00:00:00.000Z';
      dto.endDate = '2024-01-31T23:59:59.999Z';

      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 0,
        totalCount: 50,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date()
      };

      replayService.startReplay.mockResolvedValue(mockSession);

      // Act
      await controller.startReplay(actorId, dto);

      // Assert
      expect(replayService.startReplay).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date('2024-01-01T00:00:00.000Z'),
          endDate: new Date('2024-01-31T23:59:59.999Z')
        })
      );
    });

    it('should pass all optional fields to service', async () => {
      // Arrange
      const dto = new StartReplayDto();
      dto.aggregateId = 'order-456';
      dto.tenantId = 'primary-encryption-key';
      dto.eventType = 'order.created';
      dto.startDate = '2024-01-01T00:00:00.000Z';
      dto.endDate = '2024-01-31T23:59:59.999Z';
      dto.maxEvents = 1000;

      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 0,
        totalCount: 1000,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date()
      };

      replayService.startReplay.mockResolvedValue(mockSession);

      // Act
      await controller.startReplay(actorId, dto);

      // Assert
      expect(replayService.startReplay).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateId: 'order-456',
          tenantId: 'primary-encryption-key',
          eventType: 'order.created',
          startDate: new Date('2024-01-01T00:00:00.000Z'),
          endDate: new Date('2024-01-31T23:59:59.999Z'),
          maxEvents: 1000
        })
      );
    });

    it('should handle replay with no filters', async () => {
      // Arrange
      const dto = new StartReplayDto();

      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 0,
        totalCount: 5000,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date()
      };

      replayService.startReplay.mockResolvedValue(mockSession);

      // Act
      await controller.startReplay(actorId, dto);

      // Assert
      expect(replayService.startReplay).toHaveBeenCalledWith(expect.objectContaining({}));
    });

    it('should propagate service errors', async () => {
      // Arrange
      const dto = new StartReplayDto();
      dto.aggregateId = 'user-123';

      replayService.startReplay.mockRejectedValue(new Error('Event store unavailable'));

      // Act & Assert
      await expect(controller.startReplay(actorId, dto)).rejects.toThrow('Event store unavailable');
    });

    it('audits replay starts with metadata-only filter details and trace IDs', async () => {
      const dto = new StartReplayDto();
      dto.aggregateId = 'user-123';
      dto.tenantId = 'tenant-secret';
      dto.maxEvents = 25;

      replayService.startReplay.mockResolvedValue({
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 0,
        totalCount: 25,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date()
      });

      await controller.startReplay(actorId, dto, {
        requestId: 'req-replay-1',
        correlationId: 'corr-replay-1',
        causationId: 'cause-replay-1'
      });

      expect(mockAuditOutbox.insert).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          eventType: 'system.event.replay.started.audit',
          correlationId: 'corr-replay-1',
          causationId: 'cause-replay-1',
          payload: expect.objectContaining({
            requestId: 'req-replay-1',
            details: expect.objectContaining({
              aggregateFilterProvided: true,
              tenantFilterProvided: true,
              maxEvents: 25
            })
          })
        })
      );
      expect(
        JSON.stringify((mockAuditOutbox.insert as jest.Mock).mock.calls[0]?.[1]?.payload)
      ).not.toContain('tenant-secret');
    });
  });

  describe('getReplayStatus', () => {
    it('should return replay status for valid replay ID', async () => {
      // Arrange
      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.COMPLETED,
        processedCount: 100,
        totalCount: 100,
        successCount: 95,
        failureCount: 5,
        startedAt: new Date('2024-01-01T12:00:00.000Z'),
        completedAt: new Date('2024-01-01T12:05:00.000Z'),
        error: undefined
      };

      replayService.getReplayStatus.mockReturnValue(mockSession);

      // Act
      const result = await controller.getReplayStatus(actorId, replayId);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data.replayId).toBe(replayId);
      expect(result.data.processedCount).toBe(100);
      expect(result.data.totalCount).toBe(100);
      expect(result.data.successCount).toBe(95);
      expect(result.data.failureCount).toBe(5);
      expect(result.data.status).toBe(ReplayStatus.COMPLETED);
      expect(replayService.getReplayStatus).toHaveBeenCalledWith(replayId);
    });

    it('should include error message when replay failed', async () => {
      // Arrange
      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.FAILED,
        processedCount: 50,
        totalCount: 100,
        successCount: 45,
        failureCount: 5,
        startedAt: new Date('2024-01-01T12:00:00.000Z'),
        completedAt: new Date('2024-01-01T12:03:00.000Z'),
        error: 'Connection to event store lost'
      };

      replayService.getReplayStatus.mockReturnValue(mockSession);

      // Act
      const result = await controller.getReplayStatus(actorId, replayId);

      // Assert
      expect(result.data.error).toBe('Connection to event store lost');
    });

    it('should throw NotFoundException for non-existent replay', async () => {
      // Arrange
      replayService.getReplayStatus.mockReturnValue(null);

      // Act & Assert - method throws synchronously before returning
      try {
        await controller.getReplayStatus(actorId, replayId);
        fail('Expected NotFoundException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).message).toContain(
          `Replay session ${replayId} not found`
        );
      }
    });

    it('should handle running replay status', async () => {
      // Arrange
      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 50,
        totalCount: 100,
        successCount: 48,
        failureCount: 2,
        startedAt: new Date('2024-01-01T12:00:00.000Z'),
        completedAt: undefined,
        error: undefined
      };

      replayService.getReplayStatus.mockReturnValue(mockSession);

      // Act
      const result = await controller.getReplayStatus(actorId, replayId);

      // Assert
      expect(result.data.status).toBe(ReplayStatus.IN_PROGRESS);
      expect(result.data.completedAt).toBeUndefined();
    });
  });

  describe('cancelReplay', () => {
    it('should cancel running replay and return success', async () => {
      // Arrange
      replayService.cancelReplay.mockReturnValue(true);

      // Act
      const result = await controller.cancelReplay(actorId, replayId);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data.success).toBe(true);
      expect(result.data.message).toBe('Replay cancelled successfully');
      expect(replayService.cancelReplay).toHaveBeenCalledWith(replayId);
    });

    it('should return failure message when replay not found', async () => {
      // Arrange
      replayService.cancelReplay.mockReturnValue(false);

      // Act
      const result = await controller.cancelReplay(actorId, replayId);

      // Assert
      expect(result.data.success).toBe(false);
      expect(result.data.message).toBe(
        'Failed to cancel replay (session not found or already completed)'
      );
    });

    it('should return failure message when replay already completed', async () => {
      // Arrange
      replayService.cancelReplay.mockReturnValue(false);

      // Act
      const result = await controller.cancelReplay(actorId, replayId);

      // Assert
      expect(result.data.success).toBe(false);
      expect(result.data.message).toContain('session not found or already completed');
    });

    it('should propagate service errors', async () => {
      // Arrange
      replayService.cancelReplay.mockImplementation(() => {
        throw new Error('Failed to update replay status');
      });

      // Act & Assert - method throws synchronously
      try {
        await controller.cancelReplay(actorId, replayId);
        fail('Expected Error to be thrown');
      } catch (error) {
        expect((error as Error).message).toBe('Failed to update replay status');
      }
    });
  });

  describe('actor ID handling', () => {
    it('should handle string actor IDs', async () => {
      // Arrange
      const dto = new StartReplayDto();
      const testActorId = 'actor-456';

      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 0,
        totalCount: 10,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date()
      };

      replayService.startReplay.mockResolvedValue(mockSession);

      // Act
      await controller.startReplay(testActorId, dto);

      // Assert
      expect(replayService.startReplay).toHaveBeenCalled();
    });

    it('should handle UUID actor IDs', async () => {
      // Arrange
      const dto = new StartReplayDto();
      const testActorId = '123e4567-e89b-12d3-a456-426614174999';

      const mockSession: ReplaySession = {
        replayId,
        status: ReplayStatus.IN_PROGRESS,
        processedCount: 0,
        totalCount: 10,
        successCount: 0,
        failureCount: 0,
        startedAt: new Date()
      };

      replayService.startReplay.mockResolvedValue(mockSession);

      // Act
      await controller.startReplay(testActorId, dto);

      // Assert
      expect(replayService.startReplay).toHaveBeenCalled();
    });
  });
});
