/**
 * DeadLettersController Unit Tests
 *
 * Tests dead letter queue controller endpoints with mocked service.
 * Uses Jest framework following project patterns.
 *
 * Test Coverage:
 * - GET /v1/admin/events/dead-letter - get dead-lettered events
 * - POST /v1/admin/events/dead-letter/:eventId/replay - replay dead-lettered event
 * - DELETE /v1/admin/events/dead-letter/:eventId - delete dead-lettered event
 * - Actor ID extraction
 * - Error handling
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- Mock objects require any type */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { DeadLetterService } from '@package/events';

import { DeadLettersController } from '../dead-letter.controller';

import type { DeadLetterEventDto } from '../../dto';
import type { TestingModule } from '@nestjs/testing';

import { MAIN_DB } from '@/common/database/database.constants';
import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { JwtAuthGuard, EnhancedPermissionsGuard } from '@/modules/auth/guards';

// Mock DeadLetterService
const mockDeadLetterService = {
  getDeadLetteredEvents: jest.fn(),
  replayFromDeadLetter: jest.fn(),
  deleteDeadLetteredEvent: jest.fn()
};

const mockAuditOutbox = {
  insert: jest.fn()
};

describe('DeadLettersController', () => {
  let controller: DeadLettersController;
  let deadLetterService: jest.Mocked<DeadLetterService>;

  // Test data
  const actorId = 'user-123';
  const eventId = '123e4567-e89b-12d3-a456-426614174000';

  // Mock dead letter event
  const mockDeadLetterEvent: DeadLetterEventDto = {
    eventId,
    eventType: 'user.created',
    aggregateId: 'user-456',
    tenantId: 'primary-encryption-key',
    retryCount: 3,
    errorMessage: 'Processing failed: Invalid user data',
    deadLetteredAt: new Date('2024-01-01T12:05:00.000Z'),
    reason: 'validation'
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeadLettersController],
      providers: [
        {
          provide: DeadLetterService,
          useValue: mockDeadLetterService
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

    controller = module.get<DeadLettersController>(DeadLettersController);
    deadLetterService = module.get(DeadLetterService) as jest.Mocked<DeadLetterService>;

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDeadLetteredEvents', () => {
    it('should return array of dead-lettered events', async () => {
      // Arrange
      const mockEvents: DeadLetterEventDto[] = [mockDeadLetterEvent];
      deadLetterService.getDeadLetteredEvents.mockResolvedValue(mockEvents);

      // Act
      const result = await controller.getDeadLetteredEvents(actorId);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data).toEqual(mockEvents);
      expect(deadLetterService.getDeadLetteredEvents).toHaveBeenCalled();
    });

    it('should return empty array when no dead-lettered events exist', async () => {
      // Arrange
      deadLetterService.getDeadLetteredEvents.mockResolvedValue([]);

      // Act
      const result = await controller.getDeadLetteredEvents(actorId);

      // Assert
      expect(result.data).toEqual([]);
      expect(deadLetterService.getDeadLetteredEvents).toHaveBeenCalled();
    });

    it('should return events with all required fields', async () => {
      // Arrange
      const mockEvents: DeadLetterEventDto[] = [mockDeadLetterEvent];
      deadLetterService.getDeadLetteredEvents.mockResolvedValue(mockEvents);

      // Act
      const result = await controller.getDeadLetteredEvents(actorId);

      // Assert
      expect(result.data).toHaveLength(1);
      const event = result.data[0];
      expect(event).toBeDefined();
      expect(event?.eventId).toBeDefined();
      expect(event?.eventType).toBeDefined();
      expect(event?.aggregateId).toBeDefined();
      expect(event?.tenantId).toBeDefined();
      expect(event?.retryCount).toBeDefined();
      expect(event?.errorMessage).toBeDefined();
      expect(event?.deadLetteredAt).toBeDefined();
      expect(event?.reason).toBeDefined();
    });

    it('should propagate service errors', async () => {
      // Arrange
      deadLetterService.getDeadLetteredEvents.mockRejectedValue(
        new Error('Failed to query dead letter queue')
      );

      // Act & Assert
      await expect(controller.getDeadLetteredEvents(actorId)).rejects.toThrow(
        'Failed to query dead letter queue'
      );
    });
  });

  describe('replayEvent', () => {
    it('should replay dead-lettered event and return success', async () => {
      // Arrange
      deadLetterService.replayFromDeadLetter.mockResolvedValue(true);

      // Act
      const result = await controller.replayEvent(actorId, eventId);

      // Assert
      expect(result).toBeInstanceOf(BaseResponseDto);
      expect(result.data.eventId).toBe(eventId);
      expect(result.data.success).toBe(true);
      expect(result.data.message).toBe('Event queued for replay');
      expect(deadLetterService.replayFromDeadLetter).toHaveBeenCalledWith(eventId);
    });

    it('should return failure message when replay fails', async () => {
      // Arrange
      deadLetterService.replayFromDeadLetter.mockResolvedValue(false);

      // Act
      const result = await controller.replayEvent(actorId, eventId);

      // Assert
      expect(result.data.eventId).toBe(eventId);
      expect(result.data.success).toBe(false);
      expect(result.data.message).toBe(
        'Failed to queue event for replay (event may not exist or is not dead-lettered)'
      );
    });

    it('should propagate service errors', async () => {
      // Arrange
      deadLetterService.replayFromDeadLetter.mockRejectedValue(new Error('Failed to replay event'));

      // Act & Assert
      await expect(controller.replayEvent(actorId, eventId)).rejects.toThrow(
        'Failed to replay event'
      );
    });

    it('should handle different event IDs', async () => {
      // Arrange
      const testEventId = 'different-event-id-123';
      deadLetterService.replayFromDeadLetter.mockResolvedValue(true);

      // Act
      const result = await controller.replayEvent(actorId, testEventId);

      // Assert
      expect(result.data.eventId).toBe(testEventId);
      expect(deadLetterService.replayFromDeadLetter).toHaveBeenCalledWith(testEventId);
    });
  });

  describe('deleteEvent', () => {
    it('should delete dead-lettered event successfully', async () => {
      // Arrange
      deadLetterService.deleteDeadLetteredEvent.mockResolvedValue(true);

      // Act
      const result = await controller.deleteEvent(actorId, eventId);

      // Assert
      expect(result).toBeUndefined();
      expect(deadLetterService.deleteDeadLetteredEvent).toHaveBeenCalledWith(eventId);
    });

    it('should succeed even if event does not exist (idempotent)', async () => {
      // Arrange
      deadLetterService.deleteDeadLetteredEvent.mockResolvedValue(true);

      // Act
      const result = await controller.deleteEvent(actorId, 'nonexistent-event-id');

      // Assert
      expect(result).toBeUndefined();
      expect(deadLetterService.deleteDeadLetteredEvent).toHaveBeenCalledWith(
        'nonexistent-event-id'
      );
    });

    it('should propagate service errors', async () => {
      // Arrange
      deadLetterService.deleteDeadLetteredEvent.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await expect(controller.deleteEvent(actorId, eventId)).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle deletion of multiple events', async () => {
      // Arrange
      const eventIds = ['event-1', 'event-2', 'event-3'];
      deadLetterService.deleteDeadLetteredEvent.mockResolvedValue(true);

      // Act & Assert
      for (const id of eventIds) {
        await controller.deleteEvent(actorId, id);
        expect(deadLetterService.deleteDeadLetteredEvent).toHaveBeenCalledWith(id);
      }

      expect(deadLetterService.deleteDeadLetteredEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('actor ID handling', () => {
    it('should handle string actor IDs for replay', async () => {
      // Arrange
      const testActorId = 'actor-456';
      deadLetterService.replayFromDeadLetter.mockResolvedValue(true);

      // Act
      await controller.replayEvent(testActorId, eventId);

      // Assert
      expect(deadLetterService.replayFromDeadLetter).toHaveBeenCalled();
    });

    it('should handle UUID actor IDs for delete', async () => {
      // Arrange
      const testActorId = '123e4567-e89b-12d3-a456-426614174999';
      deadLetterService.deleteDeadLetteredEvent.mockResolvedValue(true);

      // Act
      await controller.deleteEvent(testActorId, eventId);

      // Assert
      expect(deadLetterService.deleteDeadLetteredEvent).toHaveBeenCalled();
    });
  });

  describe('event ID validation', () => {
    it('should handle UUID format event IDs', async () => {
      // Arrange
      const uuidEventId = '123e4567-e89b-12d3-a456-426614174000';
      deadLetterService.replayFromDeadLetter.mockResolvedValue(true);

      // Act
      const result = await controller.replayEvent(actorId, uuidEventId);

      // Assert
      expect(result.data.eventId).toBe(uuidEventId);
    });

    it('should handle string format event IDs', async () => {
      // Arrange
      const stringEventId = 'event-string-id-123';
      deadLetterService.replayFromDeadLetter.mockResolvedValue(true);

      // Act
      const result = await controller.replayEvent(actorId, stringEventId);

      // Assert
      expect(result.data.eventId).toBe(stringEventId);
    });

    it('audits dead-letter reads with metadata-only payloads', async () => {
      deadLetterService.getDeadLetteredEvents.mockResolvedValue([mockDeadLetterEvent]);

      await controller.getDeadLetteredEvents(actorId, {
        requestId: 'req-dead-letter-1',
        correlationId: 'corr-dead-letter-1',
        causationId: 'cause-dead-letter-1'
      });

      expect(mockAuditOutbox.insert).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          eventType: 'system.dead.letter.listed.audit',
          payload: expect.objectContaining({
            requestId: 'req-dead-letter-1',
            details: {
              resultCount: 1
            }
          })
        })
      );
      expect(
        JSON.stringify((mockAuditOutbox.insert as jest.Mock).mock.calls[0]?.[1]?.payload)
      ).not.toContain('Invalid user data');
    });
  });
});
