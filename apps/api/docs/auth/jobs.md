# Auth Module: Background Jobs

## Overview

The auth module includes **background jobs** for maintenance operations, including purging expired soft-deleted accounts. This document covers job configuration, scheduling, data structures, error handling, and monitoring.

---

## Table of Contents

- [Purge Soft-Deleted Accounts Job](#purge-soft-deleted-accounts-job)
- [Job Configuration](#job-configuration)
- [Job Scheduling](#job-scheduling)
- [Job Data Structures](#job-data-structures)
- [Job Execution Flow](#job-execution-flow)
- [Error Handling](#error-handling)
- [Monitoring and Logging](#monitoring-and-logging)

---

## Purge Soft-Deleted Accounts Job

### Purpose

Permanently delete soft-deleted users and organizations after retention period expires (GDPR compliance).

### Key Files

- **Job Definition:** `apps/api/src/modules/auth/jobs/purge-soft-deleted-accounts.job.ts`
- **Job Handler:** `apps/api/src/modules/auth/handlers/jobs/purge-soft-deleted-accounts.handler.ts`

### When Does It Run?

**Default Schedule:** Daily at 2 AM (configurable via `SOFT_DELETE_PURGE_CRON`)

**Trigger:** Cron-based scheduling via `@package/queues`

---

## Job Configuration

### Environment Variables

```bash
# Retention period (days)
SOFT_DELETE_RETENTION_DAYS=90        # Default: 90

# Cron schedule (cron expression)
SOFT_DELETE_PURGE_CRON=0 2 * * *     # Default: 0 2 * * * (2 AM daily)

# Dry run mode (test without deletion)
SOFT_DELETE_PURGE_DRY_RUN=false      # Default: false

# Batch size (users/orgs per batch)
SOFT_DELETE_PURGE_BATCH_SIZE=100     # Default: 100
```

### Configuration Patterns

**Production:**

```bash
SOFT_DELETE_RETENTION_DAYS=90
SOFT_DELETE_PURGE_CRON=0 2 * * *     # 2 AM daily
SOFT_DELETE_PURGE_DRY_RUN=false
SOFT_DELETE_PURGE_BATCH_SIZE=100
```

**Development:**

```bash
SOFT_DELETE_RETENTION_DAYS=7         # Optional shorter window for local testing
SOFT_DELETE_PURGE_DRY_RUN=true
```

**Testing:**

```bash
SOFT_DELETE_RETENTION_DAYS=1         # Short retention for testing
SOFT_DELETE_PURGE_CRON=* * * * *     # Every minute (testing)
SOFT_DELETE_PURGE_DRY_RUN=true       # Dry run (no actual deletion)
SOFT_DELETE_PURGE_BATCH_SIZE=10      # Small batches
```

---

## Job Scheduling

### Job Registration

**File:** `purge-soft-deleted-accounts.job.ts` (lines 16-54)

```typescript
@Injectable()
export class PurgeSoftDeletedAccountsJob implements OnModuleInit {
  private readonly logger = new Logger(PurgeSoftDeletedAccountsJob.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const retentionDays = Number(this.config.get<string>('SOFT_DELETE_RETENTION_DAYS', '90'));
    const cron = this.config.get<string>('SOFT_DELETE_PURGE_CRON', '0 2 * * *');
    const dryRun = this.config.get<string>('SOFT_DELETE_PURGE_DRY_RUN') === 'true';
    const batchSize = Number(this.config.get<string>('SOFT_DELETE_PURGE_BATCH_SIZE', '100'));

    try {
      await addCronJob({
        queueName: 'maintenance',
        jobName: 'purge-soft-deleted-accounts',
        cron,
        data: {
          retentionDays,
          dryRun,
          batchSize
        }
      });

      this.logger.log(
        `✅ Scheduled soft-delete purge job: cron="${cron}", retentionDays=${retentionDays}, dryRun=${dryRun}, batchSize=${batchSize}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule purge job: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
```

**Key Points:**

1. Job registered on module initialization via `OnModuleInit`
2. Uses `addCronJob()` from `@package/queues`
3. Always enabled when the auth module boots
4. Queue name: `maintenance`
5. Job name: `purge-soft-deleted-accounts`
6. Retention window remains configurable via `SOFT_DELETE_RETENTION_DAYS`
7. Cron schedule configurable via `SOFT_DELETE_PURGE_CRON`

### Cron Expression Examples

| Expression     | Description              |
| -------------- | ------------------------ |
| `0 2 * * *`    | 2 AM daily               |
| `0 3 * * 0`    | 3 AM every Sunday        |
| `0 0 1 * *`    | Midnight on 1st of month |
| `*/15 * * * *` | Every 15 minutes         |
| `0 */6 * * *`  | Every 6 hours            |

---

## Job Data Structures

### Job Data Interface

```typescript
interface PurgeJobData {
  retentionDays: number; // Number of days to retain soft-deleted records
  dryRun: boolean; // Whether to perform dry run (no actual deletion)
  batchSize: number; // Number of records to process per batch
}
```

### Job Result

```typescript
interface PurgeJobResult {
  success: boolean; // Whether job completed successfully
  totalPurged: number; // Total records purged (or would be purged in dry run)
  dryRun: boolean; // Whether this was a dry run
  usersFound: number; // Number of expired users found
  orgsFound: number; // Number of expired organizations found
  errors: string[]; // Array of error messages
}
```

**Example Result:**

```json
{
  "success": true,
  "totalPurged": 25,
  "dryRun": false,
  "usersFound": 20,
  "orgsFound": 5,
  "errors": []
}
```

---

## Job Execution Flow

### Handler Implementation

**File:** `purge-soft-deleted-accounts.handler.ts` (lines 58-142)

```typescript
@JobHandler({
  queueName: 'maintenance',
  jobName: 'purge-soft-deleted-accounts',
})
async handle(job: any) {
  const data = job.data as PurgeJobData;
  const { retentionDays, dryRun, batchSize } = data;

  this.logger.log(
    `Starting purge job: retentionDays=${retentionDays}, dryRun=${dryRun}, batchSize=${batchSize}`
  );

  let totalPurged = 0;
  const errors: string[] = [];

  try {
    // Step 1: Purge expired soft-deleted users
    const expiredUsers = await this.authRepository.findExpiredSoftDeleted(retentionDays);
    this.logger.log(`Found ${expiredUsers.length} expired soft-deleted users`);

    for (const user of expiredUsers) {
      try {
        if (dryRun) {
          this.logger.log(
            `[DRY RUN] Would delete user: ${user.id} (deleted at: ${user.deletedAt?.toISOString()})`
          );
          totalPurged++;
          continue;
        }

        await this.purgeUser(user);
        totalPurged++;
      } catch (error) {
        const errorMsg = `Failed to purge user ${user.id}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    // Step 2: Purge expired soft-deleted organizations
    const expiredOrgs = await this.orgRepository.findExpiredSoftDeleted(retentionDays);
    this.logger.log(`Found ${expiredOrgs.length} expired soft-deleted organizations`);

    for (const org of expiredOrgs) {
      try {
        if (dryRun) {
          this.logger.log(
            `[DRY RUN] Would delete organization: ${org.id} (deleted at: ${org.deletedAt?.toISOString()})`
          );
          totalPurged++;
          continue;
        }

        await this.purgeOrganization(org);
        totalPurged++;
      } catch (error) {
        const errorMsg = `Failed to purge organization ${org.id}: ${error instanceof Error ? error.message : String(error)}`;
        this.logger.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    this.logger.log(
      `Purge job completed: ${totalPurged} records ${dryRun ? 'would be' : 'were'} deleted, ${errors.length} errors`
    );

    return {
      success: true,
      totalPurged,
      dryRun,
      usersFound: expiredUsers.length,
      orgsFound: expiredOrgs.length,
      errors,
    };
  } catch (error) {
    this.logger.error(`Purge job failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
```

### Step-by-Step Execution

```
1. Load job configuration from job data
   └─> retentionDays, dryRun, batchSize

2. Find expired soft-deleted users
   └─> WHERE deletedAt < (NOW() - retentionDays)
   └─> Log count of expired users

3. Process each expired user
   ├─> If dryRun: Log what would be deleted
   └─> Else: Call purgeUser()
       ├─> Fetch GCP identity BEFORE transaction
       ├─> Hard delete from database (transaction)
       ├─> Publish 'user.purged' event (transaction)
       └─> Delete from GCP (best effort, after DB)

4. Find expired soft-deleted organizations
   └─> WHERE deletedAt < (NOW() - retentionDays)
   └─> Log count of expired organizations

5. Process each expired organization
   ├─> If dryRun: Log what would be deleted
   └─> Else: Call purgeOrganization()
       ├─> Hard delete from database (transaction, CASCADE)
       └─> Publish 'organization.purged' event (transaction)

6. Return result
   └─> totalPurged, errors, usersFound, orgsFound
```

### Purge User Implementation

**Method:** `purgeUser()` (lines 147-209 in purge-soft-deleted-accounts.handler.ts)

```typescript
private async purgeUser(user: User): Promise<void> {
  // CRITICAL FIX #3: Store GCP identity BEFORE transaction
  let gcpUid: string | null = null;
  let gcpTenantId: string | null = null;

  try {
    const identity = await this.userIdentityRepository.findPrimaryByUserId(Number(user.id));
    if (identity?.gcpUid) {
      const org = await this.orgRepository.findById(String(user.organizationId));
      if (org?.gcpTenantId) {
        gcpUid = identity.gcpUid;
        gcpTenantId = org.gcpTenantId;
      }
    }
  } catch (error) {
    this.logger.warn(`Could not fetch GCP identity for user ${user.id}`);
  }

  await this.db.transaction(async (tx) => {
    // CRITICAL FIX #3: Delete from database FIRST (within transaction)
    await this.authRepository.hardDeletePermanently(String(user.organizationId), Number(user.id));

    // Publish audit event
    await this.outboxRepo.insert(tx, {
      eventId: randomUUID(),
      eventType: 'user.purged',
      aggregateId: String(user.id),
      payload: {
        userId: String(user.id),
        tenantId: String(user.organizationId),
        deletedAt: user.deletedAt?.toISOString(),
        purgedAt: new Date().toISOString(),
      },
      schemaVersion: '1.0',
    });
  });

  // CRITICAL FIX #3: Delete from GCP AFTER successful DB deletion (best effort)
  if (gcpUid && gcpTenantId) {
    try {
      await this.getProvider().deleteUser(gcpUid, gcpTenantId);
    } catch (error) {
      // Log but don't fail - DB deletion already succeeded
      this.logger.warn(`Could not delete GCP user ${gcpUid} after DB deletion`);
    }
  }
}
```

**Key Pattern:** Database deletion FIRST (within transaction), GCP deletion SECOND (best effort).

**Rationale:** Database is source of truth. If GCP deletion fails, user is still purged from database.

### Purge Organization Implementation

**Method:** `purgeOrganization()` (lines 214-239 in purge-soft-deleted-accounts.handler.ts)

```typescript
private async purgeOrganization(org: Organization): Promise<void> {
  await this.db.transaction(async (tx) => {
    // Hard delete from database (CASCADE will delete users)
    await this.orgRepository.hardDeletePermanently(Number(org.id));

    // Publish audit event
    await this.outboxRepo.insert(tx, {
      eventId: randomUUID(),
      eventType: 'organization.purged',
      aggregateId: String(org.id),
      payload: {
        organizationId: String(org.id),
        deletedAt: org.deletedAt?.toISOString(),
        purgedAt: new Date().toISOString(),
      },
      schemaVersion: '1.0',
    });
  });

  if (org.gcpTenantId) {
    try {
      await this.deleteProviderTenant(org.gcpTenantId);
    } catch (error) {
      this.logger.warn(`Could not delete GCP tenant ${org.gcpTenantId} after DB deletion`);
    }
  }
}
```

**Note:** Organization deletion cascades to users via foreign key constraints. User-level provider accounts are handled by user purge, and the provider tenant itself is deleted as best-effort cleanup after the DB transaction succeeds.

---

## Error Handling

### Job-Level Error Handling

```typescript
try {
  // Purge users and organizations
  return {
    success: true,
    totalPurged,
    dryRun,
    usersFound,
    orgsFound,
    errors
  };
} catch (error) {
  this.logger.error(`Purge job failed: ${error instanceof Error ? error.message : String(error)}`);
  throw error; // Job will be retried by queue
}
```

### Record-Level Error Handling

**Pattern:** Continue processing even if individual record fails.

```typescript
for (const user of expiredUsers) {
  try {
    await this.purgeUser(user);
    totalPurged++;
  } catch (error) {
    const errorMsg = `Failed to purge user ${user.id}: ${error}`;
    this.logger.error(errorMsg);
    errors.push(errorMsg); // Collect error, continue processing
  }
}
```

**Benefits:**

- Job doesn't fail completely if one record fails
- Errors collected for review
- Other records still processed

### GCP Deletion Errors

**Pattern:** Log warning, don't fail.

```typescript
if (gcpUid && gcpTenantId) {
  try {
    await this.getProvider().deleteUser(gcpUid, gcpTenantId);
  } catch (error) {
    // Log but don't fail - DB deletion already succeeded
    this.logger.warn(`Could not delete GCP user ${gcpUid} after DB deletion`);
  }
}
```

**Rationale:** Database is source of truth. GCP deletion is best-effort cleanup.

### Retry Strategy

**Queue Configuration:**

```typescript
{
  queueName: 'maintenance',
  attempts: 3,              // Retry up to 3 times
  backoff: {
    type: 'exponential',
    delay: 60000,           // 1 minute initial delay
  },
}
```

**Failure Scenarios:**

| Scenario                   | Behavior                                           |
| -------------------------- | -------------------------------------------------- |
| Job throws error           | Job retried up to 3 times with exponential backoff |
| Individual record fails    | Error logged, job continues                        |
| GCP deletion fails         | Warning logged, job continues                      |
| Database transaction fails | Job fails, retried                                 |

---

## Monitoring and Logging

### Log Levels

**INFO:**

- Job start/completion
- Batch progress
- Record counts

**DEBUG:**

- Individual record processing
- GCP operations

**WARN:**

- GCP identity fetch failures
- GCP deletion failures (non-critical)

**ERROR:**

- Individual record purge failures
- Job-level failures

### Log Examples

**Job start:**

```
[PurgeSoftDeletedAccountsHandler] Starting purge job: retentionDays=90, dryRun=false, batchSize=100
```

**User count:**

```
[PurgeSoftDeletedAccountsHandler] Found 25 expired soft-deleted users
```

**Dry run:**

```
[PurgeSoftDeletedAccountsHandler] [DRY RUN] Would delete user: 123 (deleted at: 2024-01-01T00:00:00.000Z)
```

**Success:**

```
[PurgeSoftDeletedAccountsHandler] Permanently deleted user: 123
```

**GCP warning:**

```
[PurgeSoftDeletedAccountsHandler] Could not delete GCP user abc123 after DB deletion: User not found
```

**Job completion:**

```
[PurgeSoftDeletedAccountsHandler] Purge job completed: 25 records were deleted, 0 errors
```

**Job failure:**

```
[PurgeSoftDeletedAccountsHandler] Purge job failed: Database connection error
```

### Monitoring Metrics

**Key Metrics:**

1. **Total purged:** Number of records purged per run
2. **Error count:** Number of records that failed to purge
3. **Job duration:** Time taken to complete job
4. **GCP failures:** Number of GCP deletion failures

**Example Result:**

```json
{
  "success": true,
  "totalPurged": 25,
  "dryRun": false,
  "usersFound": 20,
  "orgsFound": 5,
  "errors": [],
  "duration": "12.5s"
}
```

### Alerts

**Recommended Alerts:**

1. **Job failure:** Alert if job fails 3 times in a row
2. **High error rate:** Alert if >10% of records fail to purge
3. **GCP failures:** Alert if >50% of GCP deletions fail
4. **Long duration:** Alert if job takes >30 minutes

---

## Testing

### Dry Run Mode

**Enable dry run:**

```bash
SOFT_DELETE_PURGE_DRY_RUN=true
```

**Behavior:**

- Finds expired records
- Logs what would be deleted
- Does NOT delete from database
- Does NOT delete from GCP
- Returns count of records that would be purged

**Use Case:** Test purge logic without actual deletion.

### Manual Job Trigger

**Trigger via BullMQ Dashboard:**

```
Queue: maintenance
Job: purge-soft-deleted-accounts
Data: {
  "retentionDays": 1,
  "dryRun": true,
  "batchSize": 10
}
```

### Integration Test

```typescript
describe('PurgeSoftDeletedAccountsHandler', () => {
  it('should purge expired users', async () => {
    // Create soft-deleted user
    const user = await createSoftDeletedUser({ deletedAt: new Date('2024-01-01') });

    // Run purge job
    const result = await handler.handle({
      data: {
        retentionDays: 1, // Very short retention
        dryRun: false,
        batchSize: 10
      }
    });

    // Verify user was purged
    expect(result.totalPurged).toBe(1);
    expect(result.usersFound).toBe(1);

    // Verify user is gone from database
    const dbUser = await authRepository.findById(user.organizationId, user.id);
    expect(dbUser).toBeNull();
  });
});
```

---

## Documentation References

- [GDPR Compliance](./gdpr.md) - Data retention and deletion policies
- [External Integrations](./integrations.md) - GCP user deletion
- [Queues Package](../../../../packages/queues/README.md) - Queue configuration
- [Audit Logging](../events/README.md) - Event publishing
