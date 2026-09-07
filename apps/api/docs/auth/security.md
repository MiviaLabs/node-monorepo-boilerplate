# Authentication Security Architecture

## Table of Contents

1. [Overview](#overview)
2. [Authentication Mechanisms](#authentication-mechanisms)
3. [Password Security](#password-security)
4. [Token Management](#token-management)
5. [Session Management](#session-management)
6. [Email Hashing and PII Protection](#email-hashing-and-pii-protection)
7. [Multi-Tenant Security](#multi-tenant-security)
8. [GCP Identity Platform Integration](#gcp-identity-platform-integration)
9. [Rate Limiting](#rate-limiting)
10. [Audit Logging](#audit-logging)
11. [Security Best Practices](#security-best-practices)

---

## Overview

The authentication system is built on **GCP Identity Platform (Firebase Auth)** as the primary authentication provider, with a local database layer for multi-tenant user management and audit logging.

### Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Request                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              JwtAuthGuard (JWT Validation)                  │
│  - Extracts Bearer token from Authorization header          │
│  - Verifies JWT signature using JwtService                  │
│  - Checks token expiration                                  │
│  - Attaches user payload to request.user                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              TenantMiddleware (Tenant Validation)           │
│  - Extracts x-tenant-id header                              │
│  - Validates tenant UUID format                             │
│  - Stores tenant context in AsyncLocalStorage               │
│  - Attaches tenant context to request                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               Authorization Guards (Optional)               │
│  - CanDeleteUserGuard: Admin or owner only                  │
│  - RolesGuard: Role-based access control                    │
│  - Custom guards per feature                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Controller Handler                        │
│  - Uses @CurrentUser() to access authenticated user         │
│  - Uses @TenantId() or @TenantContext() for tenant          │
└─────────────────────────────────────────────────────────────┘
```

### Key Security Principles

1. **Defense in Depth**: Multiple layers of security (JWT → Guards → Tenant → RBAC)
2. **Least Privilege**: Users only access resources they own or have permission for
3. **Tenant Isolation**: Strict tenant boundaries enforced at database and API levels
4. **PII Protection**: Emails hashed (SHA-256), passwords delegated to GCP
5. **Audit Everything**: All auth events logged to outbox for compliance

---

## Authentication Mechanisms

### Supported Methods

| Method                | Provider              | Status     | Use Case              |
| --------------------- | --------------------- | ---------- | --------------------- |
| **Email/Password**    | GCP Identity Platform | ✅ Active  | Standard user login   |
| **OAuth (Google)**    | GCP Identity Platform | ✅ Active  | Social login          |
| **OAuth (Microsoft)** | GCP Identity Platform | ✅ Active  | Enterprise SSO        |
| **OAuth (Apple)**     | GCP Identity Platform | ✅ Active  | iOS/macOS users       |
| **OAuth (LinkedIn)**  | GCP Identity Platform | ✅ Active  | Professional networks |
| **OAuth (GitHub)**    | GCP Identity Platform | ✅ Active  | Developer accounts    |
| **OAuth (Facebook)**  | GCP Identity Platform | ✅ Active  | Social login          |
| **Phone/SMS**         | GCP Identity Platform | ✅ Supported | SMS-based auth        |

### Email/Password Authentication Flow

```typescript
// 1. User submits credentials
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}

// 2. LoginHandler validates and authenticates
@CommandHandler(LoginCommand)
export class LoginHandler {
  async execute(command: LoginCommand) {
    // Step 1: Authenticate with GCP Identity Platform
    const { authResult, userInfo } = await this.authService.authenticateWithEmailPassword(
      command.tenantId,
      command.email,
      command.password
    );

    // Step 2: Update last sign-in timestamp (within transaction)
    await this.db.transaction(async (tx) => {
      await this.authService.updateUserLastSignInWithTransaction(tx, userId);

      // Step 3: Publish login event to outbox
      await this.outboxRepo.insert(tx, {
        eventType: AuthEventType.USER_LOGGED_IN,
        aggregateId: String(userId),
        payload: { tenantId, userId, ipAddress, sessionId },
      });
    });

    return authResult;
  }
}

// 3. Response includes JWT tokens
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",  // Short-lived (1 hour)
  "refreshToken": "eyJhbGciOiJSUzI1NiIs...", // Long-lived (14 days)
  "idToken": "eyJhbGciOiJSUzI1NiIs...",      // User identity token
  "expiresIn": 3600,
  "user": {
    "userId": "123",
    "email": "user@example.com",
    "tenantId": "456",
    "roles": ["user"],
    "permissions": []
  }
}
```

**Security Features:**

- ✅ **GCP-managed passwords**: No passwords stored locally
- ✅ **Brute-force protection**: Rate limiting on login attempts (5 per 15 minutes)
- ✅ **Audit logging**: Every login event recorded with IP, user agent, timestamp
- ✅ **Session tracking**: Session ID generated and tracked
- ✅ **Tenant validation**: User must belong to specified tenant

### OAuth Authentication Flow

```typescript
// 1. Client obtains OAuth token from provider (e.g., Google)
const googleToken = await googleSignIn();

// 2. Send token to backend
POST /api/v1/auth/login/oauth
{
  "provider": "google.com",
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "accessToken": "ya29.a0AfH6SMB..."
}

// 3. LoginWithOAuthHandler validates token
@CommandHandler(LoginWithOAuthCommand)
export class LoginWithOAuthHandler {
  async execute(command: LoginWithOAuthCommand) {
    // Step 1: Validate OAuth token with GCP
    const { authResult, userInfo, isNewUser, profile } =
      await this.authService.authenticateWithOAuth(
        command.tenantId,
        command.provider,
        command.idToken,
        command.accessToken
      );

    // Step 2: Handle existing vs new user
    if (isNewUser) {
      // Create new user and identity
      await this.authRepository.createWithEmail(tenantId, profile.email);
      await this.userIdentityRepository.create({
        userId: user.id,
        provider: command.provider,
        providerUid: profile.providerUid,
      });
    } else {
      // Update last sign-in for existing identity
      await this.userIdentityRepository.updateLastSignIn(identityId);
    }

    return authResult;
  }
}
```

**Security Features:**

- ✅ **Provider token validation**: Tokens verified with GCP Identity Platform
- ✅ **Identity linking**: Users can link multiple OAuth providers
- ✅ **Email verification**: OAuth providers pre-verify emails
- ✅ **Profile sync**: Display name and photo URL synced from provider

---

## Password Security

### Password Requirements

```typescript
export const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL: true
} as const;
```

### Password Validation (Client-Side)

```typescript
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');
```

### Password Storage

**IMPORTANT:** Passwords are **NEVER stored locally**. All password operations are delegated to **GCP Identity Platform**.

```typescript
// Registration: Password sent to GCP, never stored in DB
async registerWithEmailPassword(email: string, password: string) {
  // Step 1: Provision user in GCP Identity Platform
  const gcpUid = await this.provisionGcpUserSync(email, password, displayName, gcpTenantId);

  // Step 2: Store user in DB with GCP UID reference (no password!)
  const user = await this.authRepository.createWithEmail(tenantId, email, {
    displayName,
    isVerified: true,
  });

  // Step 3: Create identity linking user to GCP
  await this.userIdentityRepository.create({
    userId: user.id,
    provider: IdentityProvider.EMAIL_PASSWORD,
    providerUid: gcpUid, // ← GCP UID, NOT password
  });
}

// Login: Password validated by GCP, not locally
async authenticateWithEmailPassword(email: string, password: string) {
  // GCP validates password and returns tokens
  const gcpAuthResult = await this.authProvider.authenticate({
    username: email,
    password,
    tenantId: gcpTenantId,
  });

  return gcpAuthResult; // Contains JWT tokens
}
```

**Security Benefits:**

- ✅ **No password database**: Passwords never stored in local DB
- ✅ **GCP security**: Industry-standard password hashing (bcrypt/scrypt)
- ✅ **Automatic updates**: GCP handles password security updates
- ✅ **Breach protection**: Even if DB compromised, no passwords exposed

### Password Reset (Future)

```typescript
// TODO: Implement password reset flow
// 1. User requests reset → Generate reset token → Send email
// 2. User clicks link → Verify token → Allow password change
// 3. Password change handled by GCP Identity Platform
```

---

## Token Management

### Token Types

| Token Type             | Lifespan | Purpose              | Storage                    |
| ---------------------- | -------- | -------------------- | -------------------------- |
| **Access Token (JWT)** | 1 hour   | API authentication   | Memory (not localStorage!) |
| **Refresh Token**      | 14 days  | Renew access tokens  | httpOnly cookie (secure)   |
| **ID Token**           | 1 hour   | User identity claims | Memory                     |

### JWT Payload Structure

```typescript
interface JwtPayload {
  userId: string; // User ID
  tenantId: string; // Organization/tenant ID
  email: string; // User email (verified)
  roles: string[]; // User roles (admin, user, etc.)
  permissions: string[]; // Fine-grained permissions
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expiration (Unix timestamp)
  iss: string; // Issuer (GCP project)
  sub: string; // Subject (user UID)
}
```

### JWT Generation and Validation

```typescript
// JWT configuration (apps/api/src/modules/auth/auth.module.ts)
JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const secret = config.get<string>('JWT_SECRET');

    // ⚠️ Security check: Reject weak secrets
    if (!secret || secret === 'secret-key' || secret.length < 32) {
      throw new ForbiddenException(
        'JWT_SECRET must be configured with a secure value (at least 32 characters)'
      );
    }

    return {
      secret,
      signOptions: {
        expiresIn: '1h' // Access token expiration
      }
    };
  }
});

// JWT validation (JwtAuthGuard)
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Step 1: Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true; // Skip authentication
    }

    // Step 2: Extract and verify JWT
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token is missing');
    }

    try {
      // Verify token signature and expiration
      const payload = this.jwtService.verify(token);
      request.user = payload; // Attach user to request
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
```

### Token Refresh Flow

```typescript
// 1. Client requests token refresh
POST /api/v1/auth/refresh
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
}

// 2. RefreshTokenHandler validates and issues new tokens
@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler {
  async execute(command: RefreshTokenCommand) {
    // Step 1: Validate refresh token with GCP
    const authResult = await this.authService.refreshToken(
      command.tenantId,
      command.refreshToken
    );

    // Step 2: Log token refresh event (audit trail)
    await this.db.transaction(async (tx) => {
      await this.outboxRepo.insert(tx, {
        eventType: AuthEventType.TOKEN_REFRESHED,
        payload: {
          userId: authResult.user.userId,
          tenantId: authResult.user.tenantId,
          sessionId: randomUUID(),
        },
      });
    });

    return authResult; // New access + refresh tokens
  }
}

// 3. Response with new tokens
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs...",  // New access token
  "refreshToken": "eyJhbGciOiJSUzI1NiIs...", // New or rotated refresh token
  "expiresIn": 3600
}
```

**Security Features:**

- ✅ **Token rotation**: Refresh tokens may be rotated on each use
- ✅ **Audit logging**: Token refresh events logged for security monitoring
- ✅ **Automatic expiration**: Tokens expire after defined timeframes
- ✅ **Revocation**: Logout invalidates tokens with GCP

### Token Revocation (Logout)

```typescript
// Logout handler
@CommandHandler(LogoutCommand)
export class LogoutHandler {
  async execute(command: LogoutCommand) {
    // Step 1: Revoke tokens with GCP Identity Platform
    await this.authService.logout(
      command.userId,
      command.tenantId,
      command.refreshToken,
      command.accessToken
    );

    // Step 2: Log logout event
    await this.db.transaction(async (tx) => {
      await this.outboxRepo.insert(tx, {
        eventType: AuthEventType.USER_LOGGED_OUT,
        payload: {
          userId: command.userId,
          tenantId: command.tenantId,
          sessionId: command.sessionId
        }
      });
    });
  }
}
```

---

## Session Management

### Session Tracking

Sessions are tracked for audit and security purposes:

```typescript
// Session data structure
interface SessionData {
  sessionId: string; // Unique session identifier
  userId: string; // User ID
  tenantId: string; // Tenant ID
  ipAddress: string; // Client IP address
  userAgent: string; // Client user agent
  createdAt: Date; // Session creation time
  lastActivityAt: Date; // Last activity timestamp
  expiresAt: Date; // Session expiration
}
```

### Session Limits

```typescript
export const SESSION_CONFIG = {
  MAX_SESSIONS_PER_USER: 10, // Max concurrent sessions
  SESSION_INACTIVITY_TIMEOUT: 30 * 60, // 30 minutes
  REMEMBER_ME_DURATION: 30 * 24 * 60 * 60 // 30 days
} as const;
```

### Session Storage

Sessions are stored in **Redis** for fast access and automatic expiration:

```typescript
// Cache key structure
const sessionKey = `auth:session:${sessionId}`;
const userSessionsKey = `auth:sessions:user:${userId}`;

// Store session
await this.cache.set(
  sessionKey,
  JSON.stringify(sessionData),
  SESSION_CONFIG.SESSION_INACTIVITY_TIMEOUT
);

// Track user's sessions
await this.cache.sadd(userSessionsKey, sessionId);

// Retrieve user's active sessions
const sessionIds = await this.cache.smembers(userSessionsKey);
const sessions = await Promise.all(sessionIds.map((id) => this.cache.get(`auth:session:${id}`)));
```

---

## Email Hashing and PII Protection

### Email Hashing Strategy

Emails are **hashed with SHA-256** for secure, indexed lookups without storing plaintext:

```typescript
import { createHash } from 'node:crypto';

/**
 * Hash an email address for secure storage/lookup
 * Uses SHA-256 for deterministic hashing
 */
function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// Usage
const emailHash = hashEmail('user@example.com');
// → '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae'
```

### Database Schema (PII Protection)

```typescript
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),

    // ✅ Email hash for lookups (indexed)
    emailHash: varchar('email_hash', { length: 64 }).notNull(),

    // ❌ NO plaintext email field
    // ❌ NO password field (delegated to GCP)

    displayName: varchar('display_name', { length: 255 }),
    isVerified: boolean('is_verified').default(false),
    isActive: boolean('is_active').default(true),

    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    deletedAt: timestamp('deleted_at') // Soft delete
  },
  (table) => ({
    // Index on email hash for fast lookups
    emailHashIdx: index('users_email_hash_idx').on(table.emailHash),

    // Tenant scoping index
    organizationIdIdx: index('users_organization_id_idx').on(table.organizationId)
  })
);
```

### Email Lookup (No Plaintext)

```typescript
// Find user by email (using hash)
async findByEmail(tenantId: string, email: string) {
  const emailHash = hashEmail(email); // Hash the email

  const [user] = await this.db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, tenantId),
        eq(users.emailHash, emailHash), // Query by hash
        isNull(users.deletedAt)
      )
    )
    .limit(1);

  return user || null;
}
```

**Why Hash Emails?**

- ✅ **Index efficiency**: SHA-256 hashes are fixed-length (64 chars), fast to index
- ✅ **Deterministic lookups**: Same email always produces same hash
- ✅ **PII protection**: Even if DB compromised, emails not exposed
- ✅ **GDPR compliance**: Hashed emails reduce PII exposure

**Why NOT Encrypt Emails?**

- ❌ **Searchability**: Encrypted emails can't be indexed or searched
- ❌ **Key management**: Encryption keys must be secured separately
- ❌ **Performance**: Decryption overhead on every query

### GCP Identity Integration (Email Source of Truth)

The **email itself** is stored in **GCP Identity Platform**, not the local database:

```typescript
// Registration: Email stored in GCP
const gcpUid = await this.provisionGcpUserSync(
  email, // ← Email stored in GCP
  password,
  displayName,
  gcpTenantId
);

// Login: Email retrieved from GCP token
const userInfo = await this.authProvider.getUserInfoFromToken(idToken);
console.log(userInfo.email); // ← Email from GCP, NOT local DB

// Response to client includes email from GCP
return {
  userId: user.id,
  email: userInfo.email, // ← Source of truth: GCP
  name: user.displayName
};
```

---

## Multi-Tenant Security

### Tenant Isolation

Every auth operation is **scoped to a tenant** to prevent cross-tenant data leakage:

```typescript
// 1. Tenant validation in middleware
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const tenantId = req.headers['x-tenant-id'];

    if (!tenantId) {
      throw ApiException.missingRequiredHeader('x-tenant-id');
    }

    if (!isValidUuid(tenantId)) {
      throw ApiException.tenantContextInvalid();
    }

    // Store tenant context
    req.tenantContext = { tenantId };
    next();
  }
}

// 2. Tenant scoping in queries
async findById(tenantId: string, userId: number) {
  const [user] = await this.db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, tenantId), // ← Tenant filter
        eq(users.id, userId),
        isNull(users.deletedAt)
      )
    )
    .limit(1);

  return user || null;
}

// 3. Tenant validation in guards
@Injectable()
export class CanDeleteUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = request.user;
    const targetUserId = request.params.id;

    // ✅ Admin can delete any user IN THEIR TENANT
    // ✅ Users can delete their own account
    // ❌ Users cannot delete across tenants

    if (!user) {
      throw Errors.authinvalidEmailOr001({});
    }

    const isAdmin = user.roles?.includes('admin');

    if (isAdmin || user.userId.toString() === targetUserId) {
      return true;
    }

    throw Errors.authinsufficientPermissionsRequiredpermission004({
      requiredPermission: 'users:delete',
    });
  }
}
```

### GCP Multi-Tenancy

Each organization can have its own **GCP tenant** for complete isolation:

```typescript
// Organization schema includes GCP tenant ID
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),

  gcpTenantId: varchar('gcp_tenant_id', { length: 128 }), // ← GCP tenant

  isActive: boolean('is_active').default(true),
});

// Provision GCP tenant during registration
async provisionGcpTenantSync(displayName: string): Promise<string> {
  const tenantManager = this.authProvider.firebaseAuth.tenantManager();
  const tenant = await tenantManager.createTenant({
    displayName,
    emailSignInEnabled: true,
    passwordRequired: true,
  });

  return tenant.tenantId;
}

// Authenticate user in GCP tenant
const gcpAuthResult = await this.authProvider.authenticate({
  username: email,
  password,
  tenantId: gcpTenantId, // ← Tenant-specific auth
});
```

**Benefits of GCP Multi-Tenancy:**

- ✅ **Complete isolation**: Each tenant's users isolated in GCP
- ✅ **Custom auth policies**: Per-tenant password requirements, MFA settings
- ✅ **Independent scaling**: Tenants can scale independently
- ✅ **Compliance**: Tenant-specific data residency and compliance

---

## GCP Identity Platform Integration

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  GCP Identity Platform                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           Default Project (No Tenant)                  │  │
│  │  - Users without organization                          │  │
│  │  - Public registration users                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         GCP Tenant: Organization A                     │  │
│  │  - Users belonging to Org A                            │  │
│  │  - Custom password policies                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         GCP Tenant: Organization B                     │  │
│  │  - Users belonging to Org B                            │  │
│  │  - Separate user pool                                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                          ▲
                          │ Firebase Admin SDK
                          │
┌──────────────────────────────────────────────────────────────┐
│                 AuthService (NestJS)                         │
│  - Delegates authentication to GCP                           │
│  - Syncs user data to local DB                              │
│  - Manages user identities                                   │
└──────────────────────────────────────────────────────────────┘
```

### Provider Configuration

```typescript
// Module configuration
InfrastructureAuthModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (_config: ConfigService) => ({
    providers: [googleIdentityPlatformAuthConfig({ default: true })]
  })
});

// Service usage
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_PROVIDER_FACTORY)
    private readonly authProviderFactory: AuthProviderFactory
  ) {}

  private getProvider(): IAuthProvider {
    const provider = this.authProviderFactory.getDefaultProvider();
    if (!provider) {
      throw new Error('No auth provider configured');
    }
    return provider;
  }

  async authenticateWithEmailPassword(email: string, password: string) {
    // Delegate to GCP Identity Platform
    const gcpAuthResult = await this.getProvider().authenticate({
      username: email,
      password,
      tenantId: gcpTenantId
    });

    return gcpAuthResult;
  }
}
```

### GCP Operations

#### User Provisioning

```typescript
async provisionGcpUserSync(
  email: string,
  password: string,
  displayName: string,
  gcpTenantId: string | null
): Promise<string> {
  const userData = {
    email,
    password,
    displayName,
    emailVerified: false,
    disabled: false,
  };

  let userRecord: { uid: string };

  if (gcpTenantId) {
    // Create user in tenant
    const tenantAuth = this.authProvider.firebaseAuth
      .tenantManager()
      .authForTenant(gcpTenantId);
    userRecord = await tenantAuth.createUser(userData);
  } else {
    // Create user in default project
    userRecord = await this.authProvider.firebaseAuth.createUser(userData);
  }

  return userRecord.uid; // GCP user UID
}
```

#### Token Validation

```typescript
async validateToken(tenantId: string, token: string): Promise<UserInfo> {
  // GCP validates token signature and expiration
  const validationResult = await this.authProvider.validateToken(token);

  if (!validationResult.valid) {
    throw new UnauthorizedException({
      code: AUTH_ERROR_CODES.TOKEN_INVALID,
      message: validationResult.error || 'Invalid token',
    });
  }

  // Extract user info from validated token
  const userInfo = await this.authProvider.getUserInfoFromToken(token);

  return userInfo;
}
```

---

## Rate Limiting

### Limits Configuration

```typescript
export const RATE_LIMITS = {
  LOGIN_ATTEMPTS: 5, // Max login attempts
  LOGIN_WINDOW: 15 * 60, // Within 15 minutes

  REGISTRATION_ATTEMPTS: 3, // Max registration attempts
  REGISTRATION_WINDOW: 60 * 60, // Within 1 hour

  PASSWORD_RESET_ATTEMPTS: 3, // Max password reset requests
  PASSWORD_RESET_WINDOW: 60 * 60 // Within 1 hour
} as const;
```

### Implementation (Redis-based)

```typescript
class RateLimiter {
  async checkLoginLimit(email: string): Promise<boolean> {
    const emailHash = hashEmail(email);
    const key = `ratelimit:login:${emailHash}`;

    const attempts = await this.cache.incr(key);

    if (attempts === 1) {
      // Set expiration on first attempt
      await this.cache.expire(key, RATE_LIMITS.LOGIN_WINDOW);
    }

    if (attempts > RATE_LIMITS.LOGIN_ATTEMPTS) {
      throw Errors.authaccountIsLocked009({
        lockDuration: RATE_LIMITS.LOGIN_WINDOW / 60
      });
    }

    return true;
  }

  async resetLoginLimit(email: string): Promise<void> {
    const emailHash = hashEmail(email);
    const key = `ratelimit:login:${emailHash}`;
    await this.cache.del(key);
  }
}
```

---

## Audit Logging

### Event Types

All authentication events are logged to the **transactional outbox**:

```typescript
export enum AuthEventType {
  USER_REGISTERED = 'auth.user.registered',
  USER_LOGGED_IN = 'auth.user.logged_in',
  USER_LOGGED_OUT = 'auth.user.logged_out',
  TOKEN_REFRESHED = 'auth.token.refreshed',
  PASSWORD_CHANGED = 'auth.password.changed',
  PASSWORD_RESET_REQUESTED = 'auth.password.reset_requested',
  IDENTITY_LINKED = 'auth.identity.linked',
  IDENTITY_UNLINKED = 'auth.identity.unlinked',
  ACCOUNT_DELETED = 'auth.account.deleted',
  LOGIN_FAILED = 'auth.login.failed'
}
```

### Audit Event Structure

```typescript
interface AuditEvent {
  eventId: string; // Unique event ID (UUID)
  eventType: AuthEventType; // Event type
  aggregateId: string; // User ID
  aggregateVersion: string; // Version
  payload: {
    tenantId: string; // Tenant ID
    userId: string; // User ID
    actorId?: string; // Who performed the action
    ipAddress: string; // Client IP
    userAgent: string; // Client user agent
    sessionId?: string; // Session ID (if applicable)
    timestamp: string; // Event timestamp (ISO 8601)

    // Event-specific data
    [key: string]: unknown;
  };
  correlationId: string; // Request correlation ID
  causationId: string; // Causation ID (event chain)
  tenantId: string; // Tenant ID (for filtering)
  schemaVersion: string; // Event schema version
}
```

### Logging Example

```typescript
// Login event
await this.db.transaction(async (tx) => {
  // Update last sign-in timestamp
  await this.authService.updateUserLastSignInWithTransaction(tx, userId);

  // Log login event
  await this.outboxRepo.insert(tx, {
    eventId: randomUUID(),
    eventType: AuthEventType.USER_LOGGED_IN,
    aggregateId: String(userId),
    aggregateVersion: '1',
    payload: {
      tenantId: command.tenantId,
      userId: String(userId),
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      sessionId: randomUUID(),
      timestamp: new Date().toISOString()
    },
    correlationId: command.correlationId,
    causationId: command.causationId,
    tenantId: command.tenantId,
    schemaVersion: AuthEventSchemaVersion.V1_0
  });
});
```

### Audit Queries

```sql
-- Find all login events for a user
SELECT * FROM outbox_events
WHERE event_type = 'auth.user.logged_in'
  AND aggregate_id = '123'
  AND tenant_id = '456'
ORDER BY created_at DESC;

-- Find failed login attempts
SELECT * FROM outbox_events
WHERE event_type = 'auth.login.failed'
  AND payload->>'ipAddress' = '192.168.1.1'
  AND created_at > NOW() - INTERVAL '1 hour';

-- Find all auth events for a tenant
SELECT * FROM outbox_events
WHERE tenant_id = '456'
  AND event_type LIKE 'auth.%'
ORDER BY created_at DESC;
```

---

## Security Best Practices

### 1. Never Log Sensitive Data

```typescript
// ❌ BAD: Logging passwords or tokens
this.logger.log(`User login: ${email}, password: ${password}`);
this.logger.log(`Token: ${accessToken}`);

// ✅ GOOD: Log only non-sensitive info
this.logger.log(`User login attempt: ${hashEmail(email)}`);
this.logger.log(`Token issued for user: ${userId}`);
```

### 2. Always Validate Tenant Context

```typescript
// ❌ BAD: No tenant validation
async getUser(userId: number) {
  return this.db.select().from(users).where(eq(users.id, userId));
}

// ✅ GOOD: Tenant-scoped query
async getUser(tenantId: string, userId: number) {
  return this.db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, tenantId),
        eq(users.id, userId)
      )
    );
}
```

### 3. Use @Public() for Public Routes

```typescript
// ❌ BAD: No @Public() decorator, route unprotected
@Post('login')
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}

// ✅ GOOD: Explicitly marked as public
@Public()
@Post('login')
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

### 4. Validate All Inputs

```typescript
// ❌ BAD: No validation
async findByEmail(email: string) {
  return this.db.select().from(users).where(eq(users.email, email));
}

// ✅ GOOD: Hash and validate email
async findByEmail(tenantId: string, email: string) {
  const emailHash = hashEmail(email); // SHA-256 hash

  if (!/^\d+$/.test(tenantId)) {
    throw Errors.validationinvalidValueFor002({
      field: 'tenantId',
      expectedType: 'numeric string',
    });
  }

  return this.db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, Number(tenantId)),
        eq(users.emailHash, emailHash)
      )
    );
}
```

### 5. Implement RBAC Properly

```typescript
// Authorization guard with role check
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());

    if (!requiredRoles) {
      return true; // No roles required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const hasRole = requiredRoles.some(role => user.roles?.includes(role));

    if (!hasRole) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: requiredRoles.join(', '),
      });
    }

    return true;
  }
}

// Usage in controller
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Delete('users/:id')
async deleteUser(@Param('id') userId: string) {
  // Only admins can access this
}
```

### 6. Soft Delete for GDPR Compliance

```typescript
// Soft delete: Mark as deleted, retain data for compliance
async softDeleteWithTransaction(tx: NodePgDatabase, tenantId: string, userId: number) {
  const [deletedUser] = await tx
    .update(users)
    .set({
      deletedAt: new Date(),
      isActive: false,
    })
    .where(
      and(
        eq(users.organizationId, tenantId),
        eq(users.id, userId)
      )
    )
    .returning();

  return deletedUser;
}

// Scheduled job: Purge after retention period
async purgeExpiredSoftDeleted(retentionDays: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const expiredUsers = await this.db
    .select()
    .from(users)
    .where(
      and(
        isNotNull(users.deletedAt),
        lt(users.deletedAt, cutoffDate)
      )
    );

  // Hard delete expired users
  for (const user of expiredUsers) {
    await this.db.delete(users).where(eq(users.id, user.id));
  }
}
```

---

## Documentation References

- [Guards and Decorators](./guards-decorators.md) - Authentication guards and decorators
- [Multi-Tenancy](./multi-tenancy.md) - Multi-tenant architecture
- [Testing](./testing.md) - Security testing strategies
- [Quick Start](./quick-start.md) - Getting started with auth
- [Configuration](./configuration.md) - Environment configuration

---

## Security Checklist

When implementing authentication features:

- [ ] Password requirements enforced (client + server)
- [ ] Rate limiting enabled for auth endpoints
- [ ] JWT secret is strong (32+ characters)
- [ ] Public routes marked with `@Public()`
- [ ] All queries scoped to tenant
- [ ] Email hashed before storage
- [ ] Audit events logged to outbox
- [ ] Sensitive data not logged
- [ ] RBAC guards applied where needed
- [ ] Token expiration validated
- [ ] Soft delete for user accounts
- [ ] GCP Identity Platform configured
- [ ] HTTPS enforced in production
- [ ] CORS configured correctly
