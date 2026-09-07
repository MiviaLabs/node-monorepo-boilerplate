# @package/auth

Enterprise authentication and authorization infrastructure featuring multi-provider federation, JWT token lifecycle management, and role-based access control for NestJS applications.

## Purpose

The `@package/auth` package provides a unified authentication and authorization layer for backend services:

- **Multi-Provider Identity Federation**: Production integrations with Keycloak, Google Identity Platform, Google OAuth 2.0, and standalone Custom JWT engines.
- **JWT Lifecycle & Security**: Access and refresh token generation, signature validation, Redis-backed revocation, and automatic secret rotation.
- **Granular Access Control**: Role-Based Access Control (RBAC) and Permission-Based Access Control (PBAC) with high-performance Redis caching.
- **Multi-Tenancy Support**: Tenant-scoped identity verification, tenant role enforcement, and isolated Redis session partitions.
- **Observability**: OpenTelemetry tracing hooks and authentication audit metrics.

## Structure

```text
src/
├── config/                         # Configuration interfaces and resolvers
│   ├── auth-config.ts              # Auth module configuration builders
│   ├── config-resolver.ts          # Environment-based config resolution
│   ├── defaults.ts                 # Production default values
│   └── interfaces.ts               # Configuration type definitions
├── decorators/                     # NestJS routing and parameter decorators
│   ├── permissions.decorator.ts    # @RequirePermissions, @CanCreate, etc.
│   ├── public.decorator.ts         # @Public bypass guard decorator
│   ├── require-system-role.decorator.ts
│   ├── require-tenant-role.decorator.ts
│   ├── roles.decorator.ts          # @Roles, @RequireAdmin, etc.
│   └── user.decorator.ts           # @User, @UserId, @TenantId, @ActorId
├── errors/                         # Error mappers and taxonomy
│   ├── firebase-error.mapper.ts    # Identity Platform error translation
│   ├── google-error.mapper.ts      # Google OAuth error translation
│   ├── internal-token-validation-error.ts
│   └── keycloak-error.mapper.ts    # Keycloak error translation
├── guards/                         # NestJS execution guards
│   ├── enhanced-permissions.guard.ts
│   ├── enhanced-roles.guard.ts
│   ├── jwt-auth.guard.ts           # Bearer token validation
│   ├── permissions.guard.ts        # Permission enforcement
│   └── roles.guard.ts              # Role enforcement
├── providers/                      # Identity provider implementations
│   ├── auth-provider.interface.ts  # IAuthProvider contract
│   ├── base-auth-provider.ts       # Common provider telemetry and error handling
│   ├── custom-jwt.provider.ts      # Self-contained JWT authentication
│   ├── factory.ts                  # Provider instantiation factory
│   ├── google-identity-platform.provider.ts # GCP Identity Platform (Firebase Admin)
│   ├── google.provider.ts          # Google OAuth 2.0
│   └── keycloak.provider.ts        # Keycloak OpenID Connect
├── repositories/                   # Storage abstraction contracts
│   └── user-repository.interface.ts
├── services/                       # Business logic services
│   ├── auth.service.ts             # Primary authentication facade
│   ├── cached-permission.service.ts# Redis-cached permissions
│   ├── cached-role.service.ts      # Redis-cached roles
│   ├── jwt.service.ts              # Token encoding and verification
│   ├── key-rotation.service.ts     # Secret and signing key rotation
│   ├── permission.service.ts       # Permission lookup and validation
│   ├── role.service.ts             # Role lookup and validation
│   ├── token-usage-tracking.service.ts
│   └── token.service.ts            # Token storage and revocation
├── strategies/                     # Passport authentication strategies
│   └── jwt.strategy.ts             # Passport JWT strategy implementation
├── types/                          # TypeScript type declarations
│   ├── auth.types.ts
│   ├── jwt.types.ts
│   ├── permissions.types.ts
│   └── user.types.ts
├── utils/                          # Key builders and token extractors
│   ├── redis-key-builder.ts
│   └── token-info-extractor.ts
├── validators/                     # Configuration and secret validators
│   └── jwt-secret.validator.ts
├── auth.module.ts                  # NestJS Dynamic Module
├── constants.ts                    # Module constants
├── telemetry.ts                    # OpenTelemetry instrumentation
└── index.ts                        # Unified public export barrel
```

## Usage

### NestJS Module Registration

```typescript
import { Module } from '@nestjs/common';
import {
  AuthModule,
  keycloakAuthConfig,
  googleIdentityPlatformAuthConfig
} from '@package/auth';

@Module({
  imports: [
    AuthModule.forRoot({
      providers: [
        keycloakAuthConfig({ default: true })
      ],
      jwt: {
        secretOrKey: process.env.JWT_SECRET
      }
    })
  ]
})
export class AppModule {}
```

### Controller Protection & Context Extraction

```typescript
import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import {
  JwtAuthGuard,
  RolesGuard,
  EnhancedPermissionsGuard,
  Public,
  Roles,
  RequirePermissions,
  User,
  UserId,
  TenantId,
  type AuthenticatedUser
} from '@package/auth';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard, EnhancedPermissionsGuard)
export class OrganizationsController {
  @Get('public-info')
  @Public()
  getPublicInfo() {
    return { status: 'online' };
  }

  @Get('current')
  @Roles('admin', 'manager')
  getCurrentOrg(@TenantId() tenantId: string, @User() user: AuthenticatedUser) {
    return { tenantId, user };
  }

  @Post('settings')
  @RequirePermissions('org:settings:write')
  updateSettings(@UserId() userId: string, @Body() data: Record<string, unknown>) {
    return { updatedBy: userId, data };
  }
}
```

## Key Exports

### Module & Configuration
- `AuthModule` – NestJS dynamic module providing `forRoot` and `forRootAsync`.
- `keycloakAuthConfig()`, `googleIdentityPlatformAuthConfig()` – Fluent configuration helpers.

### Guards & Interceptors
- `JwtAuthGuard` – Validates JWT Bearer tokens and attaches the user payload to the request.
- `RolesGuard` / `EnhancedRolesGuard` – Enforces role hierarchy with Redis cache support.
- `PermissionsGuard` / `EnhancedPermissionsGuard` – Verifies granular resource permissions.

### Decorators
- `@Public()` – Exempts endpoints from authentication.
- `@Roles(...roles)` / `@RequireAdmin()` / `@RequireUser()` – Role requirement decorators.
- `@RequirePermissions(...permissions)` / `@CanCreate()` / `@CanRead()` – Permission requirement decorators.
- `@User()` / `@UserId()` / `@TenantId()` / `@ActorId()` – Parameter decorators for request extraction.

### Core Services
- `AuthService` – Unified authentication coordinator across configured providers.
- `JwtService` – Cryptographic signing, verification, and decoding.
- `TokenService` – Session lifecycle, blacklist tracking, and refresh rotation.
- `CachedPermissionService` / `CachedRoleService` – Distributed permission/role evaluation with Redis.
- `KeyRotationService` – Automated secret rotation and grace period management.

### Identity Providers
- `KeycloakProvider` – OpenID Connect integration for Keycloak realms.
- `GoogleIdentityPlatformProvider` – Firebase Admin SDK enterprise identity provider.
- `GoogleProvider` – Standard Google OAuth 2.0 provider.
- `CustomJwtAuthProvider` – Local password and JWT verification provider.

## Development Commands

```bash
# Build package
pnpm nx build auth

# Run unit tests
pnpm nx test auth

# Run integration tests
pnpm nx test:integration auth

# Lint package
pnpm nx lint auth
```

## Associated Packages

- [`@package/constants`](../constants) – System roles, tenant roles, and permission constants.
- [`@package/redis`](../redis) – Distributed cache backend for session and permission storage.
- [`@package/encryption`](../encryption) – Cryptographic key management and encryption.
- [`@package/db-core`](../db-core) – User entity tables and identity relations.
