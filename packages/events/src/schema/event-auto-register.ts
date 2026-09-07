/**
 * Event schema auto-registration
 *
 * Provides helper functions to automatically register event schemas
 * from existing event type constants and definitions.
 *
 * @module schema/event-auto-register
 */

import { z } from 'zod';

import {
  EventValidationService,
  type EventSchemaDefinition
} from '../validation/event-validation.service';
import { EventRegistryService, type EventSchemaMetadata } from './event-registry.service';

/**
 * Common event schema definitions
 *
 * These are reusable schema fragments that can be composed
 * into full event schemas.
 */

/**
 * Base event metadata schema
 *
 * Common metadata fields present on all events.
 *
 * @example
 * ```typescript
 * const metadata = baseEventMetadataSchema.parse({
 *   correlationId: '550e8400-e29b-41d4-a716-446655440000',
 *   tenantId: '660e8400-e29b-41d4-a716-446655440001',
 *   userId: 'user-123'
 * });
 * ```
 */
export const baseEventMetadataSchema = z.object({
  correlationId: z.string().uuid().optional(),
  causationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  userId: z.string().optional()
});

/**
 * User event schemas (v1.0)
 *
 * Schemas for user-related events.
 */

/**
 * User created event data v1.0
 *
 * @example
 * ```typescript
 * const userData = UserCreatedDataV1Schema.parse({
 *   userId: '550e8400-e29b-41d4-a716-446655440000',
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   roles: ['user'],
 *   status: 'active'
 * });
 * ```
 */
export const UserCreatedDataV1Schema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(255),
  roles: z.array(z.enum(['user', 'admin', 'super_admin'])).default(['user']),
  status: z.enum(['active', 'inactive', 'suspended']).default('active'),
  organizationId: z.string().uuid().optional()
});

/**
 * User updated event data v1.0
 *
 * @example
 * ```typescript
 * const updateData = UserUpdatedDataV1Schema.parse({
 *   userId: '550e8400-e29b-41d4-a716-446655440000',
 *   changes: { name: 'Jane Doe' },
 *   updatedAt: '2024-01-15T10:30:00Z',
 *   updatedBy: 'admin-user-id'
 * });
 * ```
 */
export const UserUpdatedDataV1Schema = z.object({
  userId: z.string().uuid(),
  changes: z.record(z.string(), z.unknown()),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().optional()
});

/**
 * User deleted event data v1.0
 *
 * @example
 * ```typescript
 * const deleteData = UserDeletedDataV1Schema.parse({
 *   userId: '550e8400-e29b-41d4-a716-446655440000',
 *   deletedAt: '2024-01-15T10:30:00Z',
 *   deletedBy: 'admin-user-id',
 *   reason: 'User requested account deletion'
 * });
 * ```
 */
export const UserDeletedDataV1Schema = z.object({
  userId: z.string().uuid(),
  deletedAt: z.string().datetime(),
  deletedBy: z.string().optional(),
  reason: z.string().optional()
});

/**
 * Organization event schemas (v1.0)
 */

/**
 * Organization created event data v1.0
 *
 * @example
 * ```typescript
 * const orgData = OrganizationCreatedDataV1Schema.parse({
 *   organizationId: '660e8400-e29b-41d4-a716-446655440001',
 *   name: 'Acme Corp',
 *   slug: 'acme-corp',
 *   plan: 'pro',
 *   createdAt: '2024-01-15T10:30:00Z'
 * });
 * ```
 */
export const OrganizationCreatedDataV1Schema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
  createdAt: z.string().datetime(),
  createdBy: z.string().optional()
});

/**
 * Organization updated event data v1.0
 *
 * @example
 * ```typescript
 * const orgUpdateData = OrganizationUpdatedDataV1Schema.parse({
 *   organizationId: '660e8400-e29b-41d4-a716-446655440001',
 *   changes: { name: 'Acme Corporation' },
 *   updatedAt: '2024-01-15T10:30:00Z'
 * });
 * ```
 */
export const OrganizationUpdatedDataV1Schema = z.object({
  organizationId: z.string().uuid(),
  changes: z.record(z.string(), z.unknown()),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().optional()
});

/**
 * System event schemas (v1.0)
 */

/**
 * System started event data v1.0
 *
 * @example
 * ```typescript
 * const systemData = SystemStartedDataV1Schema.parse({
 *   instanceId: '770e8400-e29b-41d4-a716-446655440002',
 *   startTime: '2024-01-15T10:30:00Z',
 *   version: '1.0.0',
 *   environment: 'production'
 * });
 * ```
 */
export const SystemStartedDataV1Schema = z.object({
  instanceId: z.string().uuid(),
  startTime: z.string().datetime(),
  version: z.string(),
  environment: z.enum(['development', 'staging', 'production'])
});

/**
 * Event type constant mappings
 *
 * Maps event types to their schemas and metadata.
 */

/**
 * Event schema registration entry
 *
 * Combines schema definition with metadata for registration.
 */
export interface EventSchemaRegistration {
  /** Event type (e.g., 'user.created') */
  readonly eventType: string;
  /** Schema version (e.g., '1.0') */
  readonly version: string;
  /** Zod schema */
  readonly schema: z.ZodSchema;
  /** Human-readable description */
  readonly description: string;
  /** Example payload */
  readonly example: unknown;
  /** Whether deprecated */
  readonly deprecated?: boolean;
  /** Related event types */
  readonly relatedEvents?: ReadonlyArray<string>;
}

/**
 * Default event schema registry
 *
 * Pre-defined schemas for common event types.
 */
export const DEFAULT_EVENT_SCHEMAS: ReadonlyArray<EventSchemaRegistration> = [
  // User events
  {
    eventType: 'user.created',
    version: '1.0',
    schema: UserCreatedDataV1Schema,
    description: 'Emitted when a new user account is created',
    example: {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
      name: 'John Doe',
      roles: ['user'],
      status: 'active'
    },
    relatedEvents: ['user.updated', 'user.deleted']
  },
  {
    eventType: 'user.updated',
    version: '1.0',
    schema: UserUpdatedDataV1Schema,
    description: 'Emitted when user information is updated',
    example: {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      changes: { name: 'Jane Doe' },
      updatedAt: '2024-01-15T10:30:00Z',
      updatedBy: 'admin-user-id'
    },
    relatedEvents: ['user.created', 'user.deleted']
  },
  {
    eventType: 'user.deleted',
    version: '1.0',
    schema: UserDeletedDataV1Schema,
    description: 'Emitted when a user account is deleted',
    example: {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      deletedAt: '2024-01-15T10:30:00Z',
      deletedBy: 'admin-user-id',
      reason: 'User requested account deletion'
    },
    relatedEvents: ['user.created', 'user.updated']
  },
  // Organization events
  {
    eventType: 'organization.created',
    version: '1.0',
    schema: OrganizationCreatedDataV1Schema,
    description: 'Emitted when a new organization is created',
    example: {
      organizationId: '660e8400-e29b-41d4-a716-446655440001',
      name: 'Acme Corp',
      slug: 'acme-corp',
      plan: 'pro',
      createdAt: '2024-01-15T10:30:00Z'
    },
    relatedEvents: ['organization.updated']
  },
  {
    eventType: 'organization.updated',
    version: '1.0',
    schema: OrganizationUpdatedDataV1Schema,
    description: 'Emitted when organization information is updated',
    example: {
      organizationId: '660e8400-e29b-41d4-a716-446655440001',
      changes: { name: 'Acme Corporation' },
      updatedAt: '2024-01-15T10:30:00Z'
    },
    relatedEvents: ['organization.created']
  },
  // System events
  {
    eventType: 'system.started',
    version: '1.0',
    schema: SystemStartedDataV1Schema,
    description: 'Emitted when a system instance starts',
    example: {
      instanceId: '770e8400-e29b-41d4-a716-446655440002',
      startTime: '2024-01-15T10:30:00Z',
      version: '1.0.0',
      environment: 'production'
    }
  }
] as const;

/**
 * Register all default event schemas
 *
 * Automatically registers validation schemas and metadata
 * for all pre-defined event types.
 *
 * @param validationService - Event validation service
 * @param registryService - Event registry service
 *
 * @example
 * ```typescript
 * import { registerAllEventSchemas } from '@package/events';
 *
 * // In your module initialization
 * registerAllEventSchemas(validationService, registryService);
 * ```
 */
export function registerAllEventSchemas(
  validationService: EventValidationService,
  registryService: EventRegistryService
): void {
  for (const registration of DEFAULT_EVENT_SCHEMAS) {
    // Register validation schema
    validationService.registerSchema({
      eventType: registration.eventType,
      version: registration.version,
      schema: registration.schema
    } as EventSchemaDefinition);

    // Register schema metadata
    registryService.register({
      eventType: registration.eventType,
      version: registration.version,
      description: registration.description,
      example: registration.example,
      deprecated: registration.deprecated ?? false,
      relatedEvents: registration.relatedEvents,
      introducedAt: new Date() // Track when schema was added to registry
    } as EventSchemaMetadata);
  }
}

/**
 * Register custom event schemas
 *
 * Registers custom event schemas from user-provided definitions.
 *
 * @param schemas - Array of custom schema registrations
 * @param validationService - Event validation service
 * @param registryService - Event registry service
 *
 * @example
 * ```typescript
 * registerCustomEventSchemas(
 *   [
 *     {
 *       eventType: 'order.placed',
 *       version: '1.0',
 *       schema: z.object({
 *         orderId: z.string().uuid(),
 *         amount: z.number().positive(),
 *       }),
 *       description: 'Emitted when an order is placed',
 *       example: { orderId: '...', amount: 99.99 },
 *     },
 *   ],
 *   validationService,
 *   registryService
 * );
 * ```
 */
export function registerCustomEventSchemas(
  schemas: ReadonlyArray<EventSchemaRegistration>,
  validationService: EventValidationService,
  registryService: EventRegistryService
): void {
  for (const registration of schemas) {
    // Register validation schema
    validationService.registerSchema({
      eventType: registration.eventType,
      version: registration.version,
      schema: registration.schema
    } as EventSchemaDefinition);

    // Register schema metadata
    registryService.register({
      eventType: registration.eventType,
      version: registration.version,
      description: registration.description,
      example: registration.example,
      deprecated: registration.deprecated ?? false,
      relatedEvents: registration.relatedEvents
    } as EventSchemaMetadata);
  }
}
