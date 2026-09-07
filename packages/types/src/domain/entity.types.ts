/**
 * Base domain types for entities
 *
 * This module provides the foundational interfaces for domain entities following
 * Domain-Driven Design (DDD) principles. Entities are objects with a distinct
 * identity that persists over time and across different representations.
 *
 * @module domain/entity.types
 */

/**
 * Unique identifier type for any entity.
 *
 * EntityId is a string-based identifier that uniquely identifies an entity
 * within the domain. Using strings provides flexibility for different ID
 * formats (UUID, ULID, nanoid, etc.) while maintaining type safety.
 *
 * @example
 * ```typescript
 * // Using UUID format
 * const userId: EntityId = '550e8400-e29b-41d4-a716-446655440000';
 *
 * // Using ULID format
 * const orderId: EntityId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
 *
 * // In entity definitions
 * interface User extends BaseEntity {
 *   readonly id: EntityId;
 *   readonly email: string;
 * }
 * ```
 *
 * @see {@link BaseEntity} for entities using EntityId
 */
export type EntityId = string;

/**
 * Base entity interface with common fields for all domain entities.
 *
 * BaseEntity provides the minimal set of fields that all entities should have:
 * a unique identifier and timestamp tracking. All fields are readonly to enforce
 * immutability in the domain model.
 *
 * @example
 * ```typescript
 * // Define a domain entity extending BaseEntity
 * interface User extends BaseEntity {
 *   readonly email: string;
 *   readonly name: string;
 *   readonly role: UserRole;
 * }
 *
 * // Create an entity instance
 * const user: User = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   createdAt: new Date('2024-01-15T10:00:00Z'),
 *   updatedAt: new Date('2024-01-15T10:00:00Z'),
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   role: UserRole.Member,
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Using with repository
 * interface IUserRepository extends IRepository<User> {
 *   findByEmail(email: string): Promise<User | null>;
 * }
 *
 * // Entity comparison by ID
 * function isSameEntity(a: BaseEntity, b: BaseEntity): boolean {
 *   return a.id === b.id;
 * }
 * ```
 *
 * @see {@link IRepository} for repository operations on entities
 * @see {@link Timestamps} for timestamp-only interface
 * @see {@link EntityId} for the identifier type
 * @see {@link TenantEntity} for multi-tenant entities
 * @see {@link SoftDeletableEntity} for entities supporting soft deletion
 */
export interface BaseEntity {
  readonly id: EntityId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Entity interface for entities that support soft deletion.
 *
 * Soft deletion marks an entity as deleted without physically removing it from
 * the database. This is useful for audit trails, data recovery, and maintaining
 * referential integrity. When `deletedAt` is null, the entity is active.
 *
 * @example
 * ```typescript
 * // Define a soft-deletable entity
 * interface Document extends SoftDeletableEntity {
 *   readonly title: string;
 *   readonly content: string;
 *   readonly authorId: string;
 * }
 *
 * // Active document (not deleted)
 * const activeDoc: Document = {
 *   id: 'doc-123',
 *   createdAt: new Date('2024-01-15T10:00:00Z'),
 *   updatedAt: new Date('2024-01-20T14:30:00Z'),
 *   deletedAt: null,
 *   title: 'Project Proposal',
 *   content: '...',
 *   authorId: 'user-456',
 * };
 *
 * // Soft-deleted document
 * const deletedDoc: Document = {
 *   ...activeDoc,
 *   deletedAt: new Date('2024-02-01T09:00:00Z'),
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Repository with soft delete support
 * interface IDocumentRepository extends IRepository<Document> {
 *   findActive(): Promise<Document[]>;
 *   findDeleted(): Promise<Document[]>;
 *   restore(id: string): Promise<void>;
 * }
 *
 * // Check if entity is deleted
 * function isDeleted(entity: SoftDeletableEntity): boolean {
 *   return entity.deletedAt !== null;
 * }
 * ```
 *
 * @see {@link BaseEntity} for the base entity interface
 * @see {@link IRepository} for the softDelete method
 */
export interface SoftDeletableEntity extends BaseEntity {
  readonly deletedAt: Date | null;
}

/**
 * Entity interface for multi-tenant (organization-scoped) entities.
 *
 * TenantEntity extends BaseEntity with an organizationId field to support
 * multi-tenancy. All queries and mutations on tenant entities must be scoped
 * to the tenant context to prevent cross-tenant data access.
 *
 * @example
 * ```typescript
 * // Define a tenant-scoped entity
 * interface Project extends TenantEntity {
 *   readonly name: string;
 *   readonly status: ProjectStatus;
 *   readonly ownerId: string;
 * }
 *
 * // Create a tenant entity
 * const project: Project = {
 *   id: 'proj-123',
 *   createdAt: new Date('2024-01-15T10:00:00Z'),
 *   updatedAt: new Date('2024-01-15T10:00:00Z'),
 *   organizationId: 'org-456',
 *   name: 'Website Redesign',
 *   status: ProjectStatus.Active,
 *   ownerId: 'user-789',
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Tenant repository enforces isolation
 * interface IProjectRepository extends ITenantRepository<Project> {
 *   findByStatus(
 *     tenantId: string,
 *     status: ProjectStatus
 *   ): Promise<Project[]>;
 * }
 *
 * // Validate tenant access
 * function validateTenantAccess(
 *   entity: TenantEntity,
 *   context: TenantContext
 * ): boolean {
 *   return entity.organizationId === context.tenantId;
 * }
 * ```
 *
 * @see {@link BaseEntity} for the base entity interface
 * @see {@link ITenantRepository} for tenant-scoped repository operations
 * @see {@link ITenantContext} for request-scoped tenant information
 */
export interface TenantEntity extends BaseEntity {
  readonly organizationId: string;
}

/**
 * Timestamps interface for tracking creation and modification times.
 *
 * This interface is useful when you need timestamp fields without the full
 * entity structure, such as for DTOs, embedded objects, or audit logging.
 *
 * @example
 * ```typescript
 * // Use in DTOs or embedded objects
 * interface AuditInfo extends Timestamps {
 *   readonly modifiedBy: string;
 *   readonly action: string;
 * }
 *
 * // Embedded in a larger structure
 * interface Document {
 *   readonly id: string;
 *   readonly content: string;
 *   readonly timestamps: Timestamps;
 * }
 *
 * // Create timestamps
 * const now = new Date();
 * const timestamps: Timestamps = {
 *   createdAt: now,
 *   updatedAt: now,
 * };
 * ```
 *
 * @see {@link BaseEntity} for full entity with timestamps and ID
 */
export interface Timestamps {
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
