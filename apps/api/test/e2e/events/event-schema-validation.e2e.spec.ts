/**
 * Event Schema Validation E2E Tests
 *
 * Tests the EventValidationService for runtime schema validation of events.
 * Validates:
 * 1. Valid event passes validation
 * 2. Invalid event type is rejected (or passes with warning since no schema registered)
 * 3. Invalid payload structure is rejected when schema is registered
 * 4. Schema version validation works
 * 5. Multiple schemas can be registered for same event type
 *
 * @packageDocumentation
 */

import { randomUUID } from 'crypto';

import {
  EventValidationService,
  type EventSchemaDefinition,
  type EventMessage
} from '@package/events';
import { z } from 'zod';

describe('Event Schema Validation E2E Tests', () => {
  let validationService: EventValidationService;

  beforeAll(() => {
    validationService = new EventValidationService(true);
  });

  describe('Schema Registration', () => {
    afterEach(() => {
      validationService.clearSchemas();
    });

    it('should register a single schema', () => {
      const schemaDefinition: EventSchemaDefinition<{ userId: string; email: string }> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email()
        })
      };

      validationService.registerSchema(schemaDefinition);

      expect(validationService.hasSchema('user.created', '1.0')).toBe(true);
      expect(validationService.hasSchema('user.created', '2.0')).toBe(false);
      expect(validationService.hasSchema('user.updated', '1.0')).toBe(false);
    });

    it('should register multiple schemas at once', () => {
      const schemas: ReadonlyArray<EventSchemaDefinition<unknown>> = [
        {
          eventType: 'user.created',
          version: '1.0',
          schema: z.object({
            userId: z.string().uuid(),
            email: z.string().email()
          })
        },
        {
          eventType: 'user.updated',
          version: '1.0',
          schema: z.object({
            userId: z.string().uuid(),
            name: z.string().optional()
          })
        }
      ];

      validationService.registerSchemas(schemas);

      expect(validationService.hasSchema('user.created', '1.0')).toBe(true);
      expect(validationService.hasSchema('user.updated', '1.0')).toBe(true);
    });

    it('should allow multiple schemas for same event type with different versions', () => {
      const v1Schema: EventSchemaDefinition<{ userId: string }> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid()
        })
      };

      const v2Schema: EventSchemaDefinition<{ userId: string; email: string }> = {
        eventType: 'user.created',
        version: '2.0',
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email()
        })
      };

      validationService.registerSchema(v1Schema);
      validationService.registerSchema(v2Schema);

      expect(validationService.hasSchema('user.created', '1.0')).toBe(true);
      expect(validationService.hasSchema('user.created', '2.0')).toBe(true);
      expect(validationService.getVersionsForEventType('user.created')).toEqual(['1.0', '2.0']);
    });

    it('should get all registered event types', () => {
      const schemas: ReadonlyArray<EventSchemaDefinition<unknown>> = [
        {
          eventType: 'user.created',
          version: '1.0',
          schema: z.object({ userId: z.string() })
        },
        {
          eventType: 'user.updated',
          version: '1.0',
          schema: z.object({ userId: z.string() })
        },
        {
          eventType: 'order.created',
          version: '1.0',
          schema: z.object({ orderId: z.string() })
        }
      ];

      validationService.registerSchemas(schemas);

      const eventTypes = validationService.getRegisteredEventTypes();
      expect(eventTypes).toHaveLength(3);
      expect(eventTypes).toContain('user.created');
      expect(eventTypes).toContain('user.updated');
      expect(eventTypes).toContain('order.created');
    });

    it('should clear all registered schemas', () => {
      const schema: EventSchemaDefinition<unknown> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({ userId: z.string() })
      };

      validationService.registerSchema(schema);
      expect(validationService.hasSchema('user.created', '1.0')).toBe(true);

      validationService.clearSchemas();
      expect(validationService.hasSchema('user.created', '1.0')).toBe(false);
      expect(validationService.getRegisteredEventTypes()).toHaveLength(0);
    });
  });

  describe('Event Validation - Valid Events', () => {
    beforeEach(() => {
      const schema: EventSchemaDefinition<{ userId: string; email: string }> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email()
        })
      };
      validationService.registerSchema(schema);
    });

    afterEach(() => {
      validationService.clearSchemas();
    });

    it('should pass validation for valid event', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: randomUUID(),
          email: 'test@example.com'
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should pass validation for event with optional fields', () => {
      const schema: EventSchemaDefinition<{ userId: string; name?: string }> = {
        eventType: 'user.updated',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid(),
          name: z.string().optional()
        })
      };
      validationService.registerSchema(schema);

      const event: EventMessage<{ userId: string }> = {
        eventType: 'user.updated',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: randomUUID()
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validateOrThrow without error for valid event', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: randomUUID(),
          email: 'test@example.com'
        }
      };

      expect(() => validationService.validateOrThrow(event)).not.toThrow();
    });
  });

  describe('Event Validation - Invalid Payload', () => {
    beforeEach(() => {
      const schema: EventSchemaDefinition<{ userId: string; email: string }> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email()
        })
      };
      validationService.registerSchema(schema);
    });

    afterEach(() => {
      validationService.clearSchemas();
    });

    it('should fail validation for invalid UUID format', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: 'not-a-uuid',
          email: 'test@example.com'
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.errors![0]!.path).toBe('userId');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.errors![0]!.message).toContain('Invalid UUID');
    });

    it('should fail validation for invalid email format', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: randomUUID(),
          email: 'not-an-email'
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.errors![0]!.path).toBe('email');
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.errors![0]!.message).toContain('Invalid email');
    });

    it('should fail validation for missing required field', () => {
      const event: EventMessage<{ userId: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          // email field is missing
          userId: randomUUID()
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.errors![0]!.path).toBe('email');
    });

    it('should fail validation with multiple errors', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: 'not-a-uuid',
          email: 'not-an-email'
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThanOrEqual(2);
    });

    it('should throw error for validateOrThrow with invalid payload', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: 'not-a-uuid',
          email: 'test@example.com'
        }
      };

      expect(() => validationService.validateOrThrow(event)).toThrow(
        /Event validation failed for user\.created@1\.0/
      );
    });
  });

  describe('Event Validation - No Schema Registered', () => {
    it('should pass validation when no schema is registered for event type', () => {
      const event: EventMessage<unknown> = {
        eventType: 'unknown.event',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          any: 'data'
        }
      };

      const result = validationService.validate(event);

      // Events without schemas pass validation (graceful degradation)
      expect(result.valid).toBe(true);
    });

    it('should pass validation when no schema is registered for version', () => {
      const schema: EventSchemaDefinition<unknown> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({ userId: z.string() })
      };
      validationService.registerSchema(schema);

      const event: EventMessage<unknown> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '2.0', // Version 2.0 not registered
        data: {
          userId: randomUUID()
        }
      };

      const result = validationService.validate(event);

      // Events with unregistered versions pass validation (forward compatibility)
      expect(result.valid).toBe(true);
    });

    afterEach(() => {
      validationService.clearSchemas();
    });
  });

  describe('Schema Version Validation', () => {
    beforeEach(() => {
      const v1Schema: EventSchemaDefinition<{ userId: string }> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid()
        })
      };

      const v2Schema: EventSchemaDefinition<{ userId: string; email: string }> = {
        eventType: 'user.created',
        version: '2.0',
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email()
        })
      };

      validationService.registerSchema(v1Schema);
      validationService.registerSchema(v2Schema);
    });

    afterEach(() => {
      validationService.clearSchemas();
    });

    it('should validate against v1 schema when schemaVersion is 1.0', () => {
      const event: EventMessage<{ userId: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: randomUUID()
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should validate against v2 schema when schemaVersion is 2.0', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '2.0',
        data: {
          userId: randomUUID(),
          email: 'test@example.com'
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should pass validation when v2 payload is validated against v1 schema (Zod strips unknown fields)', () => {
      const event: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0', // Using v1 schema
        data: {
          userId: randomUUID(),
          email: 'test@example.com' // Extra field not in v1 schema - Zod strips it
        }
      };

      const result = validationService.validate(event);

      // Zod strips unknown fields by default, so this passes
      // If we used .strict() it would fail
      expect(result.valid).toBe(true);
    });

    it('should fail validation when v1 payload is validated against v2 schema', () => {
      const event: EventMessage<{ userId: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '2.0', // Using v2 schema
        data: {
          userId: randomUUID()
          // Missing email field required in v2
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(result.errors![0]!.path).toBe('email');
    });
  });

  describe('Disabled Validation', () => {
    it('should always pass validation when disabled', () => {
      const disabledService = new EventValidationService(false);

      const schema: EventSchemaDefinition<{ userId: string; email: string }> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid(),
          email: z.string().email()
        })
      };
      disabledService.registerSchema(schema);

      const invalidEvent: EventMessage<{ userId: string; email: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: 'not-a-uuid',
          email: 'not-an-email'
        }
      };

      const result = disabledService.validate(invalidEvent);

      expect(disabledService.isEnabled()).toBe(false);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should check if validation is enabled', () => {
      const enabledService = new EventValidationService(true);
      const disabledService = new EventValidationService(false);

      expect(enabledService.isEnabled()).toBe(true);
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('Multi-Tenancy Compliance', () => {
    beforeEach(() => {
      const schema: EventSchemaDefinition<{ userId: string; tenantId: string }> = {
        eventType: 'user.created',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid(),
          tenantId: z.string()
        })
      };
      validationService.registerSchema(schema);
    });

    afterEach(() => {
      validationService.clearSchemas();
    });

    it('should validate event with tenant context', () => {
      const event: EventMessage<{ userId: string; tenantId: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        tenantId: 'primary-encryption-key',
        data: {
          userId: randomUUID(),
          tenantId: 'primary-encryption-key'
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should fail validation when tenantId is invalid', () => {
      const event: EventMessage<{ userId: string; tenantId: string }> = {
        eventType: 'user.created',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        tenantId: 123 as unknown as string, // Invalid type
        data: {
          userId: randomUUID(),
          tenantId: 123 as unknown as string
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(false);
    });
  });

  describe('Complex Schema Validation', () => {
    beforeEach(() => {
      const schema: EventSchemaDefinition<{
        userId: string;
        profile: {
          name: string;
          age: number;
          address: {
            street: string;
            city: string;
          };
        };
        tags: string[];
      }> = {
        eventType: 'user.profile.updated',
        version: '1.0',
        schema: z.object({
          userId: z.string().uuid(),
          profile: z.object({
            name: z.string().min(1),
            age: z.number().int().min(0).max(150),
            address: z.object({
              street: z.string(),
              city: z.string()
            })
          }),
          tags: z.array(z.string())
        })
      };
      validationService.registerSchema(schema);
    });

    afterEach(() => {
      validationService.clearSchemas();
    });

    it('should validate complex nested object', () => {
      const event: EventMessage<{
        userId: string;
        profile: {
          name: string;
          age: number;
          address: {
            street: string;
            city: string;
          };
        };
        tags: string[];
      }> = {
        eventType: 'user.profile.updated',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: randomUUID(),
          profile: {
            name: 'John Doe',
            age: 30,
            address: {
              street: '123 Main St',
              city: 'San Francisco'
            }
          },
          tags: ['developer', 'typescript']
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(true);
    });

    it('should fail validation for invalid nested structure', () => {
      const event: EventMessage<unknown> = {
        eventType: 'user.profile.updated',
        eventId: randomUUID(),
        timestamp: new Date(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        readonly: true,
        occurredAt: new Date(),
        version: 1,
        schemaVersion: '1.0',
        data: {
          userId: randomUUID(),
          profile: {
            name: 'John Doe',
            age: 200, // Invalid: > 150
            address: {
              street: '123 Main St'
              // Missing city
            }
          },
          tags: 'not-an-array' // Invalid: should be array
        }
      };

      const result = validationService.validate(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });
});
