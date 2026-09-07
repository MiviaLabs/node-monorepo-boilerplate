import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { CachedPermissionService } from '@package/auth';
import { SYSTEM_PERMISSIONS, TENANT_PERMISSIONS } from '@package/constants';
import {
  asc,
  tenants,
  organizations,
  userTenants,
  userRoles,
  users,
  eq,
  and,
  or,
  gt,
  lt,
  isNotNull,
  isNull,
  sql,
  type NodePgDatabase
} from '@package/db-core';
import { EncryptionService } from '@package/encryption';
import { Errors } from '@package/errors';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';
import { EncryptedStoreKeyService } from '../../encrypted-store/encrypted-store-key.service';

/**
 * User context interface for authorization checks
 *
 * Provided by controllers/handlers to repositories for authorization.
 */
export interface RepositoryUserContext {
  /** User ID from JWT */
  userId: number;
  /** Tenant ID (organization ID) from x-tenant-id header */
  tenantId: number;
  /** User roles from JWT */
  roles?: string[];
}

export interface UserOrganizationMembership {
  organizationId: string;
  tenantId: string;
  name: string;
  displayName: string | null;
  slug: string;
  role: string;
  isDefault: boolean;
  isActive: boolean;
}

/**
 * Auth repository
 *
 * Handles authentication-related user operations with tenant scoping and authorization
 * Extends BaseRepository with string tenant IDs (UUID)
 *
 * Authorization rules:
 * - Self-access: Users can always access their own data
 * - System permissions: system:users:* allows cross-tenant access
 * - Tenant permissions: tenant:users:* allows same-tenant access
 * - Throws ForbiddenException for unauthorized access
 */
@Injectable()
export class AuthRepository extends BaseRepository<
  typeof users.$inferSelect,
  typeof users.$inferInsert,
  Record<string, never>,
  string
> {
  private static readonly ORGANIZATION_SLUG_MAX_LENGTH = 50;

  constructor(
    @Inject(MAIN_DB) protected override readonly db: NodePgDatabase,
    private readonly permissionService: CachedPermissionService,
    private readonly encryptionService: EncryptionService,
    private readonly encryptedStoreKeyService: EncryptedStoreKeyService
  ) {
    super(db);
  }

  /**
   * Number of parts in a valid encryption envelope
   * Format: ciphertext:encryptedDataKey:iv:authTag
   */
  private static readonly ENVELOPE_PARTS_COUNT = 4;

  /**
   * Validates that an encrypted envelope has the correct format.
   *
   * @param envelope - The envelope string to validate
   * @returns True if valid envelope format
   */
  static isValidEnvelope(envelope: string): boolean {
    const parts = envelope.split(':');
    return parts.length === AuthRepository.ENVELOPE_PARTS_COUNT && parts.every((p) => p.length > 0);
  }

  private static normalizeOptionalSensitiveValue(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : undefined;
  }

  /**
   * Encrypts a plaintext value and returns it in envelope format with key version.
   *
   * @param plaintext - The plaintext value to encrypt
   * @returns The encrypted envelope string and key version
   * @throws Error if encryption fails
   */
  private async encryptToEnvelope(plaintext: string): Promise<{
    envelope: string;
    keyVersion: string;
  }> {
    const { keyId, keyVersion } = await this.encryptedStoreKeyService.getPrimaryKeyIdWithVersion();

    const result = await this.encryptionService.encryptToBase64(plaintext, { keyId });

    return {
      envelope: `${result.ciphertext}:${result.encryptedDataKey}:${result.iv}:${result.authTag}`,
      keyVersion
    };
  }

  /**
   * Decrypts an envelope-formatted encrypted value.
   *
   * @param envelope - Encrypted envelope in ciphertext:key:iv:tag format
   * @returns Decrypted plaintext
   */
  private async decryptFromEnvelope(envelope: string): Promise<string> {
    if (!AuthRepository.isValidEnvelope(envelope)) {
      throw Errors.validationinvalidValueFor002({
        field: 'encryptedValue',
        expectedType: 'valid encryption envelope'
      });
    }

    const [ciphertext, encryptedDataKey, iv, authTag] = envelope.split(':');
    if (!ciphertext || !encryptedDataKey || !iv || !authTag) {
      throw Errors.validationinvalidValueFor002({
        field: 'encryptedValue',
        expectedType: 'valid encryption envelope'
      });
    }

    return this.encryptionService.decryptFromBase64(ciphertext, encryptedDataKey, iv, authTag);
  }

  async decryptEmail(emailEncrypted: string | null | undefined): Promise<string | undefined> {
    if (typeof emailEncrypted !== 'string' || emailEncrypted.length === 0) {
      return undefined;
    }

    if (!AuthRepository.isValidEnvelope(emailEncrypted)) {
      return emailEncrypted;
    }

    return await this.decryptFromEnvelope(emailEncrypted);
  }

  /**
   * Get the users table
   */
  protected getTable(): typeof users {
    return users;
  }

  /**
   * Get the ID column for queries
   */
  protected getIdColumn(): typeof users.id {
    return users.id;
  }

  /**
   * Get the tenant column for scoping
   */
  protected getTenantColumn(): typeof users.organizationId {
    return users.organizationId;
  }

  /**
   * Get the entity name for error messages
   */
  protected getEntityName(): string {
    return 'User';
  }

  /**
   * Authorization helper: Check if user can access target user
   *
   * Rules:
   * - Users can always access their own data (self-access)
   * - System permissions (system:users:read) allow cross-tenant access
   * - Tenant permissions (tenant:users:read) allow same-tenant access
   *
   * @param userContext - Requesting user context
   * @param targetUserId - Target user ID to access
   * @param targetTenantId - Target user's tenant ID
   * @param requiredPermission - Permission to check (defaults to read)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeAccess(
    userContext: RepositoryUserContext | undefined,
    targetUserId: number,
    targetTenantId: number,
    requiredPermission: string = TENANT_PERMISSIONS.USERS_READ
  ): Promise<void> {
    // If no user context, allow public access (for registration, etc.)
    if (!userContext) {
      return;
    }

    const { userId, tenantId } = userContext;

    // Rule 1: Self-access - users can always access their own data
    if (userId === targetUserId) {
      return;
    }

    // Rule 2: System permissions - allow cross-tenant access
    const systemReadPermission = SYSTEM_PERMISSIONS.USERS_READ;
    const hasSystemPermission = await this.permissionService.hasPermission(
      userId,
      undefined,
      systemReadPermission
    );

    if (hasSystemPermission) {
      return;
    }

    // Rule 3: Tenant permissions - allow same-tenant access
    // Only if target user is in the same tenant as requesting user
    if (tenantId === targetTenantId) {
      const hasTenantPermission = await this.permissionService.hasPermission(
        userId,
        tenantId,
        requiredPermission
      );

      if (hasTenantPermission) {
        return;
      }
    }

    // Access denied - throw ForbiddenException
    throw new ForbiddenException(
      `You do not have permission to access user ${targetUserId}. ` +
        `Required permission: ${requiredPermission} or ${systemReadPermission}`
    );
  }

  /**
   * Authorization helper: Check if user can perform write operation
   *
   * @param userContext - Requesting user context
   * @param targetUserId - Target user ID
   * @param targetTenantId - Target user's tenant ID
   * @param operation - Operation type (create, update, delete)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeWrite(
    userContext: RepositoryUserContext | undefined,
    targetUserId: number,
    targetTenantId: number,
    // eslint-disable-next-line local-rules/prefer-const-enum
    operation: 'create' | 'update' | 'delete'
  ): Promise<void> {
    const tenantPermissionMap = {
      create: TENANT_PERMISSIONS.USERS_CREATE,
      update: TENANT_PERMISSIONS.USERS_UPDATE,
      delete: TENANT_PERMISSIONS.USERS_DELETE
    };

    await this.authorizeAccess(
      userContext,
      targetUserId,
      targetTenantId,
      tenantPermissionMap[operation]
    );
  }

  /**
   * Validate and convert tenant ID string to number
   * Throws error for invalid tenant IDs (consistent error handling)
   *
   * @param tenantId - Tenant ID as string
   * @returns Tenant ID as number
   * @throws ValidationError if tenantId is not a valid positive number
   */
  protected validateTenantId(tenantId: string): number {
    const orgId = Number(tenantId);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      throw Errors.validationinvalidValueFor002({
        field: 'tenantId',
        expectedType: 'positive integer'
      });
    }
    return orgId;
  }

  /**
   * Find user by ID within tenant scope (override to add soft delete filter)
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @param id - User ID
   * @returns User or null
   */
  override async findById(tenantId: string, id: number): Promise<typeof users.$inferSelect | null> {
    const orgId = this.validateTenantId(tenantId);

    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user ?? null;
  }

  /**
   * Find user by ID within tenant scope (within transaction)
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @param id - User ID
   * @returns User or null
   */
  async findByIdWithTransaction(
    tenantId: string,
    tx: NodePgDatabase,
    id: number
  ): Promise<typeof users.$inferSelect | null> {
    const orgId = this.validateTenantId(tenantId);

    const [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user ?? null;
  }

  /**
   * Update current user's profile fields within tenant scope.
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @param userId - User ID
   * @param updates - Updatable profile fields
   * @returns Updated user
   */
  async updateMyProfile(
    tenantId: string,
    userId: number,
    updates: {
      displayName?: string;
      phoneNumber?: string;
    },
    tx?: NodePgDatabase
  ): Promise<typeof users.$inferSelect> {
    const orgId = this.validateTenantId(tenantId);
    const normalizedDisplayName = AuthRepository.normalizeOptionalSensitiveValue(
      updates.displayName
    );
    const phoneNumberProvided = Object.prototype.hasOwnProperty.call(updates, 'phoneNumber');
    const normalizedPhoneNumber = AuthRepository.normalizeOptionalSensitiveValue(
      updates.phoneNumber
    );

    if (!normalizedDisplayName && !phoneNumberProvided) {
      throw Errors.validationinvalidValueFor002({
        field: 'profile',
        expectedType: 'at least one updatable field'
      });
    }

    const phoneNumberResult = normalizedPhoneNumber
      ? await this.encryptToEnvelope(normalizedPhoneNumber)
      : undefined;
    const updateSet: Partial<typeof users.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date()
    };
    if (normalizedDisplayName) {
      updateSet.displayName = normalizedDisplayName;
    }
    if (phoneNumberProvided && !normalizedPhoneNumber) {
      updateSet.phoneNumberEncrypted = null;
    }
    if (phoneNumberResult) {
      updateSet.phoneNumberEncrypted = phoneNumberResult.envelope;
      updateSet.encryptionKeyVersion = phoneNumberResult.keyVersion;
    }

    const db = tx ?? this.db;
    const [updatedUser] = await db
      .update(users)
      .set(updateSet)
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!updatedUser) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    return updatedUser;
  }

  async updateMyAvatarFile(
    tenantId: string,
    userId: number,
    avatarFileId: number | null,
    tx?: NodePgDatabase
  ): Promise<typeof users.$inferSelect> {
    const orgId = this.validateTenantId(tenantId);
    const db = tx ?? this.db;

    const [updatedUser] = await db
      .update(users)
      .set({
        avatarFileId,
        updatedAt: new Date()
      })
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!updatedUser) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    return updatedUser;
  }

  async replaceMyAvatarFileWithDatabase(
    database: NodePgDatabase,
    tenantId: string,
    userId: number,
    avatarFileId: number
  ): Promise<{
    user: typeof users.$inferSelect;
    previousAvatarFileId: number | null;
    changed: boolean;
  }> {
    const orgId = this.validateTenantId(tenantId);

    const [existingUser] = await database
      .select({
        id: users.id,
        avatarFileId: users.avatarFileId
      })
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
      .for('update');

    if (!existingUser) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    if (existingUser.avatarFileId === avatarFileId) {
      const [currentUser] = await database
        .select()
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);

      if (!currentUser) {
        throw Errors.useruserWithId001({ userId: String(userId) });
      }

      return {
        user: currentUser,
        previousAvatarFileId: existingUser.avatarFileId,
        changed: false
      };
    }

    const [updatedUser] = await database
      .update(users)
      .set({
        avatarFileId,
        updatedAt: new Date()
      })
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!updatedUser) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    return {
      user: updatedUser,
      previousAvatarFileId: existingUser.avatarFileId,
      changed: true
    };
  }

  async clearMyAvatarFileWithDatabase(
    database: NodePgDatabase,
    tenantId: string,
    userId: number
  ): Promise<{
    user: typeof users.$inferSelect;
    previousAvatarFileId: number | null;
    changed: boolean;
  }> {
    const orgId = this.validateTenantId(tenantId);

    const [existingUser] = await database
      .select({
        id: users.id,
        avatarFileId: users.avatarFileId
      })
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
      .for('update');

    if (!existingUser) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    if (existingUser.avatarFileId === null) {
      const [currentUser] = await database
        .select()
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);

      if (!currentUser) {
        throw Errors.useruserWithId001({ userId: String(userId) });
      }

      return {
        user: currentUser,
        previousAvatarFileId: null,
        changed: false
      };
    }

    const [updatedUser] = await database
      .update(users)
      .set({
        avatarFileId: null,
        photoUrl: null,
        updatedAt: new Date()
      })
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!updatedUser) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    return {
      user: updatedUser,
      previousAvatarFileId: existingUser.avatarFileId,
      changed: true
    };
  }

  /**
   * Decrypt phone number stored in envelope format.
   *
   * @param encryptedPhoneNumber - Encrypted phone number from database
   * @returns Decrypted phone number or undefined when no value is stored
   */
  async decryptPhoneNumber(
    encryptedPhoneNumber: string | null | undefined
  ): Promise<string | undefined> {
    if (!encryptedPhoneNumber) {
      return undefined;
    }

    const normalizedEncryptedPhone = encryptedPhoneNumber.trim();
    if (!normalizedEncryptedPhone) {
      return undefined;
    }

    return this.decryptFromEnvelope(normalizedEncryptedPhone);
  }

  /**
   * Activate and verify a user account within tenant scope.
   *
   * Used by invitation acceptance flow when reusing an existing account.
   */
  async activateAndVerifyUser(
    tenantId: string,
    userId: number,
    tx?: NodePgDatabase
  ): Promise<typeof users.$inferSelect> {
    const orgId = this.validateTenantId(tenantId);
    const db = tx ?? this.db;

    const [updatedUser] = await db
      .update(users)
      .set({
        isActive: true,
        isVerified: true,
        updatedAt: new Date()
      })
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!updatedUser) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    return updatedUser;
  }

  /**
   * Find user by ID within tenant, including soft-deleted users
   *
   * This method is used for validation purposes where we need to check if a user
   * exists regardless of their deleted status (e.g., ownership transfer validation).
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @param id - User ID
   * @returns User or null
   */
  async findByIdWithTransactionIncludingDeleted(
    tenantId: string,
    tx: NodePgDatabase,
    id: number
  ): Promise<typeof users.$inferSelect | null> {
    const orgId = this.validateTenantId(tenantId);

    const [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), eq(users.id, id)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user ?? null;
  }

  /**
   * Find user by ID across all organizations (global search), including soft-deleted users
   *
   * This method is used for validation purposes where we need to check if a user
   * exists globally regardless of organization or deleted status.
   *
   * @param tx - Database transaction
   * @param id - User ID
   * @returns User or null
   */
  async findByIdGlobalWithTransaction(
    tx: NodePgDatabase,
    id: number
  ): Promise<typeof users.$inferSelect | null> {
    const [user] = await tx.select().from(users).where(eq(users.id, id)).limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user ?? null;
  }

  /**
   * Find user by ID across all organizations (global search).
   */
  async findByIdGlobal(id: number): Promise<typeof users.$inferSelect | null> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user ?? null;
  }

  /**
   * Find user by email within tenant
   * Hashes email and performs secure lookup
   *
   * @param tenantId - Tenant ID (organization ID as string, or undefined for public registration)
   * @param email - User email address
   * @returns User or null
   */
  async findByEmail(
    tenantId: string | undefined,
    email: string
  ): Promise<typeof users.$inferSelect | null> {
    const emailHash = hashEmail(email);

    // If no tenantId, search globally (for public registration)
    if (!tenantId) {
      const [user] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.emailHash, emailHash), isNull(users.deletedAt)))
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return user ?? null;
    }

    const orgId = this.validateTenantId(tenantId);

    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.organizationId, orgId),
          eq(users.emailHash, emailHash),
          isNull(users.deletedAt)
        )
      )
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user ?? null;
  }

  /**
   * Find user by email or throw database error
   *
   * @param tenantId - Tenant ID (or undefined for global search)
   * @param email - User email address
   * @returns User
   * @throws Database record not found error if user not found
   */
  async findByEmailOrThrow(
    tenantId: string | undefined,
    email: string
  ): Promise<typeof users.$inferSelect> {
    const user = await this.findByEmail(tenantId, email);
    if (!user) {
      throw Errors.authinvalidEmailOr001({});
    }
    return user;
  }

  /**
   * Check if email exists within tenant
   *
   * @param tenantId - Tenant ID (organization ID as string, or undefined for global check)
   * @param email - User email address
   * @returns True if email exists
   */
  async emailExists(tenantId: string | undefined, email: string): Promise<boolean> {
    const emailHash = hashEmail(email);

    // If no tenantId, check globally (for public registration)
    if (!tenantId) {
      const [result] = await this.db
        .select({ count: users.id })
        .from(users)
        .where(and(eq(users.emailHash, emailHash), isNull(users.deletedAt)))
        .limit(1);

      return !!result;
    }

    const orgId = this.validateTenantId(tenantId);

    const [result] = await this.db
      .select({ count: users.id })
      .from(users)
      .where(
        and(
          eq(users.organizationId, orgId),
          eq(users.emailHash, emailHash),
          isNull(users.deletedAt)
        )
      )
      .limit(1);

    return !!result;
  }

  /**
   * Create user with email hashed for secure storage
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @param email - User email address
   * @param additionalData - Additional user data
   * @returns Created user
   */
  async createWithEmail(
    tenantId: string,
    email: string,
    additionalData: Partial<typeof users.$inferInsert> = {}
  ): Promise<typeof users.$inferSelect> {
    const normalizedEmail = email.trim().toLowerCase();

    // Guard: Reject empty/whitespace emails to prevent storing meaningless encrypted values
    if (!normalizedEmail) {
      throw new Error('Email cannot be empty or whitespace');
    }

    const emailHash = hashEmail(normalizedEmail);
    const orgId = this.validateTenantId(tenantId);
    const {
      organizationId: _ignoredOrganizationId,
      phoneNumberEncrypted: inputPhoneNumber,
      emailHash: _ignoredEmailHash,
      emailEncrypted: _ignoredEmailEncrypted,
      firstNameEncrypted: inputFirstName,
      lastNameEncrypted: inputLastName,
      encryptionKeyVersion: _ignoredEncryptionKeyVersion,
      ...safeAdditionalData
    } = additionalData;
    const normalizedFirstName = AuthRepository.normalizeOptionalSensitiveValue(inputFirstName);
    const normalizedLastName = AuthRepository.normalizeOptionalSensitiveValue(inputLastName);
    const normalizedPhoneNumber = AuthRepository.normalizeOptionalSensitiveValue(inputPhoneNumber);

    // Parallelize optional field encryption for performance (KMS operations can be slow)
    const [emailResult, firstNameResult, lastNameResult, phoneNumberResult] = await Promise.all([
      this.encryptToEnvelope(normalizedEmail),
      normalizedFirstName
        ? this.encryptToEnvelope(normalizedFirstName)
        : Promise.resolve(undefined),
      normalizedLastName ? this.encryptToEnvelope(normalizedLastName) : Promise.resolve(undefined),
      normalizedPhoneNumber
        ? this.encryptToEnvelope(normalizedPhoneNumber)
        : Promise.resolve(undefined)
    ]);

    // All fields encrypted in this operation use the same key version (from email encryption)
    const keyVersion = emailResult?.keyVersion;

    const [user] = await this.db
      .insert(users)
      .values({
        ...safeAdditionalData,
        organizationId: orgId,
        emailHash,
        emailEncrypted: emailResult?.envelope,
        firstNameEncrypted: firstNameResult?.envelope,
        lastNameEncrypted: lastNameResult?.envelope,
        phoneNumberEncrypted: phoneNumberResult?.envelope,
        encryptionKeyVersion: keyVersion
      } as typeof users.$inferInsert)
      .returning();

    if (!user) {
      throw new Error('Failed to create user');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
  }

  /**
   * Create user with email hashed for secure storage (within transaction)
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @param email - User email address
   * @param additionalData - Additional user data
   * @returns Created user
   */
  async createWithEmailInTransaction(
    tenantId: string,
    tx: NodePgDatabase,
    email: string,
    additionalData: Partial<typeof users.$inferInsert> = {}
  ): Promise<typeof users.$inferSelect> {
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = hashEmail(normalizedEmail);
    const orgId = this.validateTenantId(tenantId);
    const {
      organizationId: _ignoredOrganizationId,
      phoneNumberEncrypted: inputPhoneNumber,
      emailHash: _ignoredEmailHash,
      emailEncrypted: _ignoredEmailEncrypted,
      firstNameEncrypted: inputFirstName,
      lastNameEncrypted: inputLastName,
      encryptionKeyVersion: _ignoredEncryptionKeyVersion,
      ...safeAdditionalData
    } = additionalData;
    const normalizedFirstName = AuthRepository.normalizeOptionalSensitiveValue(inputFirstName);
    const normalizedLastName = AuthRepository.normalizeOptionalSensitiveValue(inputLastName);
    const normalizedPhoneNumber = AuthRepository.normalizeOptionalSensitiveValue(inputPhoneNumber);
    const emailResult = await this.encryptToEnvelope(normalizedEmail);
    const firstNameResult = normalizedFirstName
      ? await this.encryptToEnvelope(normalizedFirstName)
      : undefined;
    const lastNameResult = normalizedLastName
      ? await this.encryptToEnvelope(normalizedLastName)
      : undefined;
    const phoneNumberResult = normalizedPhoneNumber
      ? await this.encryptToEnvelope(normalizedPhoneNumber)
      : undefined;

    // All fields encrypted in this operation use the same key version (from email encryption)
    const keyVersion = emailResult.keyVersion;

    const [user] = await tx
      .insert(users)
      .values({
        ...safeAdditionalData,
        organizationId: orgId,
        emailHash,
        emailEncrypted: emailResult.envelope,
        firstNameEncrypted: firstNameResult?.envelope,
        lastNameEncrypted: lastNameResult?.envelope,
        phoneNumberEncrypted: phoneNumberResult?.envelope,
        encryptionKeyVersion: keyVersion
      } as typeof users.$inferInsert)
      .returning();

    if (!user) {
      throw new Error('Failed to create user');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user as typeof user;
  }

  /**
   * Create a new tenant and organization for a user (within transaction)
   *
   * This is used during self-registration when no existing tenant/organization is provided.
   * Creates:
   * 1. A new tenant record (type: 'individual')
   * 2. A new organization record linked to the tenant
   *
   * @param tx - Database transaction
   * @param email - User email (used for organization name/slug)
   * @param displayName - Optional display name for the organization
   * @param gcpTenantId - Optional GCP tenant ID (will be null initially, updated by consumer)
   * @returns Object containing both tenantId (from tenants table) and organizationId (from organizations table)
   */
  async createOrganizationForUserInTransaction(
    tx: NodePgDatabase,
    email: string,
    displayName?: string,
    gcpTenantId?: string,
    organizationSlug?: string,
    tenantType: 'organization' | 'team' | 'individual' = 'individual'
  ): Promise<{ tenantId: number; organizationId: number }> {
    // Generate organization name and slug
    const emailUsername = email.split('@')[0];
    if (!emailUsername) {
      throw new Error('Invalid email format');
    }
    const orgName = displayName ?? `${emailUsername}'s Organization`;
    const baseSlugInput = organizationSlug?.trim() ?? orgName;
    const normalizedBaseSlug = this.normalizeOrganizationSlug(baseSlugInput);
    const baseSlug = normalizedBaseSlug.length > 0 ? normalizedBaseSlug : `${emailUsername}-org`;

    // Step 1: Create tenant
    const [tenant] = await tx
      .insert(tenants)
      .values({
        type: tenantType,
        status: 'active'
      } as typeof tenants.$inferInsert)
      .returning();

    if (!tenant) {
      throw new Error('Failed to create tenant');
    }

    // Step 2: Create organization linked to tenant
    let organization: typeof organizations.$inferSelect;
    try {
      const [createdOrganization] = await tx
        .insert(organizations)
        .values({
          tenantId: tenant.id,
          name: orgName,
          displayName: orgName,
          slug: baseSlug,
          isActive: true,
          gcpTenantId: gcpTenantId ?? null
        } as typeof organizations.$inferInsert)
        .returning();

      if (!createdOrganization) {
        throw new Error('Failed to create organization');
      }

      organization = createdOrganization;
    } catch (error) {
      if (this.isOrganizationSlugConflict(error)) {
        throw Errors.databaserecordAlreadyExists003({
          entity: `organization slug '${baseSlug}'`
        });
      }
      throw error;
    }

    // CRITICAL: Return both IDs - tenantId for x-tenant-id header, organizationId for user.organizationId
    return { tenantId: tenant.id, organizationId: organization.id };
  }

  private normalizeOrganizationSlug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+/g, '')
      .replace(/-+$/g, '')
      .replace(/-+/g, '-')
      .substring(0, AuthRepository.ORGANIZATION_SLUG_MAX_LENGTH);
  }

  private isOrganizationSlugConflict(error: unknown): boolean {
    const stack: unknown[] = [error];

    while (stack.length > 0) {
      const current = stack.pop();
      if (typeof current !== 'object' || current === null) {
        continue;
      }

      const code = 'code' in current ? String(current.code) : '';
      const constraint = 'constraint' in current ? String(current.constraint).toLowerCase() : '';
      const detail = 'detail' in current ? String(current.detail).toLowerCase() : '';

      if (
        code === '23505' &&
        (constraint.includes('organizations_slug_unique') ||
          constraint.includes('slug') ||
          detail.includes('(slug)='))
      ) {
        return true;
      }

      if ('cause' in current) {
        stack.push(current.cause);
      }
    }

    return false;
  }

  /**
   * Create a new tenant and organization for a user
   *
   * This is used during self-registration when no existing tenant/organization is provided.
   * Creates:
   * 1. A new tenant record (type: 'individual')
   * 2. A new organization record linked to the tenant
   *
   * @param email - User email (used for organization name/slug)
   * @param displayName - Optional display name for the organization
   * @returns Object containing both tenantId (from tenants table) and organizationId (from organizations table)
   */
  async createOrganizationForUser(
    email: string,
    displayName?: string,
    gcpTenantId?: string,
    organizationSlug?: string,
    tenantType: 'organization' | 'team' | 'individual' = 'individual'
  ): Promise<{ tenantId: number; organizationId: number }> {
    // Use transaction to ensure atomicity
    return this.db.transaction(async (tx) => {
      return this.createOrganizationForUserInTransaction(
        tx,
        email,
        displayName,
        gcpTenantId,
        organizationSlug,
        tenantType
      );
    });
  }

  async hasActiveSystemOwner(tx?: NodePgDatabase): Promise<boolean> {
    const executor = tx ?? this.db;
    const [result] = await executor
      .select({ id: userRoles.id })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(
        and(
          eq(userRoles.role, 'system_owner'),
          eq(users.isActive, true),
          isNull(users.deletedAt),
          or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))
        )
      )
      .limit(1);

    return result !== undefined;
  }

  /**
   * Update organization with GCP tenant ID (within transaction)
   *
   * @param tx - Database transaction
   * @param organizationId - Organization ID
   * @param gcpTenantId - GCP tenant ID from Firebase
   * @returns Updated organization
   */
  async updateOrganizationGcpTenantInTransaction(
    tx: NodePgDatabase,
    organizationId: number,
    gcpTenantId: string
  ): Promise<typeof organizations.$inferSelect | undefined> {
    const [org] = await tx
      .update(organizations)
      .set({ gcpTenantId, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning();

    return org;
  }

  /**
   * Update organization with GCP tenant ID
   *
   * @param organizationId - Organization ID
   * @param gcpTenantId - GCP tenant ID from Firebase
   * @returns Updated organization
   */
  async updateOrganizationGcpTenant(
    organizationId: number,
    gcpTenantId: string
  ): Promise<typeof organizations.$inferSelect | undefined> {
    const [org] = await this.db
      .update(organizations)
      .set({ gcpTenantId, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning();

    return org;
  }

  /**
   * Set organization owner (within transaction)
   *
   * Validates:
   * 1. User belongs to the organization
   * 2. Only system/admin can set owner (if actorId provided)
   *
   * @param tx - Database transaction
   * @param organizationId - Organization ID
   * @param userId - User ID to set as owner
   * @param actorId - ID of user performing the action (undefined for system/registration)
   * @returns Updated organization
   * @throws Error if user doesn't belong to organization
   * @throws Error if unauthorized actor attempts to set owner
   */
  async setOrganizationOwnerInTransaction(
    tx: NodePgDatabase,
    organizationId: number,
    userId: number,
    actorId?: string | number
  ): Promise<typeof organizations.$inferSelect | undefined> {
    // Step 1: Validate user belongs to organization
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      throw Errors.useruserWithId001({ userId: String(userId) });
    }

    if (user.organizationId !== organizationId) {
      throw Errors.validationinvalidValueFor002({
        field: 'userId',
        expectedType: 'user must belong to organization'
      });
    }

    // Step 2: Authorization check (if actorId provided)
    // undefined actorId = system operation (registration, migration)
    // defined actorId = user-initiated operation (requires admin check)
    if (actorId !== undefined) {
      // TODO: Add role-based authorization check here
      // For now, only system operations (actorId = undefined) can set owner
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: 'organization:set-owner'
      });
    }

    // Step 3: Update organization owner
    const [org] = await tx
      .update(organizations)
      .set({ ownerId: userId, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning();

    return org;
  }

  /**
   * Find user with organization by email
   * Used during login to get the user's organization and GCP tenant ID
   *
   * @param email - User email address
   * @returns User with organization info or null
   */
  async findWithOrganizationByEmail(
    email: string,
    tenantId?: string
  ): Promise<{
    user: typeof users.$inferSelect;
    organization: typeof organizations.$inferSelect;
  } | null> {
    const emailHash = hashEmail(email);
    const orgId =
      tenantId !== undefined && tenantId !== null && tenantId.trim() !== ''
        ? this.validateTenantId(tenantId)
        : null;

    const [result] = await this.db
      .select({
        user: users,
        organization: organizations
      })
      .from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .where(
        and(
          eq(users.emailHash, emailHash),
          isNull(users.deletedAt),
          ...(orgId !== null ? [eq(users.organizationId, orgId)] : [])
        )
      )
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result ?? null;
  }

  /**
   * Find user with organization by email hash (NO PII)
   *
   * @param emailHash - SHA-256 hash of email
   * @returns User with organization or null
   */
  async findWithOrganizationByEmailHash(emailHash: string): Promise<{
    user: typeof users.$inferSelect;
    organization: typeof organizations.$inferSelect;
  } | null> {
    const [result] = await this.db
      .select({
        user: users,
        organization: organizations
      })
      .from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .where(and(eq(users.emailHash, emailHash), eq(users.isActive, true), isNull(users.deletedAt)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result ?? null;
  }

  /**
   * Find organization by ID.
   */
  async findOrganizationById(
    organizationId: number
  ): Promise<typeof organizations.$inferSelect | null> {
    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return organization ?? null;
  }

  /**
   * Find all users in an organization
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Array of users
   */
  async findByOrganization(
    tenantId: string,
    userContext?: RepositoryUserContext
  ): Promise<(typeof users.$inferSelect)[]> {
    const orgId = this.validateTenantId(tenantId);

    // Authorization check: user must have permission to list users in this tenant
    if (userContext) {
      const hasPermission = await this.permissionService.hasPermission(
        userContext.userId,
        orgId,
        TENANT_PERMISSIONS.USERS_READ
      );

      const hasSystemPermission = await this.permissionService.hasPermission(
        userContext.userId,
        undefined,
        SYSTEM_PERMISSIONS.USERS_READ
      );

      if (!hasPermission && !hasSystemPermission) {
        throw new ForbiddenException(
          `You do not have permission to list users in tenant ${orgId}. ` +
            `Required permission: ${TENANT_PERMISSIONS.USERS_READ} or ${SYSTEM_PERMISSIONS.USERS_READ}`
        );
      }
    }

    const userList = await this.db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), isNull(users.deletedAt)));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return userList;
  }

  /**
   * List organizations/tenants the user belongs to.
   *
   * Includes membership metadata for workspace switching in web clients.
   */
  async listUserOrganizations(userId: number): Promise<UserOrganizationMembership[]> {
    const rows = await this.db
      .select({
        organizationId: organizations.id,
        tenantId: tenants.id,
        name: organizations.name,
        displayName: organizations.displayName,
        slug: organizations.slug,
        role: userTenants.role,
        isDefault: userTenants.isDefault,
        organizationIsActive: organizations.isActive,
        membershipIsActive: userTenants.isActive
      })
      .from(userTenants)
      .innerJoin(users, eq(users.id, userTenants.userId))
      .innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
      .innerJoin(organizations, eq(organizations.tenantId, tenants.id))
      .where(
        and(
          eq(userTenants.userId, userId),
          isNull(users.deletedAt),
          isNull(organizations.deletedAt)
        )
      )
      .orderBy(
        sql`${userTenants.isDefault} DESC`,
        asc(sql`coalesce(${organizations.displayName}, ${organizations.name})`)
      );

    return rows
      .filter((row) => row.organizationIsActive && row.membershipIsActive)
      .map((row) => ({
        organizationId: String(row.organizationId),
        tenantId: String(row.tenantId),
        name: row.name,
        displayName: row.displayName,
        slug: row.slug,
        role: row.role,
        isDefault: Boolean(row.isDefault),
        isActive: Boolean(row.organizationIsActive && row.membershipIsActive)
      }));
  }

  /**
   * Find all users in an organization (within transaction)
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Array of users
   */
  async findByOrganizationWithTransaction(
    tenantId: string,
    tx: NodePgDatabase,
    userContext?: RepositoryUserContext
  ): Promise<(typeof users.$inferSelect)[]> {
    const orgId = this.validateTenantId(tenantId);

    // Authorization check: user must have permission to list users in this tenant
    if (userContext) {
      const hasPermission = await this.permissionService.hasPermission(
        userContext.userId,
        orgId,
        TENANT_PERMISSIONS.USERS_READ
      );

      const hasSystemPermission = await this.permissionService.hasPermission(
        userContext.userId,
        undefined,
        SYSTEM_PERMISSIONS.USERS_READ
      );

      if (!hasPermission && !hasSystemPermission) {
        throw new ForbiddenException(
          `You do not have permission to list users in tenant ${orgId}. ` +
            `Required permission: ${TENANT_PERMISSIONS.USERS_READ} or ${SYSTEM_PERMISSIONS.USERS_READ}`
        );
      }
    }

    const userList = await tx
      .select()
      .from(users)
      .where(and(eq(users.organizationId, orgId), isNull(users.deletedAt)));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return userList;
  }

  /**
   * Delete user within transaction (hard delete)
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @param userId - User ID (as number)
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Deleted user
   */
  async deleteWithTransaction(
    tenantId: string,
    tx: NodePgDatabase,
    userId: number,
    userContext?: RepositoryUserContext
  ): Promise<typeof users.$inferSelect | undefined> {
    const orgId = this.validateTenantId(tenantId);

    // Authorization check before delete
    await this.authorizeWrite(userContext, userId, orgId, 'delete');

    const [deletedUser] = await tx
      .delete(users)
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId)))
      .returning();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return deletedUser;
  }

  /**
   * Soft delete user (mark as deleted, don't remove data - GDPR compliance)
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @param userId - User ID (as number)
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Soft deleted user
   */
  async softDeleteWithTransaction(
    tenantId: string,
    tx: NodePgDatabase,
    userId: number,
    userContext?: RepositoryUserContext
  ): Promise<typeof users.$inferSelect | undefined> {
    const orgId = this.validateTenantId(tenantId);

    // Authorization check before delete
    await this.authorizeWrite(userContext, userId, orgId, 'delete');

    const [deletedUser] = await tx
      .update(users)
      .set({
        deletedAt: new Date(),
        isActive: false // Also mark as inactive
      })
      .where(and(eq(users.organizationId, orgId), eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    if (!deletedUser) {
      throw Errors.databaserecordNotFound004({ entity: 'User' });
    }

    await tx
      .update(userTenants)
      .set({
        isActive: false,
        isDefault: false,
        updatedAt: new Date()
      })
      .where(eq(userTenants.userId, userId));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return deletedUser;
  }

  /**
   * Find users soft-deleted before retention cutoff date
   * @param retentionDays - Number of days to retain soft-deleted records
   * @returns Array of expired soft-deleted users
   */
  async findExpiredSoftDeleted(retentionDays: number): Promise<(typeof users.$inferSelect)[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const expiredUsers = await this.db
      .select()
      .from(users)
      .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoffDate)));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return expiredUsers;
  }

  /**
   * Permanently delete user (hard delete)
   * @param tenantId - Organization ID for multi-tenancy
   * @param userId - User ID to permanently delete
   */
  async hardDeletePermanently(tenantId: string, userId: number): Promise<void> {
    const orgId = this.validateTenantId(tenantId);

    await this.db.delete(users).where(and(eq(users.organizationId, orgId), eq(users.id, userId)));
  }

  /**
   * Count active users in an organization
   *
   * @param tenantId - Tenant ID (organization ID as string)
   * @param tx - Optional database transaction
   * @returns Number of active users
   */
  async countByOrganization(tenantId: string, tx?: NodePgDatabase): Promise<number> {
    const orgId = this.validateTenantId(tenantId);

    const db = tx ?? this.db;

    const [result] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(users)
      .where(and(eq(users.organizationId, orgId), isNull(users.deletedAt)));

    return result?.count ?? 0;
  }

  /**
   * Count active users with row lock (SELECT FOR UPDATE)
   * Prevents race conditions during organization deletion
   *
   * @param tx - Database transaction (required for locking)
   * @param tenantId - Tenant ID (organization ID as string)
   * @returns Number of active users
   */
  async countByOrganizationWithLock(tenantId: string, tx: NodePgDatabase): Promise<number> {
    const orgId = this.validateTenantId(tenantId);

    // Note: FOR UPDATE cannot be used with aggregate functions like COUNT(*).
    // This count is just for a business rule check; the actual deletion has its own locks.
    const result = await tx.execute<{ count: number }>(
      sql`SELECT CAST(COUNT(*) AS INTEGER) as count
          FROM ${users}
          WHERE ${users.organizationId} = ${orgId}
          AND ${users.deletedAt} IS NULL`
    );

    return result.rows[0]?.count ?? 0;
  }

  /**
   * Soft delete all users in an organization (within transaction)
   * Used when soft-deleting an organization
   *
   * @param tx - Database transaction
   * @param tenantId - Tenant ID (organization ID as string)
   * @returns Number of users soft deleted
   */
  async softDeleteAllByOrganization(tenantId: string, tx: NodePgDatabase): Promise<number> {
    const orgId = this.validateTenantId(tenantId);

    const result = await tx
      .update(users)
      .set({
        deletedAt: new Date(),
        isActive: false
      })
      .where(and(eq(users.organizationId, orgId), isNull(users.deletedAt)))
      .returning({ id: users.id });

    return result.length;
  }
}
