# @package/types

**Shared TypeScript types and interfaces for CQRS, validation, and domain models in the Node Monorepo Boilerplate.**

## What is it?

`@package/types` provides common TypeScript types and interfaces used across all applications and packages in the Node Monorepo Boilerplate, with a focus on CQRS patterns and domain modeling.

## Features

- **CQRS Types** - Command, Query, and Event base interfaces with result types
- **Entity Types** - Base entity interfaces with timestamps and IDs
- **Infrastructure Types** - Pagination, sorting, filtering, and search types
- **Type Utilities** - Helper types for common patterns
- **Domain Models** - Core domain entities and value objects

## Installation

This package is part of the Node Monorepo Boilerplate monorepo.

```bash
pnpm install @package/types
```

## Quick Start

```typescript
// CQRS types
import type { ICommand, ICommandResult, commandSuccess, commandFailure } from '@package/types';

// Entity types
import type { IEntity, IEntityWithTimestamps, EntityType } from '@package/types';

// Infrastructure types
import type { IPaginationParams, ISortParams, IFilterParams } from '@package/types';
```

## CQRS Types

### Command Types

```typescript
import type { ICommand, ICommandResult, commandSuccess, commandFailure } from '@package/types';

// Define a command
interface CreateUserCommand extends ICommand {
  email: string;
  password: string;
  organizationId: string;
}

// Return command result
async function handleCreateUser(command: CreateUserCommand): Promise<ICommandResult<User>> {
  try {
    const user = await userService.create(command);
    return commandSuccess(user);
  } catch (error) {
    return commandFailure('Failed to create user', error);
  }
}
```

### Query Types

```typescript
import type { IQuery, IQueryResult } from '@package/types';

// Define a query
interface GetUserQuery extends IQuery {
  userId: string;
}

// Return query result
async function handleGetUser(query: GetUserQuery): Promise<IQueryResult<User>> {
  const user = await userRepository.findById(query.userId);
  return { data: user };
}
```

## Entity Types

### Base Entity

```typescript
import type { IEntity } from '@package/types';

interface User extends IEntity {
  id: string;
  // ...other fields
}
```

### Entity with Timestamps

```typescript
import type { IEntityWithTimestamps } from '@package/types';

interface User extends IEntityWithTimestamps {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  // ...other fields
}
```

### Entity Type Enum

```typescript
import type { EntityType } from '@package/types';

const entityType: EntityType = 'user';
```

## Infrastructure Types

### Pagination

```typescript
import type { PaginationParams, PaginatedResult } from '@package/types';

// Pagination parameters
const params: PaginationParams = {
  page: 1,
  pageSize: 20
};

// Paginated result
const result: PaginatedResult<User> = {
  data: [user1, user2],
  total: 100,
  page: 1,
  pageSize: 20,
  totalPages: 5
};
```

### Sorting

```typescript
import type { ISortParams, SortOrder } from '@package/types';

// Single sort
const sort: ISortParams = [
  {
    field: 'createdAt',
    order: SortOrder.DESC
  }
];

// Multiple sorts
const multiSort: ISortParams = [
  { field: 'lastName', order: SortOrder.ASC },
  { field: 'firstName', order: SortOrder.ASC }
];
```

### Filtering

```typescript
import type { IFilterParam, IFilterParams } from '@package/types';

// Single filter
const filter: IFilterParam = {
  field: 'status',
  operator: 'eq',
  value: 'active'
};

// Array of filters
const filters: IFilterParams = [
  { field: 'status', operator: 'eq', value: 'active' },
  { field: 'createdAt', operator: 'gte', value: '2024-01-01' }
];
```

## Type Utilities

### PartialBy

```typescript
import type { PartialBy } from '@package/types';

type User = {
  id: string;
  email: string;
  password: string;
};

type CreateUserInput = PartialBy<User, 'id'>;
// { id?: string; email: string; password: string; }
```

### RequiredBy

```typescript
import type { RequiredBy } from '@package/types';

type UserUpdate = {
  id: string;
  email?: string;
  password?: string;
};

type RequiredUpdate = RequiredBy<UserUpdate, 'email'>;
// { id: string; email: string; password?: string; }
```

## Available Types

### CQRS Types

- `ICommand` - Base command interface
- `ICommandResult<T>` - Command result with success/failure
- `commandSuccess()` - Create success result
- `commandFailure()` - Create failure result
- `IQuery` - Base query interface
- `IQueryResult<T>` - Query result wrapper
- `IEvent` - Base event interface

### Entity Types

- `IEntity` - Base entity with ID
- `IEntityWithTimestamps` - Entity with createdAt and updatedAt
- `EntityType` - Union type of entity names

### Infrastructure Types

- `IPaginationParams` - Pagination parameters
- `IPaginatedResult<T>` - Paginated result type
- `ISortParams` - Sorting parameters
- `IFilterParams` - Filtering parameters
- `SearchParams` - Search parameters
- `CursorPaginationParams` - Cursor-based pagination

### Utility Types

- `PartialBy<T, K>` - Make specific properties optional
- `RequiredBy<T, K>` - Make specific properties required
- `Nullable<T>` - Make type nullable
- `Optional<T>` - Make type optional
- `DeepPartial<T>` - Recursively make properties optional

## Structure

```text
src/
├── cqrs/
│   ├── command.types.ts  # Command interfaces and result wrappers
│   ├── query.types.ts    # Query interfaces and result wrappers
│   └── event.types.ts    # Domain event interfaces
├── domain/
│   ├── aggregate.types.ts
│   ├── entity.types.ts
│   ├── organization.types.ts
│   ├── query.types.ts
│   ├── repository.types.ts
│   ├── result.core.ts
│   ├── role.types.ts
│   ├── user.types.ts
│   └── value-object.types.ts
├── events/
│   └── cloudevents.types.ts
├── infrastructure/
│   ├── api.types.ts
│   ├── filtering.types.ts
│   ├── pagination.types.ts
│   └── sorting.types.ts
├── multitenancy/
│   ├── data-classification.types.ts
│   └── tenant.types.ts
└── index.ts
```

## Building

```bash
pnpm nx build types
```

## Associated Packages

- [`@package/constants`](../constants/) - Application constants
- [`@package/schema`](../schema/) - Zod validation schemas
- [`@package/db-core`](../db-core/) - Database schema types

## Links

- [Main Repository](../../README.md)
- [Package Documentation](./AGENTS.md)
