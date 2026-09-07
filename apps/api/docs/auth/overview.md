# Authentication Overview

The Node Monorepo Boilerplate uses `@package/auth` to provide enterprise-grade authentication with multiple auth providers, JWT token management, role-based access control (RBAC), and multi-tenant support.

## What is @package/auth?

`@package/auth` is a comprehensive authentication infrastructure package that provides:

- **Multiple Auth Providers**: Custom JWT, Google OAuth, Google Identity Platform, and Keycloak
- **JWT Token Management**: Validation, verification, and refresh with rotation
- **Redis Token Storage**: Refresh token storage, blacklisting, and session management
- **NestJS Guards**: JwtAuthGuard, RolesGuard, PermissionsGuard
- **NestJS Decorators**: @Public, @Roles, @RequirePermissions, @User, @ActorId
- **Multi-Tenant Support**: Tenant-scoped tokens and sessions
- **OpenTelemetry Integration**: Built-in tracing and metrics
- **Mock Provider**: Testing without external dependencies

## Architecture

### Multi-Provider Pattern

The package uses a factory pattern to support multiple auth providers:

1. **Provider Interface** - `IAuthProvider` defines the contract
2. **Provider Factory** - Creates and manages provider instances
3. **Provider Implementations** - Custom JWT, Google OAuth, Google Identity Platform, and Keycloak
4. **Base Provider** - Common functionality with OpenTelemetry metrics

### Token Flow

```
1. User Login
   ├─> Credentials sent to auth provider (Keycloak)
   ├─> Provider validates and returns tokens
   └─> Tokens stored in Redis (if enabled)

2. Access Token (JWT)
   ├─> Contains: user_id, tenant_id, actor_id, roles, permissions
   ├─> Validated on each request by JwtAuthGuard
   └─> Short-lived (e.g., 15 minutes)

3. Refresh Token
   ├─> Stored in Redis with tenant prefix
   ├─> Used to get new access token
   └─> Long-lived (e.g., 30 days) with rotation support
```

### Multi-Tenancy

Tokens include a `tenant_id` claim, and all Redis keys are tenant-prefixed:

```typescript
// JWT payload includes tenant_id
interface JwtPayload {
  sub: string;           // User ID
  tenant_id: string;     // Tenant ID
  actor_id: string;      // Actor ID (user performing action)
  roles: string[];       // User roles
  permissions: string[]; // User permissions
  // ... other claims
}

// Redis keys are tenant-scoped
auth:refresh:{tenantId}:{tokenId}  // Refresh token
auth:session:{tenantId}:{sessionId} // Session
auth:blacklist:access:{tenantId}:{tokenId} // Blacklisted access token
```

## Key Features

### 1. JWT Authentication

JWT tokens are validated on every protected request using Passport-JWT strategy:

- Token signature verification
- Expiration validation
- Issuer validation
- Claim extraction (user, tenant, roles, permissions)

### 2. Role-Based Access Control (RBAC)

Use `@Roles()` decorator to restrict access to specific roles:

```typescript
@Roles('admin', 'moderator')
@Delete('users/:id')
deleteUser() {
  // Only users with 'admin' or 'moderator' role can access
}
```

### 3. Permission-Based Access Control

Use `@RequirePermissions()` decorator for fine-grained control:

```typescript
@RequirePermissions('users:write', 'users:delete')
@Delete('users/:id')
deleteUser() {
  // Only users with both permissions can access
}
```

### 4. Token Storage and Rotation

Refresh tokens are stored in Redis with:

- **Token Rotation**: Old tokens revoked on refresh
- **Access Token Blacklisting**: Blacklist tokens on logout
- **Session Management**: Track active tokens per user
- **Tenant Isolation**: All keys tenant-prefixed

### 5. Guards

| Guard              | Purpose                 | Usage                |
| ------------------ | ----------------------- | -------------------- |
| `JwtAuthGuard`     | JWT authentication      | All protected routes |
| `RolesGuard`       | Role-based access       | Admin-only routes    |
| `PermissionsGuard` | Permission-based access | Fine-grained control |

### 6. Decorators

| Decorator                  | Purpose                                  |
| -------------------------- | ---------------------------------------- |
| `@Public()`                | Mark route as public (no auth)           |
| `@Roles(...)`              | Require specific roles                   |
| `@RequirePermissions(...)` | Require specific permissions             |
| `@User()`                  | Get full user object                     |
| `@User('field')`           | Get specific field from user             |
| `@TenantId()`              | Get tenant ID from JWT                   |
| `@ActorId()`               | Get actor ID from JWT (for audit trails) |

## Next Steps

- [Quick Start Guide](./quick-start.md) - Get started in 5 minutes
- [Configuration Guide](./configuration.md) - Environment variables and module setup
- [Guards Usage](./guards.md) - How to use auth guards
- [Decorators Reference](./decorators.md) - Available decorators and examples
- [Multi-Tenancy](./multi-tenancy.md) - How tenant ID is handled in tokens
- [Testing](./testing.md) - How to test with mock provider
