/**
 * Entity Lifecycle Hooks
 *
 * ORM-agnostic hooks for automatic encryption/decryption at entity lifecycle
 * boundaries. Integrates with repository patterns, TypeORM subscribers,
 * Drizzle hooks, or any custom persistence layer.
 *
 * ## Overview
 *
 * Lifecycle hooks provide a clean integration point between your ORM/repository
 * layer and the encryption system. Instead of manually calling encrypt/decrypt,
 * you register hooks that automatically transform entities.
 *
 * ## Lifecycle Flow
 *
 * ```
 * ┌─────────────────┐
 * │ Application     │
 * │ (plaintext)     │
 * └────────┬────────┘
 *          │ beforeCreate/beforeUpdate
 *          ▼
 * ┌─────────────────┐
 * │ EncryptedEntity │
 * │ Hooks           │
 * └────────┬────────┘
 *          │
 *          ▼
 * ┌─────────────────┐
 * │ Database        │
 * │ (encrypted)     │
 * └────────┬────────┘
 *          │ afterRead/afterFind
 *          ▼
 * ┌─────────────────┐
 * │ Application     │
 * │ (plaintext)     │
 * └─────────────────┘
 * ```
 *
 * ## Integration Examples
 *
 * ### With TypeORM Subscriber
 *
 * ```typescript
 * @EventSubscriber()
 * class EncryptionSubscriber implements EntitySubscriberInterface<User> {
 *   constructor(private readonly hooks: EncryptedEntityHooks) {}
 *
 *   listenTo() { return User; }
 *
 *   async beforeInsert(event: InsertEvent<User>) {
 *     event.entity = await this.hooks.beforeCreate(event.entity);
 *   }
 *
 *   async afterLoad(entity: User) {
 *     Object.assign(entity, await this.hooks.afterRead(entity));
 *   }
 * }
 * ```
 *
 * ### With Drizzle ORM
 *
 * ```typescript
 * async function createUser(data: NewUser): Promise<User> {
 *   const encrypted = await hooks.beforeCreate(data);
 *   const [user] = await db.insert(users).values(encrypted).returning();
 *   return hooks.afterRead(user);
 * }
 * ```
 *
 * ### With Custom Repository
 *
 * ```typescript
 * class UserRepository {
 *   async save(user: User): Promise<User> {
 *     const encrypted = await this.hooks.beforeCreate(user);
 *     const saved = await this.db.save(encrypted);
 *     return this.hooks.afterRead(saved);
 *   }
 * }
 * ```
 *
 * ## Security Notes
 *
 * - Always use hooks consistently - missing encryption on save or decryption
 *   on read will cause data corruption or exposure
 * - Hooks are async - ensure you await them before proceeding
 * - Consider creating a base repository class that enforces hook usage
 *
 * @module encryption/decorators
 *
 * @see EntityTransformer for the underlying transformation logic
 */

import { EntityTransformer } from './entity-transformer';

import type { ITenantEncryptionContext } from '../providers/kms-provider.interface';

/**
 * Encrypted Entity Lifecycle Hooks
 *
 * Provides named lifecycle hooks for ORM/repository integration.
 * Each hook maps directly to an EntityTransformer method with a
 * semantically meaningful name.
 *
 * ## Hook Methods
 *
 * | Hook | When to Use | Transform |
 * |------|-------------|-----------|
 * | `beforeCreate` | Before INSERT | Encrypt |
 * | `beforeUpdate` | Before UPDATE | Encrypt |
 * | `afterRead` | After SELECT (single) | Decrypt |
 * | `afterFind` | After SELECT (batch) | Decrypt |
 *
 * ## Multi-Tenant Support
 *
 * All hooks accept an optional `ITenantEncryptionContext` parameter
 * for multi-tenant key isolation. When provided with an adapter-configured
 * transformer, each tenant's data uses tenant-specific encryption keys.
 *
 * @class EncryptedEntityHooks
 *
 * @example Single-tenant repository implementation
 * ```typescript
 * @Injectable()
 * class SecureUserRepository {
 *   constructor(
 *     private readonly db: Database,
 *     private readonly hooks: EncryptedEntityHooks
 *   ) {}
 *
 *   async create(user: User): Promise<User> {
 *     const encrypted = await this.hooks.beforeCreate(user);
 *     const saved = await this.db.insert(encrypted);
 *     return this.hooks.afterRead(saved);
 *   }
 *
 *   async findAll(): Promise<User[]> {
 *     const users = await this.db.findAll();
 *     return this.hooks.afterFind(users);
 *   }
 * }
 * ```
 *
 * @example Multi-tenant repository with key isolation
 * ```typescript
 * @Injectable()
 * class SecureUserRepository {
 *   constructor(
 *     private readonly db: Database,
 *     private readonly hooks: EncryptedEntityHooks
 *   ) {}
 *
 *   async create(user: User, organizationId: string): Promise<User> {
 *     const encrypted = await this.hooks.beforeCreate(user, { organizationId });
 *     const saved = await this.db.insert(encrypted);
 *     return this.hooks.afterRead(saved, { organizationId });
 *   }
 *
 *   async findByOrg(organizationId: string): Promise<User[]> {
 *     const users = await this.db.findByOrg(organizationId);
 *     return this.hooks.afterFind(users, { organizationId });
 *   }
 * }
 * ```
 */
export class EncryptedEntityHooks {
  /**
   * Creates a new EncryptedEntityHooks instance.
   *
   * @param transformer - EntityTransformer instance for encryption/decryption
   */
  constructor(private readonly transformer: EntityTransformer) {}

  /**
   * Pre-create hook: encrypts entity before database INSERT.
   *
   * Call this hook before saving a new entity to the database. All fields
   * marked with `@Encrypted()` will be encrypted.
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entity - Entity to encrypt before creation
   * @param tenantContext - Optional tenant context for multi-tenant key isolation
   * @returns Encrypted entity ready for database storage
   * @throws {EntityTransformError} If encryption fails
   *
   * @example Single-tenant usage
   * ```typescript
   * async create(user: User): Promise<User> {
   *   const encrypted = await this.hooks.beforeCreate(user);
   *   return this.db.insert(encrypted);
   * }
   * ```
   *
   * @example Multi-tenant usage
   * ```typescript
   * async create(user: User, organizationId: string): Promise<User> {
   *   const encrypted = await this.hooks.beforeCreate(user, { organizationId });
   *   return this.db.insert(encrypted);
   * }
   * ```
   */
  async beforeCreate<T extends Record<string, unknown>>(
    entity: T,
    tenantContext?: ITenantEncryptionContext
  ): Promise<T> {
    return this.transformer.encryptEntity(entity, tenantContext);
  }

  /**
   * Pre-update hook: encrypts entity before database UPDATE.
   *
   * Call this hook before updating an existing entity. Re-encrypts all
   * `@Encrypted()` fields with fresh IVs (even if values unchanged).
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entity - Entity to encrypt before update
   * @param tenantContext - Optional tenant context for multi-tenant key isolation
   * @returns Encrypted entity ready for database update
   * @throws {EntityTransformError} If encryption fails
   *
   * @example Single-tenant usage
   * ```typescript
   * async update(id: string, user: User): Promise<User> {
   *   const encrypted = await this.hooks.beforeUpdate(user);
   *   return this.db.update(id, encrypted);
   * }
   * ```
   *
   * @example Multi-tenant usage
   * ```typescript
   * async update(id: string, user: User, organizationId: string): Promise<User> {
   *   const encrypted = await this.hooks.beforeUpdate(user, { organizationId });
   *   return this.db.update(id, encrypted);
   * }
   * ```
   */
  async beforeUpdate<T extends Record<string, unknown>>(
    entity: T,
    tenantContext?: ITenantEncryptionContext
  ): Promise<T> {
    return this.transformer.encryptEntity(entity, tenantContext);
  }

  /**
   * Post-read hook: decrypts a single entity after database SELECT.
   *
   * Call this hook after reading an entity from the database. All fields
   * in `IEncryptedFieldFormat` will be decrypted to plaintext.
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entity - Encrypted entity from database
   * @param tenantContext - Optional tenant context for multi-tenant provider resolution
   * @returns Decrypted entity with plaintext values
   * @throws {TenantAdapterRequiredError} If tenantContext is provided but no adapter is configured
   * @throws {EntityTransformError} If decryption fails (with allowNull: false)
   *
   * @example Single-tenant usage
   * ```typescript
   * async findById(id: string): Promise<User | null> {
   *   const encrypted = await this.db.findById(id);
   *   return encrypted ? this.hooks.afterRead(encrypted) : null;
   * }
   * ```
   *
   * @example Multi-tenant usage
   * ```typescript
   * async findById(id: string, organizationId: string): Promise<User | null> {
   *   const encrypted = await this.db.findById(id);
   *   return encrypted ? this.hooks.afterRead(encrypted, { organizationId }) : null;
   * }
   * ```
   */
  async afterRead<T extends Record<string, unknown>>(
    entity: T,
    tenantContext?: ITenantEncryptionContext
  ): Promise<T> {
    return this.transformer.decryptEntity(entity, tenantContext);
  }

  /**
   * Post-find hook: decrypts multiple entities after batch SELECT.
   *
   * Call this hook after reading multiple entities. Uses parallel
   * decryption for better performance with large result sets.
   *
   * @typeParam T - Entity type extending Record<string, unknown>
   * @param entities - Array of encrypted entities from database
   * @param tenantContext - Optional tenant context for multi-tenant provider resolution
   * @returns Array of decrypted entities with plaintext values
   * @throws {TenantAdapterRequiredError} If tenantContext is provided but no adapter is configured
   * @throws {EntityTransformError} If any decryption fails (with allowNull: false)
   *
   * @example Single-tenant usage
   * ```typescript
   * async findByOrganization(orgId: string): Promise<User[]> {
   *   const encrypted = await this.db.findByOrg(orgId);
   *   return this.hooks.afterFind(encrypted);
   * }
   * ```
   *
   * @example Multi-tenant usage
   * ```typescript
   * async findByOrganization(organizationId: string): Promise<User[]> {
   *   const encrypted = await this.db.findByOrg(organizationId);
   *   return this.hooks.afterFind(encrypted, { organizationId });
   * }
   * ```
   */
  async afterFind<T extends Record<string, unknown>>(
    entities: T[],
    tenantContext?: ITenantEncryptionContext
  ): Promise<T[]> {
    return this.transformer.decryptEntities(entities, tenantContext);
  }
}

/**
 * Factory function to create EncryptedEntityHooks instance.
 *
 * @param transformer - EntityTransformer instance to wrap
 * @returns Configured EncryptedEntityHooks instance
 *
 * @example
 * ```typescript
 * const transformer = createEntityTransformer(options);
 * const hooks = createEncryptedEntityHooks(transformer);
 *
 * // Use in repository
 * const encrypted = await hooks.beforeCreate(user);
 * ```
 */
export function createEncryptedEntityHooks(transformer: EntityTransformer): EncryptedEntityHooks {
  return new EncryptedEntityHooks(transformer);
}
