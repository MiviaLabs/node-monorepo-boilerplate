# Authorization Reference

> Reference documentation only. The executable authorization policy is
> the Rego source and tests under
> [`packages/opa/policies/authz/`](../../packages/opa/policies/authz/).
> Changes to this document do not change authorization behavior. Update
> it only after the Rego policy and tests are reviewed.

## Overview

This document describes the authorization model for the MiviaLabs
platform. Authorization is enforced by Open Policy Agent (OPA) via
Rego policies under `packages/opa/policies/authz/`.

The model is role-based access control (RBAC) with these properties:

- **Dual role system.** System-wide roles and tenant-scoped roles.
- **Role hierarchy.** Roles can inherit from other roles.
- **Fine-grained permissions.** Resource-action pairs with conditions.
- **Tenant isolation.** Multi-tenant isolation by default with a system
  bypass for platform operators.
- **Attribute-based conditions.** Dynamic policy evaluation from
  request context.

## Architecture

```
Request -> JWT Auth -> OPA Guard -> Controller
          (who)       (can they)     (action)
```

1. JWT authentication validates identity and extracts roles and claims.
2. OPA evaluates policies for the resource and action.
3. The controller executes only if OPA allows.

---

## Roles

### System Roles

System roles grant permissions across all tenants. Stored in the
`user_roles` table.

| Role           | Description         | Permissions                                                      |
| -------------- | ------------------- | ---------------------------------------------------------------- |
| `system_owner` | Full system control | `*` (all)                                                        |
| `system_admin` | System operations   | `tenants:*`, `users:read`, `organizations:read`, `policies:read` |

System users bypass tenant isolation.

### Tenant Roles

Tenant roles grant permissions within a specific tenant. Stored in the
`user_tenants` table.

| Role            | Description         | Permissions                                                               |
| --------------- | ------------------- | ------------------------------------------------------------------------- |
| `tenant_owner`  | Full tenant control | `users:*`, `organizations:*`, `projects:*`                                |
| `tenant_admin`  | Tenant operations   | `users:*`, `organizations:*`, `projects:*` (no delete)                    |
| `tenant_user`   | Standard access     | `users:read`, `organizations:read`, `projects:read`, `projects:write:own` |
| `tenant_viewer` | Read-only           | `users:read`, `organizations:read`, `projects:read`                       |

Hierarchy:

```
tenant_owner
  └─ tenant_admin
      └─ tenant_user

tenant_viewer (separate, no inheritance)
```

Inherited permissions accumulate. Users can have different roles in
different tenants.

---

## Resource Policies

### Users

| Action   | Allowed Roles                                | Conditions       |
| -------- | -------------------------------------------- | ---------------- |
| `read`   | System owner, System admin, All tenant roles | Tenant isolation |
| `write`  | System owner, Tenant owner, Tenant admin     | Tenant isolation |
| `delete` | System owner, Tenant owner                   | Tenant isolation |

### Organizations

| Action  | Allowed Roles                                | Conditions       |
| ------- | -------------------------------------------- | ---------------- |
| `read`  | System owner, System admin, All tenant roles | Tenant isolation |
| `write` | System owner, Tenant owner, Tenant admin     | Tenant isolation |

### Projects

| Action   | Allowed Roles                                         | Conditions                    |
| -------- | ----------------------------------------------------- | ----------------------------- |
| `read`   | System owner, System admin, All tenant roles          | Tenant isolation              |
| `write`  | System owner, Tenant owner, Tenant admin, Tenant user | Tenant isolation OR ownership |
| `delete` | System owner, Tenant owner                            | Tenant isolation              |

Tenant users can only write their own projects (the `ownership`
condition).

### Tenants (System Resource)

| Action  | Allowed Roles              | Conditions |
| ------- | -------------------------- | ---------- |
| `read`  | System owner, System admin | None       |
| `write` | System owner               | None       |

### Policies (System Resource)

| Action  | Allowed Roles                            | Conditions |
| ------- | ---------------------------------------- | ---------- |
| `read`  | System owner, System admin, Tenant owner | None       |
| `write` | System owner                             | None       |

---

## Permission Format

Permissions use the format `<resource>:<action>[:<scope>]`.

| Format                | Example              | Description               |
| --------------------- | -------------------- | ------------------------- |
| `resource:action`     | `users:read`         | Read any user                 |
| `resource:action:own` | `projects:write:own` | Write only owned resource   |
| `*`                   | `*`                  | All permissions (owner only) |

---

## Evaluation Order

1. Default deny if no policy explicitly allows.
2. Role check: does the user have any allowed role, including inherited?
3. Condition check: do all conditions match?
4. Decision: allow if all checks pass, deny otherwise.

---

## Multi-Tenancy

| User type                                     | Behavior                                       |
| --------------------------------------------- | ---------------------------------------------- |
| System roles (`system_owner`, `system_admin`) | Bypass isolation, access all tenants            |
| Tenant roles                                  | Enforced isolation, same-tenant data only        |

OPA input includes tenant context from the request:

```json
{
  "user": {
    "id": "user-123",
    "system_roles": [],
    "tenant_roles": ["tenant_admin"],
    "organization_id": "org-456"
  },
  "resource": {
    "type": "users",
    "id": "user-789",
    "organization_id": "org-456"
  },
  "action": "read"
}
```

---

## Condition Types

### `tenant_isolation`

User and resource must belong to the same organization. System roles
bypass this check.

### `ownership`

User owns the resource (`input.user.id == input.resource.id`).

### `role`

User has the role, including inherited roles.

### `permission`

User has the permission. Wildcard `*` grants all permissions.

### `attribute`

User attribute matches an expected value.

---

## Role Inheritance

```
tenant_owner
  ├─ tenant_admin
  │   └─ tenant_user
  └─ (inherits tenant_admin permissions)

tenant_viewer (separate, no inheritance)
```

Resolution:

1. Get the user's direct roles.
2. Walk the hierarchy transitively.
3. Collect all permissions from all roles.
4. Allow if any required role is in the set.

Example: a user with `tenant_admin` role has the direct role
`tenant_admin` plus the inherited `tenant_user`. Their permissions
include everything both roles grant.

---

## Examples

### Tenant user reads own profile (same org)

```json
{
  "user": { "id": "user-001", "system_roles": [], "tenant_roles": ["tenant_user"], "organization_id": "org-123" },
  "resource": { "type": "users", "id": "user-001", "organization_id": "org-123" },
  "action": "read"
}
```

Result: allow. Role match, same organization, no ownership required.

### Tenant user reads another user (same org)

```json
{
  "user": { "id": "user-001", "system_roles": [], "tenant_roles": ["tenant_user"], "organization_id": "org-123" },
  "resource": { "type": "users", "id": "user-002", "organization_id": "org-123" },
  "action": "read"
}
```

Result: allow. Role match, same organization.

### Tenant admin reads any user (same org)

Result: allow. `tenant_admin` is in allowed roles, same organization.

### System admin reads cross-tenant

```json
{
  "user": { "id": "system-admin-001", "system_roles": ["system_admin"], "tenant_roles": [], "organization_id": null },
  "resource": { "type": "users", "id": "user-002", "organization_id": "org-456" },
  "action": "read"
}
```

Result: allow. System role bypasses tenant isolation.

### Tenant user attempts cross-tenant access

Result: deny. Different organizations, no system bypass.

### Tenant user writes own project

```json
{
  "user": { "id": "user-001", "system_roles": [], "tenant_roles": ["tenant_user"], "organization_id": "org-123" },
  "resource": { "type": "projects", "id": "project-abc", "owner_id": "user-001", "organization_id": "org-123" },
  "action": "write"
}
```

Result: allow. Role match, same organization, owner matches.

---

## Type Definitions

### Role Types

```typescript
// packages/types/src/domain/role.types.ts
export type RBACRole =
  | SystemRole   // system_owner, system_admin
  | TenantRole;  // tenant_owner, tenant_admin, tenant_user, tenant_viewer

export const enum RoleScope {
  SYSTEM = 'system',
  TENANT = 'tenant'
}
```

### OPA Input Schema

```typescript
interface AuthzRequest {
  user: {
    id: string;
    system_roles: string[];
    tenant_roles: string[];
    organization_id: string | null;
    permissions?: string[];
    attributes?: Record<string, unknown>;
  };
  resource: {
    type: string;
    id?: string;
    owner_id?: string;
    organization_id?: string;
  };
  action: string;
}
```

---

## NestJS Integration

### Decorator Usage

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { OpaGuard } from '@package/opa';
import { Resource, Action } from '@package/opa/decorators';

@Controller('users')
@UseGuards(JwtAuthGuard, OpaGuard) // Auth first, then authorize
@Resource('users') // Default resource for all endpoints
export class UsersController {
  @Get()
  @Action('read')
  async findAll() {
    // OPA verified: user can read users
  }

  @Get(':id')
  @Action('read')
  async findOne(@Param('id') id: string) {
    // OPA verified: tenant isolation OR ownership
  }

  @Patch(':id')
  @Action('write')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    // OPA verified: tenant_admin or higher, same tenant
  }

  @Delete(':id')
  @Action('delete')
  async remove(@Param('id') id: string) {
    // OPA verified: system_owner or tenant_owner, same tenant
  }
}
```

### Guard Composition Order

```typescript
// Correct order matters
@UseGuards(
  JwtAuthGuard,    // 1. Authenticate: validate JWT, extract user
  OpaGuard         // 2. Authorize: check policy for resource + action
)
```

---

## Testing Policies Locally

### Install OPA CLI

```bash
pnpm opa:check
# if missing:
pnpm opa:install
# installs repo-pinned OPA version
```

### Test a Policy

```bash
opa eval -d packages/opa/policies/authz -i '{
  "user": {
    "id": "user-001",
    "system_roles": [],
    "tenant_roles": ["tenant_user"],
    "organization_id": "org-123"
  },
  "resource": {
    "type": "users",
    "id": "user-001",
    "organization_id": "org-123"
  },
  "action": "read"
}' 'data.authorization.allow'
```

### Start OPA Server

```bash
opa run -s packages/opa/policies/authz
```

### Test with curl

```bash
curl -X POST http://localhost:8181/v1/data/authz/allow \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "user": {
        "id": "user-001",
        "system_roles": [],
        "tenant_roles": ["tenant_user"],
        "organization_id": "org-123"
      },
      "resource": {
        "type": "users",
        "organization_id": "org-123"
      },
      "action": "read"
    }
  }'
```

---

## Adding New Resources

1. Define the resource in `resources.rego`.
2. Add actions with allowed roles.
3. Add conditions (tenant isolation, ownership, etc.).
4. Write tests in `base.test.rego`.
5. Update this document.

### Example: Adding a "Documents" Resource

```rego
"documents": {
    "actions": [
        {
            "action": "read",
            "allowed_roles": ["system_owner", "tenant_owner", "tenant_admin", "tenant_user", "tenant_viewer"],
            "conditions": [{"type": "tenant_isolation"}]
        },
        {
            "action": "write",
            "allowed_roles": ["system_owner", "tenant_owner", "tenant_admin", "tenant_user"],
            "conditions": [{"type": "tenant_isolation"}, {"type": "ownership"}]
        },
        {
            "action": "delete",
            "allowed_roles": ["system_owner", "tenant_owner"],
            "conditions": [{"type": "tenant_isolation"}]
        }
    ]
}
```

---

## Troubleshooting

### Policy Evaluates to False

1. Confirm the OPA input format matches the expected schema.
2. Verify the JWT carries the expected roles in claims.
3. Check the tenant isolation condition.
4. Confirm the resource type matches the policy definition.

### Common Issues

| Issue               | Cause                          | Solution                            |
| ------------------- | ------------------------------ | ----------------------------------- |
| Always denied       | Wrong resource name            | Match `@Resource()` to policy       |
| Cross-tenant access | Missing tenant context         | Ensure `organization_id` in input   |
| Ownership fails     | Missing `owner_id` on resource | Add owner field to resource         |

---

## References

- TypeScript constants: `packages/constants/src/domain/`
- TypeScript types: `packages/types/src/domain/role.types.ts`
- [Rego Language](https://www.openpolicyagent.org/docs/latest/policy-language/)
- [OPA Documentation](https://www.openpolicyagent.org/docs/latest/)