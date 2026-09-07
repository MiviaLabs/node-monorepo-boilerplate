import { ForbiddenException, Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { CachedPermissionService } from '@package/auth';
import { TENANT_PERMISSIONS } from '@package/constants';
import * as schema from '@package/db-core';
import {
  userIdentities,
  users,
  eq,
  and,
  desc,
  sql,
  inArray,
  type NodePgDatabase,
  type UserIdentity,
  type NewUserIdentity
} from '@package/db-core';
import { EncryptionService } from '@package/encryption';
import { MetricsService, metricsService } from '@package/observability';
import { CacheService } from '@package/redis';
import { hashEmail } from '@package/utils';

import { MAIN_DB } from '../../../common/database/database.constants';
import { BaseRepository } from '../../../common/infrastructure/repositories/base.repository';
import { EncryptedStoreKeyService } from '../../encrypted-store/encrypted-store-key.service';

/**
 * No-op permission service for unit tests
 * Always returns true (grants all permissions)
 */
class NoOpPermissionService {
  hasPermission(): boolean {
    return true;
  }
}

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

/**
 * Update data type for user_identities
 */
export interface UpdateUserIdentityData {
  providerUid?: string;
  isPrimary?: boolean;
  lastSignInAt?: Date;
}

/**
 * Input type for creating user identities with sensitive fields
 *
 * Omits encryptionKeyVersion because the repository calculates it from EncryptedStoreKeyService.
 * Callers provide plaintext providerEmail/phoneNumber, repository handles encryption.
 */
type NewUserIdentityWithSensitiveInput = Omit<NewUserIdentity, 'encryptionKeyVersion'> & {
  providerEmail?: string;
  phoneNumber?: string;
};

/**
 * User identity repository
 *
 * Manages user authentication identities across multiple providers.
 * Supports multi-provider auth, account linking, and phone-only users.
 *
 * Extends BaseRepository for consistency with repository pattern.
 * Uses userId as the tenant scope (identities belong to users, not organizations directly).
 *
 * Authorization rules:
 * - Users can always access their own identities
 * - Tenant permissions (tenant:users:*) allow accessing identities in same tenant
 * - Throws ForbiddenException for unauthorized access
 *
 * PERF-006: Caches organizationId to avoid redundant database queries in authorization checks
 */
@Injectable()
export class UserIdentityRepository
  extends BaseRepository<UserIdentity, NewUserIdentity, UpdateUserIdentityData, number>
  implements OnModuleDestroy
{
  private static readonly USER_ORG_CACHE_PREFIX = 'auth:user-org:';
  private static readonly USER_ORG_CACHE_TTL_SECONDS = 5 * 60;
  private static readonly USER_ORG_CACHE_TTL_MS =
    UserIdentityRepository.USER_ORG_CACHE_TTL_SECONDS * 1000;
  private static readonly USER_ORG_CACHE_HIT_METRIC = 'auth.user_org_cache.hit';
  private static readonly USER_ORG_CACHE_MISS_METRIC = 'auth.user_org_cache.miss';
  private static readonly USER_ORG_CACHE_ERROR_METRIC = 'auth.user_org_cache.error';
  private static readonly USER_ORG_CACHE_LOOKUP_DURATION_METRIC =
    'auth.user_org_cache.lookup.duration.ms';
  private static readonly USER_ORG_CACHE_ENTRY_AGE_METRIC = 'auth.user_org_cache.entry.age.ms';
  private static readonly USER_ORG_CACHE_ENTRY_SIZE_METRIC = 'auth.user_org_cache.entry.size.bytes';
  private static readonly USER_ORG_CACHE_LOCAL_KEY_COUNT_METRIC =
    'auth.user_org_cache.local.key_count';
  private static readonly USER_ORG_CACHE_RECONCILE_INTERVAL_MS = 30 * 1000;

  private readonly observedUserOrgCacheKeys = new Map<number, number>();
  private observedKeyCountReconcileTimer?: NodeJS.Timeout;

  constructor(
    @Inject(MAIN_DB) protected override readonly db: NodePgDatabase<typeof schema>,
    private readonly encryptionService: EncryptionService,
    private readonly encryptedStoreKeyService: EncryptedStoreKeyService,
    @Optional() private readonly cache?: CacheService,
    @Optional() private readonly metrics: MetricsService = metricsService,
    @Optional()
    private readonly permissionService:
      | CachedPermissionService
      | NoOpPermissionService = new NoOpPermissionService()
  ) {
    super(db);

    this.metrics.createCounter(
      UserIdentityRepository.USER_ORG_CACHE_HIT_METRIC,
      'Count of user organizationId cache hits'
    );
    this.metrics.createCounter(
      UserIdentityRepository.USER_ORG_CACHE_MISS_METRIC,
      'Count of user organizationId cache misses'
    );
    this.metrics.createCounter(
      UserIdentityRepository.USER_ORG_CACHE_ERROR_METRIC,
      'Count of user organizationId cache operation errors'
    );
    this.metrics.createHistogram(
      UserIdentityRepository.USER_ORG_CACHE_LOOKUP_DURATION_METRIC,
      'Duration for user organizationId cache lookup path in milliseconds'
    );
    this.metrics.createHistogram(
      UserIdentityRepository.USER_ORG_CACHE_ENTRY_AGE_METRIC,
      'Age of user organizationId cache entry on hit in milliseconds'
    );
    this.metrics.createHistogram(
      UserIdentityRepository.USER_ORG_CACHE_ENTRY_SIZE_METRIC,
      'Serialized user organizationId cache entry size in bytes'
    );
    this.metrics.createGauge(
      UserIdentityRepository.USER_ORG_CACHE_LOCAL_KEY_COUNT_METRIC,
      'Instance-local estimated count of user organizationId cache keys written by this API instance'
    );

    this.startObservedKeyCountReconcileTicker();
  }

  private static formatEnvelope(
    ciphertext: string,
    encryptedDataKey: string,
    iv: string,
    authTag: string
  ): string {
    return `${ciphertext}:${encryptedDataKey}:${iv}:${authTag}`;
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
    return (
      parts.length === UserIdentityRepository.ENVELOPE_PARTS_COUNT &&
      parts.every((p) => p.length > 0)
    );
  }

  private static normalizeSensitiveValue(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : undefined;
  }

  /**
   * Encrypts a plaintext value and returns it in envelope format with key version.
   *
   * @param value - The plaintext value to encrypt
   * @returns Object containing the encrypted envelope string and key version
   * @throws Error if encryption fails
   */
  private async encryptToEnvelope(value: string): Promise<{
    envelope: string;
    keyVersion: string;
  }> {
    try {
      const { keyId, keyVersion } = await this.encryptedStoreKeyService.getPrimaryKeyIdWithVersion();
      const encryptedValue = await this.encryptionService.encryptToBase64(value, { keyId });
      return {
        envelope: UserIdentityRepository.formatEnvelope(
          encryptedValue.ciphertext,
          encryptedValue.encryptedDataKey,
          encryptedValue.iv,
          encryptedValue.authTag
        ),
        keyVersion
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Encryption failed for sensitive identity data: ${errorMessage}`);
    }
  }

  onModuleDestroy(): void {
    if (this.observedKeyCountReconcileTimer) {
      clearInterval(this.observedKeyCountReconcileTimer);
      this.observedKeyCountReconcileTimer = undefined;
    }
  }

  /**
   * Get user_identities table for BaseRepository operations
   */
  protected getTable(): typeof userIdentities {
    return userIdentities;
  }

  /**
   * Get id column for queries
   */
  protected getIdColumn(): typeof userIdentities.id {
    return userIdentities.id;
  }

  /**
   * Get userId column as our tenant scope
   * For identities table, userId serves as the tenant scope boundary
   * (identities belong to users, not organizations directly)
   */
  protected getTenantColumn(): typeof userIdentities.userId {
    return userIdentities.userId;
  }

  /**
   * Get entity name for error messages
   */
  protected getEntityName(): string {
    return 'UserIdentity';
  }

  protected override usesOrganizationIdForTenant(): boolean {
    return false;
  }

  /**
   * PERF-006: Get user's organizationId with caching to avoid redundant DB queries
   *
   * @param userId - User ID to get organizationId for
   * @returns Organization ID or null if not found
   */
  private async getUserOrganizationId(userId: number): Promise<number | null> {
    const startTime = Date.now();
    const cacheKey = this.getUserOrganizationCacheKey(userId);

    // Check distributed cache first (stores both hit and miss values)
    if (this.cache) {
      try {
        const cached = await this.cache.get<{
          organizationId: number | null;
          cachedAt?: number;
        }>(cacheKey);
        if (cached) {
          this.metrics.incrementCounter(UserIdentityRepository.USER_ORG_CACHE_HIT_METRIC, 1, {
            operation: 'get'
          });

          if (typeof cached.cachedAt === 'number') {
            this.metrics.recordHistogram(
              UserIdentityRepository.USER_ORG_CACHE_ENTRY_AGE_METRIC,
              Date.now() - cached.cachedAt,
              { operation: 'get' }
            );
          }

          this.metrics.recordHistogram(
            UserIdentityRepository.USER_ORG_CACHE_LOOKUP_DURATION_METRIC,
            Date.now() - startTime,
            { result: 'hit' }
          );

          return cached.organizationId;
        }

        this.metrics.incrementCounter(UserIdentityRepository.USER_ORG_CACHE_MISS_METRIC, 1, {
          operation: 'get'
        });
      } catch {
        // Cache failures should not block authorization checks.
        this.metrics.incrementCounter(UserIdentityRepository.USER_ORG_CACHE_ERROR_METRIC, 1, {
          operation: 'get'
        });
      }
    }

    // Fetch from database
    const [user] = await this.db
      .select({ organizationId: users.organizationId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const orgId = user?.organizationId ?? null;
    const cachePayload = { organizationId: orgId, cachedAt: Date.now() };

    // Cache result (including null) to avoid repeated misses
    if (this.cache) {
      try {
        await this.cache.set(cacheKey, cachePayload, {
          ttl: UserIdentityRepository.USER_ORG_CACHE_TTL_SECONDS
        });

        this.observeCacheKeyCount(userId);
        this.metrics.recordHistogram(
          UserIdentityRepository.USER_ORG_CACHE_ENTRY_SIZE_METRIC,
          Buffer.byteLength(JSON.stringify(cachePayload), 'utf8'),
          { operation: 'set' }
        );
      } catch {
        // Cache failures should not block authorization checks.
        this.metrics.incrementCounter(UserIdentityRepository.USER_ORG_CACHE_ERROR_METRIC, 1, {
          operation: 'set'
        });
      }
    }

    this.metrics.recordHistogram(
      UserIdentityRepository.USER_ORG_CACHE_LOOKUP_DURATION_METRIC,
      Date.now() - startTime,
      { result: 'miss' }
    );

    return orgId;
  }

  /**
   * PERF-006: Invalidate organizationId cache for a user (call after user update/delete)
   *
   * @param userId - User ID to invalidate cache for
   */
  private invalidateOrganizationIdCache(userId: number): void {
    if (!this.cache) {
      return;
    }

    const cacheKey = this.getUserOrganizationCacheKey(userId);
    void this.cache
      .delete(cacheKey)
      .then(() => {
        this.pruneExpiredObservedCacheKeys();
        this.observedUserOrgCacheKeys.delete(userId);
        this.metrics.recordGauge(
          UserIdentityRepository.USER_ORG_CACHE_LOCAL_KEY_COUNT_METRIC,
          this.getObservedKeyCount(),
          { operation: 'delete' }
        );
      })
      .catch(() => {
        this.metrics.incrementCounter(UserIdentityRepository.USER_ORG_CACHE_ERROR_METRIC, 1, {
          operation: 'delete'
        });
      });
  }

  /**
   * Invalidate organizationId cache for a user (public method for external use)
   * Call this after updating a user's organization
   *
   * @param userId - User ID to invalidate cache for
   */
  invalidateUserOrganizationCache(userId: number): void {
    this.invalidateOrganizationIdCache(userId);
  }

  private getUserOrganizationCacheKey(userId: number): string {
    return `${UserIdentityRepository.USER_ORG_CACHE_PREFIX}${userId}`;
  }

  private observeCacheKeyCount(userId: number): void {
    this.pruneExpiredObservedCacheKeys();
    this.observedUserOrgCacheKeys.set(
      userId,
      Date.now() + UserIdentityRepository.USER_ORG_CACHE_TTL_MS
    );
    this.metrics.recordGauge(
      UserIdentityRepository.USER_ORG_CACHE_LOCAL_KEY_COUNT_METRIC,
      this.getObservedKeyCount(),
      { operation: 'set' }
    );
  }

  private startObservedKeyCountReconcileTicker(): void {
    this.observedKeyCountReconcileTimer = setInterval(() => {
      this.metrics.recordGauge(
        UserIdentityRepository.USER_ORG_CACHE_LOCAL_KEY_COUNT_METRIC,
        this.getObservedKeyCount(),
        { operation: 'reconcile' }
      );
    }, UserIdentityRepository.USER_ORG_CACHE_RECONCILE_INTERVAL_MS);

    this.observedKeyCountReconcileTimer.unref?.();
  }

  private pruneExpiredObservedCacheKeys(now: number = Date.now()): void {
    for (const [key, expiresAt] of this.observedUserOrgCacheKeys.entries()) {
      if (expiresAt <= now) {
        this.observedUserOrgCacheKeys.delete(key);
      }
    }
  }

  private getObservedKeyCount(): number {
    this.pruneExpiredObservedCacheKeys();
    return this.observedUserOrgCacheKeys.size;
  }

  /**
   * Authorization helper: Check if user can access target user's identities
   *
   * Rules:
   * - Users can always access their own identities (self-access)
   * - Tenant permissions (tenant:users:read) allow same-tenant access
   *
   * PERF-006: Uses cached organizationId lookup to avoid redundant database query
   *
   * @param userContext - Requesting user context
   * @param targetUserId - Target user ID to access
   * @param requiredPermission - Permission to check (defaults to read)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeAccess(
    userContext: RepositoryUserContext | undefined,
    targetUserId: number,
    requiredPermission: string = TENANT_PERMISSIONS.USERS_READ
  ): Promise<void> {
    // If no user context, allow public access (for registration, etc.)
    if (!userContext) {
      return;
    }

    const { userId, tenantId } = userContext;

    // Rule 1: Self-access - users can always access their own identities
    if (userId === targetUserId) {
      return;
    }

    // Rule 2: Tenant permissions - allow same-tenant access
    // PERF-006: Use cached organizationId lookup instead of direct DB query
    const targetUserOrgId = await this.getUserOrganizationId(targetUserId);

    if (targetUserOrgId === tenantId) {
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
      `You do not have permission to access identities for user ${targetUserId}. ` +
        `Required permission: ${requiredPermission}`
    );
  }

  /**
   * Authorization helper: Check if user can perform write operation
   *
   * @param userContext - Requesting user context
   * @param targetUserId - Target user ID
   * @param operation - Operation type (update, delete)
   * @throws ForbiddenException if unauthorized
   */
  private async authorizeWrite(
    userContext: RepositoryUserContext | undefined,
    targetUserId: number,
    // eslint-disable-next-line local-rules/prefer-const-enum
    operation: 'update' | 'delete'
  ): Promise<void> {
    const tenantPermissionMap = {
      update: TENANT_PERMISSIONS.USERS_UPDATE,
      delete: TENANT_PERMISSIONS.USERS_DELETE
    };

    await this.authorizeAccess(userContext, targetUserId, tenantPermissionMap[operation]);
  }

  /**
   * Find identity by provider and provider UID
   *
   * NOTE: This is intentionally public as it's used during authentication flow to look up
   * user by provider ID (e.g., Firebase UID). This is called before user authentication completes.
   *
   * @param provider - Identity provider
   * @param providerUid - Provider user ID
   * @returns User identity or null
   */
  async findByProvider(provider: string, providerUid: string): Promise<UserIdentity | null> {
    const [identity] = await this.db
      .select()
      .from(userIdentities)
      .where(
        and(eq(userIdentities.provider, provider), eq(userIdentities.providerUid, providerUid))
      )
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return identity ?? null;
  }

  /**
   * Find identity by provider and provider UID (alias for findByProvider)
   *
   * NOTE: This is intentionally public as it's used during authentication flow to look up
   * user by provider ID (e.g., Firebase UID). This is called before user authentication completes.
   *
   * @param provider - Identity provider
   * @param providerUid - Provider user ID
   * @returns User identity or null
   */
  async findByProviderAndUid(provider: string, providerUid: string): Promise<UserIdentity | null> {
    return this.findByProvider(provider, providerUid);
  }

  /**
   * Find identity by ID only (legacy method - retrieves userId first)
   *
   * NOTE: This method retrieves the userId from the identity record first.
   * This is a convenience method that doesn't require knowing userId upfront.
   *
   * @param id - Identity ID
   * @returns User identity or null
   */
  override async findById(id: number): Promise<UserIdentity | null> {
    // First get the identity to find userId for scoping
    const [identity] = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(eq(userIdentities.id, id))
      .limit(1);

    if (!identity) {
      return null;
    }

    // Now use BaseRepository.findById with proper scoping
    return super.findById(identity.userId, id);
  }

  /**
   * Find identity by ID or throw error (legacy method - retrieves userId first)
   *
   * @param id - Identity ID
   * @returns User identity
   * @throws Error if identity not found
   */
  override async findByIdOrThrow(id: number): Promise<UserIdentity> {
    const identity = await this.findById(id);
    if (!identity) {
      throw new Error('Identity not found');
    }
    return identity;
  }

  /**
   * Find all identities for a user
   *
   * @param userId - User ID
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Array of user identities
   */
  async findByUserId(userId: number, userContext?: RepositoryUserContext): Promise<UserIdentity[]> {
    // Authorization check
    await this.authorizeAccess(userContext, userId);

    return this.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .orderBy(desc(userIdentities.createdAt));
  }

  /**
   * Find primary identity for a user
   *
   * NOTE: This is a helper method used internally by services that already have
   * authorization checks at the controller/handler level.
   *
   * @param userId - User ID
   * @returns Primary identity or null
   */
  async findPrimaryByUserId(userId: number): Promise<UserIdentity | null> {
    const [identity] = await this.db
      .select()
      .from(userIdentities)
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.isPrimary, true)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return identity ?? null;
  }

  /**
   * Find identities for multiple users (batch loading)
   *
   * NOTE: This is used for batch operations where authorization is handled at the
   * caller level (e.g., filtering which user IDs to fetch).
   *
   * @param userIds - Array of user IDs
   * @returns Array of user identities
   */
  async findPrimaryByUserIds(userIds: number[]): Promise<UserIdentity[]> {
    return this.db
      .select()
      .from(userIdentities)
      .where(and(inArray(userIdentities.userId, userIds), eq(userIdentities.isPrimary, true)))
      .orderBy(desc(userIdentities.createdAt));
  }

  /**
   * Count identities for a user
   *
   * NOTE: This is a helper method used internally for validation and business logic.
   * Authorization is handled at the controller/handler level.
   *
   * @param userId - User ID
   * @returns Number of identities
   */
  async countByUserId(userId: number): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId));

    return result?.count ?? 0;
  }

  /**
   * Check if user has a specific provider
   *
   * NOTE: This is used for validation during authentication flow. Authorization is
   * handled at the controller/handler level.
   *
   * @param userId - User ID
   * @param provider - Provider to check
   * @returns True if user has this provider
   */
  async userHasProvider(userId: number, provider: string): Promise<boolean> {
    const [result] = await this.db
      .select({ count: userIdentities.id })
      .from(userIdentities)
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, provider)));

    return !!result;
  }

  /**
   * Helper: Process and encrypt sensitive identity fields
   *
   * Extracts duplicated logic for normalizing and encrypting providerEmail/phoneNumber.
   *
   * @param providerEmail - Optional provider email (plaintext)
   * @param phoneNumber - Optional phone number (plaintext)
   * @param providedProviderEmailHash - Optional pre-computed email hash
   * @param providedProviderEmailEncrypted - Optional pre-encrypted email
   * @param providedPhoneNumberEncrypted - Optional pre-encrypted phone
   * @returns Encrypted fields ready for insert, including encryption key version
   */
  private async processAndEncryptSensitiveFields(
    providerEmail: string | undefined | null,
    phoneNumber: string | undefined | null,
    providedProviderEmailHash: string | undefined | null,
    providedProviderEmailEncrypted: string | undefined | null,
    providedPhoneNumberEncrypted: string | undefined | null
  ): Promise<{
    providerEmailHash: string | undefined | null;
    providerEmailEncrypted: string | undefined | null;
    phoneNumberEncrypted: string | undefined | null;
    encryptionKeyVersion: string;
  }> {
    // Convert null to undefined for normalization
    const normalizedProviderEmail = UserIdentityRepository.normalizeSensitiveValue(
      providerEmail ?? undefined
    );
    const normalizedPhoneNumber = UserIdentityRepository.normalizeSensitiveValue(
      phoneNumber ?? undefined
    );

    // Always get key version - every identity row must track its encryption key version
    // This ensures key rotation can identify which rows need re-encryption
    const { keyVersion: encryptionKeyVersion } =
      await this.encryptedStoreKeyService.getPrimaryKeyIdWithVersion();

    const providerEmailHash = normalizedProviderEmail
      ? hashEmail(normalizedProviderEmail)
      : providedProviderEmailHash;

    const providerEmailEncrypted = normalizedProviderEmail
      ? (await this.encryptToEnvelope(normalizedProviderEmail)).envelope
      : providedProviderEmailEncrypted;

    const phoneNumberEncrypted = normalizedPhoneNumber
      ? (await this.encryptToEnvelope(normalizedPhoneNumber)).envelope
      : providedPhoneNumberEncrypted;

    return {
      providerEmailHash,
      providerEmailEncrypted,
      phoneNumberEncrypted,
      encryptionKeyVersion
    };
  }

  /**
   * Create identity (with userId in data)
   *
   * NOTE: This is used during authentication/registration flow. Authorization is
   * handled at the controller/handler level.
   *
   * This method is named createWithUserId to distinguish it from BaseRepository.create()
   * which expects (tenantId, data) parameters.
   *
   * @param data - Identity data
   * @returns Created identity
   */
  async createWithUserId(data: NewUserIdentityWithSensitiveInput): Promise<UserIdentity> {
    const {
      providerEmail,
      phoneNumber,
      providerEmailHash: providedProviderEmailHash,
      providerEmailEncrypted: providedProviderEmailEncrypted,
      phoneNumberEncrypted: providedPhoneNumberEncrypted,
      ...insertData
    } = data;

    // Use extracted helper to process and encrypt sensitive fields
    const {
      providerEmailHash,
      providerEmailEncrypted,
      phoneNumberEncrypted,
      encryptionKeyVersion
    } = await this.processAndEncryptSensitiveFields(
      providerEmail,
      phoneNumber,
      providedProviderEmailHash,
      providedProviderEmailEncrypted,
      providedPhoneNumberEncrypted
    );

    // Direct insert - userId is part of data, not used as organizationId
    const [identity] = await this.db
      .insert(userIdentities)
      .values({
        ...insertData,
        providerEmailHash,
        providerEmailEncrypted,
        phoneNumberEncrypted,
        encryptionKeyVersion
      })
      .returning();

    if (!identity) {
      throw new Error('Failed to create user identity');
    }

    return identity;
  }

  /**
   * Create identity (BaseRepository implementation)
   *
   * NOTE: BaseRepository.create expects (tenantId, data) but for identities,
   * userId is already in the data. We delegate to createWithUserId.
   *
   * @param _tenantId - User ID (ignored, userId from data is used instead)
   * @param data - Identity data
   * @returns Created identity
   */
  override async create(
    _tenantId: number,
    data: Omit<NewUserIdentity, 'organizationId'>
  ): Promise<UserIdentity> {
    // Delegate to createWithUserId which handles identities properly
    // _tenantId parameter is prefixed with underscore to indicate it's intentionally unused
    return this.createWithUserId(data as NewUserIdentityWithSensitiveInput);
  }

  /**
   * Create identity within transaction
   *
   * NOTE: This is used during authentication/registration flow within transactions.
   * Authorization is handled at the caller level.
   *
   * @param tx - Database transaction
   * @param data - Identity data
   * @returns Created identity
   */
  // Note: Using 'any' for transaction type due to Drizzle ORM's transaction type incompatibility
  async createWithTransaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: NodePgDatabase<any>,
    data: NewUserIdentityWithSensitiveInput
  ): Promise<UserIdentity> {
    const {
      providerEmail,
      phoneNumber,
      providerEmailHash: providedProviderEmailHash,
      providerEmailEncrypted: providedProviderEmailEncrypted,
      phoneNumberEncrypted: providedPhoneNumberEncrypted,
      ...insertData
    } = data;

    // Use extracted helper to process and encrypt sensitive fields
    const {
      providerEmailHash,
      providerEmailEncrypted,
      phoneNumberEncrypted,
      encryptionKeyVersion
    } = await this.processAndEncryptSensitiveFields(
      providerEmail,
      phoneNumber,
      providedProviderEmailHash,
      providedProviderEmailEncrypted,
      providedPhoneNumberEncrypted
    );

    // Direct insert within the provided transaction
    // (not using BaseRepository.transaction which would create a new transaction)
    const [identity] = await tx
      .insert(userIdentities)
      .values({
        ...insertData,
        providerEmailHash,
        providerEmailEncrypted,
        phoneNumberEncrypted,
        encryptionKeyVersion
      })
      .returning();

    if (!identity) {
      throw new Error('Failed to create user identity');
    }

    return identity;
  }

  /**
   * Update identity
   *
   * @param userId - User ID (for tenant scoping)
   * @param id - Identity ID
   * @param data - Update data
   * @param userContext - User context for authorization (optional for public endpoints)
   * @returns Updated identity
   */
  override async update(
    userId: number,
    id: number,
    data: UpdateUserIdentityData,
    userContext?: RepositoryUserContext
  ): Promise<UserIdentity> {
    // Authorization check before update
    await this.authorizeWrite(userContext, userId, 'update');

    // Use BaseRepository.update with userId as tenant scope
    return super.update(userId, id, data);
  }

  /**
   * Update identity within transaction
   *
   * NOTE: This is used within transactions for atomic operations. Authorization is
   * handled at the caller level.
   *
   * @param tx - Database transaction
   * @param userId - User ID (for tenant scoping)
   * @param id - Identity ID
   * @param data - Update data
   * @param userContext - User context for authorization
   * @returns Updated identity
   */
  async updateWithTransaction(
    tx: NodePgDatabase,
    userId: number,
    id: number,
    data: UpdateUserIdentityData,
    userContext?: RepositoryUserContext
  ): Promise<UserIdentity> {
    // Authorization check before update
    await this.authorizeWrite(userContext, userId, 'update');

    // Perform update using transaction with tenant scoping
    const [updatedIdentity] = await tx
      .update(userIdentities)
      .set(data)
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.id, id)))
      .returning();

    if (!updatedIdentity) {
      throw new Error('Failed to update user identity');
    }

    return updatedIdentity;
  }

  /**
   * Delete identity by ID only (legacy method)
   *
   * @param id - Identity ID
   */
  override async delete(id: number): Promise<void> {
    // Get the identity first to find userId for cache invalidation and tenant scoping
    const identity = await this.findById(id);
    if (identity) {
      this.invalidateUserOrganizationCache(identity.userId);

      // Delete with tenant scoping for defense in depth
      await this.db
        .delete(userIdentities)
        .where(and(eq(userIdentities.userId, identity.userId), eq(userIdentities.id, id)));
    }
  }

  /**
   * Delete identity within transaction
   *
   * @param tx - Database transaction
   * @param userId - User ID (for tenant scoping)
   * @param id - Identity ID
   * @param userContext - User context for authorization (optional for public endpoints)
   */
  async deleteWithTransaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: NodePgDatabase<any>,
    userId: number,
    id: number,
    userContext?: RepositoryUserContext
  ): Promise<void> {
    // Authorization check before delete
    await this.authorizeWrite(userContext, userId, 'delete');

    // Invalidate cache
    this.invalidateUserOrganizationCache(userId);

    // Perform delete within transaction
    await tx
      .delete(userIdentities)
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.id, id)));
  }

  /**
   * Update last sign in timestamp
   *
   * NOTE: This is a trusted internal method for tracking authentication activity.
   * Authorization is handled at the caller level.
   *
   * @param id - Identity ID
   * @param userId - Optional User ID (for tenant scoping, if not provided will look it up)
   */
  async updateLastSignIn(id: number, userId?: number): Promise<void> {
    const userIdToUse = userId ?? (await this.findById(id))?.userId;
    if (!userIdToUse) {
      throw new Error('Identity not found');
    }

    await this.db
      .update(userIdentities)
      .set({ lastSignInAt: new Date() })
      .where(and(eq(userIdentities.userId, userIdToUse), eq(userIdentities.id, id)));
  }

  /**
   * Update last sign in timestamp within transaction
   *
   * NOTE: This is a trusted internal method for tracking authentication activity
   * within transactions. Authorization is handled at the caller level.
   *
   * @param tx - Database transaction
   * @param id - Identity ID
   * @param userId - Optional User ID (for tenant scoping, if not provided will look it up)
   */
  // Note: Using 'any' for transaction type due to Drizzle ORM's transaction type incompatibility
  async updateLastSignInWithTransaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: NodePgDatabase<any>,
    id: number,
    userId?: number
  ): Promise<void> {
    const userIdToUse = userId ?? (await this.findById(id))?.userId;
    if (!userIdToUse) {
      throw new Error('Identity not found');
    }

    await tx
      .update(userIdentities)
      .set({ lastSignInAt: new Date() })
      .where(and(eq(userIdentities.userId, userIdToUse), eq(userIdentities.id, id)));
  }

  /**
   * Mark primary identity email as verified for a user.
   *
   * Used by invitation acceptance flow for existing accounts.
   */
  async markPrimaryEmailVerified(userId: number, tx?: NodePgDatabase): Promise<void> {
    const db = tx ?? this.db;

    await db
      .update(userIdentities)
      .set({
        emailVerified: true,
        updatedAt: new Date()
      })
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.isPrimary, true)));
  }
}
