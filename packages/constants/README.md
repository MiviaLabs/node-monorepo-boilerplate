# @package/constants

Type-safe, immutable application constants, domain models, error classifications, and configuration standards for TypeScript monorepos.

## Overview

`@package/constants` centralizes shared constants across all backend services, libraries, and tools. Built with TypeScript `as const` assertions, every value preserves literal types, delivering compile-time validation, intelligent IDE autocompletion, and zero runtime performance overhead.

## Key Features

- **Error Taxonomy**: RFC-compliant HTTP status codes, structured application error codes, and standardized error classifications.
- **Domain Modeling**: Enums and constants for user roles, tenant roles, lifecycle statuses, pagination defaults, time spans, and entity constraints.
- **Environment & Feature Flags**: Standard runtime environment definitions, feature toggles, and multi-region identifiers.
- **API & Networking**: Standardized HTTP headers, MIME types, rate limit presets, and network timeout specifications.
- **Strict Typing**: Full compile-time literal inference with companion type exports for easy union generation.

## Installation

```bash
pnpm add @package/constants
```

## Quick Start

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

// Literal type inference
const status = HTTP_STATUS.OK; // 200
const defaultLimit = PAGINATION.DEFAULT_LIMIT; // 20

// Derive union types directly from constants
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type HttpStatusCode = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];
```

## Submodules & Available Constants

Constants can be imported from the package root `@package/constants` or directly from targeted subpaths:

### 1. Error Constants (`@package/constants/errors`)

Provides consistent error codes and HTTP mapping across all microservices and API gateways.

```typescript
import { HTTP_STATUS, ERROR_CODES, ERROR_TYPE } from '@package/constants/errors';

if (!entity) {
  throw new NotFoundException({
    code: ERROR_CODES.RESOURCE_NOT_FOUND,
    status: HTTP_STATUS.NOT_FOUND,
    type: ERROR_TYPE.NOT_FOUND
  });
}
```

- **`HTTP_STATUS`**: Standard HTTP response codes (e.g. `OK: 200`, `BAD_REQUEST: 400`, `UNAUTHORIZED: 401`, `FORBIDDEN: 403`, `NOT_FOUND: 404`, `INTERNAL_SERVER_ERROR: 500`).
- **`ERROR_CODES`**: Domain-prefixed error identifiers (e.g. `AUTH_INVALID_CREDENTIALS`, `VALIDATION_FAILED`, `DB_QUERY_FAILED`).
- **`ERROR_TYPE`**: High-level categorization (e.g. `ValidationError`, `AuthenticationError`, `ConflictError`).
- **`ERROR_MESSAGES`**: Baseline user-facing diagnostic messages.

### 2. Domain Constants (`@package/constants/domain`)

Defines domain standards, access control roles, and data constraints.

```typescript
import {
  USER_ROLE,
  USER_STATUS,
  PAGINATION,
  LIMITS,
  TIME
} from '@package/constants/domain';

const user = {
  role: USER_ROLE.ADMIN,
  status: USER_STATUS.ACTIVE
};

// Safe pagination limits
const page = requestedPage || PAGINATION.DEFAULT_PAGE;
const limit = Math.min(requestedLimit || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);

// Standardized durations (in milliseconds)
const cacheTTL = 15 * TIME.MINUTE;
```

- **Roles & Permissions**: `USER_ROLE`, `TENANT_ROLE`, `SYSTEM_ROLE`, `PERMISSIONS`, `ROLE_PERMISSIONS`.
- **Statuses**: `USER_STATUS`, `ORGANIZATION_STATUS`, `ENTITY_STATUS`.
- **Pagination & Sorting**: `PAGINATION` (`DEFAULT_PAGE`, `DEFAULT_LIMIT`, `MAX_LIMIT`), `SORT_ORDER` (`ASC`, `DESC`).
- **Time & Durations**: `TIME` (`SECOND`, `MINUTE`, `HOUR`, `DAY`, `WEEK`, `YEAR` in milliseconds).
- **Domain Limits**: `LIMITS` (maximum payload sizes, string lengths, collection sizes).
- **Tenant Isolation**: `TENANT_ISOLATION` modes and configuration keys.

### 3. Environment Constants (`@package/constants/environment`)

Manages deployment environments, cloud regions, and system-wide feature flags.

```typescript
import { ENVIRONMENT, FEATURE_FLAGS, REGIONS } from '@package/constants/environment';

if (process.env.NODE_ENV === ENVIRONMENT.PRODUCTION) {
  // Production security configuration
}

if (FEATURE_FLAGS.MULTI_TENANCY) {
  // Multi-tenant routing
}
```

- **`ENVIRONMENT`**: `DEVELOPMENT`, `STAGING`, `PRODUCTION`, `TEST`.
- **`FEATURE_FLAGS`**: System feature flag names.
- **`REGIONS`**: Supported multi-region cloud deployment zones.

### 4. API & Network Constants (`@package/constants/api`)

Standardizes communication protocols and transport-layer configurations.

```typescript
import { API_HEADERS, CONTENT_TYPES, RATE_LIMITS, TIMEOUTS } from '@package/constants/api';

const headers = {
  [API_HEADERS.CONTENT_TYPE]: CONTENT_TYPES.JSON,
  [API_HEADERS.X_REQUEST_ID]: requestId
};

const fetchOptions = {
  headers,
  signal: AbortSignal.timeout(TIMEOUTS.REQUEST)
};
```

- **`API_HEADERS`**: Standard and custom headers (`AUTHORIZATION`, `CONTENT_TYPE`, `X_TENANT_ID`, `X_REQUEST_ID`, etc.).
- **`CONTENT_TYPES`**: MIME formats (`JSON`, `HTML`, `FORM_DATA`, `OCTET_STREAM`).
- **`RATE_LIMITS`**: Per-route and per-role request limits.
- **`TIMEOUTS`**: Standardized millisecond timeouts for requests, database queries, and network I/O.

## Package Architecture

```text
src/
├── address-types.ts         # Address format and localization constants
├── api/                     # HTTP, headers, rate limits, timeouts
├── domain/                  # Domain status, roles, permissions, time, limits
├── environment/             # Environments, feature toggles, cloud regions
├── errors/                  # HTTP status codes, error codes, categories
└── index.ts                 # Main barrel export
```

## Development & Testing

```bash
# Build
pnpm nx build constants

# Execute unit tests
pnpm nx test constants

# Lint code
pnpm nx lint constants
```

## Associated Packages

- [`@package/types`](../types) – Shared TypeScript interfaces and CQRS types
- [`@package/schema`](../schema) – Validation schemas utilizing these constants
- [`@package/errors`](../errors) – Framework error handlers and localization
