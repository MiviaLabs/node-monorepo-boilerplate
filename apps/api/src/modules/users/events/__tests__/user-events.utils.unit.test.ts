/**
 * Unit tests for UserEventsUtils
 *
 * Tests the utility functions for creating and validating user events.
 * Verifies event structure, validation, and helper functions.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion -- Safe in tests with verified data */

import { UserEventType } from '../../events/user-event-types.constants';
import { DeletionType, PasswordChangeActor } from '../../events/user-events.schema';
import {
  createUserEvent,
  getTopicForEventType,
  validateEventData,
  extractEventType,
  isUserEvent,
  getSchemaVersion
} from '../../events/user-events.utils';

import type { UserEventDataSchemas } from '../../events/user-events.schema';
import type { EventMessage } from '@package/events';

describe('UserEventsUtils', () => {
  describe('createUserEvent', () => {
    it('should create event with standard structure', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData);

      expect(event).toBeDefined();
      expect(event.eventType).toBe(UserEventType.USER_CREATED);
      expect(event.eventId).toBeDefined();
      expect(typeof event.eventId).toBe('string');
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('should include data in event', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData);

      expect(event.data).toEqual(eventData);
    });

    it('should include metadata with correlationId and causationId', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData, {
        correlationId: 'corr-123',
        causationId: 'cause-456'
      });

      expect(event.metadata).toBeDefined();
      expect(event.metadata!.correlationId).toBe('corr-123');
      expect(event.metadata!.causationId).toBe('cause-456');
    });

    it('should include tenantId in metadata', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData);

      expect(event.metadata?.tenantId).toBe('primary-encryption-key');
    });

    it('should use options tenantId if provided', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData, {
        tenantId: 'tenant-override'
      });

      expect(event.tenantId).toBe('tenant-override');
      expect(event.metadata?.tenantId).toBe('tenant-override');
    });

    it('should include schema version', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData);

      expect(event.schemaVersion).toBe('1.0');
    });

    it('should set aggregateId from data.userId', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData);

      expect(event.aggregateId).toBe('user-456');
    });

    it('should set readonly flag to true', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData);

      expect(event.readonly).toBe(true);
    });

    it('should set version to 1', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData);

      expect(event.version).toBe(1);
    });

    it('should include userId in metadata if provided in options', () => {
      const eventData: UserEventDataSchemas[typeof UserEventType.USER_CREATED] = {
        tenantId: 'primary-encryption-key',
        userId: 'user-456',
        organizationId: 'org-789',
        emailHash: 'abc123...',
        createdAt: new Date().toISOString(),
        timestamp: new Date().toISOString()
      };

      const event = createUserEvent(UserEventType.USER_CREATED, eventData, {
        userId: 'actor-789'
      });

      expect(event.metadata?.userId).toBe('actor-789');
    });
  });

  describe('getTopicForEventType', () => {
    it('should convert user.created to user-created', () => {
      const topic = getTopicForEventType(UserEventType.USER_CREATED);
      expect(topic).toBe('user-created');
    });

    it('should convert user.updated to user-updated', () => {
      const topic = getTopicForEventType(UserEventType.USER_UPDATED);
      expect(topic).toBe('user-updated');
    });

    it('should convert user.deleted to user-deleted', () => {
      const topic = getTopicForEventType(UserEventType.USER_DELETED);
      expect(topic).toBe('user-deleted');
    });

    it('should convert user.email.updated to user-email-updated', () => {
      const topic = getTopicForEventType(UserEventType.USER_EMAIL_UPDATED);
      expect(topic).toBe('user-email-updated');
    });

    it('should convert user.password.changed to user-password-changed', () => {
      const topic = getTopicForEventType(UserEventType.USER_PASSWORD_CHANGED);
      expect(topic).toBe('user-password-changed');
    });

    it('should convert user.profile.viewed to user-profile-viewed', () => {
      const topic = getTopicForEventType(UserEventType.USER_PROFILE_VIEWED);
      expect(topic).toBe('user-profile-viewed');
    });

    it('should convert user.status.changed to user-status-changed', () => {
      const topic = getTopicForEventType(UserEventType.USER_STATUS_CHANGED);
      expect(topic).toBe('user-status-changed');
    });

    it('should handle all 7 event types', () => {
      const allTopics = Object.values(UserEventType).map(getTopicForEventType);

      expect(allTopics).toHaveLength(7);
      expect(allTopics.every((topic) => typeof topic === 'string')).toBe(true);
      expect(allTopics.every((topic) => !topic.includes('.'))).toBe(true);
    });
  });

  describe('validateEventData', () => {
    describe('USER_CREATED validation', () => {
      it('should validate correct USER_CREATED data', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          organizationId: 'org-789',
          emailHash: 'abc123...',
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_CREATED, data)).not.toThrow();
      });

      it('should throw when organizationId is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          emailHash: 'abc123...',
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_CREATED, data)).toThrow(TypeError);
      });

      it('should throw when emailHash is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          organizationId: 'org-789',
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_CREATED, data)).toThrow(TypeError);
      });
    });

    describe('USER_UPDATED validation', () => {
      it('should validate correct USER_UPDATED data', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          changes: { name: 'John Doe' },
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_UPDATED, data)).not.toThrow();
      });

      it('should throw when changes is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_UPDATED, data)).toThrow(TypeError);
      });

      it('should throw when changes is null', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          changes: null,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_UPDATED, data)).toThrow(TypeError);
      });
    });

    describe('USER_DELETED validation', () => {
      it('should validate correct USER_DELETED data with soft deletion', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          deletionType: DeletionType.Soft,
          deletedBy: 'admin-789',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_DELETED, data)).not.toThrow();
      });

      it('should validate correct USER_DELETED data with hard deletion', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          deletionType: DeletionType.Hard,
          deletedBy: 'admin-789',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_DELETED, data)).not.toThrow();
      });

      it('should throw when deletionType is invalid', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          deletionType: 'invalid',
          deletedBy: 'admin-789',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_DELETED, data)).toThrow(TypeError);
      });
    });

    describe('USER_EMAIL_UPDATED validation', () => {
      it('should validate correct USER_EMAIL_UPDATED data', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          oldEmailHash: 'old-hash',
          newEmailHash: 'new-hash',
          verified: true,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_EMAIL_UPDATED, data)).not.toThrow();
      });

      it('should throw when oldEmailHash is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          newEmailHash: 'new-hash',
          verified: true,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_EMAIL_UPDATED, data)).toThrow(TypeError);
      });

      it('should throw when newEmailHash is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          oldEmailHash: 'old-hash',
          verified: true,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_EMAIL_UPDATED, data)).toThrow(TypeError);
      });

      it('should throw when verified is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          oldEmailHash: 'old-hash',
          newEmailHash: 'new-hash',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_EMAIL_UPDATED, data)).toThrow(TypeError);
      });
    });

    describe('USER_PASSWORD_CHANGED validation', () => {
      it('should validate correct USER_PASSWORD_CHANGED data with User actor', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          changedAt: new Date().toISOString(),
          changedBy: PasswordChangeActor.User,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PASSWORD_CHANGED, data)).not.toThrow();
      });

      it('should validate correct USER_PASSWORD_CHANGED data with Admin actor', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          changedAt: new Date().toISOString(),
          changedBy: PasswordChangeActor.Admin,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PASSWORD_CHANGED, data)).not.toThrow();
      });

      it('should validate correct USER_PASSWORD_CHANGED data with System actor', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          changedAt: new Date().toISOString(),
          changedBy: PasswordChangeActor.System,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PASSWORD_CHANGED, data)).not.toThrow();
      });

      it('should throw when changedAt is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          changedBy: PasswordChangeActor.User,
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PASSWORD_CHANGED, data)).toThrow(
          TypeError
        );
      });

      it('should throw when changedBy is invalid', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          changedAt: new Date().toISOString(),
          changedBy: 'invalid',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PASSWORD_CHANGED, data)).toThrow(
          TypeError
        );
      });
    });

    describe('USER_PROFILE_VIEWED validation', () => {
      it('should validate correct USER_PROFILE_VIEWED data', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          viewedBy: 'admin-789',
          fields: ['email', 'name'],
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PROFILE_VIEWED, data)).not.toThrow();
      });

      it('should throw when viewedBy is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          fields: ['email', 'name'],
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PROFILE_VIEWED, data)).toThrow(TypeError);
      });

      it('should throw when fields is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          viewedBy: 'admin-789',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PROFILE_VIEWED, data)).toThrow(TypeError);
      });

      it('should throw when fields is not an array', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          viewedBy: 'admin-789',
          fields: 'email,name',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_PROFILE_VIEWED, data)).toThrow(TypeError);
      });
    });

    describe('USER_STATUS_CHANGED validation', () => {
      it('should validate correct USER_STATUS_CHANGED data', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          oldStatus: 'active',
          newStatus: 'suspended',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_STATUS_CHANGED, data)).not.toThrow();
      });

      it('should throw when oldStatus is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          newStatus: 'suspended',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_STATUS_CHANGED, data)).toThrow(TypeError);
      });

      it('should throw when newStatus is missing', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          oldStatus: 'active',
          timestamp: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_STATUS_CHANGED, data)).toThrow(TypeError);
      });
    });

    describe('base field validation', () => {
      it('should throw when userId is not a string', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 123,
          timestamp: new Date().toISOString(),
          organizationId: 'org-789',
          emailHash: 'abc123...',
          createdAt: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_CREATED, data)).toThrow(TypeError);
      });

      it('should throw when timestamp is not a string', () => {
        const data = {
          tenantId: 'primary-encryption-key',
          userId: 'user-456',
          timestamp: new Date(),
          organizationId: 'org-789',
          emailHash: 'abc123...',
          createdAt: new Date().toISOString()
        };

        expect(() => validateEventData(UserEventType.USER_CREATED, data)).toThrow(TypeError);
      });

      it('should throw when data is null', () => {
        expect(() => validateEventData(UserEventType.USER_CREATED, null)).toThrow(TypeError);
      });

      it('should throw when data is not an object', () => {
        expect(() => validateEventData(UserEventType.USER_CREATED, 'invalid')).toThrow(TypeError);
      });
    });
  });

  describe('extractEventType', () => {
    it('should extract eventType from EventMessage', () => {
      const event: EventMessage<unknown> = {
        eventType: 'user.created',
        eventId: 'event-123',
        timestamp: new Date(),
        occurredAt: new Date(),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: {},
        schemaVersion: '1.0'
      };

      const eventType = extractEventType(event);

      expect(eventType).toBe('user.created');
    });

    it('should handle all user event types', () => {
      const eventTypes = Object.values(UserEventType);

      eventTypes.forEach((eventType) => {
        const event: EventMessage<unknown> = {
          eventType,
          eventId: 'event-123',
          timestamp: new Date(),
          occurredAt: new Date(),
          readonly: true,
          version: 1,
          aggregateId: 'user-456',
          data: {},
          schemaVersion: '1.0'
        };

        expect(extractEventType(event)).toBe(eventType);
      });
    });
  });

  describe('isUserEvent', () => {
    it('should return true for user.created event', () => {
      const event: EventMessage<unknown> = {
        eventType: 'user.created',
        eventId: 'event-123',
        timestamp: new Date(),
        occurredAt: new Date(),
        readonly: true,
        version: 1,
        aggregateId: 'user-456',
        data: {},
        schemaVersion: '1.0'
      };

      expect(isUserEvent(event)).toBe(true);
    });

    it('should return true for all user event types', () => {
      const eventTypes = Object.values(UserEventType);

      eventTypes.forEach((eventType) => {
        const event: EventMessage<unknown> = {
          eventType,
          eventId: 'event-123',
          timestamp: new Date(),
          occurredAt: new Date(),
          readonly: true,
          version: 1,
          aggregateId: 'user-456',
          data: {},
          schemaVersion: '1.0'
        };

        expect(isUserEvent(event)).toBe(true);
      });
    });

    it('should return false for non-user event', () => {
      const event: EventMessage<unknown> = {
        eventType: 'order.created',
        eventId: 'event-123',
        timestamp: new Date(),
        occurredAt: new Date(),
        readonly: true,
        version: 1,
        aggregateId: 'order-456',
        data: {},
        schemaVersion: '1.0'
      };

      expect(isUserEvent(event)).toBe(false);
    });
  });

  describe('getSchemaVersion', () => {
    it('should return 1.0 for all event types', () => {
      const eventTypes = Object.values(UserEventType);

      eventTypes.forEach((eventType) => {
        const version = getSchemaVersion(eventType);
        expect(version).toBe('1.0');
      });
    });

    it('should return string type', () => {
      const version = getSchemaVersion(UserEventType.USER_CREATED);
      expect(typeof version).toBe('string');
    });
  });
});
