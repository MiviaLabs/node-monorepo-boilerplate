# App Module Documentation

This directory contains the root application module and bootstrap configuration for the NestJS API application.

## Files

| File                | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `app.module.ts`     | Root module with global providers and imports     |
| `app.controller.ts` | Root controller for health checks and base routes |
| `app.service.ts`    | Root service for application-level operations     |
| `main.ts`           | Application bootstrap and server configuration    |

## Global Providers

The following providers are registered globally in `app.module.ts`:

- **VersionInterceptor** (`APP_INTERCEPTOR`) - Adds version headers and deprecation warnings to all responses

## Module Imports

- **AppConfigModule** - Application configuration
- **VersionModule** - API version management (global module, available throughout app)

## Health Check Endpoint

The health check endpoint is available at:

```
GET /api/{version}/health
```

Example responses:

```json
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up"
    },
    "redis": {
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "database": {
      "status": "up",
      "ping": 5
    },
    "redis": {
      "status": "up",
      "ping": 2
    }
  }
}
```

## Bootstrap Configuration (`main.ts`)

### API Versioning

API versioning is enabled via `API_VERSIONS` environment variable. See [API Versioning](../docs/AGENTS.md#api-versioning) for details.

### CORS Configuration

CORS is configured with multi-origin support via `CORS_ORIGIN`:

```bash
# Single origin
CORS_ORIGIN=http://localhost:3000

# Multiple origins (comma-separated)
CORS_ORIGIN=http://localhost:3000,https://example.com,https://app.example.com

# Allow all (development only)
CORS_ORIGIN=*
```

### Encryption Provider Configuration

`EncryptionModule` supports two runtime modes in this app:

1. Cloud KMS auto-detection (default): reads standard provider env vars (`GCP_*`, `AWS_*`, `AZURE_*`, `VAULT_*`).
2. Explicit EnvVar provider override: set `ENCRYPTION_PROVIDER=env-var`.

When `ENCRYPTION_PROVIDER=env-var` is set, encryption keys are read from:

```bash
# Default key (required for default operations)
ENCRYPTION_KEY=<64-char hex key>

# Optional key-id specific keys (used by keyId, e.g. tenant keys)
ENCRYPTION_KEY_tenant-1=<64-char hex key>
ENCRYPTION_KEY_tenant-2=<64-char hex key>
```

Generate a valid key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`EnvVarProvider` is operationally simple but less secure than managed KMS. Prefer cloud KMS in production unless there is an explicit exception.

### Validation Pipe

Global validation pipe with class-transformer:

- `whitelist: true` - Strip properties not in DTO
- `forbidNonWhitelisted: true` - Throw error for unknown properties
- `transform: true` - Transform payloads to DTO instances
- `enableImplicitConversion: true` - Enable implicit type conversion

### API Response Patterns

The API uses a consistent response pattern through `BaseResponseDto<T>` for all endpoints.

#### BaseResponseDto

All API responses should use `BaseResponseDto<T>` from `../common/dtos`:

```typescript
import { BaseResponseDto } from '../../common/dtos';

// Single item response
return new BaseResponseDto(user);

// Response with metadata
return new BaseResponseDto(user, {
  timestamp: new Date().toISOString(),
  version: '1.0.0'
});

// Using static factory methods
return BaseResponseDto.success(user);
return BaseResponseDto.withTimestamp(user);
```

Response structure (after VersionInterceptor wraps it):

```json
{
  "data": { "id": "123", "name": "John" },
  "meta": {
    "version": "v1",
    "deprecated": true,
    "sunset": "2026-06-30"
  }
}
```

#### PaginatedResponseDto

For list endpoints, use `PaginatedResponseDto<T>`:

```typescript
import { PaginatedResponseDto } from '../../common/dtos';

return new PaginatedResponseDto(users, {
  page: 1,
  pageSize: 10,
  total: 100,
  totalPages: 10,
  hasNext: true,
  hasPrevious: false
});
```

Response structure:

```json
{
  "data": [
    { "id": "1", "name": "John" },
    { "id": "2", "name": "Jane" }
  ],
  "metadata": {
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 100,
      "totalPages": 10,
      "hasNext": true,
      "hasPrevious": false
    },
    "timestamp": "2024-12-31T12:00:00.000Z"
  }
}
```

#### VersionInterceptor Interaction

The `VersionInterceptor` automatically wraps all responses in `{ data, meta }` format. If you return a `BaseResponseDto`, the interceptor will:

- Merge existing metadata with version information
- Add deprecation headers for deprecated versions
- Include `X-API-Version` header in all responses

#### Health Endpoint

The health endpoint uses `HealthResponseDto` which extends `BaseResponseDto<HealthData>`:

```json
{
  "data": {
    "status": "ok",
    "message": "API is healthy",
    "version": "1.0.0",
    "timestamp": "2024-12-31T12:00:00.000Z",
    "details": { "database": { "status": "up" } }
  },
  "metadata": {
    "timestamp": "2024-12-31T12:00:00.000Z"
  }
}
```

### Swagger Documentation

Per-version Swagger documentation is automatically set up on bootstrap:

- Index: `/api/docs`
- V1 docs: `/api/docs/v1`
- V2 docs: `/api/docs/v2`

## Tenant Decorators

The API provides decorators for accessing tenant context in controller methods. These decorators work with the `TenantMiddleware` to extract and inject tenant information.

### Decorators

#### `@TenantContext()`

Injects the full tenant context object into a controller parameter.

**Tenant Context Interface:**

```typescript
interface TenantContext {
  readonly tenantId: string; // Tenant ID from x-tenant-id header
  readonly tenantSlug: string; // Tenant slug (resolved from tenant service)
  readonly userId?: string; // Authenticated user ID (from JWT)
  readonly userRoles?: readonly string[]; // User roles (from JWT)
}
```

**Usage Example:**

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { TenantContext } from '@/common/decorators/tenant.decorator';

@Controller('products')
export class ProductsController {
  @Post()
  async create(@TenantContext() tenant: TenantContext, @Body() dto: CreateProductDto) {
    console.log(`Creating product for tenant: ${tenant.tenantId}`);
    console.log(`User: ${tenant.userId}, Roles: ${tenant.userRoles}`);

    const command = new CreateProductCommand({
      tenantId: tenant.tenantId,
      actorId: tenant.userId,
      ...dto
    });

    return this.commandBus.execute(command);
  }
}
```

#### `@TenantId()`

Injects only the tenant ID (as a string) into a controller parameter. This is a convenience decorator when you only need the tenant ID.

**Usage Example:**

```typescript
import { Controller, Get, Param } from '@nestjs/common';
import { TenantId } from '@/common/decorators/tenant.decorator';

@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') userId: string) {
    return this.queryBus.execute(new GetUserQuery(tenantId, userId));
  }

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return this.queryBus.execute(new ListUsersQuery(tenantId));
  }
}
```

### How It Works

The tenant decorators work in conjunction with `TenantMiddleware`:

1. **Middleware**: `TenantMiddleware` intercepts incoming requests
2. **Extraction**: Extracts `x-tenant-id` header from request
3. **Validation**: Validates UUID format of tenant ID
4. **Context Creation**: Creates `TenantContext` object with tenant info
5. **Storage**: Stores context in `AsyncLocalStorage` (request-scoped)
6. **Injection**: Decorators retrieve context and inject into controller methods

### Tenant Middleware Configuration

The `TenantMiddleware` is configured to:

- Extract tenant ID from the `x-tenant-id` header (configurable via `TENANT_HEADER_NAME`)
- Validate UUID format
- Allow public routes (health check, Swagger) without tenant context
- Store context in `AsyncLocalStorage` for access throughout the request
- Attach context to request object for direct access

**Header Name Configuration:**

```bash
# .env
TENANT_HEADER_NAME=x-tenant-id  # Default
# Or use a custom header
TENANT_HEADER_NAME=x-organization-id
```

### Public Routes

The following routes are exempt from tenant requirement:

- `/health` - Health check endpoint
- `/api/v1/health` - Versioned health check
- `/api/docs` - Swagger documentation index
- `/api/docs/*` - Versioned Swagger docs

### When to Use Each Decorator

**Use `@TenantContext()` when:**

- You need the full tenant context object
- You need user ID or roles from JWT
- You're passing context to services that need multiple tenant properties

```typescript
async create(
  @TenantContext() tenant: TenantContext,
  @Body() dto: CreateDto
) {
  // Access multiple tenant properties
  const command = new CreateCommand({
    tenantId: tenant.tenantId,
    actorId: tenant.userId,
    userRoles: tenant.userRoles,
    ...dto,
  });
}
```

**Use `@TenantId()` when:**

- You only need the tenant ID
- You want cleaner, more concise code
- You're building simple CRUD queries

```typescript
async findAll(@TenantId() tenantId: string) {
  return this.repository.findByTenant(tenantId);
}
```

### Complete Controller Example

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { TenantId, TenantContext } from '@/common/decorators/tenant.decorator';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @Get()
  async findAll(@TenantId() tenantId: string) {
    return this.queryBus.execute(new ListProductsQuery(tenantId));
  }

  @Get(':id')
  async findOne(@TenantId() tenantId: string, @Param('id') productId: string) {
    return this.queryBus.execute(new GetProductQuery(tenantId, productId));
  }

  @Post()
  async create(@TenantContext() tenant: TenantContext, @Body() dto: CreateProductDto) {
    const command = new CreateProductCommand({
      tenantId: tenant.tenantId,
      actorId: tenant.userId,
      actorRoles: tenant.userRoles,
      ...dto
    });
    return this.commandBus.execute(command);
  }

  @Put(':id')
  async update(
    @TenantContext() tenant: TenantContext,
    @Param('id') productId: string,
    @Body() dto: UpdateProductDto
  ) {
    const command = new UpdateProductCommand({
      tenantId: tenant.tenantId,
      actorId: tenant.userId,
      productId,
      ...dto
    });
    return this.commandBus.execute(command);
  }

  @Delete(':id')
  async delete(@TenantId() tenantId: string, @Param('id') productId: string) {
    return this.commandBus.execute(new DeleteProductCommand(tenantId, productId));
  }
}
```

### Error Handling

If tenant context is not found, the decorators will throw an error:

```
Error: Tenant context not found. Ensure TenantMiddleware is applied.
```

This happens when:

- `x-tenant-id` header is missing
- Request is not a public route
- TenantMiddleware is not applied or misconfigured

### Related Files

- `src/common/decorators/tenant.decorator.ts` - `@TenantContext()` and `@TenantId()` decorators
- `src/common/middleware/tenant.middleware.ts` - Tenant middleware for context extraction
- `src/common/middleware/tenant-context.storage.ts` - AsyncLocalStorage for tenant context

## Server Startup Logging

When the server starts, it logs:

1. Base URL: `http://localhost:3000/api`
2. Available API versions with status indicators
3. Health check URL
4. Swagger documentation URLs

Example output:

```
[Nest] INFO 🚀 Application is running on: http://localhost:3000/api
[Nest] INFO 📋 Available API Versions:
[Nest] INFO ✅ v1: http://localhost:3000/api/v1
[Nest] INFO ✅ v2: http://localhost:3000/api/v2
[Nest] INFO ❤️ Health check: http://localhost:3000/api/v2/health
[Nest] INFO 📚 Swagger Documentation:
[Nest] INFO    └─ Index: http://localhost:3000/api/docs
[Nest] INFO    └─ v1: http://localhost:3000/api/docs/v1
[Nest] INFO    └─ v2: http://localhost:3000/api/docs/v2
```

## Module Structure

All NestJS modules must follow a consistent directory structure for maintainability and scalability.

### Required Directory Layout

Every feature module must organize its files into specific subdirectories:

```
modules/
└── {feature}/                     # Feature module (e.g., users, products, orders)
    ├── __tests__/                 # Co-located tests (test files separated from source)
    │   ├── fixtures/              # Test fixtures and test data factories
    │   │   └── {entity}.fixture.ts
    │   ├── {feature}.integration.test.ts  # Integration tests
    │   ├── handlers/             # Handler tests
    │   │   ├── commands/         # Command handler tests
    │   │   ├── queries/          # Query handler tests
    │   │   └── events/           # Event handler tests
    │   └── controllers/          # Controller tests
    ├── commands/                  # CQRS commands (write operations)
    │   ├── create-{entity}.command.ts
    │   ├── update-{entity}.command.ts
    │   └── delete-{entity}.command.ts
    ├── queries/                   # CQRS queries (read operations)
    │   ├── get-{entity}.query.ts
    │   └── list-{entities}.query.ts
    ├── events/                    # Domain events
    │   ├── {entity}-created.event.ts
    │   ├── {entity}-updated.event.ts
    │   └── {entity}-deleted.event.ts
    ├── handlers/                  # Command/Query/Event handlers
    │   ├── commands/
    │   │   ├── create-{entity}.handler.ts
    │   │   ├── update-{entity}.handler.ts
    │   │   └── delete-{entity}.handler.ts
    │   ├── queries/
    │   │   ├── get-{entity}.handler.ts
    │   │   └── list-{entities}.handler.ts
    │   └── events/
    │       ├── {entity}-created.handler.ts
    │       ├── {entity}-updated.handler.ts
    │       └── {entity}-deleted.handler.ts
    ├── dto/                       # Data Transfer Objects
    │   ├── create-{entity}.dto.ts
    │   ├── update-{entity}.dto.ts
    │   ├── {entity}-response.dto.ts
    │   └── {entity}-list-item.dto.ts
    ├── repositories/              # Data access layer
    │   └── {entity}.repository.ts
    ├── controllers/               # HTTP controllers (for multiple controllers)
    │   ├── {feature}.controller.ts
    │   └── {feature}-admin.controller.ts
    ├── services/                  # Business logic services (non-CQRS)
    │   └── {feature}.service.ts
    ├── guards/                    # Module-specific guards
    │   └── {feature}.guard.ts
    ├── interceptors/              # Module-specific interceptors
    │   └── {feature}.interceptor.ts
    ├── middleware/                # Module-specific middleware
    │   └── {feature}.middleware.ts
    ├── {feature}.module.ts        # Module definition
    ├── {feature}.controller.ts    # Main controller (if single)
    ├── {feature}.service.ts       # Main service (if simple)
    ├── {feature}.constants.ts     # Module constants
    └── {feature}.types.ts         # Module-specific types
```

### Simplified Structure for Simple Modules

For simple modules without CQRS complexity:

```
modules/
└── {feature}/
    ├── dto/                       # DTOs
    │   ├── create-{feature}.dto.ts
    │   └── {feature}-response.dto.ts
    ├── {feature}.controller.ts    # Controller
    ├── {feature}.service.ts       # Service
    └── {feature}.module.ts        # Module
```

### Directory Purpose and Rules

#### **tests**/ Directory

**Purpose**: Co-located test files that are cleanly separated from source code.

**When to use**: Always. Every module must have a `__tests__/` directory for all test files.

**Rules**:

- All test files MUST be in `__tests__/` subdirectory
- Test files follow the naming pattern: `{feature}.integration.test.ts` or `{name}.unit.test.ts`
- Fixtures are in `__tests__/fixtures/` subdirectory
- Integration tests test multiple components working together
- Unit tests test individual components in isolation
- Tests are co-located with source code for easy discovery
- Clean separation prevents test files from cluttering source code

**Structure**:

```
__tests__/
├── fixtures/                      # Test data factories
│   └── {entity}.fixture.ts        # Reusable test data
├── {feature}.integration.test.ts  # Integration tests
├── handlers/                      # Handler tests
│   ├── commands/                  # Command handler tests
│   ├── queries/                   # Query handler tests
│   └── events/                    # Event handler tests
└── controllers/                   # Controller tests
```

**Example Fixture**:

```typescript
// __tests__/fixtures/user.fixture.ts
import { users } from '@package/db-core/schema';
import { db } from '../src/modules/database';

export async function createUserFixture(overrides: Partial<typeof users.$inferInsert> = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      ...overrides
    })
    .returning();

  return user;
}

export async function deleteUserFixture(userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}
```

**Example Integration Test**:

```typescript
// __tests__/users.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'node:test';
import { createUserFixture, deleteUserFixture } from './fixtures/user.fixture';

describe('Users Integration Tests', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUserFixture();
  });

  afterEach(async () => {
    await deleteUserFixture(userId);
  });

  it('should find user by ID', async () => {
    const user = await getUserById(userId);
    expect(user).toBeDefined();
    expect(user.id).toBe(userId);
  });
});
```

**Benefits**:

1. **Co-location**: Tests are right next to the code they test
2. **Separation**: Clean separation from production code
3. **Discoverability**: Easy to find tests for a module
4. **Organization**: Fixtures and tests organized together
5. **Import clarity**: Clear test file imports from `__tests__/`

#### controllers/ Directory

**Purpose**: HTTP request handlers. Use this directory when a module has multiple controllers.

**When to use**:

- Module has more than one controller (e.g., admin vs user endpoints)
- Controllers are large (>200 lines)
- Multiple API versions for same feature

**Rules**:

- Controllers must be thin (delegate to CommandBus/QueryBus)
- Use `@VersionedController()` for versioned endpoints
- Apply guards at controller or method level
- Extract tenant context with `@TenantId()` or `@TenantContext()`

**Example**:

```typescript
// modules/users/controllers/users.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { TenantId } from '@/common/decorators/tenant.decorator';
import { ApiBearerAuth, UseGuards } from '@nestjs/common';

import { CreateUserCommand } from '../../commands/create-user.command';
import { GetUserQuery } from '../../queries/get-user.query';
import { ListUsersQuery } from '../../queries/list-users.query';
import { CreateUserDto } from '../../dto/create-user.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @Get()
  findAll(@TenantId() tenantId: string) {
    return this.queryBus.execute(new ListUsersQuery(tenantId));
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') userId: string) {
    return this.queryBus.execute(new GetUserQuery(tenantId, userId));
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.commandBus.execute(new CreateUserCommand({ tenantId, ...dto }));
  }
}
```

**When NOT to use controllers/ directory**:

- Module has only one small controller (<200 lines)
- Place `{feature}.controller.ts` at module root instead

#### services/ Directory

**Purpose**: Business logic that doesn't fit CQRS pattern (e.g., external API calls, complex calculations).

**When to use**:

- Non-CQRS business logic
- External service integrations
- Complex orchestration not suited for commands/queries
- Utility services specific to module

**Rules**:

- Services should NOT handle database operations (use repositories)
- Services should NOT be used for CQRS (use handlers instead)
- Services must be stateless
- Inject services into handlers or controllers

**Example**:

```typescript
// modules/users/services/email.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  async sendWelcomeEmail(email: string, name: string) {
    // External API call to email service
    await this.emailProvider.send({
      to: email,
      template: 'welcome',
      data: { name }
    });
  }
}
```

**When NOT to use services/ directory**:

- For CQRS operations (use handlers instead)
- For database access (use repositories instead)

#### repositories/ Directory

**Purpose**: Data access layer. All database operations must go through repositories.

**When to use**: Always. Every module with database access must have a `repositories/` directory.

**Rules**:

- Extend `BaseRepository` from `@package/infrastructure-repositories`
- All methods must accept `tenantId` as first parameter
- Use transactions for multi-step operations
- Never return entities with encrypted PII to controllers
- Return domain objects, not database entities

**Example**:

```typescript
// modules/users/repositories/user.repository.ts
import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/common/infrastructure/repositories/base.repository';

@Injectable()
export class UserRepository extends BaseRepository {
  async findByEmail(tenantId: string, email: string) {
    const [user] = await this.db
      .select()
      .from(usersTable)
      .where(
        and(eq(usersTable.organizationId, tenantId), eq(usersTable.emailHash, hashEmail(email)))
      )
      .limit(1);

    return user || null;
  }

  async create(tenantId: string, data: CreateUserData) {
    const [user] = await this.db
      .insert(usersTable)
      .values({
        ...data,
        organizationId: tenantId,
        emailHash: hashEmail(data.email),
        emailEncrypted: encrypt(data.email)
      })
      .returning();

    return user;
  }

  async createWithProfile(tenantId: string, userData: any, profileData: any) {
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(usersTable)
        .values({ ...userData, organizationId: tenantId })
        .returning();

      await tx.insert(userProfilesTable).values({ userId: user.id, ...profileData });

      return user;
    });
  }
}
```

**Required Methods Pattern**:

| Method Type | Naming Pattern                           | Example         |
| ----------- | ---------------------------------------- | --------------- |
| Find one    | `findBy{Field}`                          | `findByEmail`   |
| Find many   | `listBy{Condition}` or `search{Keyword}` | `listByStatus`  |
| Create      | `create`                                 | `create`        |
| Update      | `update`                                 | `update`        |
| Delete      | `delete` or `softDelete`                 | `softDelete`    |
| Count       | `countBy{Condition}`                     | `countByStatus` |
| Exists      | `existsBy{Field}`                        | `existsByEmail` |

#### dto/ Directory

**Purpose**: Data Transfer Objects for request validation and response formatting.

**When to use**: Always. Every module must have a `dto/` directory.

**Rules**:

- Use class-validator decorators
- Use `@ApiProperty()` for Swagger docs
- Separate DTOs by purpose (create, update, response, query)
- Extend from base DTOs when applicable
- Name files with kebab-case

**Standard DTO Files**:

| File Pattern                | Purpose                   | Example                   |
| --------------------------- | ------------------------- | ------------------------- |
| `create-{entity}.dto.ts`    | POST request body         | `create-user.dto.ts`      |
| `update-{entity}.dto.ts`    | PATCH/PUT request body    | `update-user.dto.ts`      |
| `{entity}-response.dto.ts`  | Single item response      | `user-response.dto.ts`    |
| `{entity}-list-item.dto.ts` | List item response        | `user-list-item.dto.ts`   |
| `query-{entity}.dto.ts`     | Query parameters          | `query-users.dto.ts`      |
| `pagination.dto.ts`         | Generic pagination params | (import from common/dtos) |

**Example**:

```typescript
// modules/users/dto/create-user.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe', minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

// modules/users/dto/user-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ nullable: true })
  updatedAt: Date | null;
}
```

#### commands/ Directory

**Purpose**: CQRS write operations (create, update, delete).

**When to use**: Always for modules following CQRS pattern.

**Rules**:

- Implement `ICommand` from `@package/foundation-cqrs`
- Include `tenantId`, `actorId`, `createdAt` properties
- Use readonly properties
- Accept data object in constructor
- File name: `{action}-{entity}.command.ts`

**Example**:

```typescript
// modules/users/commands/create-user.command.ts
import { ICommand } from '@package/types';

export interface CreateUserCommandProps {
  tenantId: string;
  actorId: string;
  email: string;
  password: string;
  name: string;
}

export class CreateUserCommand implements ICommand {
  readonly tenantId: string;
  readonly actorId: string;
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly createdAt: Date;

  constructor(props: CreateUserCommandProps) {
    this.tenantId = props.tenantId;
    this.actorId = props.actorId;
    this.email = props.email;
    this.password = props.password;
    this.name = props.name;
    this.createdAt = new Date();
  }
}
```

#### queries/ Directory

**Purpose**: CQRS read operations (get, list).

**When to use**: Always for modules following CQRS pattern.

**Rules**:

- Implement `IQuery` from `@package/foundation-cqrs`
- Include `tenantId` property
- Use readonly properties
- Accept data object in constructor
- File name: `{action}-{entity}.query.ts`

**Example**:

```typescript
// modules/users/queries/get-user.query.ts
import { IQuery } from '@package/types';

export interface GetUserQueryProps {
  tenantId: string;
  userId: string;
}

export class GetUserQuery implements IQuery {
  readonly tenantId: string;
  readonly userId: string;

  constructor(props: GetUserQueryProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
  }
}

// modules/users/queries/list-users.query.ts
export interface ListUsersQueryProps {
  tenantId: string;
  page?: number;
  pageSize?: number;
  status?: string;
}

export class ListUsersQuery implements IQuery {
  readonly tenantId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly status?: string;

  constructor(props: ListUsersQueryProps) {
    this.tenantId = props.tenantId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.status = props.status;
  }
}
```

#### events/ Directory

**Purpose**: Domain events for state changes.

**When to use**: Always for modules following CQRS pattern.

**Rules**:

- Implement `IEvent` from `@package/foundation-cqrs`
- Include `tenantId`, `aggregateId`, `occurredAt` properties
- Use readonly properties
- File name: `{entity}-{action}.event.ts`

**Example**:

```typescript
// modules/users/events/user-created.event.ts
import { IEvent } from '@package/types';

export class UserCreatedEvent implements IEvent {
  readonly aggregateId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly occurredAt: Date;

  constructor(tenantId: string, userId: string, email: string, name: string) {
    this.aggregateId = userId;
    this.tenantId = tenantId;
    this.userId = userId;
    this.email = email;
    this.name = name;
    this.occurredAt = new Date();
  }
}
```

#### handlers/ Directory

**Purpose**: Command/Query/Event handlers containing business logic.

**When to use**: Always for modules following CQRS pattern.

**Subdirectories**:

- `handlers/commands/` - Command handlers
- `handlers/queries/` - Query handlers
- `handlers/events/` - Event handlers

**Rules**:

- Use `@CommandHandler()`, `@QueryHandler()`, or `@EventsHandler()` decorators
- Implement appropriate handler interface
- Register handlers in module providers
- Publish events after state changes (commands only)
- File name: matching command/query/event name

**Example**:

```typescript
// modules/users/handlers/commands/create-user.handler.ts
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

import { CreateUserCommand } from '../../commands/create-user.command';
import { UserCreatedEvent } from '../../events/user-created.event';
import { UserRepository } from '../../repositories/user.repository';

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private readonly repository: UserRepository,
    private readonly eventBus: EventBus
  ) {}

  async execute(command: CreateUserCommand) {
    // Check if user exists
    const existing = await this.repository.findByEmail(command.tenantId, command.email);

    if (existing) {
      throw Errors.useruserWithEmail002({ email: command.email });
    }

    // Create user
    const user = await this.repository.create(command.tenantId, {
      email: command.email,
      password: await hashPassword(command.password),
      name: command.name
    });

    // Publish domain event
    await this.eventBus.publish(
      new UserCreatedEvent(command.tenantId, user.id, user.email, user.name)
    );

    return user;
  }
}
```

#### guards/ Directory

**Purpose**: Module-specific authentication and authorization guards.

**When to use**:

- Custom authorization logic specific to module
- Complex permission checks beyond role-based access
- Resource-level authorization (e.g., user can only edit their own resources)

**Rules**:

- Implement `CanActivate` interface
- Return boolean or promise<boolean>
- Throw exceptions for auth failures
- Use `@Injectable()` decorator

**Example**:

```typescript
// modules/users/guards/user-owner.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '@package/errors';
import { TenantContext } from '@/common/decorators/tenant.decorator';

@Injectable()
export class UserOwnerGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = request.params.id;

    // Admin can access any user
    if (user.roles?.includes('admin')) {
      return true;
    }

    // Users can only access their own data
    if (user.id !== userId) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: 'user:access-own-data'
      });
    }

    return true;
  }
}
```

#### interceptors/ Directory

**Purpose**: Module-specific interceptors for request/response transformation.

**When to use**:

- Transform data before/after handler execution
- Add module-specific logging
- Cache responses
- Measure handler execution time

**Rules**:

- Implement `NestInterceptor` interface
- Use `@Injectable()` decorator
- Return Observable

**Example**:

```typescript
// modules/users/interceptors/user-transform.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class UserTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // Remove sensitive fields
        if (data.password) {
          delete data.password;
        }
        return data;
      })
    );
  }
}
```

#### middleware/ Directory

**Purpose**: Module-specific middleware for request processing.

**When to use**:

- Custom request processing logic
- Request validation before guards
- Request logging/metrics
- CORS or rate limiting per module

**Rules**:

- Implement `NestMiddleware` interface
- Use `@Injectable()` decorator
- Register in module configuration

**Example**:

```typescript
// modules/users/middleware/user-logging.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class UserLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(UserLoggingMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(`User request: ${req.method} ${req.path}`);
    next();
  }
}

// Register in users.module.ts
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserLoggingMiddleware).forRoutes('users');
  }
}
```

### Naming Conventions

#### Files

- **Kebab-case for filenames**: `create-user.dto.ts`, `user.repository.ts`
- **Singular entity names**: `user` not `users`
- **Action prefix**: `create-`, `update-`, `delete-`, `get-`, `list-`

#### Classes

- **PascalCase**: `CreateUserCommand`, `UserRepository`, `UsersController`
- **Suffix pattern**:
  - Commands: `*Command`
  - Queries: `*Query`
  - Events: `*Event`
  - Handlers: `*Handler`
  - DTOs: `*Dto`
  - Controllers: `*Controller`
  - Services: `*Service`
  - Guards: `*Guard`
  - Interceptors: `*Interceptor`
  - Middleware: `*Middleware`

#### Directories

- **Plural for group directories**: `commands/`, `queries/`, `handlers/`, `dto/`
- **Singular for type directories**: `controllers/`, `services/`, `repositories/`, `guards/`, `interceptors/`, `middleware/`
- **Feature directory**: Singular, kebab-case: `user-management/`, `order-processing/`

### Module Registration

All handlers, repositories, and services must be registered in the module definition:

```typescript
// modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { UsersController } from './controllers/users.controller';
import { UserRepository } from './repositories/user.repository';
import { EmailService } from './services/email.service';

// Command handlers
import { CreateUserHandler } from './handlers/commands/create-user.handler';
import { UpdateUserHandler } from './handlers/commands/update-user.handler';
import { DeleteUserHandler } from './handlers/commands/delete-user.handler';

// Query handlers
import { GetUserHandler } from './handlers/queries/get-user.handler';
import { ListUsersHandler } from './handlers/queries/list-users.handler';

// Event handlers
import { UserCreatedHandler } from './handlers/events/user-created.handler';

@Module({
  imports: [CqrsModule],
  controllers: [UsersController],
  providers: [
    // Repository
    UserRepository,

    // Services
    EmailService,

    // Command handlers
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,

    // Query handlers
    GetUserHandler,
    ListUsersHandler,

    // Event handlers
    UserCreatedHandler
  ],
  exports: [UserRepository]
})
export class UsersModule {}
```

### Index Files for Clean Imports

Use `index.ts` files to export from subdirectories for cleaner imports:

```typescript
// modules/users/dto/index.ts
export { CreateUserDto } from './create-user.dto';
export { UpdateUserDto } from './update-user.dto';
export { UserResponseDto } from './user-response.dto';

// Usage in other files
import { CreateUserDto, UserResponseDto } from '../modules/users/dto';
```

### Examples from Codebase

#### Health Module (Simple Structure)

The health module demonstrates a simple structure without CQRS:

```
modules/health/
├── dto/
│   └── health-response.dto.ts
├── indicators/
│   └── health-indicator.interface.ts
├── health.constants.ts
├── health.controller.ts
├── health.service.ts
└── health.module.ts
```

This is appropriate because health checks are simple read operations without complex business logic.

#### Complete CQRS Module Example

A full CQRS module like `users` would have:

```
modules/users/
├── __tests__/
│   ├── fixtures/
│   │   └── user.fixture.ts
│   ├── users.integration.test.ts
│   ├── handlers/
│   │   ├── commands/
│   │   │   ├── create-user.handler.unit.test.ts
│   │   │   ├── update-user.handler.unit.test.ts
│   │   │   └── delete-user.handler.unit.test.ts
│   │   ├── queries/
│   │   │   ├── get-user.handler.unit.test.ts
│   │   │   ├── list-users.handler.unit.test.ts
│   │   │   └── search-users.handler.unit.test.ts
│   │   └── events/
│   │       ├── user-created.handler.unit.test.ts
│   │       ├── user-updated.handler.unit.test.ts
│   │       └── user-deleted.handler.unit.test.ts
│   └── controllers/
│       ├── users.controller.integration.test.ts
│       └── users-admin.controller.integration.test.ts
├── commands/
│   ├── create-user.command.ts
│   ├── update-user.command.ts
│   └── delete-user.command.ts
├── queries/
│   ├── get-user.query.ts
│   ├── list-users.query.ts
│   └── search-users.query.ts
├── events/
│   ├── user-created.event.ts
│   ├── user-updated.event.ts
│   └── user-deleted.event.ts
├── handlers/
│   ├── commands/
│   │   ├── create-user.handler.ts
│   │   ├── update-user.handler.ts
│   │   └── delete-user.handler.ts
│   ├── queries/
│   │   ├── get-user.handler.ts
│   │   ├── list-users.handler.ts
│   │   └── search-users.handler.ts
│   └── events/
│       ├── user-created.handler.ts
│       ├── user-updated.handler.ts
│       └── user-deleted.handler.ts
├── dto/
│   ├── create-user.dto.ts
│   ├── update-user.dto.ts
│   ├── user-response.dto.ts
│   ├── user-list-item.dto.ts
│   └── query-users.dto.ts
├── repositories/
│   └── user.repository.ts
├── services/
│   └── email.service.ts
├── controllers/
│   ├── users.controller.ts
│   └── users-admin.controller.ts
├── guards/
│   └── user-owner.guard.ts
├── users.module.ts
├── users.constants.ts
└── users.types.ts
```

### When to Deviate from Structure

**Valid deviations**:

1. **Shared feature module**: Multiple related features can share a module (e.g., `auth/` module with `login/`, `register/`, `password-reset/` subdirectories)
2. **Micro-module**: Very simple features (<3 files) can live in flat structure
3. **Cross-cutting concerns**: Place in `common/` directory instead of feature module

**Invalid deviations**:

1. ❌ Putting handlers directly in module root (must use `handlers/` subdirectory)
2. ❌ Mixing commands and queries in same directory
3. ❌ Placing DTOs in controllers directory
4. ❌ Database operations in services (use repositories)

### Module Structure Checklist

When creating a new module, ensure:

- [ ] All tests in `__tests__/` directory (co-located with source code)
- [ ] Fixtures in `__tests__/fixtures/` directory
- [ ] Integration tests in `__tests__/{feature}.integration.test.ts`
- [ ] Unit tests in `__tests__/handlers/`, `__tests__/controllers/` subdirectories
- [ ] Commands in `commands/` directory
- [ ] Queries in `queries/` directory
- [ ] Events in `events/` directory
- [ ] Handlers organized in `handlers/commands/`, `handlers/queries/`, `handlers/events/`
- [ ] DTOs in `dto/` directory
- [ ] Repository in `repositories/` directory (if database access)
- [ ] Controllers in `controllers/` directory (or at root if single/small)
- [ ] Services in `services/` directory (if non-CQRS logic)
- [ ] Guards in `guards/` directory (if module-specific)
- [ ] Interceptors in `interceptors/` directory (if module-specific)
- [ ] Middleware in `middleware/` directory (if module-specific)
- [ ] All providers registered in module file
- [ ] Proper naming conventions followed
- [ ] Index files for clean imports (optional but recommended)

## Error Handling

Unified error responses use `BaseResponseDto.error()` and the `@package/errors` package with i18n support.

### Error Response Format

All errors return a consistent response format using `BaseResponseDto.error()`:

```typescript
// Error response structure
{
  "data": null,
  "metadata": {
    "error": {
      "code": "USER_001",
      "message": "User with ID 123 not found",
      "category": "USER",
      "severity": "low",
      "safeForUser": true,
      "httpStatus": 404
    },
    "timestamp": "2024-12-31T12:00:00.000Z"
  }
}
```

### Throwing Errors

Use `ApiException` for API-specific errors (API_001-020):

```typescript
import { ApiException } from '@/common/errors';

// Tenant context errors
throw ApiException.tenantContextMissing(); // API_001
throw ApiException.tenantContextInvalid(); // API_002

// API version errors
throw ApiException.apiVersionNotFound(version); // API_003
throw ApiException.apiVersionDeprecated(version, sunsetDate); // API_004

// Rate limiting
throw ApiException.rateLimitExceeded(limit, window, retryAfter); // API_005

// Validation errors
throw ApiException.requestValidationFailed('email', 'must be valid email'); // API_006
throw ApiException.invalidQueryParameter('sort', 'invalid'); // API_007
throw ApiException.missingRequiredHeader('X-API-Version'); // API_008

// Service errors
throw ApiException.serviceUnavailable('payment-gateway', 60); // API_011
throw ApiException.configurationError('databaseUrl'); // API_012
```

Use `Errors` factory from `@package/errors` for domain-specific errors:

```typescript
import { Errors } from '@package/errors';

// User domain errors (USER_001-010)
throw Errors.useruserWithId001({ userId: '123' }); // User not found
throw Errors.useruserWithEmail002({ email: 'user@example.com' }); // Email already exists
throw Errors.useruserAccountIs007({ reason: 'Too many failed login attempts' }); // Account suspended

// Auth domain errors (AUTH_001-010)
throw Errors.authinvalidEmailOr001({}); // Invalid credentials
throw Errors.authinsufficientPermissionsRequiredpermission004({ requiredPermission: 'admin' });

// Validation errors (VAL_001-009)
throw Errors.validationvalidationFailedField001({ field: 'email' }); // Field required
throw Errors.validationinvalidValueFor002({ field: 'age', expectedType: 'number' }); // Invalid type

// Database errors (DB_001-010)
throw Errors.databaserecordNotFound004({ entity: 'User' }); // Record not found
throw Errors.databaserecordAlreadyExists003({ entity: 'User' }); // Record already exists
```

### Error Code Reference

#### API Errors (API_001-020)

| Code    | Description                      | HTTP Status | Parameters                        |
| ------- | -------------------------------- | ----------- | --------------------------------- |
| API_001 | Tenant context missing           | 400         | -                                 |
| API_002 | Tenant context invalid           | 400         | -                                 |
| API_003 | API version not found            | 404         | `version` (optional)              |
| API_004 | API version deprecated           | 400         | `version`, `sunsetDate`           |
| API_005 | Rate limit exceeded              | 429         | `limit`, `window`, `retryAfter`   |
| API_006 | Request validation failed        | 400         | `field`, `constraint`             |
| API_007 | Invalid query parameter          | 400         | `param`, `value`                  |
| API_008 | Missing required header          | 400         | `header`                          |
| API_009 | Invalid request body format      | 400         | `format`                          |
| API_010 | Feature not enabled              | 503         | `feature`                         |
| API_011 | Service temporarily unavailable  | 503         | `service`, `retryAfter`           |
| API_012 | Configuration error              | 500         | `setting`                         |
| API_013 | Invalid API key                  | 401         | `keyId`                           |
| API_014 | API key expired                  | 401         | `keyId`, `expiredAt`              |
| API_015 | Webhook delivery failed          | 500         | `webhookUrl`, `attempt`, `reason` |
| API_016 | Batch request too large          | 413         | `maxSize`, `actualSize`, `unit`   |
| API_017 | Request timeout                  | 408         | `timeout`                         |
| API_018 | Invalid pagination parameters    | 400         | `page`, `pageSize`, `maxPageSize` |
| API_019 | Invalid sort parameters          | 400         | `field`, `direction`              |
| API_020 | Concurrent modification conflict | 409         | `resource`, `id`                  |

#### Domain Error Prefixes

- **USER_001-010**: User domain (not found, already exists, invalid format, account issues)
- **AUTH_001-010**: Authentication domain (invalid credentials, token issues, permissions)
- **VAL_001-009**: Validation domain (required fields, invalid values, format errors)
- **DB_001-010**: Database domain (connection issues, query failures, constraints)
- **BIZ_001-008**: Business logic domain (operation restrictions, workflow transitions)
- **EXT_001-007**: External services (third-party API failures, timeouts)
- **FILE_001-008**: File operations (upload failures, format errors, storage issues)
- **SYS_001-010**: System errors (internal errors, configuration, infrastructure)

### Error Categories

Each error belongs to a category:

- **USER**: User-related errors (not found, duplicates, validation)
- **AUTH**: Authentication and authorization errors
- **VALIDATION**: Input validation failures
- **DATABASE**: Database operation failures
- **BUSINESS**: Business rule violations
- **EXTERNAL**: Third-party service failures
- **FILE**: File handling errors
- **SYSTEM**: Infrastructure and system errors

### Error Severity Levels

- **low**: Expected errors (validation, not found) - no alert needed
- **medium**: Unexpected but recoverable (external service failures) - log warning
- **high**: System errors requiring attention (database failures) - alert on-call

### Safe For User Flag

Errors marked `safeForUser: true` can be shown to end users. Others should be logged but generic messages shown.

### Internationalization (i18n)

All error messages support multiple languages with **automatic translation** via `error.translated` getter:

```typescript
import { RegisteredError } from '@package/errors';

// In exception filter or error handler
if (error instanceof RegisteredError) {
  // Automatic translation via LocaleContext
  const translation = error.translated;

  console.log(translation.message); // Translated message
  console.log(translation.locale); // Locale used
  console.log(translation.usedFallback); // Whether fallback was used
}
```

**How it works:**

1. `LocaleContextMiddleware` extracts locale from request (`?locale`, `Accept-Language`, or default)
2. Sets locale in `LocaleContext` (AsyncLocalStorage)
3. `error.translated` getter automatically reads from `LocaleContext`
4. `TranslationService` translates and returns `TranslationResult`

**No need to manually call `TranslationService.translate()` for RegisteredError!**

**Supported locales:** `en`, `ar-SA`, `tl-PH`, `fr`

### Error Handling in Controllers

```typescript
import { ApiException } from '@/common/errors';
import { Errors } from '@package/errors';

@Controller('users')
export class UsersController {
  @Get(':id')
  async findOne(@Param('id') userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      // Use domain error for not found
      throw Errors.useruserWithId001({ userId });
    }

    return user;
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    // Check if email exists
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) {
      // Use domain error for duplicate
      throw Errors.useruserWithEmail002({ email: dto.email });
    }

    return this.usersService.create(dto);
  }
}
```

### Error Handling in Middleware/Guards

```typescript
import { ApiException } from '@/common/errors';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'];

    if (!tenantId) {
      // Use API error for missing tenant context
      throw ApiException.missingRequiredHeader('x-tenant-id');
    }

    if (!isValidUuid(tenantId)) {
      // Use API error for invalid tenant context
      throw ApiException.tenantContextInvalid();
    }

    next();
  }
}
```

### Error Handling in Repositories

Base repository uses `Errors.database.recordNotFound004()` for not found errors. Domain-specific errors should be thrown in concrete repositories:

```typescript
@Injectable()
export class UserRepository extends BaseRepository {
  async findByEmail(tenantId: string, email: string) {
    const [user] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      // Throw domain error, not generic NotFoundException
      throw Errors.useruserWithId001({ userId: email });
    }

    return user;
  }
}
```

### Error Logging

All errors are logged by `GlobalExceptionFilter` with context:

```typescript
// Error logged with:
// - Error code and message
// - Request ID
// - User ID (if authenticated)
// - Tenant ID (if available)
// - Stack trace (for server errors)
// - Metadata (for debugging)
```

### Testing Error Responses

```typescript
import { ApiException } from '@/common/errors';
import { Errors } from '@package/errors';

describe('UsersController', () => {
  it('should throw USER_001 when user not found', async () => {
    await expect(controller.findOne('123')).rejects.toThrow(
      Errors.useruserWithId001({ userId: '123' })
    );
  });

  it('should return 404 for USER_001', async () => {
    try {
      await controller.findOne('123');
    } catch (error) {
      expect(error.code).toBe('USER_001');
      expect(error.httpStatus).toBe(404);
    }
  });
});
```

### Documentation References

- [API Claude Instructions](../../../AGENTS.md) - Root API documentation
- [API Versioning](../../../AGENTS.md#api-versioning) - Versioning configuration and usage
- [Tenant Decorators](#tenant-decorators) - @TenantContext() and @TenantId() decorators
- [Version Config](config/version.config.ts) - Version configuration schema
- [Swagger Setup](common/swagger/swagger.setup.ts) - Per-version Swagger setup
- [Tenant Middleware](common/middleware/tenant.middleware.ts) - Tenant context extraction
- [Tenant Decorators](common/decorators/tenant.decorator.ts) - Tenant decorators implementation
- [ApiException](common/errors/api-exception.ts) - API exception class with static factory methods
- [API Error Codes](common/errors/api-error-codes.ts) - Complete API error registry
- [Errors Package](../../../packages/errors/README.md) - Generic errors package documentation
