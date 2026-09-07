# Auth Module - Repositories

This document provides a comprehensive overview of the Authentication module's repository layer, including all data access patterns, transaction handling, and multi-tenancy implementation.

## Table of Contents

- [Overview](#overview)
- [AuthRepository](#authrepository)
  - [Query Methods](#query-methods)
  - [Mutation Methods](#mutation-methods)
  - [Organization Management](#organization-management)
  - [Soft Delete Support](#soft-delete-support)
- [UserIdentityRepository](#useridentityrepository)
  - [Query Methods](#query-methods-1)
  - [Mutation Methods](#mutation-methods-1)
  - [Batch Operations](#batch-operations)
- [OrganizationRepository](#organizationrepository)
  - [Query Methods](#query-methods-2)
  - [Mutation Methods](#mutation-methods-2)
  - [Soft Delete Support](#soft-delete-support-1)
- [Transaction Patterns](#transaction-patterns)
- [Multi-Tenancy Implementation](#multi-tenancy-implementation)
- [Security Considerations](#security-considerations)

## Overview

The Auth module uses three main repositories for data access:

1. **AuthRepository** - User authentication and account management
2. **UserIdentityRepository** - Multi-provider identity management
3. **OrganizationRepository** - Organization/tenant management

All repositories:

- Extend `BaseRepository` for consistent patterns
- Support transactions for atomic operations
- Include multi-tenancy scoping
- Use email hashing for secure lookups
- Support soft delete for GDPR compliance

## AuthRepository

**Location:** `src/modules/auth/repositories/auth.repository.ts`

**Extends:** `BaseRepository<User, NewUser, {}, string>`

**Table:** `users` from `@package/db-core`

The `AuthRepository` handles all user authentication and account management operations. It provides methods for user lookup, creation, and organization management.

### Query Methods

#### findById

Find a user by ID within tenant scope (excludes soft-deleted users).

```typescript
async findById(
  tenantId: string,
  id: number
): Promise<User | null>
```

**Parameters:**

- `tenantId` - Tenant ID (organization ID as string)
- `id` - User ID

**Returns:** User or null if not found

**SQL:**

```sql
SELECT * FROM users
WHERE organization_id = ? AND id = ? AND deleted_at IS NULL
LIMIT 1
```

**Example:**

```typescript
const user = await authRepository.findById('123', 456);
if (!user) {
  throw Errors.useruserWithId001({ userId: '456' });
}
```

#### findByIdWithTransaction

Same as `findById` but within a transaction context.

```typescript
async findByIdWithTransaction(
  tx: NodePgDatabase,
  tenantId: string,
  id: number
): Promise<User | null>
```

**Use Case:** Ensure consistent reads within a transaction.

#### findByEmail

Find user by email address (uses email hash for secure lookup).

```typescript
async findByEmail(
  tenantId: string | undefined,
  email: string
): Promise<User | null>
```

**Parameters:**

- `tenantId` - Tenant ID (or undefined for global search during public registration)
- `email` - User email address

**Returns:** User or null if not found

**Security:** Email is hashed using SHA-256 before database lookup to prevent storing plaintext emails in indexes.

**SQL:**

```sql
-- If tenantId provided
SELECT * FROM users
WHERE organization_id = ? AND email_hash = ? AND deleted_at IS NULL
LIMIT 1

-- If tenantId is undefined (public registration)
SELECT * FROM users
WHERE email_hash = ? AND deleted_at IS NULL
LIMIT 1
```

**Example:**

```typescript
// Tenant-scoped search
const user = await authRepository.findByEmail('123', 'user@example.com');

// Global search (public registration)
const user = await authRepository.findByEmail(undefined, 'user@example.com');
```

#### findByEmailOrThrow

Same as `findByEmail` but throws an error if user not found.

```typescript
async findByEmailOrThrow(
  tenantId: string | undefined,
  email: string
): Promise<User>
```

**Throws:** `Errors.authinvalidEmailOr001({})` if user not found

**Use Case:** When you expect the user to exist and want to fail fast.

#### emailExists

Check if email exists within tenant (or globally).

```typescript
async emailExists(
  tenantId: string | undefined,
  email: string
): Promise<boolean>
```

**Returns:** True if email exists

**Use Case:** Email uniqueness validation during registration.

**Example:**

```typescript
if (await authRepository.emailExists('123', 'user@example.com')) {
  throw Errors.useruserWithEmail002({ email: 'user@example.com' });
}
```

#### findWithOrganizationByEmail

Find user with organization details by email (JOIN query).

```typescript
async findWithOrganizationByEmail(
  email: string
): Promise<{
  user: User;
  organization: Organization;
} | null>
```

**Returns:** User and organization or null

**SQL:**

```sql
SELECT users.*, organizations.*
FROM users
INNER JOIN organizations ON users.organization_id = organizations.id
WHERE users.email_hash = ? AND users.deleted_at IS NULL
LIMIT 1
```

**Use Case:** Login - need both user and organization info (including GCP tenant ID).

**Example:**

```typescript
const result = await authRepository.findWithOrganizationByEmail('user@example.com');
if (!result) {
  throw Errors.authinvalidEmailOr001({});
}

const { user, organization } = result;
const gcpTenantId = organization.gcpTenantId;
```

#### findWithOrganizationByEmailHash

Same as `findWithOrganizationByEmail` but accepts pre-hashed email (for performance).

```typescript
async findWithOrganizationByEmailHash(
  emailHash: string
): Promise<{
  user: User;
  organization: Organization;
} | null>
```

#### findByOrganization

Find all users in an organization (excludes soft-deleted users).

```typescript
async findByOrganization(
  tenantId: string
): Promise<User[]>
```

**Returns:** Array of users in the organization

**SQL:**

```sql
SELECT * FROM users
WHERE organization_id = ? AND deleted_at IS NULL
```

**Use Case:** Organization-wide operations (e.g., delete all users when organization owner deletes account).

#### findByOrganizationWithTransaction

Same as `findByOrganization` but within a transaction.

```typescript
async findByOrganizationWithTransaction(
  tx: NodePgDatabase,
  tenantId: string
): Promise<User[]>
```

#### findExpiredSoftDeleted

Find users soft-deleted before retention cutoff date.

```typescript
async findExpiredSoftDeleted(
  retentionDays: number
): Promise<User[]>
```

**Parameters:**

- `retentionDays` - Number of days to retain soft-deleted records (e.g., 30)

**Returns:** Array of users eligible for permanent deletion

**SQL:**

```sql
SELECT * FROM users
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '? days'
```

**Use Case:** Scheduled job to permanently delete expired soft-deleted users (GDPR compliance).

**Example:**

```typescript
// In scheduled job handler
const expiredUsers = await authRepository.findExpiredSoftDeleted(30);
for (const user of expiredUsers) {
  await authRepository.hardDeletePermanently(String(user.organizationId), user.id);
}
```

### Mutation Methods

#### createWithEmail

Create a new user with email hashed for secure storage.

```typescript
async createWithEmail(
  tenantId: string | undefined,
  email: string,
  additionalData: Partial<NewUser> = {}
): Promise<User>
```

**Parameters:**

- `tenantId` - Tenant ID (or undefined for personal account)
- `email` - User email address
- `additionalData` - Additional user fields (displayName, isActive, etc.)

**Returns:** Created user

**Security:** Email is hashed using SHA-256 and stored in `email_hash` column.

**SQL:**

```sql
INSERT INTO users (organization_id, email_hash, ...)
VALUES (?, ?, ...)
RETURNING *
```

**Example:**

```typescript
const user = await authRepository.createWithEmail('123', 'user@example.com', {
  displayName: 'John Doe',
  isActive: true,
  isVerified: true
});
```

#### createWithEmailInTransaction

Same as `createWithEmail` but within a transaction.

```typescript
async createWithEmailInTransaction(
  tx: NodePgDatabase,
  tenantId: string | undefined,
  email: string,
  additionalData: Partial<NewUser> = {}
): Promise<User>
```

**Use Case:** Create user within same transaction as organization creation or event publishing.

#### deleteWithTransaction

Hard delete user (permanent removal).

```typescript
async deleteWithTransaction(
  tx: NodePgDatabase,
  tenantId: string,
  userId: number
): Promise<User>
```

**Returns:** Deleted user

**Warning:** This is a permanent deletion. Use `softDeleteWithTransaction` for GDPR-compliant deletion.

#### softDeleteWithTransaction

Soft delete user (mark as deleted, preserve data).

```typescript
async softDeleteWithTransaction(
  tx: NodePgDatabase,
  tenantId: string,
  userId: number
): Promise<User>
```

**SQL:**

```sql
UPDATE users
SET deleted_at = NOW(), is_active = false
WHERE organization_id = ? AND id = ?
RETURNING *
```

**Benefits:**

- Preserves data for retention period
- Allows account recovery
- GDPR-compliant (data can be purged after retention period)

**Example:**

```typescript
await db.transaction(async (tx) => {
  const deletedUser = await authRepository.softDeleteWithTransaction(tx, '123', 456);

  // Publish deletion event in same transaction
  await outboxRepo.insert(tx, {
    eventType: 'user.deleted',
    payload: { userId: deletedUser.id }
    // ...
  });
});
```

#### hardDeletePermanently

Permanently delete user (hard delete).

```typescript
async hardDeletePermanently(
  tenantId: string,
  userId: number
): Promise<void>
```

**Use Case:** Purge expired soft-deleted users after retention period.

**Warning:** This is irreversible. Ensure user has been soft-deleted and retention period has passed.

### Organization Management

#### createOrganizationForUser

Create a new tenant and organization for a user (during self-registration).

```typescript
async createOrganizationForUser(
  email: string,
  displayName?: string,
  gcpTenantId?: string
): Promise<number>
```

**Parameters:**

- `email` - User email (used to generate organization name/slug)
- `displayName` - Optional display name for organization
- `gcpTenantId` - Optional GCP tenant ID (will be null initially, updated by consumer)

**Returns:** Created organization ID

**Creates:**

1. Tenant record (type: 'individual', status: 'active')
2. Organization record (linked to tenant)

**SQL:**

```sql
BEGIN;
  INSERT INTO tenants (type, status) VALUES ('individual', 'active');
  INSERT INTO organizations (tenant_id, name, slug, is_active, gcp_tenant_id)
  VALUES (?, ?, ?, true, ?);
COMMIT;
```

**Example:**

```typescript
const organizationId = await authRepository.createOrganizationForUser(
  'user@example.com',
  'John Doe',
  'gcp-tenant-123'
);
```

#### createOrganizationForUserInTransaction

Same as `createOrganizationForUser` but within a transaction.

```typescript
async createOrganizationForUserInTransaction(
  tx: NodePgDatabase,
  email: string,
  displayName?: string,
  gcpTenantId?: string
): Promise<number>
```

**Use Case:** Create organization within same transaction as user creation.

#### setOrganizationOwnerInTransaction

Set organization owner (with authorization checks).

```typescript
async setOrganizationOwnerInTransaction(
  tx: NodePgDatabase,
  organizationId: number,
  userId: number,
  actorId?: string | number
): Promise<Organization>
```

**Parameters:**

- `tx` - Database transaction
- `organizationId` - Organization ID
- `userId` - User ID to set as owner
- `actorId` - ID of user performing the action (undefined for system/registration)

**Validation:**

1. User must belong to the organization
2. If `actorId` is defined (user-initiated), requires admin permissions
3. If `actorId` is undefined (system operation), bypasses authorization

**Throws:**

- `Errors.useruserWithId001()` if user not found
- `Errors.validationinvalidValueFor002()` if user doesn't belong to organization
- `Errors.authinsufficientPermissionsRequiredpermission004()` if unauthorized

**Example:**

```typescript
await db.transaction(async (tx) => {
  // System operation (registration) - no actorId
  await authRepository.setOrganizationOwnerInTransaction(
    tx,
    organizationId,
    userId,
    undefined // System operation
  );
});
```

#### updateOrganizationGcpTenant

Update organization with GCP tenant ID.

```typescript
async updateOrganizationGcpTenant(
  organizationId: number,
  gcpTenantId: string
): Promise<Organization>
```

**Use Case:** Update organization after GCP tenant is created.

#### updateOrganizationGcpTenantInTransaction

Same as `updateOrganizationGcpTenant` but within a transaction.

```typescript
async updateOrganizationGcpTenantInTransaction(
  tx: NodePgDatabase,
  organizationId: number,
  gcpTenantId: string
): Promise<Organization>
```

### Soft Delete Support

The `AuthRepository` supports both soft delete and hard delete modes:

**Soft Delete Mode** (`USE_SOFT_DELETE=true`):

- User is marked as deleted (`deleted_at` timestamp set)
- User is marked as inactive (`is_active = false`)
- Data is preserved for retention period
- Scheduled job purges expired soft-deleted users

**Hard Delete Mode** (`USE_SOFT_DELETE=false`):

- User is permanently removed from database
- Cannot be recovered

**Default Behavior:**

- All find methods exclude soft-deleted users (`WHERE deleted_at IS NULL`)
- Soft-deleted users are invisible to the application
- Expired soft-deleted users are purged by scheduled job

## UserIdentityRepository

**Location:** `src/modules/auth/repositories/user-identity.repository.ts`

**Table:** `user_identities` from `@package/db-core`

The `UserIdentityRepository` manages user authentication identities across multiple providers (email/password, Google, Microsoft, phone, etc.).

### Query Methods

#### findByProvider

Find identity by provider and provider UID.

```typescript
async findByProvider(
  provider: string,
  providerUid: string
): Promise<UserIdentity | null>
```

**Parameters:**

- `provider` - Identity provider (e.g., 'google', 'email_password')
- `providerUid` - Provider user ID

**Returns:** User identity or null

**SQL:**

```sql
SELECT * FROM user_identities
WHERE provider = ? AND provider_uid = ?
LIMIT 1
```

**Example:**

```typescript
const identity = await userIdentityRepository.findByProvider('google', 'google-user-123');
```

#### findByProviderAndUid

Alias for `findByProvider`.

```typescript
async findByProviderAndUid(
  provider: string,
  providerUid: string
): Promise<UserIdentity | null>
```

#### findByProviderOrThrow

Same as `findByProvider` but throws error if not found.

```typescript
async findByProviderOrThrow(
  provider: string,
  providerUid: string
): Promise<UserIdentity>
```

**Throws:** `Error('Identity not found')` if not found

#### findByUserId

Find all identities for a user (ordered by primary, then created date).

```typescript
async findByUserId(
  userId: number
): Promise<UserIdentity[]>
```

**Returns:** Array of user identities (ordered: primary first, then by created date descending)

**SQL:**

```sql
SELECT * FROM user_identities
WHERE user_id = ?
ORDER BY is_primary DESC, created_at DESC
```

**Example:**

```typescript
const identities = await userIdentityRepository.findByUserId(123);
// Returns:
// [
//   { provider: 'email_password', isPrimary: true, ... },
//   { provider: 'google', isPrimary: false, ... }
// ]
```

#### findPrimaryByUserId

Find primary identity for a user.

```typescript
async findPrimaryByUserId(
  userId: number
): Promise<UserIdentity | null>
```

**Returns:** Primary identity or null

**SQL:**

```sql
SELECT * FROM user_identities
WHERE user_id = ? AND is_primary = true
LIMIT 1
```

**Use Case:** Get user's primary authentication method.

#### findPrimaryByUserIds

Find primary identities for multiple users (batch loading to avoid N+1 queries).

```typescript
async findPrimaryByUserIds(
  userIds: number[]
): Promise<UserIdentity[]>
```

**Parameters:**

- `userIds` - Array of user IDs

**Returns:** Array of primary identities

**SQL:**

```sql
SELECT * FROM user_identities
WHERE user_id IN (?, ?, ...) AND is_primary = true
ORDER BY created_at DESC
```

**Use Case:** Efficiently load identities for multiple users (e.g., when deleting organization).

**Example:**

```typescript
const orgUsers = await authRepository.findByOrganization('123');
const userIds = orgUsers.map((user) => user.id);

// Batch load all primary identities (single query)
const identities = await userIdentityRepository.findPrimaryByUserIds(userIds);

// Create Map for O(1) lookup
const identityMap = new Map();
for (const identity of identities) {
  identityMap.set(identity.userId, identity);
}

// Use identities
for (const user of orgUsers) {
  const identity = identityMap.get(user.id);
  // ...
}
```

#### findByGcpUid

Find identity by GCP/Firebase UID.

```typescript
async findByGcpUid(
  gcpUid: string
): Promise<UserIdentity | null>
```

**Returns:** User identity or null

**Use Case:** Validate GCP token and find associated user.

#### exists

Check if identity exists for provider and provider UID.

```typescript
async exists(
  provider: string,
  providerUid: string
): Promise<boolean>
```

**Returns:** True if identity exists

**Use Case:** Check if identity already linked before linking.

#### userHasProvider

Check if user has identity with specific provider.

```typescript
async userHasProvider(
  userId: number,
  provider: string
): Promise<boolean>
```

**Returns:** True if user has identity with provider

**Use Case:** Prevent duplicate identity links.

#### countByUserId

Count identities for a user.

```typescript
async countByUserId(
  userId: number
): Promise<number>
```

**Returns:** Number of identities

**Use Case:** Validate user has multiple identities before unlinking (cannot unlink last identity).

**Example:**

```typescript
const identityCount = await userIdentityRepository.countByUserId(123);
if (identityCount <= 1) {
  throw Errors.businessoperationNotAllowed001({
    reason: 'Cannot unlink last identity'
  });
}
```

### Mutation Methods

#### create

Create a new identity.

```typescript
async create(
  data: NewUserIdentity
): Promise<UserIdentity>
```

**Parameters:**

- `data` - Identity data (userId, provider, providerUid, etc.)

**Returns:** Created identity

**SQL:**

```sql
INSERT INTO user_identities (user_id, provider, provider_uid, ...)
VALUES (?, ?, ?, ...)
RETURNING *
```

**Example:**

```typescript
const identity = await userIdentityRepository.create({
  userId: 123,
  provider: 'google',
  providerUid: 'google-user-123',
  gcpUid: 'gcp-uid-123',
  displayName: 'John Doe',
  photoUrl: 'https://...',
  isPrimary: false
});
```

#### createWithTransaction

Same as `create` but within a transaction.

```typescript
async createWithTransaction(
  tx: NodePgDatabase,
  data: NewUserIdentity
): Promise<UserIdentity>
```

**Use Case:** Create identity within same transaction as user creation or event publishing.

#### update

Update identity.

```typescript
async update(
  id: number,
  data: Partial<NewUserIdentity>
): Promise<UserIdentity>
```

**Parameters:**

- `id` - Identity ID
- `data` - Fields to update

**Returns:** Updated identity

#### updateWithTransaction

Same as `update` but within a transaction.

```typescript
async updateWithTransaction(
  tx: NodePgDatabase,
  id: number,
  data: Partial<NewUserIdentity>
): Promise<UserIdentity>
```

#### updateByUserIdAndProvider

Update identity by user ID and provider.

```typescript
async updateByUserIdAndProvider(
  userId: number,
  provider: string,
  data: Partial<NewUserIdentity>
): Promise<UserIdentity>
```

**Parameters:**

- `userId` - User ID
- `provider` - Identity provider
- `data` - Fields to update

**Returns:** Updated identity

**Throws:** Error if identity not found

**Use Case:** Update identity without knowing identity ID.

#### setAsPrimary

Set identity as primary (unsets primary flag for all other identities).

```typescript
async setAsPrimary(
  userId: number,
  identityId: number
): Promise<void>
```

**Parameters:**

- `userId` - User ID
- `identityId` - Identity ID to set as primary

**SQL:**

```sql
BEGIN;
  UPDATE user_identities SET is_primary = false WHERE user_id = ?;
  UPDATE user_identities SET is_primary = true WHERE id = ? AND user_id = ?;
COMMIT;
```

**Use Case:** Change user's primary authentication method.

#### updateLastSignIn

Update last sign-in timestamp for identity.

```typescript
async updateLastSignIn(
  id: number
): Promise<void>
```

**SQL:**

```sql
UPDATE user_identities
SET last_sign_in_at = NOW()
WHERE id = ?
```

**Use Case:** Track authentication activity.

#### updateLastSignInWithTransaction

Same as `updateLastSignIn` but within a transaction.

```typescript
async updateLastSignInWithTransaction(
  tx: NodePgDatabase,
  id: number
): Promise<void>
```

#### delete

Delete identity.

```typescript
async delete(
  id: number
): Promise<void>
```

**Warning:** This is a permanent deletion.

#### deleteWithTransaction

Same as `delete` but within a transaction.

```typescript
async deleteWithTransaction(
  tx: NodePgDatabase,
  id: number
): Promise<void>
```

#### deleteByUserId

Delete all identities for a user.

```typescript
async deleteByUserId(
  userId: number
): Promise<void>
```

**Use Case:** Delete all identities when user account is deleted.

**SQL:**

```sql
DELETE FROM user_identities WHERE user_id = ?
```

### Batch Operations

The `UserIdentityRepository` supports efficient batch operations to avoid N+1 query problems.

#### Example: Delete Organization with All Users

```typescript
await db.transaction(async (tx) => {
  // 1. Get all users in organization
  const orgUsers = await authRepository.findByOrganizationWithTransaction(tx, tenantId);
  const userIds = orgUsers.map((user) => user.id);

  // 2. Batch load all primary identities (single query)
  const identities = await userIdentityRepository.findPrimaryByUserIds(userIds);

  // 3. Create Map for O(1) lookup
  const identityMap = new Map();
  for (const identity of identities) {
    identityMap.set(identity.userId, identity);
  }

  // 4. Delete users from GCP
  for (const user of orgUsers) {
    const identity = identityMap.get(user.id);
    if (identity?.gcpUid && org.gcpTenantId) {
      await authProvider.deleteUser(identity.gcpUid, org.gcpTenantId);
    }
  }

  // 5. Delete organization (CASCADE deletes users and identities)
  await orgRepository.deleteWithTransaction(tx, org.id);
});
```

## OrganizationRepository

**Location:** `src/modules/auth/repositories/organization.repository.ts`

**Extends:** `BaseRepository<Organization, NewOrganization, {}, string>`

**Table:** `organizations` from `@package/db-core`

The `OrganizationRepository` handles organization/tenant management operations.

### Query Methods

#### findById

Find organization by ID.

```typescript
async findById(
  tenantId: string
): Promise<Organization | null>
```

**Parameters:**

- `tenantId` - Tenant ID (organization ID as string)

**Returns:** Organization or null

**SQL:**

```sql
SELECT * FROM organizations
WHERE id = ?
LIMIT 1
```

**Example:**

```typescript
const org = await orgRepository.findById('123');
if (!org) {
  throw Errors.databaserecordNotFound004({ entity: 'Organization' });
}
```

#### findByIdWithTransaction

Same as `findById` but within a transaction.

```typescript
async findByIdWithTransaction(
  tx: NodePgDatabase,
  tenantId: string
): Promise<Organization | null>
```

#### allowsPublicRegistration

Check if organization allows public registration.

```typescript
async allowsPublicRegistration(
  tenantId: string
): Promise<boolean>
```

**Returns:** True if public registration is allowed

**Implementation:** Currently returns `org.isActive` (all active organizations allow public registration). Future enhancement: add `publicRegistrationEnabled` column.

**Use Case:** Validate organization allows public registration during user registration.

#### findExpiredSoftDeleted

Find organizations soft-deleted before retention cutoff date.

```typescript
async findExpiredSoftDeleted(
  retentionDays: number
): Promise<Organization[]>
```

**Parameters:**

- `retentionDays` - Number of days to retain soft-deleted records

**Returns:** Array of organizations eligible for permanent deletion

**SQL:**

```sql
SELECT * FROM organizations
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '? days'
```

**Use Case:** Scheduled job to permanently delete expired soft-deleted organizations.

### Mutation Methods

#### deleteWithTransaction

Hard delete organization (CASCADE deletes all users).

```typescript
async deleteWithTransaction(
  tx: NodePgDatabase,
  orgId: number
): Promise<Organization>
```

**Returns:** Deleted organization

**Side Effects:** Due to foreign key CASCADE, deleting organization also deletes:

- All users in the organization
- All user identities
- All related entities

**Warning:** This is a permanent deletion. Use `softDeleteWithTransaction` for GDPR-compliant deletion.

#### softDeleteWithTransaction

Soft delete organization (mark as deleted, preserve data).

```typescript
async softDeleteWithTransaction(
  tx: NodePgDatabase,
  orgId: number
): Promise<Organization>
```

**SQL:**

```sql
UPDATE organizations
SET deleted_at = NOW(), is_active = false
WHERE id = ?
RETURNING *
```

**Benefits:**

- Preserves data for retention period
- Allows organization recovery
- GDPR-compliant (data can be purged after retention period)

**Example:**

```typescript
await db.transaction(async (tx) => {
  const deletedOrg = await orgRepository.softDeleteWithTransaction(tx, orgId);

  // Publish deletion event in same transaction
  await outboxRepo.insert(tx, {
    eventType: 'organization.deleted',
    payload: { organizationId: deletedOrg.id }
    // ...
  });
});
```

#### hardDeletePermanently

Permanently delete organization (hard delete).

```typescript
async hardDeletePermanently(
  orgId: number
): Promise<void>
```

**Use Case:** Purge expired soft-deleted organizations after retention period.

**Warning:** This is irreversible. Ensure organization has been soft-deleted and retention period has passed.

### Soft Delete Support

The `OrganizationRepository` supports both soft delete and hard delete modes:

**Soft Delete Mode** (`USE_SOFT_DELETE=true`):

- Organization is marked as deleted (`deleted_at` timestamp set)
- Organization is marked as inactive (`is_active = false`)
- Data is preserved for retention period
- Scheduled job purges expired soft-deleted organizations

**Hard Delete Mode** (`USE_SOFT_DELETE=false`):

- Organization is permanently removed from database
- All users in organization are also deleted (CASCADE)
- Cannot be recovered

## Transaction Patterns

All repositories support transaction-based operations for atomicity.

### Pattern 1: Simple Transaction

```typescript
await db.transaction(async (tx) => {
  // All operations use tx instead of db
  const user = await authRepository.createWithEmailInTransaction(tx, tenantId, email, {
    displayName: 'John Doe'
  });

  const identity = await userIdentityRepository.createWithTransaction(tx, {
    userId: user.id,
    provider: 'email_password',
    providerUid: email,
    isPrimary: true
  });

  // Transaction commits automatically
});
```

### Pattern 2: Transaction with Event Publishing

```typescript
await db.transaction(async (tx) => {
  // 1. Perform database writes
  const user = await authRepository.createWithEmailInTransaction(tx, tenantId, email, data);

  // 2. Publish events to outbox (same transaction)
  await outboxRepo.insert(tx, {
    eventId: randomUUID(),
    eventType: 'user.registered',
    aggregateId: String(user.id),
    payload: { userId: user.id, email },
    tenantId,
    schemaVersion: '1.0'
  });

  // 3. Transaction commits - both data and events are saved atomically
});
```

### Pattern 3: Complex Multi-Step Transaction

```typescript
await db.transaction(async (tx) => {
  // 1. Create organization
  const orgId = await authRepository.createOrganizationForUserInTransaction(tx, email, displayName);

  // 2. Create user
  const user = await authRepository.createWithEmailInTransaction(tx, String(orgId), email, {
    displayName,
    isActive: true
  });

  // 3. Set user as organization owner
  await authRepository.setOrganizationOwnerInTransaction(
    tx,
    orgId,
    user.id,
    undefined // System operation
  );

  // 4. Create primary identity
  await userIdentityRepository.createWithTransaction(tx, {
    userId: user.id,
    provider: 'email_password',
    providerUid: email,
    isPrimary: true
  });

  // 5. Publish events
  await outboxRepo.insert(tx, {
    eventType: 'user.registered',
    payload: { userId: user.id, organizationId: orgId }
    // ...
  });

  // All operations commit atomically
});
```

### Pattern 4: Transaction with Rollback on Error

```typescript
try {
  await db.transaction(async (tx) => {
    const user = await authRepository.createWithEmailInTransaction(tx, tenantId, email, data);

    // If this throws, entire transaction rolls back
    if (someCondition) {
      throw new Error('Validation failed');
    }

    await outboxRepo.insert(tx, {
      /* event */
    });
  });
} catch (error) {
  // Transaction rolled back automatically
  logger.error('Transaction failed:', error);
  throw error;
}
```

## Multi-Tenancy Implementation

All repositories enforce multi-tenancy at the data access layer.

### Tenant ID Validation

All methods validate `tenantId` format to prevent SQL injection:

```typescript
// Validate tenantId is a valid number string
const orgIdStr = tenantId.trim();
if (!/^\d+$/.test(orgIdStr)) {
  throw Errors.validationinvalidValueFor002({
    field: 'tenantId',
    expectedType: 'numeric string'
  });
}
const orgId = Number(orgIdStr);
```

### Tenant Scoping

All queries include `organization_id` filter:

```typescript
// AuthRepository.findById
SELECT * FROM users
WHERE organization_id = ? AND id = ? AND deleted_at IS NULL
LIMIT 1

// AuthRepository.findByEmail
SELECT * FROM users
WHERE organization_id = ? AND email_hash = ? AND deleted_at IS NULL
LIMIT 1
```

### Cross-Tenant Protection

Repositories prevent cross-tenant data access:

```typescript
// User in org 123 cannot access user in org 456
const user = await authRepository.findById('123', userId);
// Returns null if user belongs to different organization
```

### Global Queries (Public Registration)

Some methods support global queries (without tenant scope) for public registration:

```typescript
// Find user by email globally (for public registration)
const user = await authRepository.findByEmail(undefined, email);

// Find user with organization by email (for login)
const result = await authRepository.findWithOrganizationByEmail(email);
```

## Security Considerations

### Email Hashing

All email lookups use SHA-256 hashing to prevent storing plaintext emails in indexes:

```typescript
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// Stored in database
{
  email_hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
}
```

**Benefits:**

- Email addresses are not stored in plaintext in indexes
- Database administrators cannot see user emails
- Compromised database backups don't expose emails
- Still allows efficient email lookups

### SQL Injection Prevention

All methods validate input and use parameterized queries:

```typescript
// Validate tenantId format
if (!/^\d+$/.test(orgIdStr)) {
  throw Errors.validationinvalidValueFor002({
    field: 'tenantId',
    expectedType: 'numeric string'
  });
}

// Use parameterized query
await db.select().from(users).where(eq(users.organizationId, orgId)).limit(1);
```

### Soft Delete Exclusion

All queries exclude soft-deleted users by default:

```typescript
WHERE deleted_at IS NULL
```

**Benefits:**

- Soft-deleted users are invisible to application
- Prevents accidental data leakage
- Allows recovery if needed
- GDPR-compliant data retention

### Transactional Consistency

All multi-step operations use transactions to ensure consistency:

```typescript
await db.transaction(async (tx) => {
  // All operations succeed or all fail
  const user = await authRepository.createWithEmailInTransaction(tx, ...);
  await userIdentityRepository.createWithTransaction(tx, ...);
  await outboxRepo.insert(tx, ...);
});
```

**Benefits:**

- Prevents partial updates
- Ensures data integrity
- Prevents orphaned records
- Guarantees event publishing

## Documentation References

- [CQRS](./cqrs.md) - Auth CQRS implementation
- [Multi-Tenancy](./multi-tenancy.md) - Multi-tenancy patterns
- [Testing](./testing.md) - Testing repositories
- [Security](./security.md) - Security architecture
