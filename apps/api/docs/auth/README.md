# Authentication Documentation

Documentation for the `@package/auth` package used by the API.

These pages describe the current implementation where noted; design notes and
examples should be checked against the source and tests before production use.

## Table of Contents

1. [Overview](./overview.md) - What is the auth package and how it works
2. [Quick Start](./quick-start.md) - Get started in 5 minutes
3. [Configuration](./configuration.md) - Environment variables and module setup
4. [Guards](./guards.md) - Using authentication and authorization guards
5. [Decorators](./decorators.md) - Available decorators and examples
6. [Multi-Tenancy](./multi-tenancy.md) - How tenant ID is handled in tokens
7. [Testing](./testing.md) - How to test with mock provider

## Quick Links

### Getting Started

- [Overview](./overview.md) - Learn about the auth architecture
- [Quick Start](./quick-start.md) - Get started in 5 minutes
- [Configuration](./configuration.md) - Set up your environment

### Core Concepts

- [Guards Usage](./guards.md) - JwtAuthGuard, RolesGuard, PermissionsGuard
- [Decorators Reference](./decorators.md) - @Public, @Roles, @RequirePermissions, @User
- [Multi-Tenancy](./multi-tenancy.md) - Tenant context in tokens

### Advanced

- [Testing](./testing.md) - Test with mock provider

## Common Tasks

### Protect a Route

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@package/auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  @Get('profile')
  getProfile() {
    return { message: 'Protected' };
  }
}
```

### Create a Public Route

```typescript
import { Public } from '@package/auth';

@Public()
@Post('login')
login() {
  return { message: 'Public' };
}
```

### Require Specific Role

```typescript
import { Roles } from '@package/auth';

@Roles('admin')
@Delete('users/:id')
deleteUser() {
  return { message: 'Admin only' };
}
```

### Require Specific Permission

```typescript
import { RequirePermissions } from '@package/auth';

@RequirePermissions('users:write')
@Post('users')
createUser() {
  return { message: 'Requires users:write' };
}
```

### Extract User Information

```typescript
import { User, TenantId, ActorId } from '@package/auth';

@Get('posts')
getPosts(@User() user: any, @TenantId() tenantId: string, @ActorId() actorId: string) {
  return this.postsService.findByTenant(tenantId);
}
```

## Features

### Authentication

- **JWT Validation** - Verify JWT tokens on every request
- **Multiple Providers** - Custom JWT, Google OAuth, Google Identity Platform, and Keycloak
- **Token Refresh** - Refresh access tokens with rotation
- **Token Blacklisting** - Blacklist tokens on logout

### Authorization

- **Role-Based Access Control (RBAC)** - Use `@Roles()` decorator
- **Permission-Based Access Control** - Use `@RequirePermissions()` decorator
- **Guards** - JwtAuthGuard, RolesGuard, PermissionsGuard
- **Public Routes** - Use `@Public()` decorator

### Multi-Tenancy

- **Tenant-Scoped Tokens** - JWT includes `tenant_id` claim
- **Tenant-Prefixed Redis Keys** - All keys are tenant-scoped
- **Tenant Isolation** - Guaranteed tenant separation at all layers

### Developer Experience

- **Type-Safe** - Full TypeScript support
- **Decorators** - Declarative authentication and authorization
- **Mock Provider** - Test without external dependencies
- **OpenTelemetry Integration** - Built-in tracing and metrics

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         API Layer                            │
├─────────────────────────────────────────────────────────────┤
│  Controllers (@UseGuards, @Roles, @RequirePermissions)      │
│  Decorators (@User, @TenantId, @ActorId)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         Guards                               │
├─────────────────────────────────────────────────────────────┤
│  JwtAuthGuard  →  RolesGuard  →  PermissionsGuard          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Auth Service                             │
├─────────────────────────────────────────────────────────────┤
│  Provider Factory  →  Selected Provider    →  JWT Service     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
├─────────────────────────────────────────────────────────────┤
│  Auth Provider    →  Redis (Token Storage)                  │
└─────────────────────────────────────────────────────────────┘
```

## Package Structure

```
@package/auth/
├── providers/
│   ├── auth-provider.interface.ts
│   ├── base-auth-provider.ts
│   ├── factory.ts
│   └── keycloak.provider.ts
├── services/
│   ├── auth.service.ts
│   ├── jwt.service.ts
│   └── token.service.ts
├── guards/
│   ├── jwt-auth.guard.ts
│   ├── roles.guard.ts
│   └── permissions.guard.ts
├── decorators/
│   ├── public.decorator.ts
│   ├── roles.decorator.ts
│   ├── permissions.decorator.ts
│   └── user.decorator.ts
├── strategies/
│   └── jwt.strategy.ts
├── config/
│   └── auth-config.ts
├── types/
│   ├── auth.types.ts
│   ├── jwt.types.ts
│   └── user.types.ts
└── auth.module.ts
```

## Documentation References

### API Documentation

- [API Overview](../README.md) - API documentation index
- [Testing Guide](../testing/e2e-testing-guide.md) - Testing with Testcontainers
- [CQRS](./cqrs.md) - CQRS patterns in the auth module

### Root Documentation

- Configure the provider using the environment variables documented in [Configuration](./configuration.md).
- [Packages Documentation](../../../../README.md#packages-documentation) - All packages

### Standards

- [Security Standards](../../../../.agents/standards/security.md) - Security best practices
- [Backend Standards](../../../../.agents/standards/backend.md) - API and NestJS patterns

## Support

### Issues

For issues or questions about the auth package:

1. Check the documentation in this folder
2. Review the package README at `packages/auth/README.md`
3. Check the provider configuration guide in this directory

### Contributing

When contributing to the auth package:

1. Follow existing patterns and conventions
2. Add tests for new features
3. Update documentation
4. Ensure multi-tenancy is maintained

**Next Steps:**

- New to auth? Start with [Overview](./overview.md)
- Ready to code? Check out [Quick Start](./quick-start.md)
- Need configuration details? See [Configuration](./configuration.md)
