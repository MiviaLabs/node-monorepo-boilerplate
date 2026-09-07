# Event Schemas Guide

**This guide explains how to design type-safe event schemas for event-driven architecture.**

## Table of Contents

- [What are Event Schemas?](#what-are-event-schemas)
- [Schema Design Principles](#schema-design-principles)
- [Schema Structure](#schema-structure)
- [Creating Event Schemas](#creating-event-schemas)
- [Schema Versioning](#schema-versioning)
- [Common Patterns](#common-patterns)
- [Multi-Tenancy](#multi-tenancy)
- [Best Practices](#best-practices)

---

## What are Event Schemas?

**Event schemas** define the structure of event data. They provide type safety, validation, and documentation for events.

### Why Event Schemas Matter

```typescript
// ❌ WITHOUT schema: No type safety
await this.eventBus.publish('user.created', {
  userId: 'user-123'
  // Did I include email? What about tenantId?
  // TypeScript won't help me here
});

// ✅ WITH schema: Type-safe
await this.eventBus.publish('user.created', {
  userId: 'user-123',
  email: 'user@example.com', // TypeScript validates required fields
  tenantId: 'tenant-1',
  createdAt: new Date().toISOString()
} as UserCreatedData);
```

### Benefits

1. **Type Safety** - TypeScript ensures correct data structure
2. **Validation** - Zod schemas can validate at runtime
3. **Documentation** - Schemas serve as living documentation
4. **IntelliSense** - IDE auto-completion for event data
5. **Refactoring** - Safe code changes with compile-time checks

---

## Schema Design Principles

### Principle 1: Self-Contained Data

**Events should contain all data consumers need.**

```typescript
// ✅ GOOD: Complete data
interface UserCreatedData {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: string;
  createdAt: string;
}

// ❌ BAD: Incomplete data
interface UserCreatedData {
  userId: string;
  // Consumer would need to query database for email, name, etc.
}
```

### Principle 2: Immutable Facts

**Events represent facts that have occurred.**

```typescript
// ✅ GOOD: Past tense (fact)
'user.created'; // User was created
'order.completed'; // Order was completed

// ❌ BAD: Commands or requests
'user.create'; // This is a command, not an event
'create.user'; // Also a command
```

### Principle 3: Privacy-Aware Design

**Never include sensitive data in events.**

```typescript
// ✅ GOOD: Hashed email
interface UserCreatedData {
  userId: string;
  emailHash: string; // SHA-256 hash
  // Sensitive data stored separately
}

// ❌ BAD: Plain text email
interface UserCreatedData {
  userId: string;
  email: 'user@example.com'; // PII exposed!
}
```

### Principle 4: Explicit Types

**Use specific types, not `any` or loose types.**

```typescript
// ✅ GOOD: Explicit types
interface UserCreatedData {
  readonly userId: string;
  readonly email: string;
  readonly createdAt: string; // ISO 8601
  readonly isActive: boolean;
}

// ❌ BAD: Vague types
interface UserCreatedData {
  userId: any;
  email: unknown;
  createdAt: Date | string | number;
}
```

---

## Schema Structure

### Base Event Interface

All events follow the `EventMessage<T>` interface:

```typescript
interface EventMessage<T = unknown> {
  // Identification
  readonly eventType: string; // 'user.created'
  readonly eventId: string; // UUID
  readonly timestamp: Date; // Event creation time

  // Payload
  readonly data: T; // Event data (your schema)

  // Aggregation
  readonly aggregateId?: string; // Entity ID
  readonly aggregateVersion?: number;

  // Tracing
  readonly correlationId?: string; // For distributed tracing
  readonly causationId?: string; // Event chain

  // Schema versioning
  readonly schemaVersion: string; // '1.0', '1.1', etc.

  // Multi-tenancy
  readonly tenantId?: string; // Tenant identifier
}
```

### Event Data Schema

Your event data schema defines the `data` field:

```typescript
interface UserCreatedData {
  // Required fields
  readonly userId: string;
  readonly tenantId: string;
  readonly email: string;

  // Optional fields
  readonly name?: string;
  readonly phoneNumber?: string;

  // Timestamps (ISO 8601 format)
  readonly createdAt: string;
}
```

---

## Creating Event Schemas

### Step 1: Define Schema Interface

**File:** `apps/api/src/modules/users/events/user-events.schema.ts`

```typescript
/**
 * Base event data interface
 *
 * Common fields shared across all user events.
 */
export interface BaseUserEventData {
  /**
   * Tenant/organization ID
   *
   * Required for multi-tenant isolation.
   */
  readonly tenantId: string;

  /**
   * User ID
   *
   * Unique identifier for the user.
   */
  readonly userId: string;

  /**
   * Event timestamp
   *
   * When the event occurred (ISO 8601 format).
   */
  readonly timestamp: string;
}

/**
 * User created event data
 *
 * Fired when a new user is created in the system.
 */
export interface UserCreatedData extends BaseUserEventData {
  /**
   * Organization ID
   *
   * The organization this user belongs to.
   */
  readonly organizationId: string;

  /**
   * Email hash
   *
   * SHA-256 hash of the user's email for privacy.
   * Actual email is stored encrypted separately.
   */
  readonly emailHash: string;

  /**
   * Creation timestamp
   *
   * When the user was created (ISO 8601 format).
   */
  readonly createdAt: string;
}
```

### Step 2: Define Event Type Constants

**File:** `apps/api/src/modules/users/events/user-event-types.constants.ts`

```typescript
/**
 * User event type constants
 *
 * Type-safe event type values.
 */
export const UserEventType = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_EMAIL_UPDATED: 'user.email.updated',
  USER_PASSWORD_CHANGED: 'user.password.changed',
  USER_PROFILE_VIEWED: 'user.profile.viewed',
  USER_STATUS_CHANGED: 'user.status.changed'
} as const;

export type UserEventType = (typeof UserEventType)[keyof typeof UserEventType];
```

### Step 3: Create Type Mapping

**File:** `apps/api/src/modules/users/events/user-events.schema.ts` (continued)

```typescript
/**
 * Event data schema mapping
 *
 * Maps event types to their corresponding data schemas.
 * Provides type safety when working with events.
 */
export type UserEventDataSchemas = {
  [UserEventType.USER_CREATED]: UserCreatedData;
  [UserEventType.USER_UPDATED]: UserUpdatedData;
  [UserEventType.USER_DELETED]: UserDeletedData;
  [UserEventType.USER_EMAIL_UPDATED]: UserEmailUpdatedData;
  [UserEventType.USER_PASSWORD_CHANGED]: UserPasswordChangedData;
  [UserEventType.USER_PROFILE_VIEWED]: UserProfileViewedData;
  [UserEventType.USER_STATUS_CHANGED]: UserStatusChangedData;
};
```

### Step 4: Use in Consumer

```typescript
import type { EventMessage } from '@package/events';
import type { UserCreatedData } from '../../events';

@Injectable()
export class UserCreatedConsumer {
  @EventHandler('user.created')
  handleUserCreated(event: EventMessage<UserCreatedData>) {
    // TypeScript knows event.data has these fields:
    console.log(event.data.userId);
    console.log(event.data.tenantId);
    console.log(event.data.organizationId);
    console.log(event.data.emailHash);
    console.log(event.data.createdAt);

    // Compile-time error if accessing non-existent field:
    // console.log(event.data.nonExistentField); // ERROR!
  }
}
```

---

## Schema Versioning

### Why Version Schemas?

Event schemas evolve over time. Versioning allows:

- **Backward compatibility** - Old consumers work with new events
- **Gradual migration** - Update consumers incrementally
- **Multiple versions** - Support old and new simultaneously

### Versioning Strategy

```typescript
// Version 1.0 - Initial schema
interface UserCreatedDataV1 {
  readonly userId: string;
  readonly email: string;
  readonly createdAt: string;
  schemaVersion: '1.0';
}

// Version 1.1 - Add optional field (backward compatible)
interface UserCreatedDataV1_1 {
  readonly userId: string;
  readonly email: string;
  readonly phoneNumber?: string; // NEW - optional
  readonly createdAt: string;
  schemaVersion: '1.1';
}

// Version 2.0 - Breaking change (new event type)
interface UserCreatedDataV2 {
  readonly userId: string;
  readonly profile: {
    readonly email: string;
    readonly phoneNumber: string;
  };
  readonly createdAt: string;
  schemaVersion: '2.0';
}
```

### Versioning Rules

1. **Patch version (1.0 -> 1.1)** - Add optional fields (backward compatible)
2. **Minor version (1.x -> 2.0)** - Breaking changes, create new event type

### Backward-Compatible Changes

```typescript
// ✅ GOOD: Add optional field
interface UserCreatedData {
  readonly userId: string;
  readonly email: string;
  readonly phoneNumber?: string; // NEW - optional
  readonly createdAt: string;
}
// Old consumers still work (phoneNumber is undefined)

// ✅ GOOD: Add field with default value
interface UserCreatedData {
  readonly userId: string;
  readonly email: string;
  readonly role: string; // NEW - has default value
  readonly createdAt: string;
}
```

### Breaking Changes

```typescript
// ❌ BAD: Remove field
interface UserCreatedData {
  readonly userId: string;
  // readonly email: string; // REMOVED - breaking!
  readonly createdAt: string;
}
// Old consumers expect email field

// ❌ BAD: Change field type
interface UserCreatedData {
  readonly userId: string;
  readonly email: number; // CHANGED from string - breaking!
  readonly createdAt: string;
}

// ✅ GOOD: Create new event type for breaking changes
('user.created.v2'); // New event type
```

### Schema Version in Events

```typescript
await this.outboxRepo.insert(tx, {
  eventId: randomUUID(),
  eventType: 'user.created',
  aggregateId: user.id,
  payload: {
    userId: user.id,
    email: user.email
  },
  schemaVersion: '1.1' // Specify schema version
});
```

---

## Common Patterns

### Pattern 1: Base Event Interface

```typescript
// Base interface with common fields
export interface BaseUserEventData {
  readonly tenantId: string;
  readonly userId: string;
  readonly timestamp: string;
}

// Extend for specific events
export interface UserCreatedData extends BaseUserEventData {
  readonly organizationId: string;
  readonly emailHash: string;
}

export interface UserUpdatedData extends BaseUserEventData {
  readonly changes: Readonly<Record<string, unknown>>;
}
```

### Pattern 2: Const Enums for Fixed Values

```typescript
const enum DeletionType {
  Soft = 'soft',
  Hard = 'hard'
}

export interface UserDeletedData extends BaseUserEventData {
  readonly deletionType: DeletionType;
  readonly deletedBy?: string;
}
```

### Pattern 3: Readonly for Immutability

```typescript
// ✅ GOOD: Readonly
export interface UserCreatedData {
  readonly userId: string;
  readonly email: string;
  readonly createdAt: string;
}

// ❌ BAD: Mutable
export interface UserCreatedData {
  userId: string;
  email: string;
  createdAt: string;
}
```

### Pattern 4: ISO 8601 for Dates

```typescript
// ✅ GOOD: ISO 8601 strings
export interface UserCreatedData {
  readonly createdAt: string; // '2024-01-01T00:00:00.000Z'
  readonly updatedAt: string;
}

// ❌ BAD: Date objects or timestamps
export interface UserCreatedData {
  readonly createdAt: Date; // Don't use Date objects
  readonly updatedAt: number; // Don't use Unix timestamps
}
```

---

## Multi-Tenancy

### Include Tenant Context

All events should include `tenantId`:

```typescript
// ✅ GOOD: Includes tenant context
export interface UserCreatedData {
  readonly tenantId: string; // REQUIRED
  readonly userId: string;
  readonly email: string;
}

// ❌ BAD: Missing tenant context
export interface UserCreatedData {
  readonly userId: string;
  readonly email: string;
  // No tenantId - consumer can't scope to tenant
}
```

### Tenant-Scoped Events

```typescript
export interface BaseUserEventData {
  readonly tenantId: string; // Always include
  readonly userId: string;
  readonly timestamp: string;
}

export interface UserCreatedData extends BaseUserEventData {
  readonly organizationId: string;
  readonly emailHash: string;
}
```

---

## Best Practices

### 1. Use Descriptive Field Names

```typescript
// ✅ GOOD: Descriptive
{
  userId: 'user-123';
  organizationId: 'org-456';
  createdAt: '2024-01-01T00:00:00.000Z';
}

// ❌ BAD: Abbreviations
{
  uid: 'user-123';
  orgId: 'org-456';
  created: '2024-01-01T00:00:00.000Z';
}
```

### 2. Include Complete Data

```typescript
// ✅ GOOD: Complete
{
  userId: 'user-123';
  email: 'user@example.com';
  name: 'John Doe';
  role: 'customer';
  createdAt: '2024-01-01T00:00:00.000Z';
}

// ❌ BAD: Incomplete
{
  userId: 'user-123';
  // Missing email, name, etc.
}
```

### 3. Use Readonly

```typescript
// ✅ GOOD: Readonly
export interface UserCreatedData {
  readonly userId: string;
  readonly email: string;
}
```

### 4. Document Your Schemas

````typescript
/**
 * User created event data
 *
 * Fired when a new user is created in the system.
 *
 * @example
 * ```typescript
 * const data: UserCreatedData = {
 *   tenantId: 'org-123',
 *   userId: 'user-456',
 *   emailHash: 'abc123...',
 *   createdAt: '2024-01-01T00:00:00.000Z',
 * };
 * ```
 */
export interface UserCreatedData {
  readonly tenantId: string;
  readonly userId: string;
  readonly emailHash: string;
  readonly createdAt: string;
}
````

### 5. Use Type Guards for Validation

```typescript
/**
 * Type guard for UserCreatedData
 */
function isUserCreatedData(data: unknown): data is UserCreatedData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'userId' in data &&
    'tenantId' in data &&
    'emailHash' in data &&
    'createdAt' in data
  );
}

// Usage
if (isUserCreatedData(event.data)) {
  // TypeScript knows event.data is UserCreatedData
  console.log(event.data.userId);
}
```

---

## Summary

**Key Takeaways:**

1. **Define schemas** for all event data
2. **Use readonly** for immutability
3. **Include complete data** - self-contained events
4. **Add tenant context** - always include `tenantId`
5. **Version your schemas** - use `schemaVersion` field
6. **Document schemas** - JSDoc comments

**Quick Reference:**

```typescript
// 1. Define schema
export interface UserCreatedData {
  readonly tenantId: string;
  readonly userId: string;
  readonly emailHash: string;
  readonly createdAt: string;
}

// 2. Define event type
export const UserEventType = {
  USER_CREATED: 'user.created',
} as const;

// 3. Use in consumer
@EventHandler('user.created')
handle(event: EventMessage<UserCreatedData>) {
  console.log(event.data.userId); // Type-safe!
}
```

**Next Steps:**

- [Publishing Events](publishing-events.md) - How to publish events with schemas
- [Creating Consumers](creating-consumers.md) - How to consume typed events
- [Testing Events](testing-events.md) - How to test event schemas
