import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { DeadLetterService, ErrorClassification } from '../../dead-letter/dead-letter.service';
import type { DeadLetterEvent } from '../../dead-letter/dead-letter.service';
import type { DeadLetterConfig } from '../../config';

// Mock EventBus
class MockEventBus {
  async publish(): Promise<void> {
    // Mock implementation
  }
}

// Mock OutboxRepository
class MockOutboxRepository {
  async markAsDeadLettered(_eventId: string, _tenantId: string, _reason: string): Promise<void> {
    // Mock implementation
  }

  async getDeadLetteredEvents(_tenantId?: string): Promise<any[]> {
    return [];
  }

  async getById(): Promise<any> {
    return null;
  }

  async resetForRetry(_eventId: string, _tenantId: string): Promise<void> {
    // Mock implementation
  }

  async cleanupDeadLetters(_olderThan: Date, _tenantId?: string): Promise<void> {
    // Mock implementation
  }

  async deleteDeadLetteredEvent(_eventId: string, _tenantId: string): Promise<boolean> {
    return true;
  }
}

describe('DeadLetterService', () => {
  let deadLetterService: DeadLetterService;
  let mockEventBus: MockEventBus;
  let mockOutboxRepo: MockOutboxRepository;
  let config: Required<DeadLetterConfig>;

  beforeEach(() => {
    mockEventBus = new MockEventBus();
    mockOutboxRepo = new MockOutboxRepository();
    config = {
      enabled: true,
      maxRetries: 5,
      deadLetterTopic: 'dead-letter',
      alertOnFailure: true,
      retentionDays: 30,
      cleanupInterval: 86400000
    };

    // Create service instance
    deadLetterService = new DeadLetterService(mockEventBus as any, mockOutboxRepo as any, config);
  });

  afterEach(() => {
    // Clean up timers to prevent test pollution
    deadLetterService.onModuleDestroy();
  });

  describe('classifyError', () => {
    it('should classify network errors correctly', () => {
      const error = new Error('ECONNREFUSED');
      assert.equal(deadLetterService.classifyError(error), ErrorClassification.NETWORK);

      const error2 = new Error('Connection timeout');
      assert.equal(deadLetterService.classifyError(error2), ErrorClassification.NETWORK);
    });

    it('should classify timeout errors correctly', () => {
      const error = new Error('Request timed out');
      assert.equal(deadLetterService.classifyError(error), ErrorClassification.TIMEOUT);

      const error2 = new Error('Deadline exceeded');
      assert.equal(deadLetterService.classifyError(error2), ErrorClassification.TIMEOUT);
    });

    it('should classify validation errors correctly', () => {
      const error = new Error('Validation failed');
      assert.equal(deadLetterService.classifyError(error), ErrorClassification.VALIDATION);

      const error2 = new Error('Invalid schema format');
      assert.equal(deadLetterService.classifyError(error2), ErrorClassification.VALIDATION);
    });

    it('should classify permission errors correctly', () => {
      const error = new Error('Unauthorized access');
      assert.equal(deadLetterService.classifyError(error), ErrorClassification.PERMISSION);

      const error2 = new Error('Access denied');
      assert.equal(deadLetterService.classifyError(error2), ErrorClassification.PERMISSION);
    });

    it('should classify unknown errors as unknown', () => {
      const error = new Error('Some random error');
      assert.equal(deadLetterService.classifyError(error), ErrorClassification.UNKNOWN);
    });

    it('should handle non-Error objects', () => {
      assert.equal(deadLetterService.classifyError('string error'), ErrorClassification.UNKNOWN);
      assert.equal(deadLetterService.classifyError(null), ErrorClassification.UNKNOWN);
      assert.equal(deadLetterService.classifyError(undefined), ErrorClassification.UNKNOWN);
    });
  });

  describe('sendToDeadLetter', () => {
    it('should mark event as dead-lettered and publish to topic', async () => {
      const event = {
        eventId: 'event-123',
        eventType: 'user.created',
        aggregateId: 'user-456',
        tenantId: 'tenant-789',
        retryCount: 5,
        errorMessage: 'Max retries exceeded',
        deadLetteredAt: new Date(),
        deadLetterReason: 'timeout'
      };

      const error = new Error('Connection timeout');

      let markedAsDeadLettered = false;
      let publishedToTopic = false;

      mockOutboxRepo.markAsDeadLettered = async () => {
        markedAsDeadLettered = true;
      };

      mockEventBus.publish = async () => {
        publishedToTopic = true;
      };

      await deadLetterService.sendToDeadLetter(event as any, error);

      assert.ok(markedAsDeadLettered, 'Event should be marked as dead-lettered');
      assert.ok(publishedToTopic, 'Event should be published to DLQ topic');
    });

    it('should handle publish failures gracefully', async () => {
      const event = {
        eventId: 'event-123',
        eventType: 'user.created',
        aggregateId: 'user-456',
        tenantId: 'tenant-789',
        retryCount: 5,
        errorMessage: 'Max retries exceeded',
        deadLetteredAt: new Date(),
        deadLetterReason: 'timeout'
      };

      const error = new Error('Connection timeout');

      let markedAsDeadLettered = false;

      mockOutboxRepo.markAsDeadLettered = async () => {
        markedAsDeadLettered = true;
      };

      mockEventBus.publish = async () => {
        throw new Error('Publish failed');
      };

      // Should not throw even if publish fails
      await deadLetterService.sendToDeadLetter(event as any, error);

      assert.ok(markedAsDeadLettered, 'Event should be marked as dead-lettered');
    });

    it('should not publish to topic if deadLetterTopic is not configured', async () => {
      const serviceWithoutTopic = new DeadLetterService(
        mockEventBus as any,
        mockOutboxRepo as any,
        { ...config, deadLetterTopic: '' }
      );

      // Ensure cleanup after test
      try {
        const event = {
          eventId: 'event-123',
          eventType: 'user.created',
          aggregateId: 'user-456',
          tenantId: 'tenant-789',
          retryCount: 5,
          errorMessage: 'Max retries exceeded',
          deadLetteredAt: new Date(),
          deadLetterReason: 'timeout'
        };

        const error = new Error('Connection timeout');

        let publishedToTopic = false;

        mockEventBus.publish = async () => {
          publishedToTopic = true;
        };

        await serviceWithoutTopic.sendToDeadLetter(event as any, error);

        assert.ok(!publishedToTopic, 'Should not publish if topic is not configured');
      } finally {
        serviceWithoutTopic.onModuleDestroy();
      }
    });
  });

  describe('getDeadLetteredEvents', () => {
    it('should return dead-lettered events from repository', async () => {
      const mockEvents = [
        {
          eventId: 'event-1',
          eventType: 'user.created',
          aggregateId: 'user-1',
          tenantId: 'tenant-1',
          retryCount: 5,
          errorMessage: 'Timeout',
          deadLetteredAt: new Date(),
          deadLetterReason: 'timeout'
        },
        {
          eventId: 'event-2',
          eventType: 'order.placed',
          aggregateId: 'order-1',
          tenantId: 'tenant-1',
          retryCount: 3,
          errorMessage: 'Network error',
          deadLetteredAt: new Date(),
          deadLetterReason: 'network'
        }
      ];

      mockOutboxRepo.getDeadLetteredEvents = async () => mockEvents;

      const events = await deadLetterService.getDeadLetteredEvents('tenant-1');

      assert.equal(events.length, 2);
      assert.equal(events[0].eventId, 'event-1');
      assert.equal(events[1].eventId, 'event-2');
    });
  });

  describe('replayFromDeadLetter', () => {
    it('should reset event for replay and return true', async () => {
      const mockEvent = {
        eventId: 'event-123',
        eventType: 'user.created',
        aggregateId: 'user-456',
        tenantId: 'tenant-789',
        retryCount: 5,
        errorMessage: 'Timeout',
        deadLetteredAt: new Date(),
        deadLetterReason: 'timeout'
      };

      mockOutboxRepo.getById = async () => mockEvent;
      mockOutboxRepo.resetForRetry = async () => {};

      const result = await deadLetterService.replayFromDeadLetter('event-123');

      assert.ok(result, 'Should return true on successful replay');
    });

    it('should return false if event does not exist', async () => {
      mockOutboxRepo.getById = async () => null;

      const result = await deadLetterService.replayFromDeadLetter('non-existent');

      assert.ok(!result, 'Should return false if event does not exist');
    });

    it('should return false if event is not dead-lettered', async () => {
      const mockEvent = {
        eventId: 'event-123',
        eventType: 'user.created',
        aggregateId: 'user-456',
        tenantId: 'tenant-789',
        retryCount: 1,
        errorMessage: null,
        deadLetteredAt: null,
        deadLetterReason: null
      };

      mockOutboxRepo.getById = async () => mockEvent;

      const result = await deadLetterService.replayFromDeadLetter('event-123');

      assert.ok(!result, 'Should return false if event is not dead-lettered');
    });

    it('should return false on repository errors', async () => {
      mockOutboxRepo.getById = async () => {
        throw new Error('Database error');
      };

      const result = await deadLetterService.replayFromDeadLetter('event-123');

      assert.ok(!result, 'Should return false on repository errors');
    });
  });
});
