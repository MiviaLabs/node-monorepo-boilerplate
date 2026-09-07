import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  and,
  eq,
  invitations,
  type Invitation,
  type NewInvitation,
  type NodePgDatabase
} from '@package/db-core';
import { EncryptionService } from '@package/encryption';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';
import { EncryptedStoreKeyService } from '../../encrypted-store/encrypted-store-key.service';

// eslint-disable-next-line local-rules/prefer-const-enum
export type TenantInvitationRole =
  | 'tenant_owner'
  | 'tenant_admin'
  | 'tenant_user'
  | 'tenant_viewer';

/**
 * Invitation repository
 *
 * Handles tenant-scoped invitation persistence and lifecycle transitions.
 */
@Injectable()
export class InvitationRepository extends BaseRepository<
  Invitation,
  NewInvitation,
  Partial<NewInvitation>,
  number
> {
  constructor(
    @Inject(MAIN_DB) protected override readonly db: NodePgDatabase,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly encryptedStoreKeyService: EncryptedStoreKeyService
  ) {
    super(db);
  }

  protected getTable(): typeof invitations {
    return invitations;
  }

  protected getIdColumn(): typeof invitations.id {
    return invitations.id;
  }

  protected getTenantColumn(): typeof invitations.organizationId {
    return invitations.organizationId;
  }

  protected getEntityName(): string {
    return 'Invitation';
  }

  private getInvitationTokenSecret(): string {
    const configuredSecret =
      this.configService.get<string>('INVITATION_TOKEN_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      process.env['INVITATION_TOKEN_SECRET'] ??
      process.env['JWT_SECRET'];

    if (!configuredSecret) {
      throw new Error('INVITATION_TOKEN_SECRET or JWT_SECRET must be configured');
    }

    return configuredSecret;
  }

  private buildDeterministicInvitationToken(input: {
    organizationId: number;
    invitationId: number;
    issuedAt: Date;
  }): string {
    return createHash('sha256')
      .update(
        `${input.organizationId}:${input.invitationId}:${input.issuedAt.toISOString()}:${this.getInvitationTokenSecret()}`
      )
      .digest('hex');
  }

  getCurrentInvitationToken(
    invitation: Pick<Invitation, 'organizationId' | 'id' | 'updatedAt'>
  ): string {
    return this.buildDeterministicInvitationToken({
      organizationId: invitation.organizationId,
      invitationId: invitation.id,
      issuedAt: invitation.updatedAt
    });
  }

  /**
   * Decrypts the emailEncrypted field from an invitation record.
   *
   * @param emailEncrypted - Encrypted email in format: ciphertext:encryptedDataKey:iv:authTag
   * @returns Decrypted plaintext email
   */
  async decryptEmail(emailEncrypted: string): Promise<string> {
    const parts = emailEncrypted.split(':');
    if (parts.length !== 4) {
      throw new Error(`Invalid encrypted email format: expected 4 parts, got ${parts.length}`);
    }
    const [ciphertext, encryptedDataKey, iv, authTag] = parts;

    if (!ciphertext || !encryptedDataKey || !iv || !authTag) {
      throw new Error('Invalid encrypted email format: missing required parts');
    }

    return this.encryptionService.decryptFromBase64(ciphertext, encryptedDataKey, iv, authTag);
  }

  /**
   * Creates a pending invitation and returns the persisted record plus raw invitation token.
   *
   * The raw token is never stored in the database. Only SHA-256 tokenHash is persisted.
   */
  async createInvitation(params: {
    organizationId: number;
    email: string;
    invitedByUserId?: number;
    role?: TenantInvitationRole;
    expiresAt?: Date;
  }): Promise<{ invitation: Invitation; invitationToken: string }> {
    return this.db.transaction(async (tx) => this.createInvitationWithTransaction(tx, params));
  }

  /**
   * Creates a pending invitation within an existing transaction.
   */
  async createInvitationWithTransaction(
    tx: NodePgDatabase,
    params: {
      organizationId: number;
      email: string;
      invitedByUserId?: number;
      role?: TenantInvitationRole;
      expiresAt?: Date;
    }
  ): Promise<{ invitation: Invitation; invitationToken: string }> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const emailHash = hashEmail(normalizedEmail);
    const now = new Date();
    const placeholderTokenHash = createHash('sha256').update(randomUUID()).digest('hex');

    // Get encryption key with version tracking
    const { keyId, keyVersion } = await this.encryptedStoreKeyService.getPrimaryKeyIdWithVersion();

    // Encrypt email using AES-256-GCM as per schema requirements
    const encryptedEmail = await this.encryptionService.encryptToBase64(normalizedEmail, { keyId });
    const emailEncrypted = `${encryptedEmail.ciphertext}:${encryptedEmail.encryptedDataKey}:${encryptedEmail.iv}:${encryptedEmail.authTag}`;

    const [invitation] = await tx
      .insert(invitations)
      .values({
        organizationId: params.organizationId,
        emailHash,
        emailEncrypted,
        tokenHash: placeholderTokenHash,
        status: 'pending',
        role: params.role ?? 'tenant_user',
        invitedByUserId: params.invitedByUserId,
        expiresAt: params.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        encryptionKeyVersion: keyVersion,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!invitation) {
      throw new Error('Failed to create invitation');
    }

    const invitationToken = this.buildDeterministicInvitationToken({
      organizationId: invitation.organizationId,
      invitationId: invitation.id,
      issuedAt: invitation.updatedAt
    });
    const tokenHash = createHash('sha256').update(invitationToken).digest('hex');

    const [persistedInvitation] = await tx
      .update(invitations)
      .set({
        tokenHash
      })
      .where(eq(invitations.id, invitation.id))
      .returning();

    if (!persistedInvitation) {
      throw new Error('Failed to persist invitation token hash');
    }

    return {
      invitation: persistedInvitation,
      invitationToken
    };
  }

  /**
   * Finds a pending invitation by token hash within tenant scope.
   */
  async findPendingByTokenHash(
    organizationId: number,
    tokenHash: string
  ): Promise<Invitation | null> {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.tokenHash, tokenHash),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    return invitation ?? null;
  }

  /**
   * Finds a pending invitation by token hash without requiring client-supplied organization context.
   */
  async findPendingByTokenHashGlobal(tokenHash: string): Promise<Invitation | null> {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, tokenHash), eq(invitations.status, 'pending')))
      .limit(1);

    return invitation ?? null;
  }

  /**
   * Finds an invitation by token hash within tenant scope across all statuses.
   */
  async findByTokenHash(organizationId: number, tokenHash: string): Promise<Invitation | null> {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(
        and(eq(invitations.organizationId, organizationId), eq(invitations.tokenHash, tokenHash))
      )
      .limit(1);

    return invitation ?? null;
  }

  /**
   * Finds an invitation by token hash across all statuses without requiring organization context.
   */
  async findByTokenHashGlobal(tokenHash: string): Promise<Invitation | null> {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);

    return invitation ?? null;
  }

  /**
   * Finds a pending invitation by email hash within tenant scope.
   */
  async findPendingByEmailHash(
    organizationId: number,
    emailHash: string
  ): Promise<Invitation | null> {
    const [invitation] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.emailHash, emailHash),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    return invitation ?? null;
  }

  /**
   * Updates role/inviter/expiration for a pending invitation in tenant scope.
   */
  async updatePendingInvitation(
    organizationId: number,
    invitationId: number,
    update: {
      role?: TenantInvitationRole;
      invitedByUserId?: number;
      expiresAt?: Date;
    }
  ): Promise<Invitation | null> {
    const [invitation] = await this.db
      .update(invitations)
      .set({
        ...(update.role !== undefined && { role: update.role }),
        ...(update.invitedByUserId !== undefined && { invitedByUserId: update.invitedByUserId }),
        ...(update.expiresAt !== undefined && { expiresAt: update.expiresAt }),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning();

    return invitation ?? null;
  }

  async updatePendingInvitationWithTransaction(
    tx: NodePgDatabase,
    organizationId: number,
    invitationId: number,
    update: {
      role?: TenantInvitationRole;
      invitedByUserId?: number;
      expiresAt?: Date;
    }
  ): Promise<Invitation | null> {
    const [invitation] = await tx
      .update(invitations)
      .set({
        ...(update.role !== undefined && { role: update.role }),
        ...(update.invitedByUserId !== undefined && { invitedByUserId: update.invitedByUserId }),
        ...(update.expiresAt !== undefined && { expiresAt: update.expiresAt }),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning();

    return invitation ?? null;
  }

  /**
   * Updates expiresAt for a pending invitation within a transaction.
   *
   * @param tx - Transaction context
   * @param organizationId - Tenant ID
   * @param invitationId - Invitation ID
   * @param expiresAt - New expiration date
   */
  async updateExpiresAt(
    tx: NodePgDatabase,
    organizationId: number,
    invitationId: number,
    expiresAt: Date
  ): Promise<Invitation | null> {
    const [invitation] = await tx
      .update(invitations)
      .set({
        expiresAt,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning();

    return invitation ?? null;
  }

  /**
   * Marks a pending invitation as accepted within tenant scope.
   */
  async markAsAccepted(organizationId: number, invitationId: number): Promise<Invitation | null> {
    const now = new Date();

    const [invitation] = await this.db
      .update(invitations)
      .set({
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning();

    return invitation ?? null;
  }

  /**
   * Marks a pending invitation as accepted within tenant scope using an existing transaction.
   */
  async markAsAcceptedWithTransaction(
    tx: NodePgDatabase,
    organizationId: number,
    invitationId: number
  ): Promise<Invitation | null> {
    const now = new Date();

    const [invitation] = await tx
      .update(invitations)
      .set({
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning();

    return invitation ?? null;
  }

  /**
   * Marks a pending invitation as cancelled within tenant scope.
   */
  async markAsCancelled(organizationId: number, invitationId: number): Promise<Invitation | null> {
    const now = new Date();

    const [invitation] = await this.db
      .update(invitations)
      .set({
        status: 'cancelled',
        updatedAt: now
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning();

    return invitation ?? null;
  }

  /**
   * Marks a pending invitation as cancelled within tenant scope using an existing transaction.
   */
  async markAsCancelledWithTransaction(
    tx: NodePgDatabase,
    organizationId: number,
    invitationId: number
  ): Promise<Invitation | null> {
    const now = new Date();

    const [invitation] = await tx
      .update(invitations)
      .set({
        status: 'cancelled',
        updatedAt: now
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning();

    return invitation ?? null;
  }

  /**
   * Rotates the token hash for a pending invitation and returns the new raw token.
   *
   * The raw token is never persisted, only the hash is stored.
   */
  async rotatePendingToken(organizationId: number, invitationId: number): Promise<string | null> {
    return this.rotatePendingTokenWithTransaction(this.db, organizationId, invitationId);
  }

  /**
   * Rotates the token hash for a pending invitation within an existing transaction.
   *
   * The raw token is never persisted, only the hash is stored.
   */
  async rotatePendingTokenWithTransaction(
    tx: NodePgDatabase,
    organizationId: number,
    invitationId: number
  ): Promise<string | null> {
    const issuedAt = new Date();
    const invitationToken = this.buildDeterministicInvitationToken({
      organizationId,
      invitationId,
      issuedAt
    });
    const tokenHash = createHash('sha256').update(invitationToken).digest('hex');

    const [updated] = await tx
      .update(invitations)
      .set({
        tokenHash,
        updatedAt: issuedAt
      })
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          eq(invitations.id, invitationId),
          eq(invitations.status, 'pending')
        )
      )
      .returning({ id: invitations.id });

    if (!updated) {
      return null;
    }

    return invitationToken;
  }
}
