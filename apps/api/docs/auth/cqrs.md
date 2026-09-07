# Auth Module - CQRS Implementation

This document provides a comprehensive overview of the Authentication module's CQRS (Command Query Responsibility Segregation) implementation, including all commands, queries, handlers, and events.

## Table of Contents

- [Overview](#overview)
- [Commands](#commands)
  - [LoginCommand](#logincommand)
  - [RegisterCommand](#registercommand)
  - [LogoutCommand](#logoutcommand)
  - [RefreshTokenCommand](#refreshtokencommand)
  - [LoginWithPhoneCommand](#loginwithphonecommand)
  - [LoginWithOAuthCommand](#loginwithoauthcommand)
  - [LinkIdentityCommand](#linkidentitycommand)
  - [UnlinkIdentityCommand](#unlinkidentitycommand)
  - [DeleteAccountCommand](#deleteaccountcommand)
  - [ExportUserDataCommand](#exportuserdatacommand)
- [Queries](#queries)
  - [ValidateTokenQuery](#validatetokenquery)
  - [GetUserSessionQuery](#getusersessionquery)
  - [ListUserIdentitiesQuery](#listuseridentitiesquery)
- [Events](#events)
  - [UserLoggedInEvent](#userloggedinevent)
  - [UserRegisteredEvent](#userregisteredevent)
  - [TokenRefreshedEvent](#tokenrefreshedevent)
  - [UserLoggedOutEvent](#userloggedoutevent)
  - [IdentityLinkedEvent](#identitylinkedevent)
  - [IdentityUnlinkedEvent](#identityunlinkedevent)
- [Transactional Outbox Pattern](#transactional-outbox-pattern)
- [Multi-Tenancy Support](#multi-tenancy-support)

## Overview

The Auth module follows the CQRS pattern to separate write operations (commands) from read operations (queries). All commands and queries include multi-tenancy support via `tenantId` and use the **Transactional Outbox Pattern** for reliable event publishing.

### Key Principles

1. **Commands** - Write operations that modify state (login, register, logout, etc.)
2. **Queries** - Read operations that return data (get session, list identities, etc.)
3. **Events** - Domain events published after successful state changes
4. **Handlers** - Execute command/query logic and publish events
5. **Outbox Pattern** - All events are written to the outbox table within the same transaction

## Commands

Commands represent write operations in the authentication domain. All commands implement the `ICommand` interface from `@package/types`.

### Common Command Properties

All commands include the following properties:

| Property        | Type     | Required | Description                                         |
| --------------- | -------- | -------- | --------------------------------------------------- |
| `tenantId`      | `string` | Yes\*    | Tenant/organization ID (\*optional for public auth) |
| `actorId`       | `string` | No       | User performing the action                          |
| `createdAt`     | `Date`   | Yes      | Command creation timestamp                          |
| `correlationId` | `string` | No       | Correlation ID for distributed tracing              |
| `causationId`   | `string` | No       | Causation ID for event sourcing                     |
| `readonly`      | `true`   | Yes      | Immutability flag (all commands are readonly)       |

### LoginCommand

Authenticates a user with email/password.

**Location:** `src/modules/auth/commands/login.command.ts`

**Properties:**

```typescript
{
  tenantId: string;        // Tenant ID (optional for public auth)
  email: string;           // User email address
  password: string;        // User password (plaintext - hashed by handler)
  ipAddress?: string;      // Client IP address for audit
  userAgent?: string;      // Client user agent for audit
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `LoginHandler` (`src/modules/auth/handlers/commands/login.handler.ts`)

**Business Logic:**

1. Validates email and password are provided
2. Authenticates user via `AuthService.authenticateWithEmailPassword()`
3. Generates session ID
4. Within a database transaction:
   - Updates user's `lastSignInAt` timestamp
   - Publishes `user.logged_in` event to outbox
5. Returns authentication result with tokens and user info

**Events Published:**

- `user.logged_in` (AuthEventType.USER_LOGGED_IN)

**Example:**

```typescript
const command = new LoginCommand({
  tenantId: 'org-123',
  email: 'user@example.com',
  password: 'SecurePass123!',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
});

const result = await commandBus.execute(command);
// Returns: { accessToken, refreshToken, user, isNewUser }
```

### RegisterCommand

Registers a new user with email/password authentication.

**Location:** `src/modules/auth/commands/register.command.ts`

**Properties:**

```typescript
{
  tenantId?: string;           // Tenant ID (undefined for new organization)
  actorId?: string;            // Actor ID (undefined for self-registration)
  email: string;               // User email address
  password: string;            // User password
  displayName?: string;        // User display name
  organizationName?: string;   // Organization name (required if no tenantId)
  ipAddress?: string;          // Client IP address
  userAgent?: string;          // Client user agent
  isVerified: boolean;         // Email verification status (default: true)
  isActive: boolean;           // Account active status (default: true)
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `RegisterHandler` (`src/modules/auth/handlers/commands/register.handler.ts`)

**Business Logic:**

1. If `tenantId` provided:
   - Validates organization exists
   - Checks if organization allows public registration
2. If no `tenantId`:
   - Requires `organizationName`
   - Creates new organization for user
3. Registers user via `AuthService.registerWithEmailPassword()`
4. All operations (user creation, organization creation, GCP provisioning, owner assignment) happen synchronously within a transaction
5. Returns user info and tenant ID

**Events Published:**

- `user.registered` (published by AuthService within transaction)
- `owner.assigned` (if new organization created)

**Example:**

```typescript
// Self-registration (creates new organization)
const command = new RegisterCommand({
  email: 'newuser@example.com',
  password: 'SecurePass123!',
  displayName: 'John Doe',
  organizationName: 'Acme Corp',
  isVerified: true,
  isActive: true
});

const result = await commandBus.execute(command);
// Returns: { user, tenantId, isNewOrganization, gcpTenantId }
```

### LogoutCommand

Logs out a user and invalidates their tokens.

**Location:** `src/modules/auth/commands/logout.command.ts`

**Properties:**

```typescript
{
  tenantId: string;        // Tenant ID
  actorId: string;         // User performing logout
  userId: number;          // User ID to log out
  refreshToken: string;    // Refresh token to invalidate
  accessToken?: string;    // Access token to invalidate (optional)
  ipAddress?: string;      // Client IP address
  userAgent?: string;      // Client user agent
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `LogoutHandler` (`src/modules/auth/handlers/commands/logout.handler.ts`)

**Business Logic:**

1. Validates refresh token
2. Invalidates tokens via `AuthService.logout()`
3. Publishes `user.logged_out` event to outbox
4. Returns success confirmation

**Events Published:**

- `user.logged_out` (AuthEventType.USER_LOGGED_OUT)

**Example:**

```typescript
const command = new LogoutCommand({
  tenantId: 'org-123',
  actorId: 'user-123',
  userId: 123,
  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  ipAddress: '192.168.1.1'
});

await commandBus.execute(command);
```

### RefreshTokenCommand

Refreshes an access token using a refresh token.

**Location:** `src/modules/auth/commands/refresh-token.command.ts`

**Properties:**

```typescript
{
  tenantId: string;        // Tenant ID (optional - extracted from token)
  refreshToken: string;    // Refresh token
  ipAddress?: string;      // Client IP address
  userAgent?: string;      // Client user agent
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `RefreshTokenHandler` (`src/modules/auth/handlers/commands/refresh-token.handler.ts`)

**Business Logic:**

1. Validates refresh token is provided
2. Refreshes token via `AuthService.refreshToken()` (extracts tenantId from JWT)
3. Within a database transaction:
   - Publishes `token.refreshed` event to outbox
4. Returns new access and refresh tokens

**Events Published:**

- `token.refreshed` (AuthEventType.TOKEN_REFRESHED)

**Example:**

```typescript
const command = new RefreshTokenCommand({
  tenantId: 'org-123',
  refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});

const result = await commandBus.execute(command);
// Returns: { accessToken, refreshToken, user }
```

### LoginWithPhoneCommand

Authenticates a user with phone number and verification code.

**Location:** `src/modules/auth/commands/login-with-phone.command.ts`

**Properties:**

```typescript
{
  tenantId: string;           // Tenant ID
  phoneNumber: string;        // Phone number (E.164 format)
  verificationCode: string;   // SMS verification code
  ipAddress?: string;         // Client IP address
  userAgent?: string;         // Client user agent
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `LoginWithPhoneHandler` (`src/modules/auth/handlers/commands/login-with-phone.handler.ts`)

**Business Logic:**

1. Validates phone number and verification code
2. Authenticates user via phone verification
3. Publishes authentication event
4. Returns authentication tokens

**Events Published:**

- `user.logged_in` with `provider: 'phone'`

### LoginWithOAuthCommand

Authenticates a user with OAuth provider (Google, Microsoft, etc.).

**Location:** `src/modules/auth/commands/login-with-oauth.command.ts`

**Properties:**

```typescript
{
  tenantId: string;                   // Tenant ID
  provider: IdentityProvider;         // OAuth provider (google, microsoft, etc.)
  idToken: string;                    // ID token from OAuth provider
  accessToken?: string;               // Access token from OAuth provider
  ipAddress?: string;                 // Client IP address
  userAgent?: string;                 // Client user agent
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `LoginWithOAuthHandler` (`src/modules/auth/handlers/commands/login-with-oauth.handler.ts`)

**Business Logic:**

1. Validates ID token from OAuth provider
2. Extracts user information from token
3. Finds or creates user identity
4. Publishes authentication event
5. Returns authentication tokens

**Events Published:**

- `user.logged_in` with `provider: <oauth-provider>`

### LinkIdentityCommand

Links an additional identity provider to an existing user account.

**Location:** `src/modules/auth/commands/link-identity.command.ts`

**Properties:**

```typescript
{
  tenantId: string;                   // Tenant ID
  actorId: string;                    // User performing the action
  userId: number;                     // User ID to link identity to
  provider: IdentityProvider;         // Identity provider to link
  providerUid: string;                // Provider user ID
  idToken?: string;                   // ID token from provider
  accessToken?: string;               // Access token from provider
  displayName?: string;               // Display name from provider
  photoUrl?: string;                  // Photo URL from provider
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `LinkIdentityHandler` (`src/modules/auth/handlers/commands/link-identity.handler.ts`)

**Business Logic:**

1. Validates user exists and belongs to tenant
2. Checks if identity already linked
3. Links new identity to user account
4. Publishes identity linked event
5. Returns updated identity list

**Events Published:**

- `identity.linked` (AuthEventType.IDENTITY_LINKED)

**Example:**

```typescript
const command = new LinkIdentityCommand({
  tenantId: 'org-123',
  actorId: 'user-123',
  userId: 123,
  provider: 'google',
  providerUid: 'google-user-123',
  displayName: 'John Doe',
  photoUrl: 'https://...'
});

await commandBus.execute(command);
```

### UnlinkIdentityCommand

Unlinks an identity provider from a user account.

**Location:** `src/modules/auth/commands/unlink-identity.command.ts`

**Properties:**

```typescript
{
  tenantId: string;                   // Tenant ID
  actorId: string;                    // User performing the action
  userId: number;                     // User ID
  provider: IdentityProvider;         // Identity provider to unlink
  providerUid: string;                // Provider user ID
  createdAt: Date;
  correlationId?: string;
  causationId?: string;
}
```

**Handler:** `UnlinkIdentityHandler` (`src/modules/auth/handlers/commands/unlink-identity.handler.ts`)

**Business Logic:**

1. Validates user has multiple identities (cannot unlink last identity)
2. Validates identity exists and belongs to user
3. Unlinks identity from user account
4. Publishes identity unlinked event
5. Returns success confirmation

**Events Published:**

- `identity.unlinked` (AuthEventType.IDENTITY_UNLINKED)

### DeleteAccountCommand

Deletes a user account with support for organization cascading.

**Location:** `src/modules/auth/commands/delete-account.command.ts`

**Properties:**

```typescript
{
  tenantId: string;          // Tenant ID (organization ID)
  actorId: string;           // User performing deletion
  targetUserId: string;      // User ID to delete
  reason?: string;           // Deletion reason (e.g., 'GDPR request')
  createdAt: Date;
}
```

**Handler:** `DeleteAccountHandler` (`src/modules/auth/handlers/commands/delete-account.handler.ts`)

**Business Logic:**

1. Fetches user and organization within transaction for consistency
2. Determines if user is organization owner
3. **If owner:**
   - Deletes entire organization (CASCADE deletes all users)
   - Deletes all users from GCP Identity Platform
   - Publishes `organization.deleted` event
4. **If regular user:**
   - Deletes only that user
   - Deletes user from GCP Identity Platform
   - Publishes `user.deleted` event
5. Creates audit log event in same transaction
6. Supports soft delete mode via `USE_SOFT_DELETE` environment variable

**Events Published:**

- `organization.deleted` (if owner)
- `user.deleted` (if regular user)
- `account.deleted.audit` (audit log)

**Example:**

```typescript
const command = new DeleteAccountCommand({
  tenantId: 'org-123',
  actorId: 'user-123',
  targetUserId: 'user-456',
  reason: 'GDPR right to be forgotten request'
});

await commandBus.execute(command);
```

**Soft Delete Mode:**

Set `USE_SOFT_DELETE=true` in environment to enable soft delete:

- User/organization marked as deleted (`deletedAt` timestamp set)
- Data preserved for retention period
- Automatically purged after retention period by scheduled job

### ExportUserDataCommand

Exports all user data in JSON format for GDPR compliance.

**Location:** `src/modules/auth/commands/export-user-data.command.ts`

**Properties:**

```typescript
{
  tenantId: string; // Tenant ID
  userId: string; // User ID to export data for
  actorId: string; // User requesting export
  createdAt: Date;
}
```

**Handler:** `ExportUserDataHandler` (`src/modules/auth/handlers/commands/export-user-data.handler.ts`)

**Business Logic:**

1. Validates user exists and actor has permission
2. Collects all user data (profile, identities, sessions, audit logs)
3. Formats data as JSON
4. Returns complete data export

**Example:**

```typescript
const command = new ExportUserDataCommand({
  tenantId: 'org-123',
  userId: 'user-123',
  actorId: 'user-123', // User can export own data
});

const export = await commandBus.execute(command);
// Returns: { user: {...}, identities: [...], sessions: [...] }
```

## Queries

Queries represent read operations in the authentication domain. All queries implement the `IQuery` interface from `@package/types`.

### ValidateTokenQuery

Validates an access token and returns decoded user information.

**Location:** `src/modules/auth/queries/validate-token.query.ts`

**Properties:**

```typescript
{
  tenantId: string; // Tenant ID
  token: string; // Access token to validate
  readonly: true;
}
```

**Handler:** `ValidateTokenHandler` (`src/modules/auth/handlers/queries/validate-token.handler.ts`)

**Returns:**

```typescript
{
  valid: boolean;
  userId?: string;
  tenantId?: string;
  roles?: string[];
  exp?: number;
}
```

**Example:**

```typescript
const query = new ValidateTokenQuery({
  tenantId: 'org-123',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
});

const result = await queryBus.execute(query);
// Returns: { valid: true, userId: 'user-123', ... }
```

### GetUserSessionQuery

Retrieves active sessions for a user.

**Location:** `src/modules/auth/queries/get-user-session.query.ts`

**Properties:**

```typescript
{
  tenantId: string;        // Tenant ID
  userId: number;          // User ID
  sessionId?: string;      // Optional: specific session ID
  readonly: true;
}
```

**Handler:** `GetUserSessionHandler` (`src/modules/auth/handlers/queries/get-user-session.handler.ts`)

**Returns:**

```typescript
{
  sessions: Array<{
    id: string;
    userId: number;
    createdAt: Date;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }>;
}
```

**Example:**

```typescript
const query = new GetUserSessionQuery({
  tenantId: 'org-123',
  userId: 123
});

const result = await queryBus.execute(query);
// Returns: { sessions: [...] }
```

### ListUserIdentitiesQuery

Retrieves all identity providers linked to a user.

**Location:** `src/modules/auth/queries/list-user-identities.query.ts`

**Properties:**

```typescript
{
  tenantId: string; // Tenant ID
  userId: number; // User ID
  readonly: true;
}
```

**Handler:** `ListUserIdentitiesHandler` (`src/modules/auth/handlers/queries/list-user-identities.handler.ts`)

**Returns:**

```typescript
Array<{
  id: number;
  userId: number;
  provider: IdentityProvider;
  providerUid: string;
  isPrimary: boolean;
  displayName?: string;
  photoUrl?: string;
  createdAt: Date;
  lastSignInAt?: Date;
}>;
```

**Example:**

```typescript
const query = new ListUserIdentitiesQuery({
  tenantId: 'org-123',
  userId: 123
});

const identities = await queryBus.execute(query);
// Returns: [
//   { provider: 'email_password', isPrimary: true, ... },
//   { provider: 'google', isPrimary: false, ... }
// ]
```

## Events

Events are published after successful state changes. All events are written to the **outbox table** within the same database transaction to ensure reliable event delivery.

### Event Schema Version

All auth events use schema version `1.0` (`AuthEventSchemaVersion.V1_0`).

### UserLoggedInEvent

Published when a user successfully authenticates.

**Event Type:** `user.logged_in` (AuthEventType.USER_LOGGED_IN)

**Payload:**

```typescript
{
  tenantId: string;
  userId: string;
  provider: 'email_password' | 'phone' | 'google' | 'microsoft' | ...;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;  // ISO 8601
}
```

**Published By:** `LoginHandler`, `LoginWithPhoneHandler`, `LoginWithOAuthHandler`

### UserRegisteredEvent

Published when a new user completes registration.

**Event Type:** `user.registered` (AuthEventType.USER_REGISTERED)

**Payload:**

```typescript
{
  tenantId: string;
  userId: string;
  email: string;
  displayName?: string;
  organizationId: string;
  isNewOrganization: boolean;
  timestamp: string;  // ISO 8601
}
```

**Published By:** `AuthService.registerWithEmailPassword()` (within transaction)

### TokenRefreshedEvent

Published when an access token is refreshed.

**Event Type:** `token.refreshed` (AuthEventType.TOKEN_REFRESHED)

**Payload:**

```typescript
{
  tenantId: string;
  userId: string;
  sessionId: string;
  ipAddress?: string;
  timestamp: string;  // ISO 8601
}
```

**Published By:** `RefreshTokenHandler`

### UserLoggedOutEvent

Published when a user logs out.

**Event Type:** `user.logged_out` (AuthEventType.USER_LOGGED_OUT)

**Payload:**

```typescript
{
  tenantId: string;
  userId: string;
  sessionId?: string;
  ipAddress?: string;
  timestamp: string;  // ISO 8601
}
```

**Published By:** `LogoutHandler`

### IdentityLinkedEvent

Published when an additional identity provider is linked to a user.

**Event Type:** `identity.linked` (AuthEventType.IDENTITY_LINKED)

**Payload:**

```typescript
{
  tenantId: string;
  userId: string;
  provider: IdentityProvider;
  providerUid: string;
  timestamp: string; // ISO 8601
}
```

**Published By:** `LinkIdentityHandler`

### IdentityUnlinkedEvent

Published when an identity provider is unlinked from a user.

**Event Type:** `identity.unlinked` (AuthEventType.IDENTITY_UNLINKED)

**Payload:**

```typescript
{
  tenantId: string;
  userId: string;
  provider: IdentityProvider;
  providerUid: string;
  timestamp: string; // ISO 8601
}
```

**Published By:** `UnlinkIdentityHandler`

## Transactional Outbox Pattern

The Auth module uses the **Transactional Outbox Pattern** to ensure reliable event publishing. This pattern guarantees that events are never lost, even if the event bus is temporarily unavailable.

### How It Works

1. **Within Transaction:** All database writes (user updates, identity changes) and event publishing happen in the same database transaction
2. **Outbox Table:** Events are written to the `outbox` table (via `OutboxRepository`)
3. **Atomic Commit:** Transaction commits atomically - either both data and events are saved, or neither
4. **Background Processor:** A separate worker reads from the outbox table and publishes events to the event bus
5. **At-Least-Once Delivery:** Events are marked as processed after successful publishing, with retry logic for failures

### Benefits

- **Reliability:** Events are never lost due to event bus failures
- **Consistency:** Data and events are always in sync
- **Decoupling:** Application doesn't need to wait for event bus
- **Observability:** All events are queryable from outbox table

### Example Transaction

```typescript
// In LoginHandler.execute()
await this.db.transaction(async (tx) => {
  // 1. Update user last sign-in timestamp
  await this.authService.updateUserLastSignInWithTransaction(tx, userId);

  // 2. Publish event to outbox (same transaction)
  await this.outboxRepo.insert(tx, {
    eventId: randomUUID(),
    eventType: AuthEventType.USER_LOGGED_IN,
    aggregateId: String(userId),
    aggregateVersion: '1',
    payload: eventData,
    correlationId: command.correlationId,
    causationId: command.causationId,
    tenantId: userInfo.tenantId,
    schemaVersion: AuthEventSchemaVersion.V1_0
  });

  // 3. Transaction commits - both operations succeed or both fail
});
```

## Multi-Tenancy Support

All commands and queries include `tenantId` for multi-tenant isolation.

### Tenant ID Handling

- **Required:** For authenticated operations (logout, link identity, etc.)
- **Optional:** For public auth endpoints (login, register, refresh token)
  - Login: `tenantId` is optional, user's organization ID is looked up by email
  - Register: `tenantId` is optional, new organization is created if not provided
  - Refresh Token: `tenantId` is extracted from JWT payload

### Repository Scoping

All repository methods accept `tenantId` as the first parameter to ensure data isolation:

```typescript
// All queries scoped to tenant
await authRepository.findByEmail(tenantId, email);
await authRepository.findById(tenantId, userId);
await userIdentityRepository.findByUserId(userId); // No tenant needed (user-scoped)
```

### Validation

The `AuthRepository` validates `tenantId` format to prevent SQL injection:

```typescript
// Validate tenantId is a valid number string
const orgIdStr = tenantId.trim();
if (!/^\d+$/.test(orgIdStr)) {
  throw Errors.validationinvalidValueFor002({
    field: 'tenantId',
    expectedType: 'numeric string'
  });
}
```

## Handler Registration

All handlers must be registered in the Auth module:

```typescript
// src/modules/auth/auth.module.ts
@Module({
  imports: [CqrsModule],
  providers: [
    // Command handlers
    LoginHandler,
    RegisterHandler,
    LogoutHandler,
    RefreshTokenHandler,
    LoginWithPhoneHandler,
    LoginWithOAuthHandler,
    LinkIdentityHandler,
    UnlinkIdentityHandler,
    DeleteAccountHandler,
    ExportUserDataHandler,

    // Query handlers
    ValidateTokenHandler,
    GetUserSessionHandler,
    ListUserIdentitiesHandler

    // Event handlers
    // (Add event handlers here as needed)
  ]
})
export class AuthModule {}
```

## Error Handling

All handlers use typed exceptions from `@package/errors`:

```typescript
// User not found
throw Errors.useruserWithId001({ userId });

// Invalid credentials
throw Errors.authinvalidEmailOr001({});

// Validation error
throw Errors.validationvalidationFailedField001({ field: 'email' });

// Insufficient permissions
throw Errors.authinsufficientPermissionsRequiredpermission004({
  requiredPermission: 'user:delete'
});
```

## Documentation References

- [Repositories](./repositories.md) - Auth repository implementations
- [Multi-Tenancy](./multi-tenancy.md) - Multi-tenancy patterns
- [Testing](./testing.md) - Testing auth commands and queries
- [Events](../events/README.md) - Event architecture
