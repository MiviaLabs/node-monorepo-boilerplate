import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, isNull, organizations, type NodePgDatabase } from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';
import { PasswordResetRepository } from '../repositories/password-reset.repository';

/**
 * Token Cleanup Service
 *
 * Scheduled service for cleaning up expired and used password reset tokens.
 * Runs daily at 2 AM to prevent database bloat while preserving recent tokens
 * for debugging and audit purposes.
 *
 * Cleanup policy:
 * - Expired tokens: Delete after 7 days (keep recent for debugging)
 * - Used tokens: Delete after 30 days (keep for audit trail)
 * - Per-tenant batching: Process 50 organizations per batch with 50ms delay
 * - Rate limiting: Prevents overwhelming database during cleanup
 *
 * Performance characteristics:
 * - Batch size: 50 organizations per iteration
 * - Inter-batch delay: 50ms (prevents DB saturation)
 * - Estimated time: ~100 organizations/second = 600 orgs in ~6 seconds
 *
 * @example Manual cleanup trigger
 * ```typescript
 * // For testing or manual execution
 * await tokenCleanupService.cleanupExpiredTokens();
 * ```
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  /**
   * Retention periods for token cleanup
   */
  private readonly EXPIRED_TOKEN_RETENTION_DAYS = 7;
  private readonly USED_TOKEN_RETENTION_DAYS = 30;

  /**
   * Batching configuration for per-tenant cleanup
   */
  private readonly BATCH_SIZE = 50; // Organizations per batch
  private readonly BATCH_DELAY_MS = 50; // Delay between batches

  constructor(
    @Inject(MAIN_DB) private readonly db: NodePgDatabase,
    private readonly passwordResetRepository: PasswordResetRepository
  ) {}

  /**
   * Scheduled job: Clean up expired password reset tokens
   *
   * Runs daily at 2:00 AM (low-traffic time).
   * Deletes tokens that expired more than 7 days ago.
   * Uses per-tenant batching to prevent long-running transactions.
   *
   * Schedule: Every day at 2:00 AM
   * Cron: 0 2 * * * (minute hour day month dayOfWeek)
   *
   * @example Cron schedule breakdown
   * ```
   * 0 2 * * *
   * │ │ │ │ │
   * │ │ │ │ └─── Day of week (0-7, 0=Sunday)
   * │ │ │ └───── Month (1-12)
   * │ │ └─────── Day of month (1-31)
   * │ └───────── Hour (0-23)
   * └─────────── Minute (0-59)
   * ```
   */
  @Cron('0 2 * * *')
  async cleanupExpiredTokens(): Promise<void> {
    this.logger.log('Starting cleanup of expired password reset tokens');

    try {
      // Calculate cutoff date (7 days ago)
      const cutoffDate = new Date(
        Date.now() - this.EXPIRED_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000
      );

      this.logger.debug(`Deleting expired tokens older than ${cutoffDate.toISOString()}`);

      // Use per-tenant batching for scalability
      const deletedCount = await this.deleteExpiredTokensForAllTenants(cutoffDate);

      this.logger.log(`Cleanup completed: Deleted ${deletedCount} expired password reset tokens`);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired password reset tokens: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }

  /**
   * Scheduled job: Clean up used password reset tokens
   *
   * Runs daily at 3:00 AM (after expired token cleanup).
   * Deletes tokens that were used more than 30 days ago.
   * Uses per-tenant batching to prevent long-running transactions.
   *
   * Schedule: Every day at 3:00 AM
   * Cron: 0 3 * * *
   */
  @Cron('0 3 * * *')
  async cleanupUsedTokens(): Promise<void> {
    this.logger.log('Starting cleanup of used password reset tokens');

    try {
      // Calculate cutoff date (30 days ago)
      const cutoffDate = new Date(
        Date.now() - this.USED_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000
      );

      this.logger.debug(`Deleting used tokens older than ${cutoffDate.toISOString()}`);

      // Use per-tenant batching for scalability
      const deletedCount = await this.deleteUsedTokensForAllTenants(cutoffDate);

      this.logger.log(`Cleanup completed: Deleted ${deletedCount} used password reset tokens`);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup used password reset tokens: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }

  /**
   * Deletes expired tokens for all tenants using per-tenant batching.
   *
   * Iterates through organizations in batches, cleaning up tokens for each.
   * Includes rate limiting (50ms delay) between batches to prevent DB saturation.
   *
   * @param cutoffDate - Delete tokens expired before this date
   * @param orgIds - Optional pre-fetched organization IDs to avoid redundant queries
   * @returns Promise resolving to total number of tokens deleted
   *
   * @private
   */
  private async deleteExpiredTokensForAllTenants(
    cutoffDate: Date,
    orgIds?: number[]
  ): Promise<number> {
    const organizationIds = orgIds ?? (await this.getActiveOrganizationIds());
    this.logger.log(
      `Found ${organizationIds.length} organizations to process for expired token cleanup`
    );

    let totalDeleted = 0;
    let processedCount = 0;

    // Process in batches to avoid overwhelming database
    for (let i = 0; i < organizationIds.length; i += this.BATCH_SIZE) {
      const batch = organizationIds.slice(i, i + this.BATCH_SIZE);
      const batchNumber = Math.floor(i / this.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(organizationIds.length / this.BATCH_SIZE);

      this.logger.debug(
        `Processing batch ${batchNumber}/${totalBatches} (${batch.length} organizations)`
      );

      // Process batch in parallel
      const deletePromises = batch.map((orgId) =>
        this.passwordResetRepository.deleteExpiredTokens(orgId, cutoffDate)
      );

      const deleteCounts = await Promise.all(deletePromises);
      const batchDeleted = deleteCounts.reduce((sum, count) => sum + count, 0);

      totalDeleted += batchDeleted;
      processedCount += batch.length;

      this.logger.debug(
        `Batch ${batchNumber} complete: ${batchDeleted} tokens deleted ` +
          `(${processedCount}/${organizationIds.length} organizations processed)`
      );

      // Rate limiting: wait before next batch (except for last batch)
      if (i + this.BATCH_SIZE < organizationIds.length) {
        await this.sleep(this.BATCH_DELAY_MS);
      }
    }

    return totalDeleted;
  }

  /**
   * Deletes used tokens for all tenants using per-tenant batching.
   *
   * Iterates through organizations in batches, cleaning up tokens for each.
   * Includes rate limiting (50ms delay) between batches to prevent DB saturation.
   *
   * @param cutoffDate - Delete tokens used before this date
   * @param orgIds - Optional pre-fetched organization IDs to avoid redundant queries
   * @returns Promise resolving to total number of tokens deleted
   *
   * @private
   */
  private async deleteUsedTokensForAllTenants(
    cutoffDate: Date,
    orgIds?: number[]
  ): Promise<number> {
    const organizationIds = orgIds ?? (await this.getActiveOrganizationIds());
    this.logger.log(
      `Found ${organizationIds.length} organizations to process for used token cleanup`
    );

    let totalDeleted = 0;
    let processedCount = 0;

    // Process in batches to avoid overwhelming database
    for (let i = 0; i < organizationIds.length; i += this.BATCH_SIZE) {
      const batch = organizationIds.slice(i, i + this.BATCH_SIZE);
      const batchNumber = Math.floor(i / this.BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(organizationIds.length / this.BATCH_SIZE);

      this.logger.debug(
        `Processing batch ${batchNumber}/${totalBatches} (${batch.length} organizations)`
      );

      // Process batch in parallel
      const deletePromises = batch.map((orgId) =>
        this.passwordResetRepository.deleteUsedTokens(orgId, cutoffDate)
      );

      const deleteCounts = await Promise.all(deletePromises);
      const batchDeleted = deleteCounts.reduce((sum, count) => sum + count, 0);

      totalDeleted += batchDeleted;
      processedCount += batch.length;

      this.logger.debug(
        `Batch ${batchNumber} complete: ${batchDeleted} tokens deleted ` +
          `(${processedCount}/${organizationIds.length} organizations processed)`
      );

      // Rate limiting: wait before next batch (except for last batch)
      if (i + this.BATCH_SIZE < organizationIds.length) {
        await this.sleep(this.BATCH_DELAY_MS);
      }
    }

    return totalDeleted;
  }

  /**
   * Retrieves all active organization IDs.
   *
   * Returns organizations that:
   * - Have isActive = true
   * - Have deletedAt = null (not soft-deleted)
   *
   * @returns Promise resolving to array of organization IDs
   *
   * @private
   */
  private async getActiveOrganizationIds(): Promise<number[]> {
    const orgs = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.isActive, true), isNull(organizations.deletedAt)));

    return orgs.map((org) => org.id);
  }

  /**
   * Sleep utility for rate limiting between batches.
   *
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   *
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Manual cleanup trigger for testing or administrative purposes.
   *
   * Runs both expired and used token cleanup immediately.
   * Uses same batching logic as scheduled jobs.
   *
   * @returns Promise resolving to cleanup statistics
   *
   * @example Controller endpoint for manual cleanup
   * ```typescript
   * @Post('admin/cleanup-tokens')
   * @UseGuards(JwtAuthGuard, AdminGuard)
   * async manualCleanup() {
   *   return this.tokenCleanupService.runManualCleanup();
   * }
   * ```
   */
  async runManualCleanup(): Promise<{
    expiredTokensDeleted: number;
    usedTokensDeleted: number;
    organizationsProcessed: number;
  }> {
    this.logger.log('Manual cleanup triggered');

    const expiredCutoff = new Date(
      Date.now() - this.EXPIRED_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const usedCutoff = new Date(Date.now() - this.USED_TOKEN_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const orgIds = await this.getActiveOrganizationIds();

    const [expiredTokensDeleted, usedTokensDeleted] = await Promise.all([
      this.deleteExpiredTokensForAllTenants(expiredCutoff, orgIds),
      this.deleteUsedTokensForAllTenants(usedCutoff, orgIds)
    ]);

    this.logger.log(
      `Manual cleanup completed: ${expiredTokensDeleted} expired, ${usedTokensDeleted} used ` +
        `(${orgIds.length} organizations processed)`
    );

    return {
      expiredTokensDeleted,
      usedTokensDeleted,
      organizationsProcessed: orgIds.length
    };
  }
}
