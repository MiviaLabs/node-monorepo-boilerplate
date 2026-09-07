/**
 * @package/types
 *
 * Shared types package for Node Monorepo Boilerplate.
 * Provides compile-time type safety and serves as the source of truth
 * for domain entities, infrastructure patterns, and CQRS types.
 *
 * Related packages:
 * - `@package/schema` - Zod validation schemas
 * - `@package/constants` - Constant values and enums
 * - `@package/db-core` - Drizzle ORM entity implementations
 * - `@package/events` - Event handling implementations
 *
 * @packageDocumentation
 */

// Domain types
// - User: User entity type
// See @package/db-core for users table schema
export * from './domain/user.types';

// - Organization: Organization entity type
// See @package/db-core for organizations table schema
export * from './domain/organization.types';

// - BaseEntity: Base entity with timestamps
// - EntityId: Branded entity identifier type
// See @package/db-core for entity implementations
export * from './domain/entity.types';

// - IValueObject: Value object interface
// See @package/schema for value object validation
export * from './domain/value-object.types';

// - Role: Role type definitions
// See @package/constants for SystemRole and TenantRole
// See @package/auth for role guards and decorators
export * from './domain/role.types';

// - AggregateRoot: Aggregate root base class
// See @package/events for domain event handling
export * from './domain/aggregate.types';

// - Result: Result type for error handling
// See @package/errors for error implementations
export * from './domain/result.types';

// - IDomainQueryParams: Domain query parameters
// See @package/schema for pagination/sort validation
export * from './domain/query.types';

// - IRepository: Repository interface
// See @package/db-core for repository implementations
export * from './domain/repository.types';

// Infrastructure types
// - IPaginationParams: Pagination parameters
// - IPaginatedResult: Paginated response wrapper
// See @package/constants for pagination limits
// See @package/schema for pagination validation
export * from './infrastructure/pagination.types';

// - ISortParams: Sorting parameters
// See @package/schema for sort validation
export * from './infrastructure/sorting.types';

// - IFilterParams: Filtering parameters
// See @package/schema for filter validation
export * from './infrastructure/filtering.types';

// - IApiResponse: API response wrapper
// - IApiError: API error response
// See @package/errors for error handling
export * from './infrastructure/api.types';

// CQRS types
// - ICommand: Command interface
// - ICommandResult: Command result type
// - commandSuccess: Create successful result
// - commandFailure: Create failed result
export * from './cqrs/command.types';

// - IQuery: Query interface
// - IQueryResult: Query result type
export * from './cqrs/query.types';

// - IEvent: Event interface
// - EventMetadata: Event metadata type
// See @package/events for event bus implementation
export * from './cqrs/event.types';

// Multitenancy types
// - TenantId: Branded tenant identifier
// - ITenantContext: Request-scoped tenant context
// - ITenantScoped: Tenant-aware entity interface
// See @package/constants for tenant isolation levels
export * from './multitenancy/tenant.types';

// - DataClassification: Data classification levels
export * from './multitenancy/data-classification.types';

// Events types
// - CloudEvent: CloudEvents specification type
// - toCloudEvent: Convert domain event to CloudEvent
// - fromCloudEvent: Convert CloudEvent to domain event
// See @package/events for event publishing
export * from './events/cloudevents.types';
