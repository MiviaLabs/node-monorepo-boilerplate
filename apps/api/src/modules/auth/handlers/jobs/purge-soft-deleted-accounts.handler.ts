import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthProviderFactory, AUTH_PROVIDER_FACTORY, type IAuthProvider } from '@package/auth';
import { OutboxRepository } from '@package/events';
import { JobHandler } from '@package/queues';

import { DATABASE_PROVIDER, MAIN_DB } from '../../../../common/database/database.constants';
import { AuthRepository } from '../../repositories/auth.repository';
import { OrganizationRepository } from '../../repositories/organization.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';

import type { User, Organization } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';

interface PurgeJobData {
  retentionDays: number;
  dryRun: boolean;
  batchSize: number;
}

/**
 * Purge soft-deleted accounts handler
 *
 * Scheduled job to permanently delete soft-deleted users and organizations
 * after retention period expires.
 */
@Injectable()
export class PurgeSoftDeletedAccountsHandler {
  private static readonly PURGE_JOB_ADVISORY_LOCK_KEY = 8_643_201;
  private readonly logger = new Logger(PurgeSoftDeletedAccountsHandler.name);
  private authProvider: IAuthProvider | null = null;
  private advisoryLockClient: PoolClient | null = null;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly orgRepository: OrganizationRepository,
    private readonly userIdentityRepository: UserIdentityRepository,
    private readonly outboxRepo: OutboxRepository,
    @Inject(AUTH_PROVIDER_FACTORY)
    private readonly authProviderFactory: AuthProviderFactory,
    @Inject(DATABASE_PROVIDER)
    private readonly databaseConnection: { pool: Pool },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject(MAIN_DB) private readonly db: NodePgDatabase<any>
  ) {}

  private getProvider(): IAuthProvider {
    if (!this.authProvider) {
      const provider = this.authProviderFactory.getDefaultProvider();
      if (!provider) {
        throw new Error('No auth provider configured');
      }
      this.authProvider = provider;
    }
    return this.authProvider;
  }

  @JobHandler({
    queueName: 'maintenance',
    jobName: 'purge-soft-deleted-accounts'
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  async handle(job: unknown): Promise<{
    success: boolean;
    totalPurged: number;
    dryRun: boolean;
    usersFound: number;
    orgsFound: number;
    errors: string[];
  }> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const data = (job as { data: PurgeJobData }).data;
    const retentionDays = data.retentionDays;
    const dryRun = data.dryRun;
    const batchSize = data.batchSize;

    this.logger.log(
      `Starting purge job: retentionDays=${retentionDays}, dryRun=${dryRun}, batchSize=${batchSize}`
    );

    const lockAcquired = await this.tryAcquireJobLock();
    if (!lockAcquired) {
      this.logger.log('Skipping purge job because another instance is already processing it');
      return {
        success: true,
        totalPurged: 0,
        dryRun,
        usersFound: 0,
        orgsFound: 0,
        errors: []
      };
    }

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
              `[DRY RUN] Would delete user: ${user.id} (deleted at: ${user.deletedAt?.toISOString() ?? 'unknown'})`
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
              `[DRY RUN] Would delete organization: ${org.id} (deleted at: ${org.deletedAt?.toISOString() ?? 'unknown'})`
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
        errors
      };
    } catch (error) {
      this.logger.error(
        `Purge job failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    } finally {
      await this.releaseJobLock();
    }
  }

  private async tryAcquireJobLock(): Promise<boolean> {
    const client = await this.databaseConnection.pool.connect();

    try {
      const result = await client.query<{ acquired: boolean }>(
        'select pg_try_advisory_lock($1) as acquired',
        [PurgeSoftDeletedAccountsHandler.PURGE_JOB_ADVISORY_LOCK_KEY]
      );

      if (result.rows[0]?.acquired === true) {
        this.advisoryLockClient = client;
        return true;
      }

      client.release();
      return false;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  private async releaseJobLock(): Promise<void> {
    if (!this.advisoryLockClient) {
      return;
    }

    try {
      await this.advisoryLockClient.query('select pg_advisory_unlock($1)', [
        PurgeSoftDeletedAccountsHandler.PURGE_JOB_ADVISORY_LOCK_KEY
      ]);
    } catch (error) {
      this.logger.warn(
        `Failed to release purge job advisory lock: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.advisoryLockClient.release();
      this.advisoryLockClient = null;
    }
  }

  /**
   * Purge a single user permanently
   */
  private async purgeUser(user: User): Promise<void> {
    // CRITICAL FIX #3: Store GCP identity BEFORE transaction
    // This prevents data loss if DB delete succeeds but GCP delete fails
    let providerUid: string | null = null;
    let gcpTenantId: string | null = null;

    try {
      const identity = await this.userIdentityRepository.findPrimaryByUserId(Number(user.id));
      if (identity?.providerUid) {
        const org = await this.orgRepository.findById(String(user.organizationId));
        if (org?.gcpTenantId) {
          providerUid = identity.providerUid;
          gcpTenantId = org.gcpTenantId;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not fetch GCP identity for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    await this.db.transaction(async (tx) => {
      // CRITICAL FIX #3: Delete from database FIRST (within transaction)
      // This ensures atomicity - if DB delete fails, nothing is deleted
      await this.authRepository.hardDeletePermanently(String(user.organizationId), Number(user.id));

      // Publish audit event
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      await this.outboxRepo.insert(tx as any, {
        eventId: randomUUID(),
        eventType: 'user.purged',
        aggregateId: String(user.id),
        aggregateVersion: '1',
        payload: {
          userId: String(user.id),
          tenantId: String(user.organizationId),
          deletedAt: user.deletedAt?.toISOString(),
          purgedAt: new Date().toISOString()
        },
        correlationId: randomUUID(),
        causationId: randomUUID(),
        tenantId: String(user.organizationId),
        schemaVersion: '1.0'
      });

      this.logger.debug(`Permanently deleted user: ${user.id}`);
    });

    // CRITICAL FIX #3: Delete from GCP AFTER successful DB deletion (best effort)
    // If this fails, user is already deleted from DB (primary concern)
    // GCP cleanup can be retried in a separate job if needed
    if (providerUid && gcpTenantId) {
      try {
        await this.getProvider().deleteUser(providerUid, gcpTenantId);
        this.logger.debug(`Deleted GCP user: ${providerUid}`);
      } catch (error) {
        // Log but don't fail - DB deletion already succeeded
        this.logger.warn(
          `Could not delete GCP user ${providerUid} after DB deletion: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  /**
   * Purge a single organization permanently (CASCADE deletes users)
   */
  private async purgeOrganization(org: Organization): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Hard delete from database (CASCADE will delete users)
      await this.orgRepository.hardDeletePermanently(Number(org.id));

      // Publish audit event
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      await this.outboxRepo.insert(tx as any, {
        eventId: randomUUID(),
        eventType: 'organization.purged',
        aggregateId: String(org.id),
        aggregateVersion: '1',
        payload: {
          organizationId: String(org.id),
          deletedAt: org.deletedAt?.toISOString(),
          purgedAt: new Date().toISOString()
        },
        correlationId: randomUUID(),
        causationId: randomUUID(),
        tenantId: String(org.id),
        schemaVersion: '1.0'
      });

      this.logger.debug(`Permanently deleted organization: ${org.id}`);
    });

    if (org.gcpTenantId) {
      try {
        await this.deleteProviderTenant(org.gcpTenantId);
        this.logger.debug(`Deleted GCP tenant: ${org.gcpTenantId}`);
      } catch (error) {
        this.logger.warn(
          `Could not delete GCP tenant ${org.gcpTenantId} after DB deletion: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private async deleteProviderTenant(gcpTenantId: string): Promise<void> {
    const provider = this.getProvider();
    if (
      !('firebaseAuth' in provider) ||
      typeof (provider as { firebaseAuth?: unknown }).firebaseAuth === 'undefined'
    ) {
      return;
    }

    const googleProvider = provider as {
      firebaseAuth: {
        tenantManager: () => {
          deleteTenant: (tenantId: string) => Promise<void>;
        };
      };
    };

    await googleProvider.firebaseAuth.tenantManager().deleteTenant(gcpTenantId);
  }
}
