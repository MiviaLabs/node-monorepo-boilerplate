/**
 * Domain-Driven Design: Repository interfaces
 *
 * This module provides repository interfaces following the Repository pattern from
 * Domain-Driven Design (DDD). Repositories are abstractions over data persistence,
 * representing "ports" in Hexagonal Architecture that separate domain logic from
 * infrastructure concerns.
 *
 * Key concepts:
 * - **Collection semantics**: Repositories behave like in-memory collections
 * - **Aggregate boundaries**: Each aggregate has its own repository
 * - **Infrastructure abstraction**: Domain code doesn't know about databases
 * - **CQRS support**: Separate read and write repositories for query optimization
 *
 * @module domain/repository.types
 */

import type { AggregateRoot } from './aggregate.types';
import type { BaseEntity, TenantEntity } from './entity.types';
import type { IDomainPaginatedResult, IDomainQueryParams } from './query.types';
import type { Result } from './result.types';

// Re-export query types
export type {
  IDomainPaginationParams,
  IDomainSortParam,
  IDomainFilterParam,
  IDomainQueryParams,
  IDomainPaginatedResult
} from './query.types';

export { SortDirection, DomainFilterOperator } from './query.types';

/**
 * Generic repository interface for domain entities.
 *
 * This interface defines standard CRUD operations for entities. Repository
 * implementations are infrastructure-specific (PostgreSQL, Redis, etc.) and
 * provide the "adapter" in Hexagonal Architecture.
 *
 * @template T - The entity type (must extend BaseEntity)
 * @template TFilter - Optional custom filter type for domain-specific filtering.
 *                     Defaults to `unknown` for generic filtering.
 *
 * @example
 * ```typescript
 * // Define a custom filter type
 * interface UserFilter {
 *   readonly status?: UserStatus;
 *   readonly role?: UserRole;
 *   readonly search?: string;
 * }
 *
 * // Implement the repository interface
 * class UserRepository implements IRepository<User, UserFilter> {
 *   async findById(id: string): Promise<User | null> {
 *     return this.db.query.users.findFirst({
 *       where: eq(users.id, id),
 *     });
 *   }
 *
 *   async findAll(filter?: UserFilter): Promise<readonly User[]> {
 *     const conditions = this.buildConditions(filter);
 *     return this.db.query.users.findMany({ where: and(...conditions) });
 *   }
 *
 *   async findPaginated(
 *     params: Omit<IDomainQueryParams, 'filter'> & { filter?: UserFilter }
 *   ): Promise<IDomainPaginatedResult<User>> {
 *     // Implementation with pagination, sorting, filtering
 *   }
 *
 *   async exists(id: string): Promise<boolean> {
 *     const result = await this.db.query.users.findFirst({
 *       where: eq(users.id, id),
 *       columns: { id: true },
 *     });
 *     return result !== null;
 *   }
 *
 *   async count(filter?: UserFilter): Promise<number> {
 *     const conditions = this.buildConditions(filter);
 *     return this.db.select({ count: count() })
 *       .from(users)
 *       .where(and(...conditions));
 *   }
 *
 *   async save(entity: User): Promise<void> {
 *     await this.db.insert(users)
 *       .values(entity)
 *       .onConflictDoUpdate({ target: users.id, set: entity });
 *   }
 *
 *   async delete(id: string): Promise<void> {
 *     await this.db.delete(users).where(eq(users.id, id));
 *   }
 *
 *   async softDelete(id: string): Promise<void> {
 *     await this.db.update(users)
 *       .set({ deletedAt: new Date() })
 *       .where(eq(users.id, id));
 *   }
 * }
 * ```
 *
 * @see {@link BaseEntity} for the required entity structure
 * @see {@link IDomainQueryParams} for pagination/sorting/filtering
 * @see {@link IDomainPaginatedResult} for paginated query results
 * @see {@link ITenantRepository} for multi-tenant repositories
 * @see {@link IReadOnlyRepository} for CQRS read-side repositories
 * @see {@link IWriteOnlyRepository} for CQRS write-side repositories
 */
export interface IRepository<T extends BaseEntity, TFilter = unknown> {
  /**
   * Find entity by ID.
   * @param id - The unique identifier of the entity
   * @returns The entity if found, null otherwise
   */
  findById(id: string): Promise<T | null>;

  /**
   * Find all entities matching optional filter.
   * @param filter - Optional filter criteria
   * @returns Array of matching entities (readonly to prevent mutation)
   */
  findAll(filter?: TFilter): Promise<readonly T[]>;

  /**
   * Find entities with pagination, sorting, and filtering.
   * @param params - Query parameters including pagination, sort, and filter
   * @returns Paginated result with metadata
   */
  findPaginated(
    params: Omit<IDomainQueryParams, 'filter'> & { filter?: TFilter }
  ): Promise<IDomainPaginatedResult<T>>;

  /**
   * Check if entity exists by ID.
   * @param id - The unique identifier to check
   * @returns True if entity exists, false otherwise
   */
  exists(id: string): Promise<boolean>;

  /**
   * Count entities matching optional filter.
   * @param filter - Optional filter criteria
   * @returns Count of matching entities
   */
  count(filter?: TFilter): Promise<number>;

  /**
   * Save entity (create or update based on existence).
   * @param entity - The entity to save
   */
  save(entity: T): Promise<void>;

  /**
   * Hard delete entity by ID.
   * @param id - The unique identifier of the entity to delete
   */
  delete(id: string): Promise<void>;

  /**
   * Soft delete entity by ID (if entity supports soft delete).
   * Sets deletedAt timestamp instead of removing the record.
   * @param id - The unique identifier of the entity to soft delete
   */
  softDelete?(id: string): Promise<void>;
}

/**
 * Repository interface for tenant-scoped (multi-tenant) entities.
 *
 * Extends IRepository with tenant context awareness to ensure data isolation
 * between organizations. All operations are scoped to a specific tenant.
 *
 * @template T - The entity type (must extend TenantEntity)
 * @template TFilter - Optional custom filter type for domain-specific filtering
 *
 * @example
 * ```typescript
 * // Implement tenant-scoped repository
 * class ProjectRepository implements ITenantRepository<Project, ProjectFilter> {
 *   // Inherit all IRepository methods...
 *
 *   async findByTenantId(
 *     tenantId: string,
 *     params?: IDomainQueryParams
 *   ): Promise<IDomainPaginatedResult<Project>> {
 *     return this.findPaginated({
 *       ...params,
 *       filter: { organizationId: tenantId },
 *     });
 *   }
 *
 *   async findByIdAndTenant(id: string, tenantId: string): Promise<Project | null> {
 *     const project = await this.findById(id);
 *     if (project?.organizationId !== tenantId) {
 *       return null; // Enforce tenant isolation
 *     }
 *     return project;
 *   }
 * }
 *
 * // Usage in service layer
 * class ProjectService {
 *   async getProject(id: string, context: TenantContext): Promise<Project | null> {
 *     // Always use tenant-scoped queries for security
 *     return this.repository.findByIdAndTenant(id, context.tenantId);
 *   }
 * }
 * ```
 *
 * @see {@link TenantEntity} for the required entity structure
 * @see {@link IRepository} for base repository operations
 * @see {@link ITenantContext} for request-scoped tenant information
 */
export interface ITenantRepository<T extends TenantEntity, TFilter = unknown> extends IRepository<
  T,
  TFilter
> {
  /**
   * Find all entities belonging to a tenant with optional pagination.
   * @param tenantId - The tenant/organization ID
   * @param params - Optional query parameters
   * @returns Paginated result of tenant entities
   */
  findByTenantId(tenantId: string, params?: IDomainQueryParams): Promise<IDomainPaginatedResult<T>>;

  /**
   * Find entity by ID with tenant isolation check.
   * Returns null if entity exists but belongs to different tenant.
   * @param id - The entity ID
   * @param tenantId - The expected tenant ID
   * @returns The entity if found and belongs to tenant, null otherwise
   */
  findByIdAndTenant(id: string, tenantId: string): Promise<T | null>;
}

/**
 * Repository interface for aggregates with event sourcing support.
 *
 * Aggregates are consistency boundaries, so repositories only work with
 * aggregate roots, not internal entities. This interface supports both
 * traditional persistence and event sourcing patterns.
 *
 * @template T - The aggregate type (must extend AggregateRoot)
 * @template U - The JSON representation type for serialization
 *
 * @example
 * ```typescript
 * // Implement event-sourced aggregate repository
 * class OrderRepository implements IAggregateRepository<Order, OrderJSON> {
 *   constructor(
 *     private readonly eventStore: EventStore,
 *     private readonly eventBus: EventBus,
 *   ) {}
 *
 *   async save(aggregate: Order): Promise<void> {
 *     const events = aggregate.uncommittedEvents;
 *
 *     // Persist events to event store
 *     await this.eventStore.append(aggregate.id, events, aggregate.version);
 *
 *     // Publish events for other services/handlers
 *     await this.eventBus.publishAll(events);
 *
 *     // Mark events as committed
 *     aggregate.markEventsAsCommitted();
 *   }
 *
 *   async findById(id: string): Promise<Order | null> {
 *     return this.loadFromHistory(id);
 *   }
 *
 *   async loadFromHistory(id: string): Promise<Order | null> {
 *     const events = await this.eventStore.getEvents(id);
 *     if (events.length === 0) return null;
 *
 *     return Order.rebuildFromEvents(events);
 *   }
 *
 *   async findByIdAndVersion(id: string, version: number): Promise<Order | null> {
 *     const events = await this.eventStore.getEventsUpToVersion(id, version);
 *     if (events.length === 0) return null;
 *
 *     return Order.rebuildFromEvents(events);
 *   }
 *
 *   async exists(id: string): Promise<boolean> {
 *     return this.eventStore.hasEvents(id);
 *   }
 *
 *   async delete(id: string): Promise<void> {
 *     // For event sourcing, typically append a "deleted" event
 *     await this.eventStore.appendDeletionEvent(id);
 *   }
 * }
 * ```
 *
 * @see {@link AggregateRoot} for the aggregate base class
 * @see {@link IEvent} for domain events
 */
export interface IAggregateRepository<T extends AggregateRoot<U>, U> {
  /**
   * Save aggregate with its uncommitted events.
   * @param aggregate - The aggregate to save
   */
  save(aggregate: T): Promise<void>;

  /**
   * Find aggregate by ID.
   * @param id - The aggregate ID
   * @returns The aggregate if found, null otherwise
   */
  findById(id: string): Promise<T | null>;

  /**
   * Delete aggregate.
   * @param id - The aggregate ID to delete
   */
  delete(id: string): Promise<void>;

  /**
   * Check if aggregate exists.
   * @param id - The aggregate ID to check
   * @returns True if aggregate exists, false otherwise
   */
  exists(id: string): Promise<boolean>;

  /**
   * Find aggregate by ID and version for optimistic concurrency.
   * @param id - The aggregate ID
   * @param version - The expected version number
   * @returns The aggregate if found with matching version, null otherwise
   */
  findByIdAndVersion(id: string, version: number): Promise<T | null>;

  /**
   * Load aggregate from event store by replaying events.
   * @param id - The aggregate ID
   * @returns The rebuilt aggregate or null if no events found
   */
  loadFromHistory(id: string): Promise<T | null>;
}

/**
 * Domain repository interface using Result type for error handling.
 *
 * Returns `Result<T, E>` instead of throwing exceptions, following
 * functional programming principles for explicit error handling.
 *
 * @template T - The entity type (must extend BaseEntity)
 * @template E - The error type (defaults to Error)
 *
 * @example
 * ```typescript
 * class UserResultRepository implements IResultRepository<User, DomainError> {
 *   async findById(id: string): Promise<Result<User | null, DomainError>> {
 *     try {
 *       const user = await this.db.query.users.findFirst({
 *         where: eq(users.id, id),
 *       });
 *       return success(user);
 *     } catch (error) {
 *       return failure(new DomainError('DATABASE_ERROR', error));
 *     }
 *   }
 *
 *   async save(entity: User): Promise<Result<void, DomainError>> {
 *     try {
 *       await this.db.insert(users).values(entity);
 *       return success(undefined);
 *     } catch (error) {
 *       if (isUniqueConstraintViolation(error)) {
 *         return failure(new DomainError('DUPLICATE_EMAIL'));
 *       }
 *       return failure(new DomainError('DATABASE_ERROR', error));
 *     }
 *   }
 * }
 *
 * // Usage with pattern matching
 * const result = await repository.findById('user-123');
 * if (isSuccess(result)) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 *
 * @see {@link Result} for the Result type definition
 * @see {@link success} for creating success results
 * @see {@link failure} for creating failure results
 */
export interface IResultRepository<T extends BaseEntity, E = Error> {
  findById(id: string): Promise<Result<T | null, E>>;
  findAll(filter?: unknown): Promise<Result<readonly T[], E>>;
  save(entity: T): Promise<Result<void, E>>;
  delete(id: string): Promise<Result<void, E>>;
}

/**
 * Read-only repository interface for CQRS query side.
 *
 * Used for read models in CQRS pattern where queries are separated from
 * commands. Read models can be optimized for specific query patterns
 * without affecting the write model.
 *
 * @template T - The read model type (doesn't need to extend BaseEntity)
 * @template TFilter - Optional custom filter type for domain-specific filtering
 *
 * @example
 * ```typescript
 * // Define a read model (denormalized for queries)
 * interface UserListView {
 *   readonly id: string;
 *   readonly name: string;
 *   readonly email: string;
 *   readonly organizationName: string;
 *   readonly lastActiveAt: Date;
 * }
 *
 * // Implement read-only repository for projections
 * class UserListViewRepository implements IReadOnlyRepository<UserListView, UserListFilter> {
 *   async findById(id: string): Promise<UserListView | null> {
 *     return this.readDb.query.userListView.findFirst({
 *       where: eq(userListView.id, id),
 *     });
 *   }
 *
 *   async findPaginated(
 *     params: Omit<IDomainQueryParams, 'filter'> & { filter?: UserListFilter }
 *   ): Promise<IDomainPaginatedResult<UserListView>> {
 *     // Optimized query against denormalized read model
 *   }
 *
 *   // ... other read operations
 * }
 *
 * // Use in query handler
 * class ListUsersQueryHandler implements IQueryHandler<ListUsersQuery> {
 *   constructor(
 *     private readonly viewRepository: IReadOnlyRepository<UserListView>
 *   ) {}
 *
 *   async execute(query: ListUsersQuery): Promise<IQueryResult<PaginatedUsers>> {
 *     const result = await this.viewRepository.findPaginated(query);
 *     return querySuccess(result);
 *   }
 * }
 * ```
 *
 * @see {@link IQuery} for the query interface
 * @see {@link IWriteOnlyRepository} for the write side
 * @see {@link IDomainQueryParams} for query parameters
 */
export interface IReadOnlyRepository<T, TFilter = unknown> {
  findById(id: string): Promise<T | null>;
  findAll(filter?: TFilter): Promise<readonly T[]>;
  findPaginated(
    params: Omit<IDomainQueryParams, 'filter'> & { filter?: TFilter }
  ): Promise<IDomainPaginatedResult<T>>;
  exists(id: string): Promise<boolean>;
  count(filter?: TFilter): Promise<number>;
}

/**
 * Write-only repository interface for CQRS command side.
 *
 * Used for write operations in CQRS pattern where commands are separated
 * from queries. The write model can be optimized for transactional integrity
 * without query concerns.
 *
 * @template T - The entity type (must extend BaseEntity)
 *
 * @example
 * ```typescript
 * // Implement write-only repository
 * class UserWriteRepository implements IWriteOnlyRepository<User> {
 *   async save(entity: User): Promise<void> {
 *     await this.writeDb.insert(users)
 *       .values(entity)
 *       .onConflictDoUpdate({ target: users.id, set: entity });
 *
 *     // Publish event for read model synchronization
 *     await this.eventBus.publish(new UserSavedEvent(entity));
 *   }
 *
 *   async delete(id: string): Promise<void> {
 *     await this.writeDb.delete(users).where(eq(users.id, id));
 *     await this.eventBus.publish(new UserDeletedEvent(id));
 *   }
 *
 *   async softDelete(id: string): Promise<void> {
 *     await this.writeDb.update(users)
 *       .set({ deletedAt: new Date() })
 *       .where(eq(users.id, id));
 *     await this.eventBus.publish(new UserSoftDeletedEvent(id));
 *   }
 * }
 *
 * // Use in command handler
 * class CreateUserCommandHandler implements ICommandHandler<CreateUserCommand> {
 *   constructor(
 *     private readonly writeRepository: IWriteOnlyRepository<User>
 *   ) {}
 *
 *   async execute(command: CreateUserCommand): Promise<ICommandResult<void>> {
 *     const user = User.create(command);
 *     await this.writeRepository.save(user);
 *     return commandSuccess(undefined);
 *   }
 * }
 * ```
 *
 * @see {@link ICommand} for the command interface
 * @see {@link IReadOnlyRepository} for the read side
 * @see {@link BaseEntity} for the required entity structure
 */
export interface IWriteOnlyRepository<T extends BaseEntity> {
  save(entity: T): Promise<void>;
  delete(id: string): Promise<void>;
  softDelete?(id: string): Promise<void>;
}
