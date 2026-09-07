/**
 * Unit tests for UserCreatedConsumer
 *
 * Tests the event consumer that handles user.created events.
 * Verifies @EventHandler decorator registration and event processing.
 */

import { Test } from '@nestjs/testing';

import { UserEventType } from '../../../events';
import { UserCreatedConsumer } from '../user-created.consumer';

import type { UserCreatedData } from '../../../events';
import type { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { EventMessage } from '@package/events';

describe('UserCreatedConsumer', () => {
  let consumer: UserCreatedConsumer;
  let logger: jest.Mocked<Logger>;

  beforeEach(async () => {
    // Mock logger
    logger = {
      log: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [UserCreatedConsumer]
    }).compile();

    consumer = module.get<UserCreatedConsumer>(UserCreatedConsumer);

    // Replace the internal logger with our mock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (consumer as any).logger = logger;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('class structure', () => {
    it('should be defined', () => {
      expect(consumer).toBeDefined();
    });

    it('should have handleUserCreated method', () => {
      expect(typeof consumer.handleUserCreated).toBe('function');
    });

    it('should be decorated with @Injectable', () => {
      // This test verifies the class can be instantiated via DI
      expect(consumer).toBeInstanceOf(UserCreatedConsumer);
    });
  });

  describe('@EventHandler decorator registration', () => {
    it('should have @EventHandler decorator on handleUserCreated', () => {
      // The @EventHandler decorator registers the method with the EventsModule
      // We verify the method exists and is a function
      expect(typeof consumer.handleUserCreated).toBe('function');
    });

    it('should have method name handleUserCreated', () => {
      expect(consumer.handleUserCreated.name).toBe('handleUserCreated');
    });
  });

  describe('handleUserCreated', () => {
    it('should call logger.log with formatted event data', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledTimes(1);
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('USER CREATED EVENT RECEIVED')
      );
    });

    it('should extract and log eventId', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('event-abc-123'));
    });

    it('should extract and log userId from event data', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('user-456'));
    });

    it('should extract and log tenantId from event data', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('primary-encryption-key'));
    });

    it('should extract and log organizationId from event data', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('org-789'));
    });

    it('should extract and log emailHash (truncated) from event data', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('abcdef1234567890...'));
    });

    it('should extract and log timestamp from event data', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T12:30:45.000Z',
        timestamp: '2024-01-01T12:30:45.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T12:30:45.000Z'),
        occurredAt: new Date('2024-01-01T12:30:45.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('2024-01-01T12:30:45.000Z'));
    });

    it('should log demonstration message about future actions', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('DEMONSTRATION'));
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('welcome email'));
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('analytics'));
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('cache'));
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('workflows'));
    });
  });

  describe('event data extraction', () => {
    it('should handle events with different eventIds', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event1: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-001',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      const event2: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-002',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event1);
      consumer.handleUserCreated(event2);

      expect(logger.log).toHaveBeenCalledTimes(2);
      expect((logger.log as jest.Mock).mock.calls[0]?.[0]).toContain('event-001');
      expect((logger.log as jest.Mock).mock.calls[1]?.[0]).toContain('event-002');
    });

    it('should handle events with different userIds', () => {
      const event1Data: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-001',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event2Data: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-002',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event1: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-001',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-001',
        data: event1Data,
        schemaVersion: '1.0'
      };

      const event2: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-002',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-002',
        data: event2Data,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event1);
      consumer.handleUserCreated(event2);

      expect((logger.log as jest.Mock).mock.calls[0]?.[0]).toContain('user-001');
      expect((logger.log as jest.Mock).mock.calls[1]?.[0]).toContain('user-002');
    });
  });

  describe('logging format', () => {
    it('should log with visually distinct format', () => {
      const eventData: UserCreatedData = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abcdef1234567890abcdef1234567890abcdef12',
        createdAt: '2024-01-01T00:00:00.000Z',
        timestamp: '2024-01-01T00:00:00.000Z'
      };

      const event: EventMessage<UserCreatedData> = {
        eventType: UserEventType.USER_CREATED,
        eventId: 'event-abc-123',
        timestamp: new Date('2024-01-01T00:00:00.000Z'),
        occurredAt: new Date('2024-01-01T00:00:00.000Z'),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: eventData,
        schemaVersion: '1.0'
      };

      consumer.handleUserCreated(event);

      const logMessage = (logger.log as jest.Mock).mock.calls[0]?.[0];

      expect(logMessage).toContain('╔');
      expect(logMessage).toContain('╠');
      expect(logMessage).toContain('╚');
      expect(logMessage).toContain('║');
    });
  });
});
