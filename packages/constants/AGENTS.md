# @package/constants

Type-safe, immutable application constants, error codes, status codes, and domain configurations for the platform monorepo.

## Purpose

The `@package/constants` package provides single-source-of-truth constants used across all backend microservices, libraries, and applications. Every constant uses TypeScript `as const` assertions for precise literal type inference, enabling compile-time verification, IDE autocompletion, and zero-overhead runtime access.

## Structure

```text
src/
├── address-types.ts         # Address format and country/region types
├── api/                     # HTTP and network protocol constants
│   ├── content-types.ts     # Standard MIME types
│   ├── headers.ts           # Standard and custom HTTP header names
│   ├── rate-limits.ts       # Rate limiting defaults and thresholds
│   ├── timeouts.ts          # Network, connection, and execution timeouts
│   └── index.ts
├── domain/                  # Core domain and business model constants
│   ├── entity-status.ts     # Generic entity lifecycle states
│   ├── limits.ts            # Input validation and business rule limits
│   ├── organization-status.ts # Organization account statuses
│   ├── organization-types.ts  # Organization classifications
│   ├── pagination.ts        # Pagination defaults and bounds
│   ├── permissions.ts       # Granular system and resource permissions
│   ├── role-permissions.ts  # Role-to-permission mapping defaults
│   ├── sorting.ts           # Sort order directions and parameters
│   ├── system-roles.ts      # Global system administrator roles
│   ├── tenant-isolation.ts  # Multi-tenancy isolation policies
│   ├── tenant-roles.ts      # Tenant-scoped user roles
│   ├── time.ts              # Millisecond durations, date formats, timezones
│   ├── user-roles.ts        # Standard application user roles
│   ├── user-status.ts       # User account lifecycle states
│   └── index.ts
├── environment/             # Deployment and operational environment constants
│   ├── env.ts               # Environment names (development, staging, production, test)
│   ├── features.ts          # Feature flag keys
│   ├── regions.ts           # Cloud provider deployment regions
│   └── index.ts
├── errors/                  # Error classification and status constants
│   ├── error-codes.ts       # Standardized application error identifiers
│   ├── error-messages.ts    # Default human-readable error messages
│   ├── error-types.ts       # Categorized error type identifiers
│   ├── http-status.ts       # Standard RFC HTTP status codes
│   └── index.ts
└── index.ts                 # Unified public export barrel
```

## Key Exports

### Error & HTTP Constants (`@package/constants/errors` or `@package/constants`)
- `HTTP_STATUS` – Standard HTTP status codes (`OK: 200`, `CREATED: 201`, `BAD_REQUEST: 400`, `UNAUTHORIZED: 401`, `NOT_FOUND: 404`, `INTERNAL_SERVER_ERROR: 500`, etc.)
- `ERROR_CODES` – Categorized error codes across domains (`AUTH_*`, `VALIDATION_*`, `DB_*`, `NETWORK_*`, etc.)
- `ERROR_TYPE` – High-level error classification taxonomy (`ValidationError`, `AuthenticationError`, `NotFoundError`, etc.)
- `ERROR_MESSAGES` – Default user-facing error text mapped by code

### Domain Constants (`@package/constants/domain` or `@package/constants`)
- `USER_ROLE` / `TENANT_ROLE` / `SYSTEM_ROLE` – Typed role definitions for RBAC and ABAC
- `USER_STATUS` / `ORGANIZATION_STATUS` / `ENTITY_STATUS` – Lifecycle status enumerations
- `ORGANIZATION_TYPE` – Supported organizational categories
- `PERMISSIONS` / `ROLE_PERMISSIONS` – Granular permission identifiers and default role matrices
- `PAGINATION` – Pagination defaults (`DEFAULT_PAGE: 1`, `DEFAULT_LIMIT: 20`, `MAX_LIMIT: 100`)
- `SORT_ORDER` – Standard ascending and descending ordering strings
- `TIME` – Time duration constants in milliseconds (`SECOND`, `MINUTE`, `HOUR`, `DAY`, `WEEK`, etc.)
- `LIMITS` – String length bounds, upload size limits, and security constraints
- `TENANT_ISOLATION` – Isolation modes and multi-tenancy configuration keys

### Environment Constants (`@package/constants/environment` or `@package/constants`)
- `ENVIRONMENT` – Deployment environments (`development`, `staging`, `production`, `test`)
- `FEATURE_FLAGS` – System feature toggle identifiers
- `REGIONS` – Supported deployment regions

### API Constants (`@package/constants/api` or `@package/constants`)
- `API_HEADERS` – Standard and custom HTTP headers (`CONTENT_TYPE`, `AUTHORIZATION`, `X_TENANT_ID`, `X_REQUEST_ID`, etc.)
- `CONTENT_TYPES` – MIME content type strings (`JSON`, `FORM_DATA`, `OCTET_STREAM`, etc.)
- `RATE_LIMITS` – Default rate limit quotas by endpoint category
- `TIMEOUTS` – Standard timeout durations in milliseconds for requests, database queries, and external services

## Usage

```typescript
import {
  HTTP_STATUS,
  ERROR_CODES,
  USER_ROLE,
  PAGINATION,
  ENVIRONMENT,
  API_HEADERS,
  CONTENT_TYPES,
  TIME
} from '@package/constants';

// Type inference with as const
const status = HTTP_STATUS.OK; // Type: 200
const defaultLimit = PAGINATION.DEFAULT_LIMIT; // Type: 20

// Derive union types from constants
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
```

## Development Commands

```bash
# Build package with Nx
pnpm nx build constants

# Run unit tests
pnpm nx test constants

# Lint code
pnpm nx lint constants
```

## Guidelines

- All constants must use `as const` assertions for literal type preservation.
- Export derived TypeScript union types alongside constant objects when consumers require typing.
- Use `UPPER_SNAKE_CASE` for object keys and constant identifiers.
- Keep constants grouped by domain and single-purpose.
- Avoid circular dependencies between submodules.
