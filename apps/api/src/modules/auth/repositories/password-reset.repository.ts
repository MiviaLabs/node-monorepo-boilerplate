import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  gt,
  gte,
  isNull,
  lt,
  passwordResetTokens,
  type NewPasswordResetToken,
  type NodePgDatabase,
  type PasswordResetToken
} from '@package/db-core';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';

/**
 * Password Reset Repository
 *
 * Handles tenant-scoped password reset token persistence and lifecycle management.
 *
 * Security features:
 * - Token hashing: Only SHA-256 hash stored, never plaintext token
 * - Tenant isolation: All queries scoped to organization_id
 * - Single-use tokens: usedAt soft-delete pattern
 * - Automatic expiration: expiresAt validation
 * - Audit trail: Creation and usage timestamps
 *
 * Token lifecycle:
 * 1. Create token → Returns raw token (shown once), hash stored in DB
 * 2. Validate token → Check hash exists, not used, not expired
 * 3. Mark as used → Set usedAt timestamp (soft delete)
 * 4. Cleanup → Delete expired/used tokens (background job)
 *
 * @example Basic usage
 * ```typescript
 * // Create token
 * const { token, resetToken } = await repository.createToken({
 *   organizationId: 1,
 *   userId: 5,
 *   emailHash: sha256('user@example.com'),
 *   expiresAt: new Date(Date.now() + 3600000) // 1 hour
 * });
 *
 * // Validate token
 * const validToken = await repository.findActiveByTokenHash(1, tokenHash);
 *
 * // Mark as used
 * await repository.markAsUsed(1, validToken.id);
 * ```
 */
@Injectable()
export class PasswordResetRepository extends BaseRepository<
  PasswordResetToken,
  NewPasswordResetToken,
  Partial<NewPasswordResetToken>,
  number
> {
  constructor(@Inject(MAIN_DB) protected override readonly db: NodePgDatabase) {
    super(db);
  }

  protected getTable(): typeof passwordResetTokens {
    return passwordResetTokens;
  }

  protected getIdColumn(): typeof passwordResetTokens.id {
    return passwordResetTokens.id;
  }

  protected getTenantColumn(): typeof passwordResetTokens.organizationId {
    return passwordResetTokens.organizationId;
  }

  protected getEntityName(): string {
    return 'PasswordResetToken';
  }

  /**
   * Creates a password reset token and returns the persisted record plus raw token.
   *
   * The raw token is never stored in the database. Only SHA-256 tokenHash is persisted.
   *
   * @param params - Token creation parameters
   * @param params.organizationId - Tenant ID
   * @param params.userId - User ID requesting reset
   * @param params.emailHash - SHA-256 hash of user's email
   * @param params.expiresAt - Token expiration timestamp
   * @param params.requestIp - Optional IP address of requester
   * @param params.requestUserAgent - Optional user agent of requester
   * @returns Promise resolving to token record and raw token string
   *
   * @example
   * ```typescript
   * const { token, resetToken } = await repository.createToken({
   *   organizationId: 1,
   *   userId: 5,
   *   emailHash: hashEmail('user@example.com'),
   *   expiresAt: new Date(Date.now() + 3600000), // 1 hour
   *   requestIp: '192.168.1.1',
   *   requestUserAgent: 'Mozilla/5.0...'
   * });
   *
   * // Send resetToken to user via email (shown once)
   * await emailService.sendPasswordReset(email, resetToken);
   * ```
   */
  async createToken(params: {
    organizationId: number;
    userId: number;
    emailHash: string;
    expiresAt: Date;
    requestIp?: string;
    requestUserAgent?: string;
  }): Promise<{ token: PasswordResetToken; resetToken: string }> {
    return this.db.transaction(async (tx) => this.createTokenWithTransaction(tx, params));
  }

  /**
   * Creates a password reset token within an existing transaction.
   *
   * Use this when token creation is part of a larger transactional operation.
   *
   * @param tx - Transaction context
   * @param params - Token creation parameters
   * @returns Promise resolving to token record and raw token string
   */
  async createTokenWithTransaction(
    tx: NodePgDatabase,
    params: {
      organizationId: number;
      userId: number;
      emailHash: string;
      expiresAt: Date;
      requestIp?: string;
      requestUserAgent?: string;
    }
  ): Promise<{ token: PasswordResetToken; resetToken: string }> {
    const resetToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(resetToken).digest('hex');

    const [token] = await tx
      .insert(passwordResetTokens)
      .values({
        organizationId: params.organizationId,
        userId: params.userId,
        emailHash: params.emailHash,
        tokenHash,
        expiresAt: params.expiresAt,
        requestIp: params.requestIp,
        requestUserAgent: params.requestUserAgent
      })
      .returning();

    if (!token) {
      throw new Error('Failed to create password reset token');
    }

    return {
      token,
      resetToken
    };
  }

  /**
   * Finds an active (unused, not expired) token by token hash within tenant scope.
   *
   * Active token criteria:
   * - Correct tokenHash
   * - Belongs to organizationId (tenant scoping)
   * - usedAt is null (not yet used)
   * - expiresAt > now (not expired)
   *
   * @param organizationId - Tenant ID
   * @param tokenHash - SHA-256 hash of the reset token
   * @returns Promise resolving to token record or null if not found/invalid
   *
   * @example
   * ```typescript
   * const tokenHash = createHash('sha256').update(rawToken).digest('hex');
   * const validToken = await repository.findActiveByTokenHash(1, tokenHash);
   *
   * if (!validToken) {
   *   throw new BadRequestException('Invalid or expired token');
   * }
   * ```
   */
  async findActiveByTokenHash(
    organizationId: number,
    tokenHash: string
  ): Promise<PasswordResetToken | null> {
    const now = new Date();

    const [token] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt), // Not used yet
          gt(passwordResetTokens.expiresAt, now) // Not expired
        )
      )
      .limit(1);

    return token ?? null;
  }

  /**
   * Finds an active token by token hash across all organizations.
   *
   * Safe because token_hash is globally unique.
   */
  async findActiveByTokenHashGlobal(tokenHash: string): Promise<PasswordResetToken | null> {
    const now = new Date();

    const [token] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now)
        )
      )
      .limit(1);

    return token ?? null;
  }

  /**
   * Finds a token by token hash within tenant scope across all statuses.
   *
   * Use this when you need to retrieve a token regardless of its status
   * (used, expired, or active). Useful for audit/logging purposes.
   *
   * @param organizationId - Tenant ID
   * @param tokenHash - SHA-256 hash of the reset token
   * @returns Promise resolving to token record or null if not found
   */
  async findByTokenHash(
    organizationId: number,
    tokenHash: string
  ): Promise<PasswordResetToken | null> {
    const [token] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          eq(passwordResetTokens.tokenHash, tokenHash)
        )
      )
      .limit(1);

    return token ?? null;
  }

  /**
   * Finds a token by token hash across all organizations.
   *
   * Safe because token_hash is globally unique.
   */
  async findByTokenHashGlobal(tokenHash: string): Promise<PasswordResetToken | null> {
    const [token] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    return token ?? null;
  }

  /**
   * Finds active tokens by user within tenant scope.
   *
   * Returns all active (unused, not expired) tokens for a specific user.
   * Useful for:
   * - Invalidating previous tokens when new one is created
   * - Checking if user has pending reset requests
   * - Admin audit of active tokens
   *
   * @param organizationId - Tenant ID
   * @param userId - User ID
   * @returns Promise resolving to array of active token records
   *
   * @example
   * ```typescript
   * // Invalidate all existing tokens for user before creating new one
   * const existingTokens = await repository.findActiveByUser(orgId, userId);
   * for (const token of existingTokens) {
   *   await repository.markAsUsed(orgId, token.id);
   * }
   * ```
   */
  async findActiveByUser(organizationId: number, userId: number): Promise<PasswordResetToken[]> {
    const now = new Date();

    return this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt), // Not used yet
          gt(passwordResetTokens.expiresAt, now) // Not expired
        )
      );
  }

  /**
   * Finds active tokens by email hash within tenant scope.
   *
   * Returns all active (unused, not expired) tokens for a specific email.
   * Useful for rate limiting password reset requests per email.
   *
   * @param organizationId - Tenant ID
   * @param emailHash - SHA-256 hash of user's email
   * @returns Promise resolving to array of active token records
   *
   * @example
   * ```typescript
   * // Rate limit: No more than 3 active tokens per email
   * const existingTokens = await repository.findActiveByEmailHash(orgId, emailHash);
   * if (existingTokens.length >= 3) {
   *   throw new TooManyRequestsException('Too many password reset requests');
   * }
   * ```
   */
  async findActiveByEmailHash(
    organizationId: number,
    emailHash: string
  ): Promise<PasswordResetToken[]> {
    const now = new Date();

    return this.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          eq(passwordResetTokens.emailHash, emailHash),
          isNull(passwordResetTokens.usedAt), // Not used yet
          gt(passwordResetTokens.expiresAt, now) // Not expired
        )
      );
  }

  /**
   * Counts tokens created for an email hash since a cutoff within tenant scope.
   *
   * Used for per-email rate limiting of password reset requests.
   */
  async countRecentByEmailHash(
    organizationId: number,
    emailHash: string,
    since: Date
  ): Promise<number> {
    const rows = await this.db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          eq(passwordResetTokens.emailHash, emailHash),
          gte(passwordResetTokens.createdAt, since)
        )
      );

    return rows.length;
  }

  /**
   * Marks a token as used within tenant scope.
   *
   * Sets usedAt timestamp to prevent token reuse (soft delete pattern).
   * Token becomes invalid for future password reset attempts.
   *
   * @param organizationId - Tenant ID
   * @param tokenId - Token ID
   * @param dbOrTx - Database or transaction context (optional, defaults to this.db)
   * @returns Promise resolving to updated token record or null if not found
   *
   * @example
   * ```typescript
   * // After successfully resetting password
   * const updatedToken = await repository.markAsUsed(orgId, token.id);
   * if (!updatedToken) {
   *   throw new NotFoundException('Token not found');
   * }
   *
   * // Within transaction
   * await db.transaction(async (tx) => {
   *   const updatedToken = await repository.markAsUsed(orgId, token.id, tx);
   * });
   * ```
   */
  async markAsUsed(
    organizationId: number,
    tokenId: number,
    dbOrTx?: NodePgDatabase
  ): Promise<PasswordResetToken | null> {
    const now = new Date();
    const db = dbOrTx ?? this.db;

    const [token] = await db
      .update(passwordResetTokens)
      .set({
        usedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          eq(passwordResetTokens.id, tokenId),
          isNull(passwordResetTokens.usedAt) // Only if not already used
        )
      )
      .returning();

    return token ?? null;
  }

  /**
   * Invalidates all active tokens for a user within tenant scope.
   *
   * Marks all active (unused, not expired) tokens as used.
   * Useful when:
   * - Creating a new reset token (invalidate previous requests)
   * - User successfully changes password (invalidate pending tokens)
   * - Admin manually invalidates user's tokens
   *
   * @param organizationId - Tenant ID
   * @param userId - User ID
   * @param dbOrTx - Database or transaction context (optional, defaults to this.db)
   * @returns Promise resolving to number of tokens invalidated
   *
   * @example
   * ```typescript
   * // Before creating new token, invalidate existing ones
   * const invalidatedCount = await repository.invalidateAllForUser(orgId, userId);
   * console.log(`Invalidated ${invalidatedCount} existing tokens`);
   *
   * // Within transaction
   * await db.transaction(async (tx) => {
   *   await repository.invalidateAllForUser(orgId, userId, tx);
   * });
   * ```
   */
  async invalidateAllForUser(
    organizationId: number,
    userId: number,
    dbOrTx?: NodePgDatabase
  ): Promise<number> {
    const now = new Date();
    const db = dbOrTx ?? this.db;

    const result = await db
      .update(passwordResetTokens)
      .set({
        usedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt), // Only active tokens
          gt(passwordResetTokens.expiresAt, now) // Only non-expired tokens
        )
      );

    return result.rowCount ?? 0;
  }

  /**
   * Deletes expired tokens within tenant scope.
   *
   * Hard deletes tokens that have expired (expiresAt <= cutoff date).
   * Intended for background cleanup jobs to prevent database bloat.
   *
   * @param organizationId - Tenant ID
   * @param cutoffDate - Delete tokens expired before this date
   * @returns Promise resolving to number of tokens deleted
   *
   * @example
   * ```typescript
   * // Delete tokens expired more than 7 days ago
   * const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
   * const deletedCount = await repository.deleteExpiredTokens(orgId, cutoff);
   * console.log(`Cleaned up ${deletedCount} expired tokens`);
   * ```
   */
  async deleteExpiredTokens(organizationId: number, cutoffDate: Date): Promise<number> {
    const result = await this.db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          lt(passwordResetTokens.expiresAt, cutoffDate)
        )
      );

    return result.rowCount ?? 0;
  }

  /**
   * Deletes used tokens older than cutoff date within tenant scope.
   *
   * Hard deletes tokens that have been used (usedAt != null) and are older
   * than the cutoff date. Preserves recent used tokens for audit purposes.
   *
   * @param organizationId - Tenant ID
   * @param cutoffDate - Delete tokens used before this date
   * @returns Promise resolving to number of tokens deleted
   *
   * @example
   * ```typescript
   * // Delete tokens used more than 30 days ago
   * const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
   * const deletedCount = await repository.deleteUsedTokens(orgId, cutoff);
   * console.log(`Cleaned up ${deletedCount} used tokens`);
   * ```
   */
  async deleteUsedTokens(organizationId: number, cutoffDate: Date): Promise<number> {
    const result = await this.db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.organizationId, organizationId),
          lt(passwordResetTokens.usedAt, cutoffDate)
        )
      );

    return result.rowCount ?? 0;
  }

  /**
   * Deletes expired tokens across ALL tenants (global cleanup).
   *
   * Hard deletes tokens that have expired (expiresAt <= cutoff date) across
   * all organizations. Intended for background cleanup jobs.
   *
   * **Use with caution**: This operates across all tenants.
   * For very large databases, consider per-tenant batching instead.
   *
   * @param cutoffDate - Delete tokens expired before this date
   * @returns Promise resolving to number of tokens deleted
   *
   * @example
   * ```typescript
   * // Delete tokens expired more than 7 days ago (all tenants)
   * const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
   * const deletedCount = await repository.deleteExpiredTokensGlobal(cutoff);
   * console.log(`Cleaned up ${deletedCount} expired tokens globally`);
   * ```
   */
  async deleteExpiredTokensGlobal(cutoffDate: Date): Promise<number> {
    const result = await this.db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, cutoffDate));

    return result.rowCount ?? 0;
  }

  /**
   * Deletes used tokens across ALL tenants (global cleanup).
   *
   * Hard deletes tokens that have been used (usedAt != null) and are older
   * than the cutoff date across all organizations. Preserves recent used
   * tokens for audit purposes.
   *
   * **Use with caution**: This operates across all tenants.
   * For very large databases, consider per-tenant batching instead.
   *
   * @param cutoffDate - Delete tokens used before this date
   * @returns Promise resolving to number of tokens deleted
   *
   * @example
   * ```typescript
   * // Delete tokens used more than 30 days ago (all tenants)
   * const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
   * const deletedCount = await repository.deleteUsedTokensGlobal(cutoff);
   * console.log(`Cleaned up ${deletedCount} used tokens globally`);
   * ```
   */
  async deleteUsedTokensGlobal(cutoffDate: Date): Promise<number> {
    const result = await this.db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.usedAt, cutoffDate));

    return result.rowCount ?? 0;
  }
}
