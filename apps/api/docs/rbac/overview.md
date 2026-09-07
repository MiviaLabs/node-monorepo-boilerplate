# RBAC Overview

Comprehensive overview of the Role-Based Access Control system in the Node Monorepo Boilerplate API.

## Table of Contents

1. [Architecture](#architecture)
2. [Dual-Provider Support](#dual-provider-support)
3. [Authorization Flow](#authorization-flow)
4. [Permission Model](#permission-model)
5. [Defense in Depth](#defense-in-depth)

## Architecture

```mermaid
C4Context
    title RBAC System Context
    Person(user, "API User", "Authenticated user with JWT")
    Person(admin, "System Admin", "System-level administrator")

    Container(api, "API", "NestJS Application", "REST API with RBAC guards")
    Container(auth, "Auth Package", "auth", "JWT validation & permissions")
    Container(cache, "Redis", "Permission Cache", "Cached permission resolution")
    ContainerDb(db, "PostgreSQL", "Database", "Users, roles, permissions")

    Rel(user, api, "HTTPS", "Bearer token")
    Rel(admin, api, "HTTPS", "Bearer token")
    Rel(api, auth, "Calls", "Validate & authorize")
    Rel(auth, cache, "Check", "Firebase permissions")
    Rel(auth, db, "Query", "User role data")
```

### Component Diagram

```mermaid
C4Component
    title RBAC Component Architecture
    Container(api, "API", "NestJS")

    Component(guard, "EnhancedPermissionsGuard", "NestJS Guard", "Authorization entry point")
    Component(provider, "Auth Provider", "Strategy", "JWT validation & user extraction")
    Component(service, "CachedPermissionService", "Service", "Permission resolution")
    Component(mock, "NoOpPermissionService", "Mock", "Test permission service")

    Rel(api, guard, "Uses", "Protect routes")
    Rel(guard, provider, "Extracts", "User from request")
    Rel(guard, service, "Checks", "Has permission")
    Rel(service, cache, "Queries", "Cached permissions")
    Rel(service, db, "Queries", "User roles")
```

## Dual-Provider Support

The RBAC system supports two authentication providers with different permission resolution strategies:

### Custom JWT Provider

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Guard as EnhancedPermissionsGuard

    Client->>API: Request with JWT
    API->>Guard: canActivate()
    Guard->>Guard: Extract user from request
    Note over Guard: Check embedded permissions
    Guard->>Guard: user.permissions.includes(required)
    alt Permissions embedded
        Guard->>API: true
    else No permissions
        Guard->>API: throw ForbiddenException
    end
    API->>Client: Response
```

**Characteristics:**

- Permissions embedded in JWT access token
- No cache lookup required
- Faster authorization (single token validation)
- Token size increases with permission count

**JWT Payload Structure:**

```typescript
{
  "sub": "user-123",
  "tenant_id": "tenant-456",
  "actor_id": "user-123",
  "roles": ["tenant_admin"],
  "permissions": [
    "tenant:users:read",
    "tenant:users:create",
    "tenant:users:update"
  ]
}
```

### Firebase/Google Identity Platform Provider

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant Guard as EnhancedPermissionsGuard
    participant Cache as Redis
    participant Service as CachedPermissionService

    Client->>API: Request with Firebase JWT
    API->>Guard: canActivate()
    Guard->>Guard: Extract user from request
    Note over Guard: Check perm_version
    Guard->>Service: getUserPermissions(userId, tenantId)
    Service->>Cache: GET permissions:{userId}:{tenantId}:{permVersion}
    Cache-->>Service: Permission array
    Service-->>Guard: Permission array
    Guard->>Guard: permissions.includes(required)
    alt Has permission
        Guard->>API: true
    else Missing permission
        Guard->>API: throw ForbiddenException
    end
    API->>Client: Response
```

**Characteristics:**

- Permissions stored in Redis cache
- `perm_version` in token for cache invalidation
- Requires cache lookup on each request
- Smaller token size (permissions not embedded)

**Firebase Custom Claims Structure:**

```typescript
{
  "sub": "firebase-uid-123",
  "tenant_id": "tenant-456",
  "actor_id": "firebase-uid-123",
  "roles": ["tenant_admin"],
  "perm_version": "v1"
}
```

## Authorization Flow

### Complete Request Flow

```mermaid
flowchart TD
    Start([Client Request]) --> Auth[JwtAuthGuard]
    Auth -->|Valid JWT| Extract[Extract User Context]
    Auth -->|Invalid JWT| Unauthorized[401 Unauthorized]

    Extract --> Guard[EnhancedPermissionsGuard]
    Guard --> Check{Required Permissions?}

    Check -->|No permissions| Allow[Allow Access]
    Check -->|Has permissions| CheckType{Permission Type}

    CheckType -->|Embedded| Validate[Validate Embedded]
    CheckType -->|Cached| Resolve[Resolve from Cache]

    Validate -->|All present| Allow
    Validate -->|Missing| Forbidden[403 Forbidden]

    Resolve --> Cache{Cache Hit?}
    Cache -->|Hit| ValidateCached
    Cache -->|Miss| Forbidden

    ValidateCached -->|Has all| Allow
    ValidateCached -->|Missing| Forbidden

    Allow --> Handler[Execute Handler]
    Handler --> Response([Return Response])

    style Start fill:#51cf66
    style Response fill:#51cf66
    style Unauthorized fill:#ff6b6b
    style Forbidden fill:#ff6b6b
```

### Permission Resolution Logic

```mermaid
flowchart TD
    Start([EnhancedPermissionsGuard.canActivate]) --> GetReflector[Get Required Permissions from Reflector]
    GetReflector --> CheckRequired{Required Permissions?}
    CheckRequired -->|None| ReturnTrue[Return true]
    CheckRequired -->|Has permissions| GetUser[Get user from request]

    GetUser --> ValidateUser{User exists?}
    ValidateUser -->|No| ThrowForbidden[Throw ForbiddenException]
    ValidateUser -->|Yes| GetContext[Get tenantId from context]

    GetContext --> CheckType{Permissions in token?}
    CheckType -->|Yes - Embedded| CheckEmbedded[Check embedded permissions]
    CheckType -->|No - Cached| CheckCached[Check cached permissions]

    CheckEmbedded --> AllPresent{All required present?}
    AllPresent -->|Yes| ReturnTrue2[Return true]
    AllPresent -->|No| ThrowMissing[Throw Forbidden - Missing permissions]

    CheckCached --> GetUserPermissions[Get user permissions from cache]
    GetUserPermissions --> AllCached{All required in cache?}
    AllCached -->|Yes| ReturnTrue3[Return true]
    AllCached -->|No| ThrowCached[Throw Forbidden - Missing permissions]

    style Start fill:#a5d8ff
    style ReturnTrue fill:#51cf66
    style ReturnTrue2 fill:#51cf66
    style ReturnTrue3 fill:#51cf66
    style ThrowForbidden fill:#ff6b6b
    style ThrowMissing fill:#ff6b6b
    style ThrowCached fill:#ff6b6b
```

## Permission Model

### Permission Format

Permissions follow a hierarchical format:

```
{scope}:{resource}:{action}
```

**Components:**

| Part       | Description               | Values                                     |
| ---------- | ------------------------- | ------------------------------------------ |
| `scope`    | Permission scope          | `system`, `tenant`                         |
| `resource` | Entity being operated on  | `tenants`, `users`, `projects`, `settings` |
| `action`   | Operation being performed | `create`, `read`, `update`, `delete`       |

### Scope Types

```mermaid
mindmap
  root((RBAC Scopes))
    system(System Scope)
      description["Cross-tenant permissions"]
      granted_to["System roles"]
      examples["system:tenants:create"]
      examples["system:users:read"]
      examples["system:system:monitor"]
    tenant(Tenant Scope)
      description["Tenant-scoped permissions"]
      granted_to["Tenant roles"]
      examples["tenant:users:create"]
      examples["tenant:projects:read"]
      examples["tenant:settings:update"]
```

**System Permissions** (`system:*`):

- Apply across all tenants
- Granted to users with system roles
- Used for administrative operations

**Tenant Permissions** (`tenant:*`):

- Apply within a specific tenant
- Granted to users with tenant roles
- Used for tenant-scoped operations

### Permission Hierarchy

```mermaid
graph TD
    subgraph System Permissions
        S1[system:tenants:create]
        S2[system:tenants:read]
        S3[system:tenants:update]
        S4[system:tenants:delete]
        S5[system:users:create]
        S6[system:users:read]
    end

    subgraph Tenant Permissions
        T1[tenant:settings:update]
        T2[tenant:users:create]
        T3[tenant:users:read]
        T4[tenant:users:update]
        T5[tenant:users:delete]
        T6[tenant:projects:create]
        T7[tenant:projects:read]
        T8[tenant:projects:update]
        T9[tenant:projects:delete]
    end

    style S1 fill:#ff6b6b
    style S2 fill:#ffd43b
    style S3 fill:#ffd43b
    style S4 fill:#ff6b6b
    style T2 fill:#a5d8ff
    style T4 fill:#a5d8ff
    style T5 fill:#ff6b6b
```

## Defense in Depth

The RBAC system implements defense-in-depth with authorization checks at multiple layers:

```mermaid
flowchart LR
    Request[HTTP Request] --> Controller[Controller Guards]
    Controller --> Service[Service Handlers]
    Service --> Repository[Repository Authorization]
    Repository --> Database[(Database)]

    style Request fill:#f8f9fa
    style Database fill:#e7f5ff
```

### Layer 1: Controller Guards

**Purpose:** First line of defense - reject unauthorized requests early

**Implementation:** `EnhancedPermissionsGuard`

```typescript
@Controller('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, EnhancedPermissionsGuard)
export class UsersController {
  @RequirePermissions(TENANT_PERMISSIONS.USERS_READ)
  findAll() {
    return this.usersService.findAll();
  }
}
```

### Layer 2: Service Handlers

**Purpose:** Business logic authorization - validate permissions for operations

**Implementation:** Permission checks in command/query handlers

```typescript
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand) {
    // Authorization check
    const hasPermission = await this.permissionService.hasPermission(
      command.actorId,
      command.tenantId,
      TENANT_PERMISSIONS.USERS_CREATE
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Business logic
    return await this.repository.create(command.data);
  }
}
```

### Layer 3: Repository Authorization

**Purpose:** Data-layer defense - prevent unauthorized data access

**Implementation:** Authorization methods in repositories

```typescript
@Injectable()
export class UserRepository extends BaseRepository {
  async delete(id: number, userContext?: RepositoryUserContext) {
    // Authorization check before deletion
    await this.authorizeDelete(userContext, id);

    return await this.db.delete(users).where(eq(users.id, id));
  }

  private async authorizeDelete(
    userContext: RepositoryUserContext | undefined,
    targetUserId: number
  ): Promise<void> {
    if (!userContext) return;

    const { userId, tenantId } = userContext;

    // Rule 1: Self-access
    if (userId === targetUserId.toString()) return;

    // Rule 2: Tenant permission
    const hasPermission = await this.permissionService.hasPermission(
      parseInt(userId),
      parseInt(tenantId),
      TENANT_PERMISSIONS.USERS_DELETE
    );

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}
```

### Authorization Comparison

```mermaid
graph LR
    subgraph Layer1["Layer 1: Controller"]
        C1["Fast rejection<br/>No business logic"]
    end

    subgraph Layer2["Layer 2: Service"]
        S1["Business logic validation<br/>Context-aware"]
    end

    subgraph Layer3["Layer 3: Repository"]
        R1["Data access control<br/>Direct-to-data defense"]
    end

    Request[Request] --> C1
    C1 -->|Pass| S1
    S1 -->|Pass| R1
    R1 -->|Pass| DB[(Database)]

    C1 -->|Fail| F1[403]
    S1 -->|Fail| F2[403]
    R1 -->|Fail| F3[403]

    style Request fill:#f8f9fa
    style DB fill:#e7f5ff
    style F1 fill:#ff6b6b
    style F2 fill:#ff6b6b
    style F3 fill:#ff6b6b
```

## Configuration

### Environment Variables

```bash
# Authentication Provider
AUTH_PROVIDER=custom-jwt  # Options: custom-jwt, google-identity-platform

# Custom JWT Provider
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Firebase/Google Identity Platform
GCP_PROJECT_ID=your-project
GCP_API_KEY=your-api-key
GCP_TENANT_ID=your-tenant

# Redis (for Firebase permission caching)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Module Configuration

```typescript
import { AuthModule } from '@package/auth';

@Module({
  imports: [
    AuthModule.forRoot({
      provider: 'custom-jwt', // or 'google-identity-platform'
      jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN
      },
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
      }
    })
  ]
})
export class AppModule {}
```

## Next Steps

- [Permissions Reference](./permissions.md) - Complete permission list
- [Roles](./roles.md) - Role hierarchy and mapping
- [Guards](./guards.md) - EnhancedPermissionsGuard details
- [Decorators](./decorators.md) - Using RBAC decorators
- [Repository-Level](./repository-level.md) - Data-layer authorization
- [Testing](./testing.md) - Testing RBAC features
