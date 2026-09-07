# Auth Module: GDPR Compliance

## Overview

The auth module implements **GDPR-compliant data operations** including data export, soft deletion, hard deletion, and retention policies. This document covers all GDPR-related functionality, retention periods, audit trails, and deletion workflows.

---

## Table of Contents

- [Data Export (Right to Access)](#data-export-right-to-access)
- [Soft Delete (Right to be Forgotten)](#soft-delete-right-to-be-forgotten)
- [Hard Delete (Permanent Deletion)](#hard-delete-permanent-deletion)
- [Retention Policies](#retention-policies)
- [Audit Trails](#audit-trails)
- [Configuration](#configuration)

---

## Data Export (Right to Access)

### Export User Data Handler

**File:** `apps/api/src/modules/auth/handlers/commands/export-user-data.handler.ts`

**Command:** `ExportUserDataCommand`

```typescript
export interface ExportUserDataCommand {
  tenantId: string;
  userId: string;
  actorId: string; // User requesting export
}
```

### Exported Data Structure

```typescript
interface UserDataExport {
  user: {
    id: string;
    email: string;
    displayName: string;
    isVerified: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string | null;
    lastSignInAt: string | null;
  };
  identities: Array<{
    provider: string;
    displayName: string;
    emailVerified: boolean;
    createdAt: string;
  }>;
  organization: {
    id: string;
    name: string;
  };
  exportedAt: string;
  exportedBy: string;
}
```

### Export Implementation

```typescript
async execute(command: ExportUserDataCommand): Promise<UserDataExport> {
  // Step 1: Get user data
  const user = await this.authRepository.findById(command.tenantId, Number(command.userId));

  if (!user) {
    throw Errors.useruserWithId001({ userId: command.userId });
  }

  // CRITICAL FIX #1: Verify user belongs to the same tenant as the actor
  if (user.organizationId?.toString() !== command.tenantId) {
    throw Errors.authinsufficientPermissionsRequiredpermission004({
      requiredPermission: 'users:export-cross-tenant',
    });
  }

  // Authorization: Only allow users to export their own data (unless admin)
  if (command.actorId !== command.userId) {
    // TODO: Check if admin role when RBAC is implemented
    throw Errors.authinsufficientPermissionsRequiredpermission004({
      requiredPermission: 'users:export',
    });
  }

  // Step 2: Get all user identities
  const identities = await this.userIdentityRepository.findByUserId(user.id);

  // Step 3: Get organization
  const org = await this.orgRepository.findById(command.tenantId);

  if (!org) {
    throw Errors.databaserecordNotFound004({ entity: 'Organization' });
  }

  // Step 4: Build export data
  return {
    user: {
      id: String(user.id),
      email: decryptEmail(user.emailEncrypted), // Decrypt PII for GDPR compliance
      displayName: user.displayName || '',
      isVerified: user.isVerified,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt?.toISOString() || null,
      lastSignInAt: user.lastSignInAt?.toISOString() || null,
    },
    identities: identities.map((identity) => ({
      provider: identity.provider,
      displayName: identity.displayName || '',
      emailVerified: identity.emailVerified,
      createdAt: identity.createdAt.toISOString(),
    })),
    organization: {
      id: String(org.id),
      name: org.name,
    },
    exportedAt: new Date().toISOString(),
    exportedBy: command.actorId,
  };
}
```

### Export Authorization

**Rules:**

1. Users can export **their own data**
2. Admins can export **any user's data** (TODO: implement RBAC check)
3. Cross-tenant exports are **forbidden**

### PII Decryption

**Important:** Email is stored encrypted. Export handler **decrypts for GDPR compliance**.

```typescript
let decryptedEmail = '';

if (user.emailEncrypted) {
  // Return the encrypted email field as-is for now
  // In production, this should be decrypted using EncryptionService
  this.logger.warn(
    `Email encryption detected but decryption service not configured for user ${command.userId}`
  );
  decryptedEmail = user.emailEncrypted; // Return encrypted data as placeholder
} else {
  // Fallback to email hash if emailEncrypted is not set
  decryptedEmail = user.emailHash || '';
}
```

**TODO:** Implement `EncryptionService` for proper email decryption.

---

## Soft Delete (Right to be Forgotten)

### What is Soft Delete?

**Soft delete** marks records as deleted without removing data from the database.

**Benefits:**

- **GDPR-compliant** with retention period
- **Recoverable** within retention window
- **Audit trail** preserved
- **Cascading deletes** handled via foreign keys

### Soft Delete Implementation

**File:** `apps/api/src/modules/auth/handlers/commands/delete-account.handler.ts`

**Configuration:**

```bash
# Enable soft delete mode (default: false)
USE_SOFT_DELETE=true

# Retention period in days (default: 90)
SOFT_DELETE_RETENTION_DAYS=90
```

### Delete Account Flow

```typescript
async execute(command: DeleteAccountCommand): Promise<void> {
  return this.db.transaction(async (tx) => {
    const { user, org } = await this.fetchUserAndOrganization(command, tx);
    const isOwner = org.ownerId === user.id;

    if (isOwner) {
      await this.deleteOrganizationOwner(tx, command, org, authProvider);
    } else {
      await this.deleteRegularUser(tx, command, user, org, authProvider);
    }

    await this.createAuditLog(tx, command, isOwner, deletedUserCount);
  });
}
```

### Soft Delete User

```typescript
private async deleteRegularUser(
  tx: NodePgDatabase,
  command: DeleteAccountCommand,
  user: { id: number },
  org: { gcpTenantId: string | null },
  authProvider: IAuthProvider
) {
  // Soft delete from database (sets deletedAt timestamp)
  if (this.USE_SOFT_DELETE) {
    await this.authRepository.softDeleteWithTransaction(tx, command.tenantId, user.id);
    this.logger.log(`Successfully soft deleted user ${command.targetUserId} (data preserved)`);
  } else {
    // Hard delete (immediate removal)
    await this.authRepository.deleteWithTransaction(tx, command.tenantId, user.id);
    this.logger.log(`Successfully hard deleted user ${command.targetUserId}`);
  }

  // GCP user deletion (only for hard delete)
  if (!this.USE_SOFT_DELETE && identity?.gcpUid && org.gcpTenantId) {
    await this.deleteUserFromGCP(identity.gcpUid, org.gcpTenantId, authProvider);
  }

  // Publish USER_DELETED event to outbox
  await this.outboxRepo.insert(tx, {
    eventId: randomUUID(),
    eventType: 'user.deleted',
    aggregateId: user.id.toString(),
    payload: {
      tenantId: command.tenantId,
      userId: user.id.toString(),
      deletedBy: command.actorId,
      reason: command.reason,
      timestamp: new Date().toISOString(),
    },
    schemaVersion: '1.0',
  });
}
```

### Soft Delete Organization

```typescript
private async deleteOrganizationOwner(
  tx: NodePgDatabase,
  command: DeleteAccountCommand,
  org: { id: number; gcpTenantId: string | null },
  authProvider: IAuthProvider
) {
  // Get all users in organization (within transaction for consistency)
  const orgUsers = await this.authRepository.findByOrganizationWithTransaction(tx, command.tenantId);

  // Soft delete organization (cascades to all users)
  if (this.USE_SOFT_DELETE) {
    await this.orgRepository.softDeleteWithTransaction(tx, org.id);
    this.logger.log(
      `Successfully soft deleted organization ${command.tenantId} with ${orgUsers.length} users (data preserved)`
    );
  } else {
    // Hard delete (immediate removal)
    await this.orgRepository.deleteWithTransaction(tx, org.id);
    this.logger.log(
      `Successfully hard deleted organization ${command.tenantId} with ${orgUsers.length} users`
    );
  }

  // GCP deletion (only for hard delete)
  if (!this.USE_SOFT_DELETE) {
    await this.deleteUsersFromGCP(orgUsers, org, authProvider);
  }

  // Publish ORG_DELETED event to outbox
  await this.outboxRepo.insert(tx, {
    eventId: randomUUID(),
    eventType: 'organization.deleted',
    aggregateId: org.id.toString(),
    payload: {
      tenantId: command.tenantId,
      organizationId: org.id.toString(),
      deletedUserCount: orgUsers.length,
      deletedBy: command.actorId,
      reason: command.reason,
      timestamp: new Date().toISOString(),
    },
    schemaVersion: '1.0',
  });
}
```

### Database Schema

**Soft delete fields:**

```typescript
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id'),
  emailHash: varchar('email_hash', { length: 64 }),
  displayName: varchar('display_name'),
  isActive: boolean('is_active').default(true),
  isVerified: boolean('is_verified').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
  deletedAt: timestamp('deleted_at') // NULL = active, non-NULL = soft deleted
});
```

**Queries exclude soft-deleted records:**

```typescript
async findById(tenantId: string, id: number) {
  const [user] = await this.db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, Number(tenantId)),
        eq(users.id, id),
        isNull(users.deletedAt) // Exclude soft-deleted
      )
    )
    .limit(1);
  return user || null;
}
```

---

## Hard Delete (Permanent Deletion)

### What is Hard Delete?

**Hard delete** permanently removes records from the database after retention period expires.

**When:**

- Soft-deleted records older than retention period
- Scheduled purge job runs
- GDPR compliance requires final deletion

### Hard Delete Implementation

**Method:** `hardDeletePermanently()` in AuthRepository (lines 674-687)

```typescript
async hardDeletePermanently(tenantId: string, userId: number): Promise<void> {
  // Validate tenantId
  const orgIdStr = String(tenantId);
  if (!/^\d+$/.test(orgIdStr)) {
    throw Errors.validationinvalidValueFor002({
      field: 'tenantId',
      expectedType: 'numeric string',
    });
  }

  // Permanently delete user
  await this.db
    .delete(users)
    .where(and(eq(users.organizationId, Number(orgIdStr)), eq(users.id, userId)));
}
```

### Purge Job (Automated Hard Delete)

**File:** `apps/api/src/modules/auth/jobs/purge-soft-deleted-accounts.job.ts`

**Configuration:**

```bash
# Enable purge job (default: false)
SOFT_DELETE_PURGE_ENABLED=true

# Retention period in days (default: 90)
SOFT_DELETE_RETENTION_DAYS=90

# Cron schedule (default: 2 AM daily)
SOFT_DELETE_PURGE_CRON=0 2 * * *

# Dry run mode (default: false)
SOFT_DELETE_PURGE_DRY_RUN=false

# Batch size (default: 100)
SOFT_DELETE_PURGE_BATCH_SIZE=100
```

**See [Background Jobs](./jobs.md) for purge job details.**

---

## Retention Policies

### Retention Period

**Default:** 90 days (configurable via `SOFT_DELETE_RETENTION_DAYS`)

**Policy:**

- Soft-deleted users/organizations retained for **90 days**
- After 90 days, purge job permanently deletes
- Existing protected requests are denied as soon as the user or organization is soft-deleted
- Token refresh and token validation also re-check the current DB user and organization state
- Provider users are deleted during user purge, and provider tenants are deleted during organization purge

### Finding Expired Records

```typescript
async findExpiredSoftDeleted(retentionDays: number): Promise<User[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const expiredUsers = await this.db
    .select()
    .from(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoffDate)));

  return expiredUsers;
}
```

### Retention Timeline

```
Day 0:  User deletes account (soft delete)
        └─> deletedAt = 2024-01-01T00:00:00Z
        └─> isActive = false
        └─> Data preserved in database
        └─> New email/password login blocked by deletedAt filter
        └─> Existing protected requests rejected by auth guards
        └─> Token refresh/validation rejected by DB active-state checks
        └─> Provider record retained until purge window expires

Day 1-89: User can recover account (TODO: implement recovery)

Day 90:  Purge job runs
         └─> Hard delete from database
         └─> Delete from GCP Identity Platform
         └─> If organization purge, delete provider tenant as best-effort cleanup
         └─> Publish 'user.purged' event

Day 90+: Data permanently deleted
```

---

## Audit Trails

### Event Types

All GDPR operations publish audit events:

| Event Type              | Description               | Payload                                             |
| ----------------------- | ------------------------- | --------------------------------------------------- |
| `user.deleted`          | User soft/hard deleted    | `userId`, `tenantId`, `deletedBy`, `reason`         |
| `organization.deleted`  | Organization deleted      | `organizationId`, `deletedUserCount`, `reason`      |
| `user.purged`           | User permanently purged   | `userId`, `deletedAt`, `purgedAt`                   |
| `organization.purged`   | Organization purged       | `organizationId`, `deletedAt`, `purgedAt`           |
| `account.deleted.audit` | Audit log for deletion    | `action`, `actorId`, `cascaded`, `deletedUserCount` |
| `user.data.exported`    | User data exported (TODO) | `userId`, `exportedBy`, `exportedAt`                |

### Audit Log Structure

```typescript
await this.outboxRepo.insert(tx, {
  eventId: randomUUID(),
  eventType: 'account.deleted.audit',
  aggregateId: command.targetUserId,
  aggregateVersion: '1',
  payload: {
    action: isOwner ? 'DELETE_ORGANIZATION' : 'DELETE_ACCOUNT',
    actorId: command.actorId,
    targetUserId: command.targetUserId,
    tenantId: command.tenantId,
    cascaded: isOwner,
    deletedUserCount,
    reason: command.reason,
    timestamp: new Date().toISOString()
  },
  correlationId: randomUUID(),
  causationId: randomUUID(),
  tenantId: command.tenantId,
  schemaVersion: '1.0'
});
```

### Audit Log Query

```typescript
// Find all deletions for a user
const deletions = await outboxRepo.findByAggregateId(userId, 'user.deleted');

// Find all purges in date range
const purges = await outboxRepo.findByEventType('user.purged', startDate, endDate);

// Find all exports by actor
const exports = await outboxRepo.findByPayload({ exportedBy: actorId });
```

---

## Configuration

### Environment Variables

```bash
# Soft delete mode
USE_SOFT_DELETE=true                 # Enable soft delete (default: false)

# Retention policy
SOFT_DELETE_RETENTION_DAYS=90        # Days to retain soft-deleted records (default: 90)

# Purge job configuration
SOFT_DELETE_PURGE_CRON=0 2 * * *     # Cron schedule (default: 2 AM daily)
SOFT_DELETE_PURGE_DRY_RUN=false      # Dry run mode (default: false)
SOFT_DELETE_PURGE_BATCH_SIZE=100     # Batch size (default: 100)
```

### Recommended Configuration

**Production:**

```bash
USE_SOFT_DELETE=true
SOFT_DELETE_RETENTION_DAYS=90
SOFT_DELETE_PURGE_CRON=0 2 * * *
SOFT_DELETE_PURGE_DRY_RUN=false
SOFT_DELETE_PURGE_BATCH_SIZE=100
```

**Development:**

```bash
USE_SOFT_DELETE=false
```

### Testing Configuration

```bash
# Test purge without deletion
USE_SOFT_DELETE=true
SOFT_DELETE_RETENTION_DAYS=1         # Short retention for testing
SOFT_DELETE_PURGE_DRY_RUN=true       # Dry run
SOFT_DELETE_PURGE_BATCH_SIZE=10      # Small batches
```

---

## GDPR Compliance Checklist

- [x] **Right to Access:** Data export implemented (`export-user-data.handler.ts`)
- [x] **Right to be Forgotten:** Soft delete implemented (`delete-account.handler.ts`)
- [x] **Retention Policies:** Configurable retention period (default 90 days)
- [x] **Automated Purge:** Scheduled job for permanent deletion (`purge-soft-deleted-accounts.job.ts`)
- [x] **Audit Trails:** All deletions logged to outbox
- [x] **Immediate Access Shutdown:** Soft-deleted users and deleted organizations are blocked on guarded requests and token refresh
- [x] **Cross-tenant Protection:** Tenant validation in export/delete
- [ ] **Email Decryption:** TODO - implement EncryptionService for proper PII decryption
- [ ] **Account Recovery:** TODO - implement recovery within retention window
- [ ] **Data Minimization:** TODO - implement field-level deletion

---

## Documentation References

- [External Integrations](./integrations.md) - GCP user deletion
- [Background Jobs](./jobs.md) - Purge job details
- [Repositories](./repositories.md) - Database operations
- [Audit Logging](../events/README.md) - Event publishing
