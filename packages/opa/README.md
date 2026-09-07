# @package/opa

Enterprise-grade Open Policy Agent (OPA) integration for NestJS providing declarative, policy-based authorization, fail-closed security enforcement, and high-performance in-memory decision caching.

## Overview

`@package/opa` connects NestJS applications with Open Policy Agent (OPA) to enforce fine-grained, externalized authorization policies. It features compile-time route decorators (`@Resource`, `@Action`), fail-closed guards (`OpaGuard`, `OpaCachedGuard`), structured input payload serialization, configurable query timeouts, and multi-tenant authorization policies.

## Features

- **OPA HTTP Client** - High-throughput service querying OPA authorization decisions over HTTP
- **Fail-Closed Security** - Enforces default-deny access control on network timeouts or evaluation errors
- **Route Authorization Guards** - `OpaGuard` for standard evaluation and `OpaCachedGuard` for high-traffic endpoints
- **Declarative Decorators** - Method and controller decorators (`@Resource` and `@Action`) to bind routes to policies
- **Input Validation** - Validates and normalizes user context, roles, permissions, and resource metadata
- **Configurable Timeouts & Retries** - Resilient HTTP configuration preventing slow policy evaluations from blocking requests
- **Multi-Tenant Isolation** - Native support for organization and tenant isolation checks
- **Hierarchical Permission Strings** - Full support for `scope:resource:action` permission formats

## Installation

This package is part of the enterprise starter monorepo.

```bash
pnpm add @package/opa
```

## Quick Start

### 1. Module Setup

```typescript
import { Module } from '@nestjs/common';
import { OpaModule } from '@package/opa';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    OpaModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        url: config.get('OPA_URL', 'http://localhost:8181'),
        policyPath: config.get('OPA_POLICY_PATH', '/v1/data/authz/allow'),
        timeout: config.get('OPA_TIMEOUT', 5000)
      })
    })
  ]
})
export class AppModule {}
```

### 2. Protect Routes

```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { OpaGuard, Resource, Action } from '@package/opa';
import { JwtAuthGuard } from '@package/auth';

@Controller('organizations')
@UseGuards(JwtAuthGuard, OpaGuard)
@Resource({ type: 'organization', scope: 'tenant' })
export class OrganizationsController {
  @Get()
  @Action('list')
  findAll() {
    return this.organizationService.findAll();
  }

  @Post()
  @Action('create')
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(dto);
  }
}
```

### 3. OPA Policy

Create a Rego policy at `packages/opa/policies/authz/authorization.rego`:

```rego
package authz

import future.keywords.contains
import future.keywords.if
import future.keywords.in

default allow = false

# System roles bypass
allow if {
  "system_admin" in input.user.system_roles
}

allow if {
  "system_owner" in input.user.system_roles
}

# Tenant role checks with organization isolation
allow if {
  "tenant_admin" in input.user.tenant_roles
  input.user.organization_id == input.resource.organization_id
}

# Permission-based authorization with scope:resource:action format
allow if {
  perm := input.user.permissions[_]
  [scope, resource, action] := parse_permission(perm)
  scope == input.resource.scope
  resource == input.resource.type
  action == input.action
}
```

## Role System

### System Roles (Cross-Tenant)

| Role           | Permissions                | Use Case               |
| -------------- | -------------------------- | ---------------------- |
| `system_owner` | Full platform control      | Platform founders, CTO |
| `system_admin` | Limited system permissions | DevOps, support staff  |

### Tenant Roles (Organization-Scoped)

| Role            | Permissions         | Use Case              |
| --------------- | ------------------- | --------------------- |
| `tenant_owner`  | Full tenant control | Organization founder  |
| `tenant_admin`  | Tenant management   | Team leads, IT admin  |
| `tenant_user`   | Standard access     | Regular team members  |
| `tenant_viewer` | Read-only access    | External stakeholders |

## Permission Format

### New Format: `scope:resource:action`

- `system:tenants:read` - Read all tenants
- `system:users:create` - Create users across system
- `tenant:projects:update` - Update projects in tenant

### Legacy Format: `resource:action` (Backward Compatible)

- `tenants:read` - Read tenants
- `users:create` - Create users

## Scope Options

### `system` Scope

For cross-tenant resources:

```typescript
@Controller('admin/tenants')
@Resource('tenants', { scope: 'system' })
export class TenantsAdminController {
  @Get()
  @Action('list')
  listAllTenants() { ... }
}
```

### `tenant` Scope (Default)

For organization-scoped resources:

```typescript
@Controller('projects')
@Resource('projects', { scope: 'tenant' })
export class ProjectsController {
  @Get()
  @Action('list')
  listProjects() { ... }
}
```

## API Reference

### Module

- `OpaModule.forRoot(options)` - Synchronous configuration
- `OpaModule.forRootAsync(options)` - Async configuration (recommended)

### Guards

- `OpaGuard` - Standard authorization guard
- `OpaCachedGuard` - Cached authorization for high-traffic endpoints

### Decorators

- `@Resource(type, options?)` - Specify resource type and scope
- `@Action(action)` - Specify action (create, read, update, delete, etc.)

### Service

- `OpaService.isAuthorized(request)` - Check authorization programmatically

### Types

- `IAuthzRequest` - Authorization request structure
- `IAuthzResponse` - Authorization response structure
- `IOpaModuleOptions` - Module configuration options

## Environment Variables

| Variable          | Description          | Default                 |
| ----------------- | -------------------- | ----------------------- |
| `OPA_URL`         | OPA server URL       | `http://localhost:8181` |
| `OPA_POLICY_PATH` | Policy document path | `/v1/data/authz/allow`  |
| `OPA_TIMEOUT`     | Request timeout (ms) | `5000`                  |

## Running Tests

```bash
# Run OPA policy tests
opa test packages/opa/policies/ -v

# Run TypeScript unit tests
pnpm test --filter @package/opa
```

## Security Considerations

1. **Fail-Closed**: Always denies access on errors
2. **Default Deny**: Policies must explicitly allow access
3. **Tenant Isolation**: Enforced by default for tenant-scoped resources
4. **Audit Logging**: Log all authorization decisions
5. **Timeout**: Prevents indefinite waits on OPA failures
