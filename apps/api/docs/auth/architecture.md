# Auth Module Architecture

This document details the architectural design of the auth module, including module structure, providers, services, and integration points.

## Table of Contents

- [Overview](#overview)
- [Module Structure](#module-structure)
- [Controllers](#controllers)
- [Services and Repositories](#services-and-repositories)
- [CQRS Architecture](#cqrs-architecture)
- [External Dependencies](#external-dependencies)
- [Configuration](#configuration)
- [Security Architecture](#security-architecture)

## Overview

The auth module is a comprehensive authentication and authorization system built on NestJS with CQRS pattern, multi-tenancy support, and GCP Identity Platform integration.

**Key Features:**

- Email/password authentication
- Multi-provider OAuth (Google, Microsoft, Apple, LinkedIn, GitHub, Facebook)
- Phone number authentication
- Multi-tenant isolation
- Identity linking/unlinking
- Token management (JWT + refresh tokens)
- Session management
- Account lifecycle (GDPR compliance)

## Module Structure

```
modules/auth/
├── controllers/
│   ├── auth.controller.ts           # Authentication endpoints
│   └── account.controller.ts        # Account management endpoints
├── commands/
│   ├── register.command.ts          # User registration
│   ├── login.command.ts             # Email/password login
│   ├── login-with-oauth.command.ts  # OAuth login
│   ├── login-with-phone.command.ts  # Phone login
│   ├── refresh-token.command.ts     # Token refresh
│   ├── logout.command.ts            # User logout
│   ├── link-identity.command.ts     # Link provider
│   ├── unlink-identity.command.ts   # Unlink provider
│   ├── delete-account.command.ts    # Account deletion
│   └── export-user-data.command.ts  # GDPR data export
├── queries/
│   ├── get-user-session.query.ts    # Get user sessions
│   ├── list-user-identities.query.ts # List linked identities
│   └── validate-token.query.ts      # Validate JWT token
├── events/
│   ├── user-registered.event.ts     # User registered
│   ├── user-logged-in.event.ts      # User logged in
│   ├── user-logged-out.event.ts     # User logged out
│   ├── token-refreshed.event.ts     # Token refreshed
│   ├── identity-linked.event.ts     # Identity linked
│   └── identity-unlinked.event.ts   # Identity unlinked
├── handlers/
│   ├── commands/                    # Command handlers
│   ├── queries/                     # Query handlers
│   ├── consumers/                   # Event consumers
│   └── jobs/                        # Background jobs
├── repositories/
│   ├── auth.repository.ts           # User data access
│   ├── user-identity.repository.ts  # Identity data access
│   └── organization.repository.ts   # Organization data access
├── services/
│   └── auth.service.ts              # Core auth business logic
├── guards/
│   ├── jwt-auth.guard.ts            # JWT authentication guard
│   ├── public.decorator.ts          # Public endpoint marker
│   └── can-delete-user.guard.ts     # Account deletion guard
├── decorators/
│   └── index.ts                     # Custom decorators
├── dto/
│   ├── login.dto.ts                 # Login request
│   ├── register.dto.ts              # Registration request
│   ├── auth-response.dto.ts         # Auth response
│   ├── refresh-token.dto.ts         # Token refresh request
│   ├── session.dto.ts               # Session response
│   └── user-identity.dto.ts         # Identity response
├── jobs/
│   └── purge-soft-deleted-accounts.job.ts # Account purge job
├── auth.module.ts                   # Module definition
├── auth.service.ts                  # Main service
├── auth.constants.ts                # Module constants
└── auth.types.ts                    # Type definitions
```

## Controllers

### AuthController

**Routes:** `/api/v1/auth`

**Endpoints:**

| Method | Path                 | Auth     | Description                  |
| ------ | -------------------- | -------- | ---------------------------- |
| POST   | `/register`          | Public   | Register new user            |
| POST   | `/login`             | Public   | Login with email/password    |
| POST   | `/login/oauth`       | Public   | Login with OAuth provider    |
| POST   | `/login/phone`       | Public   | Login with phone             |
| POST   | `/refresh`           | Public   | Refresh access token         |
| POST   | `/logout`            | Required | Logout user                  |
| POST   | `/identities/link`   | Required | Link identity provider       |
| POST   | `/identities/unlink` | Required | Unlink identity provider     |
| GET    | `/identities`        | Required | Get user's linked identities |
| GET    | `/sessions`          | Required | Get user's active sessions   |
| POST   | `/validate`          | Public   | Validate access token        |

**Dependencies:**

- `CommandBus` - Execute commands
- `QueryBus` - Execute queries

**Design Notes:**

- Controller is thin - delegates to command/query bus
- Uses `@Public()` decorator for public endpoints
- Extracts tenant context from `x-tenant-id` header
- Captures IP address and User-Agent for audit logging

### AccountController

**Routes:** `/api/v1/auth/account`

**Endpoints:**

| Method | Path          | Auth     | Description         |
| ------ | ------------- | -------- | ------------------- |
| DELETE | `/:id`        | Required | Delete user account |
| GET    | `/:id/export` | Required | Export user data    |

**Guards:**

- `CanDeleteUserGuard` - Validates user can delete account (self or org owner)

**GDPR Compliance:**

- Export includes: user profile, identities, organization membership
- Deletion supports soft delete with purge job

## Services and Repositories

### AuthService

**Purpose:** Central service for authentication business logic

**Key Responsibilities:**

1. **Email/Password Authentication**
   - Validates user credentials via GCP Identity Platform
   - Returns JWT tokens (access, refresh, ID)
   - Updates last sign-in timestamp

2. **OAuth Authentication**
   - Validates OAuth tokens via GCP Identity Platform
   - Handles new user registration or existing user login
   - Syncs provider profile to local database

3. **User Registration**
   - Creates organization (if new tenant) with GCP tenant
   - Provisions user in GCP Identity Platform
   - Creates user and identity records in database
   - ATOMIC: All steps succeed or fail together (rollback on error)

4. **Token Management**
   - Refreshes access tokens via GCP
   - Validates tokens via GCP
   - Revokes tokens on logout

5. **Identity Management**
   - Links additional providers to user account
   - Unlinks providers (with validation)
   - Prevents unlinking primary identity

**Dependencies:**

- `IAuthProvider` - GCP Identity Platform integration (via `@package/auth`)
- `AuthRepository` - User data access
- `UserIdentityRepository` - Identity data access
- `OrganizationRepository` - Organization data access
- `TenantManagementService` - Tenant provisioning
- `CacheService` - Redis caching
- `OutboxRepository` - Event publishing

**Design Patterns:**

- **Lazy Provider Loading:** Auth provider is resolved on first use (not in constructor)
- **Transactional Outbox:** Events published within database transaction
- **Distributed Locking:** Redis lock for registration to prevent race conditions
- **Synchronous Provisioning:** GCP tenant/user created synchronously (not async)
- **Rollback on Failure:** GCP resources deleted if database transaction fails

### AuthRepository

**Purpose:** Data access layer for user management

**Key Methods:**

- `findByEmail(tenantId, email)` - Find user by email (tenant-scoped)
- `findById(tenantId, userId)` - Find user by ID (tenant-scoped)
- `findWithOrganizationByEmail(email)` - Find user with organization data
- `createWithEmail(tenantId, email, data)` - Create user
- `createOrganizationForUser(email, orgName, gcpTenantId)` - Create organization
- `setOrganizationOwnerInTransaction(tx, orgId, userId)` - Set org owner

**Tenant Isolation:**

- All queries include `WHERE organization_id = ?` filter
- Composite indexes on `(organization_id, column)` for performance

### UserIdentityRepository

**Purpose:** Data access layer for identity provider management

**Key Methods:**

- `findByProviderAndUid(provider, providerUid)` - Find identity by provider
- `findByUserId(userId)` - Get all identities for user
- `create(data)` - Create identity record
- `updateLastSignIn(identityId)` - Update last sign-in timestamp
- `delete(identityId)` - Delete identity
- `countByUserId(userId)` - Count user's identities
- `userHasProvider(userId, provider)` - Check if user has provider

**Schema:**

- `provider` - Provider name (google.com, microsoft.com, email_password)
- `provider_uid` - Provider's unique ID for user
- `provider_email_hash` - SHA-256 hash of email for indexed lookups
- `display_name` - Display name from provider
- `photo_url` - Avatar URL from provider
- `email_verified` - Email verification status
- `is_primary` - Primary identity flag
- `last_sign_in_at` - Last login timestamp

## CQRS Architecture

The auth module follows CQRS (Command Query Responsibility Segregation) pattern:

### Commands (Write Operations)

**RegisterCommand:**

- Validates tenant (if provided)
- Creates organization with GCP tenant (if new)
- Provisions GCP user synchronously
- Creates user and identity in database
- Publishes `user.registered` event

**LoginCommand:**

- Validates credentials via GCP
- Updates last sign-in timestamp
- Publishes `user.logged_in` event
- Returns JWT tokens

**RefreshTokenCommand:**

- Validates refresh token via GCP
- Returns new access token
- Publishes `token.refreshed` event

**LogoutCommand:**

- Revokes tokens via GCP
- Publishes `user.logged_out` event

**LinkIdentityCommand:**

- Validates identity not already linked
- Creates identity record
- Publishes `identity.linked` event

**UnlinkIdentityCommand:**

- Validates identity exists and not primary
- Deletes identity record
- Publishes `identity.unlinked` event

### Queries (Read Operations)

**GetUserSessionQuery:**

- Returns active sessions for user

**ListUserIdentitiesQuery:**

- Returns all linked identities for user

**ValidateTokenQuery:**

- Validates JWT token via GCP
- Returns user information

### Event Handlers

**UserRegisteredGcpProvisionConsumer:**

- Consumes `user.registered` events
- Currently no async provisioning (handled synchronously)
- Kept for future async operations

**PurgeSoftDeletedAccountsHandler:**

- Background job to permanently delete soft-deleted accounts
- Runs on schedule (configurable interval)

## External Dependencies

### GCP Identity Platform

**Integration:** `@package/auth` package

**Provider Interface:**

```typescript
interface IAuthProvider {
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;
  getUserInfoFromToken(token: string): Promise<UserInfo>;
  refreshToken(refreshToken: string): Promise<AuthResult>;
  validateToken(token: string): Promise<ValidationResult>;
  logout(refreshToken: string, accessToken?: string): Promise<void>;
}
```

**Features Used:**

- Multi-tenant isolation (GCP tenant ID per organization)
- Email/password authentication
- OAuth token validation
- Token refresh/revocation
- User provisioning (Firebase Admin SDK)
- Tenant provisioning (Firebase Admin SDK)

### Redis (via @package/redis)

**Use Cases:**

- Distributed locking (registration race conditions)
- Session storage (future)
- Token blacklist (future)
- Rate limiting (future)

**Cache Keys:**

- `lock:register:{emailHash}` - Registration lock
- `auth:sessions:user:{userId}` - User sessions (future)
- `auth:refresh:{tokenId}` - Refresh tokens (future)

### BullMQ (via @package/queues)

**Job Types:**

- `purge-soft-deleted-accounts` - Account purge job

**Configuration:**

- Queue name: `auth`
- Retry strategy: Exponential backoff
- Max retries: 3

### Transactional Outbox (via @package/events)

**Events Published:**

- `user.registered` - User registration completed
- `user.logged_in` - User logged in
- `user.logged_out` - User logged out
- `token.refreshed` - Access token refreshed
- `identity.linked` - Identity provider linked
- `identity.unlinked` - Identity provider unlinked
- `organization.owner.assigned` - Organization owner set

**Pattern:**

1. Command handler performs database operation in transaction
2. Event inserted into outbox table within same transaction
3. Outbox processor publishes events to RabbitMQ
4. Event consumers process events asynchronously

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=<secure-secret-key>              # Min 32 chars
JWT_EXPIRES_IN=1h                           # Access token TTL
JWT_REFRESH_EXPIRES_IN=14d                  # Refresh token TTL

# GCP Identity Platform
GOOGLE_CLOUD_PROJECT=<project-id>
GOOGLE_APPLICATION_CREDENTIALS=<path-to-key-json>

# Tenant Configuration
TENANT_HEADER_NAME=x-tenant-id              # Tenant header name

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=auth:                      # Cache key prefix

# Queue Configuration
QUEUE_REDIS_URL=redis://localhost:6379
QUEUE_PREFIX=bullmq:                        # Queue prefix

# Account Purge Job
PURGE_SOFT_DELETED_ACCOUNTS_CRON=0 2 * * *  # Daily at 2 AM
PURGE_SOFT_DELETED_ACCOUNTS_RETENTION_DAYS=30
```

### Constants (auth.constants.ts)

**AUTH_PROVIDERS:**

- `GOOGLE: 'google.com'`
- `MICROSOFT: 'microsoft.com'`
- `APPLE: 'apple.com'`
- `LINKEDIN: 'linkedin.com'`
- `GITHUB: 'github.com'`
- `FACEBOOK: 'facebook.com'`
- `PHONE: 'phone'`
- `EMAIL_PASSWORD: 'email_password'`

**TOKEN_EXPIRATION:**

- `ACCESS_TOKEN: 3600` (1 hour)
- `REFRESH_TOKEN: 1209600` (14 days)
- `ID_TOKEN: 3600` (1 hour)

**PASSWORD_REQUIREMENTS:**

- `MIN_LENGTH: 8`
- `REQUIRE_UPPERCASE: true`
- `REQUIRE_LOWERCASE: true`
- `REQUIRE_NUMBER: true`
- `REQUIRE_SPECIAL: true`

**RATE_LIMITS:**

- `LOGIN_ATTEMPTS: 5`
- `LOGIN_WINDOW: 900` (15 minutes)
- `REGISTRATION_ATTEMPTS: 3`
- `REGISTRATION_WINDOW: 3600` (1 hour)

**AUTH_ERROR_CODES:**

- `INVALID_CREDENTIALS: 'AUTH_001'`
- `USER_NOT_FOUND: 'AUTH_002'`
- `IDENTITY_NOT_FOUND: 'AUTH_003'`
- `TOKEN_INVALID: 'AUTH_005'`
- `TOKEN_EXPIRED: 'AUTH_006'`
- `REFRESH_TOKEN_INVALID: 'AUTH_007'`
- `IDENTITY_ALREADY_LINKED: 'AUTH_013'`
- `CANNOT_UNLINK_PRIMARY_IDENTITY: 'AUTH_014'`

## Security Architecture

### Authentication Flow

1. **Public Endpoints:** No authentication required
   - `/register` - User registration
   - `/login` - Email/password login
   - `/login/oauth` - OAuth login
   - `/login/phone` - Phone login
   - `/refresh` - Token refresh
   - `/validate` - Token validation

2. **Protected Endpoints:** JWT authentication required
   - All other endpoints require `Authorization: Bearer <token>` header
   - `JwtAuthGuard` validates token via GCP Identity Platform
   - Token must be valid and not expired

### Authorization Flow

1. **User Level:** Basic authentication
   - User can access own profile
   - User can manage own identities
   - User can export own data

2. **Organization Owner:** Enhanced permissions
   - Can delete organization (deletes all users)
   - Can manage organization settings
   - Can delete other users in organization

3. **Guards:**
   - `CanDeleteUserGuard` - Validates user can delete account

### Multi-Tenancy Isolation

1. **Tenant Context:**
   - Extracted from `x-tenant-id` header
   - Validated on every request
   - Attached to all commands/queries

2. **Database Isolation:**
   - All tables have `organization_id` column
   - All queries scoped to tenant: `WHERE organization_id = ?`
   - Composite indexes: `(organization_id, column)`

3. **GCP Isolation:**
   - Each organization has unique GCP tenant ID
   - Users provisioned within tenant scope
   - Token validation includes tenant context

### Token Security

1. **JWT Tokens:**
   - Issued by GCP Identity Platform
   - Signed with RS256 algorithm
   - Short TTL (1 hour for access tokens)
   - Include user ID, tenant ID, roles, permissions

2. **Refresh Tokens:**
   - Long-lived (14 days)
   - Stored securely (not in database)
   - Rotated on use (optional)
   - Revoked on logout

3. **Token Validation:**
   - Verified via GCP Identity Platform
   - Signature validation
   - Expiration check
   - Tenant context validation

### PII Protection

1. **Email Storage:**
   - Hashed with SHA-256 for indexed lookups
   - Not stored in plaintext (use GCP token email)

2. **Password Storage:**
   - Never stored locally
   - Handled entirely by GCP Identity Platform
   - Meets NIST password guidelines

3. **Audit Logging:**
   - All auth events published to outbox
   - Includes actor ID, IP address, user agent
   - Immutable event log for SOC2 compliance

## Module Registration

```typescript
@Module({
  imports: [
    CqrsModule,
    PassportModule,
    TenantsModule,
    RedisModule,
    QueuesModule.forRoot(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') || '1h'
        }
      })
    }),
    InfrastructureAuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        providers: [googleIdentityPlatformAuthConfig({ default: true })]
      })
    })
  ],
  controllers: [AuthController, AccountController],
  providers: [
    // Repositories
    AuthRepository,
    UserIdentityRepository,
    OrganizationRepository,

    // Services
    AuthService,

    // Guards
    CanDeleteUserGuard,

    // Command handlers
    RegisterHandler,
    LoginHandler,
    LoginWithOAuthHandler,
    LoginWithPhoneHandler,
    LinkIdentityHandler,
    UnlinkIdentityHandler,
    LogoutHandler,
    RefreshTokenHandler,
    DeleteAccountHandler,
    ExportUserDataHandler,

    // Query handlers
    GetUserSessionHandler,
    ListUserIdentitiesHandler,
    ValidateTokenHandler,

    // Event consumers
    UserRegisteredGcpProvisionConsumer,

    // Job handlers
    PurgeSoftDeletedAccountsHandler,
    PurgeSoftDeletedAccountsJob
  ],
  exports: [AuthService, AuthRepository, UserIdentityRepository, OrganizationRepository]
})
export class AuthModule {}
```

## Documentation References

- [Authentication Flows](./flows.md) - Detailed authentication flow diagrams
- [Configuration](./configuration.md) - Environment and configuration setup
- [Guards](./guards.md) - Authentication and authorization guards
- [Decorators](./decorators.md) - Custom decorators for auth
- [Multi-Tenancy](./multi-tenancy.md) - Multi-tenant architecture
- [Testing](./testing.md) - Testing strategies and examples
- [Quick Start](./quick-start.md) - Getting started guide
