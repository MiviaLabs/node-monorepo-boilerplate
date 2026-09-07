# @package/types

Shared TypeScript types, interfaces, and enums for Node Monorepo Boilerplate.

## Purpose

This package contains common type definitions used across all applications and packages in the monorepo. It provides compile-time type safety and serves as the source of truth for domain entities and infrastructure patterns.

## Structure

```
src/
├── domain/              # Domain entity types
│   ├── user.types.ts
│   ├── organization.types.ts
│   ├── entity.types.ts
│   └── value-object.types.ts
├── infrastructure/      # Infrastructure types
│   ├── pagination.types.ts
│   ├── sorting.types.ts
│   ├── filtering.types.ts
│   └── api.types.ts
├── cqrs/               # CQRS types
│   ├── command.types.ts
│   ├── query.types.ts
│   └── event.types.ts
├── multitenancy/       # Multi-tenancy types
│   └── tenant.types.ts
└── index.ts
```

## Usage

```typescript
import type { User, CreateUserInput, UpdateUserInput } from '@package/types';

import type { PaginatedResult, PaginationParams } from '@package/types';

import type { ICommand, ICommandResult, IQuery, IEvent } from '@package/types';
```

## Key Types

### Domain Types

- `User` - User entity with roles and status
- `Organization` - Organization/tenant entity
- `BaseEntity` - Base entity with timestamps
- `TenantEntity` - Tenant-scoped entity

### Infrastructure Types

- `PaginatedResult<T>` - Paginated response wrapper
- `PaginationParams` - Pagination parameters
- `ISortParam` - Sort field and direction
- `FilterParam` - Filter field, operator, value
- `ApiResponse<T>` - API response wrapper
- `ApiError` - API error response

### CQRS Types

- `ICommand` - Base command interface
- `ICommandResult<T>` - Command result with data or errors
- `IQuery` - Base query interface
- `IQueryResult<T>` - Query result with data or error
- `IEvent` - Base event interface

### Multi-tenancy Types

- `Tenant` - Tenant entity
- `TenantContext` - Request-scoped tenant context
- `TenantScoped` - Tenant-scoped entity marker

## Guidelines

- All types use `readonly` modifiers where appropriate
- Entity types have `readonly id` and timestamps
- Input types use `readonly` for immutability
- Use `as const` for constant-like types
