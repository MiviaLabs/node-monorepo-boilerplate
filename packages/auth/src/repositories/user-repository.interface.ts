/**
 * User Repository Interface
 *
 * This interface defines the contract for user data access.
 * Implementations are provided by the application layer (apps/api).
 *
 * @packageDocumentation
 */

/**
 * User entity from database
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UserEntity = any;

/**
 * User identity entity from database
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type UserIdentityEntity = any;

/**
 * Filter options for user queries
 */
export interface UserFilter {
  /** Email hash to match */
  emailHash?: string;
  /** User ID to match */
  userId?: number;
  /** Organization ID to filter by */
  organizationId?: number;
  /** Whether user is active */
  isActive?: boolean;
  /** Whether user is verified */
  isVerified?: boolean;
}

/**
 * Result type for user queries
 */
export interface UserQueryResult {
  /** User entity */
  user: UserEntity;
  /** User identities if requested */
  identities?: UserIdentityEntity[];
}

/**
 * User Repository Interface
 *
 * Defines the contract for user data operations.
 * This abstraction allows auth to depend on interfaces
 * rather than concrete database implementations, following the
 * Dependency Inversion Principle.
 */
export interface IUserRepository {
  /**
   * Find a user by filter criteria
   *
   * @param filter - Filter criteria for user lookup
   * @param includeIdentities - Whether to include user identities
   * @returns User query result or null if not found
   */
  findByFilter(filter: UserFilter, includeIdentities?: boolean): Promise<UserQueryResult | null>;

  /**
   * Find a user by email hash
   *
   * @param emailHash - SHA-256 hash of the user's email
   * @param organizationId - Organization ID for multi-tenancy
   * @returns User entity or null if not found
   */
  findByEmailHash(emailHash: string, organizationId: number): Promise<UserEntity | null>;

  /**
   * Find a user by ID
   *
   * @param userId - User ID
   * @returns User entity or null if not found
   */
  findById(userId: number): Promise<UserEntity | null>;

  /**
   * Find user identities for a user
   *
   * @param userId - User ID
   * @returns Array of user identity entities
   */
  findIdentitiesByUserId(userId: number): Promise<UserIdentityEntity[]>;

  /**
   * Find a specific user identity by provider
   *
   * @param userId - User ID
   * @param provider - Auth provider name (e.g., 'keycloak', 'google')
   * @returns User identity entity or null if not found
   */
  findIdentityByProvider(userId: number, provider: string): Promise<UserIdentityEntity | null>;

  /**
   * Create a new user
   *
   * @param data - User data to create
   * @returns Created user entity
   */
  create(data: {
    organizationId: number;
    emailHash: string;
    isActive?: boolean;
    isVerified?: boolean;
  }): Promise<UserEntity>;

  /**
   * Create a new user identity
   *
   * @param data - User identity data to create
   * @returns Created user identity entity
   */
  createIdentity(data: {
    userId: number;
    provider: string;
    providerUserId: string;
    email?: string;
  }): Promise<UserIdentityEntity>;

  /**
   * Update user fields
   *
   * @param userId - User ID to update
   * @param data - Fields to update
   * @returns Updated user entity
   */
  update(
    userId: number,
    data: Partial<{
      isActive: boolean;
      isVerified: boolean;
    }>
  ): Promise<UserEntity>;

  /**
   * Delete a user
   *
   * @param userId - User ID to delete
   * @returns void
   */
  delete(userId: number): Promise<void>;
}

/**
 * Token for injection
 */
export const USER_REPOSITORY_TOKEN = Symbol('USER_REPOSITORY');

/**
 * Type for the user repository provider
 */
export type UserRepositoryProvider = {
  provide: typeof USER_REPOSITORY_TOKEN;
  useExisting: IUserRepository;
};
