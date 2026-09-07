# Auth Module: External Integrations

## Overview

The auth module integrates with **Google Cloud Platform (GCP) Identity Platform** via Firebase Admin SDK for authentication and multi-tenant management. This document covers GCP integration patterns, configuration, user provisioning, tenant management, and error handling.

---

## Table of Contents

- [GCP Identity Platform Integration](#gcp-identity-platform-integration)
- [Auth Provider Factory Pattern](#auth-provider-factory-pattern)
- [User Provisioning in GCP](#user-provisioning-in-gcp)
- [Tenant Management in GCP](#tenant-management-in-gcp)
- [Error Handling](#error-handling)
- [Rollback and Cleanup](#rollback-and-cleanup)

---

## GCP Identity Platform Integration

### Authentication Flow

The auth service uses **lazy-loaded GCP provider** via `AuthProviderFactory`:

```typescript
// AuthService constructor
constructor(
  @Inject(AUTH_PROVIDER_FACTORY) private readonly authProviderFactory: AuthProviderFactory
) {
  // Provider resolved on first use, not in constructor
  this.logger.log('AuthService initialized - provider will be resolved on first use');
}

// Lazy-loaded provider
private getProvider(): IAuthProvider {
  if (!this.authProvider) {
    const provider = this.authProviderFactory.getDefaultProvider();
    if (!provider) {
      throw new Error('No auth provider configured. Please configure GCP Identity Platform.');
    }
    this.authProvider = provider;
  }
  return this.authProvider;
}
```

### Why Lazy Loading?

**Problem:** Auth providers are registered in module lifecycle hooks (after service instantiation).

**Solution:** Lazy-load provider on first method call to avoid initialization race conditions.

---

## Auth Provider Factory Pattern

### Interface: `IAuthProvider`

Located in `@package/auth`, the interface defines authentication operations:

```typescript
interface IAuthProvider {
  // Provider metadata
  name: string;
  type: string;

  // Authentication
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;
  logout(refreshToken: string, accessToken?: string): Promise<void>;

  // Token operations
  refreshToken(refreshToken: string): Promise<AuthResult>;
  validateToken(token: string): Promise<ValidationResult>;
  getUserInfoFromToken(token: string): Promise<UserInfo>;

  // User management (GCP-specific)
  deleteUser(gcpUid: string, tenantId: string): Promise<void>;

  // GCP tenant management (Firebase Admin SDK)
  firebaseAuth?: {
    tenantManager(): TenantManager;
    createUser(userData: UserRecord): Promise<{ uid: string }>;
    deleteUser(uid: string): Promise<void>;
  };
}
```

### Factory Pattern

**`AuthProviderFactory`** manages multiple providers (GCP, custom, future providers):

```typescript
@Injectable()
export class AuthProviderFactory {
  private providers = new Map<string, IAuthProvider>();
  private defaultProviderId?: string;

  register(id: string, provider: IAuthProvider): void {
    this.providers.set(id, provider);
  }

  setDefaultProvider(id: string): void {
    this.defaultProviderId = id;
  }

  getDefaultProvider(): IAuthProvider | null {
    return this.defaultProviderId ? this.providers.get(this.defaultProviderId) : null;
  }
}
```

---

## User Provisioning in GCP

### Synchronous Registration Flow

User registration provisions **ALL resources synchronously** in one transaction:

```
1. Check if user exists (prevent duplicates)
2. Get or create organization with GCP tenant
3. Provision GCP user synchronously
4. Create user in database with actual GCP UID
5. Create user identity with GCP UID
```

**Key files:**

- `apps/api/src/modules/auth/services/auth.service.ts` (lines 444-487)
- `apps/api/src/modules/auth/handlers/commands/register.handler.ts` (lines 55-72)

### GCP User Creation

**Method:** `provisionGcpUserSync()` (lines 771-822 in auth.service.ts)

```typescript
private async provisionGcpUserSync(
  email: string,
  password: string,
  displayName: string,
  gcpTenantId: string | null
): Promise<string> {
  const provider = this.getProvider();

  // Type-guard for Firebase Auth
  if (!('firebaseAuth' in provider)) {
    throw new Error('Provider does not support Firebase Auth');
  }

  const googleProvider = provider as {
    firebaseAuth: {
      tenantManager: () => TenantManager;
      createUser: (data: UserRecord) => Promise<{ uid: string }>;
    };
  };

  const userData = {
    email,
    password,
    displayName,
    emailVerified: false,
    disabled: false,
  };

  // Create user in GCP tenant or default project
  if (gcpTenantId) {
    const tenantAuth = googleProvider.firebaseAuth.tenantManager().authForTenant(gcpTenantId);
    return (await tenantAuth.createUser(userData)).uid;
  } else {
    return (await googleProvider.firebaseAuth.createUser(userData)).uid;
  }
}
```

**Features:**

- Creates user in GCP Identity Platform
- Supports tenant-scoped users (multi-tenancy)
- Returns GCP UID for database storage
- Handles email verification status
- Sets disabled flag

### GCP User Authentication

**Method:** `authenticateWithEmailPassword()` (lines 83-101 in auth.service.ts)

```typescript
async authenticateWithEmailPassword(
  _tenantId: string | undefined,
  email: string,
  password: string
): Promise<{
  authResult: AuthResult;
  userInfo: UserInfo;
  isNewUser: boolean;
  user: User;
}> {
  // Step 1: Validate user exists and get GCP tenant ID
  const { user, gcpTenantId } = await this.validateUserExists(email);

  // Step 2: Authenticate with GCP Identity Platform
  const gcpAuthResult = await this.authenticateWithGCP(email, password, gcpTenantId);

  // Step 3: Get user info from GCP token
  const gcpUserInfo = await this.getGCPUserInfo(gcpAuthResult.idToken);

  // Step 4: Build user info response
  const userInfo = this.buildUserInfo(user, gcpUserInfo, gcpTenantId);

  return { authResult: gcpAuthResult, userInfo, isNewUser: false, user };
}
```

**Flow:**

1. Fetch user from database with organization (gets `gcpTenantId`)
2. Call GCP `authenticate()` with email, password, and tenant ID
3. Extract user info from ID token
4. Build response with combined database + GCP data

### GCP User Deletion

**Method:** `deleteGcpUserSync()` (lines 857-884 in auth.service.ts)

```typescript
private async deleteGcpUserSync(gcpUid: string, gcpTenantId: string | null): Promise<void> {
  const provider = this.getProvider();

  if (!('firebaseAuth' in provider)) {
    return;
  }

  const googleProvider = provider as {
    firebaseAuth: {
      tenantManager: () => TenantManager;
      deleteUser: (uid: string) => Promise<void>;
    };
  };

  // Delete from tenant or default project
  if (gcpTenantId) {
    const tenantAuth = googleProvider.firebaseAuth.tenantManager().authForTenant(gcpTenantId);
    await tenantAuth.deleteUser(gcpUid);
  } else {
    await googleProvider.firebaseAuth.deleteUser(gcpUid);
  }
}
```

**Used in:**

- Rollback during registration failure
- Account deletion (soft/hard delete)
- Purge job (for expired soft-deleted accounts)

---

## Tenant Management in GCP

### GCP Tenant Provisioning

**Service:** `TenantManagementService` (`apps/api/src/modules/tenants/services/tenant-management.service.ts`)

**Method:** `provisionGcpTenant()` (lines 61-120)

```typescript
async provisionGcpTenant(
  organizationId: number,
  config: GcpTenantConfig
): Promise<GcpTenantResult> {
  const provider = this.getProvider();

  // Type-guard for Google Identity Platform
  if (!('firebaseAuth' in provider)) {
    throw new Error('Auth provider does not support tenant management');
  }

  const googleProvider = provider as {
    firebaseAuth: {
      tenantManager: () => TenantManager;
    };
  };

  try {
    const tenantManager = googleProvider.firebaseAuth.tenantManager();

    // Create GCP tenant
    const tenant = await tenantManager.createTenant({
      displayName: config.displayName,
      emailSignInEnabled: config.emailSignInEnabled,
      passwordPolicy: config.passwordPolicy,
      multiFactorConfig: config.multiFactorConfig
        ? {
            enabled: config.multiFactorConfig.enabled,
            state: config.multiFactorConfig.state,
          }
        : undefined,
    });

    return {
      tenantId: tenant.tenantId,
      displayName: tenant.displayName,
    };
  } catch (error) {
    throw Errors.externalserviceReturnedAn002({
      service: 'GCP Identity Platform',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### GCP Tenant Configuration

**Interface:** `GcpTenantConfig`

```typescript
interface GcpTenantConfig {
  displayName: string;
  emailSignInEnabled?: boolean;
  passwordPolicy?: PasswordPolicyConfig;
  multiFactorConfig?: {
    enabled: boolean;
    state: 'ENABLED' | 'DISABLED';
  };
}
```

### Tenant Lifecycle

**Creation Flow:**

```
1. Organization created in database
2. GCP tenant provisioned (via Firebase Admin SDK)
3. Organization updated with gcpTenantId
4. Users created in tenant-scoped context
```

**Method:** `provisionGcpTenantForOrganization()` (lines 144-199 in tenant-management.service.ts)

```typescript
async provisionGcpTenantForOrganization(
  organizationId: number,
  config: GcpTenantConfig
): Promise<GcpTenantResult> {
  // Step 0: Check if organization already has a GCP tenant
  const existingOrg = await this.gcpTenantRepository.findByIdWithGcpTenant('system', organizationId);
  if (existingOrg?.gcpTenantId) {
    return {
      tenantId: existingOrg.gcpTenantId,
      displayName: existingOrg.name || 'Organization',
    };
  }

  // Step 1: Create GCP tenant
  const gcpTenant = await this.provisionGcpTenant(organizationId, config);

  // Step 2: Update organization with GCP tenant ID
  try {
    await this.linkGcpTenantToOrganization(organizationId, gcpTenant.tenantId);
  } catch (error) {
    // Rollback GCP tenant if link fails
    await this.deleteGcpTenant(gcpTenant.tenantId);
    throw Errors.externalserviceReturnedAn002({
      service: 'Database',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  return gcpTenant;
}
```

**Rollback logic:** If database link fails, GCP tenant is deleted to prevent orphaned resources.

### GCP Tenant Deletion

**Method:** `deleteGcpTenant()` (lines 209-239 in tenant-management.service.ts)

```typescript
async deleteGcpTenant(gcpTenantId: string): Promise<void> {
  const provider = this.getProvider();

  if (!('firebaseAuth' in provider)) {
    return;
  }

  const googleProvider = provider as {
    firebaseAuth: {
      tenantManager: () => TenantManager;
    };
  };

  try {
    const tenantManager = googleProvider.firebaseAuth.tenantManager();
    await tenantManager.deleteTenant(gcpTenantId);
  } catch (error) {
    throw Errors.externalserviceReturnedAn002({
      service: 'GCP Identity Platform',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
```

**WARNING:** Deleting a GCP tenant **permanently deletes ALL tenant users**. This is irreversible.

---

## Error Handling

### GCP Operation Errors

**Pattern:** All GCP operations are wrapped in try-catch with typed errors:

```typescript
try {
  const result = await gcpOperation();
  return result;
} catch (error) {
  this.logger.error('GCP operation failed', error);
  throw Errors.externalserviceReturnedAn002({
    service: 'GCP Identity Platform',
    errorMessage: error instanceof Error ? error.message : String(error)
  });
}
```

### Error Codes

| Error Code                             | Description                   | HTTP Status |
| -------------------------------------- | ----------------------------- | ----------- |
| `AUTH_ERROR_CODES.INVALID_CREDENTIALS` | Invalid email or password     | 401         |
| `AUTH_ERROR_CODES.TOKEN_INVALID`       | Invalid/expired token         | 401         |
| `AUTH_ERROR_CODES.ACCOUNT_NOT_FOUND`   | User account not found in GCP | 401         |
| `Errors.externalserviceReturnedAn002`  | GCP service returned an error | 500         |

### Authentication Errors

**Invalid credentials:**

```typescript
try {
  return await this.getProvider().authenticate({
    username: email,
    password,
    tenantId: gcpTenantId || undefined
  });
} catch {
  throw new UnauthorizedException({
    code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    message: 'Invalid email or password'
  });
}
```

**Token validation errors:**

```typescript
try {
  const userInfo = await this.getProvider().getUserInfoFromToken(idToken);
  return userInfo;
} catch (error) {
  this.logger.error('Failed to parse GCP token', error);
  throw new UnauthorizedException({
    code: AUTH_ERROR_CODES.TOKEN_INVALID,
    message: 'Invalid authentication token'
  });
}
```

### Provisioning Errors

**User creation failure:**

```typescript
try {
  return await this.provisionGcpUserSync(email, password, displayName, gcpTenantId);
} catch (error) {
  this.logger.error('Failed to provision GCP user', error);

  // Rollback GCP tenant if new organization
  if (isNewOrganization && gcpTenantId) {
    await this.rollbackGcpTenant(gcpTenantId);
  }

  throw error;
}
```

**Tenant creation failure:**

```typescript
try {
  const tenant = await tenantManager.createTenant(config);
  return { tenantId: tenant.tenantId, displayName: tenant.displayName };
} catch (error) {
  this.logger.error('Failed to create GCP tenant', error);
  throw Errors.externalserviceReturnedAn002({
    service: 'GCP Identity Platform',
    errorMessage: error instanceof Error ? error.message : String(error)
  });
}
```

---

## Rollback and Cleanup

### Registration Rollback

**Scenario:** GCP user created, but database transaction fails.

**Solution:** Rollback GCP user and tenant:

```typescript
try {
  return await this.db.transaction(async (tx) => {
    const user = await this.authRepository.createWithEmailInTransaction(tx, ...);
    await this.userIdentityRepository.createWithTransaction(tx, ...);
    return user;
  });
} catch (error) {
  this.logger.error('Database transaction failed during user creation', error);

  // Rollback GCP resources
  await this.rollbackGcpUser(gcpUid, gcpTenantId);
  if (isNewOrganization && gcpTenantId) {
    await this.rollbackGcpTenant(gcpTenantId);
  }

  throw error;
}
```

### Purge Job Cleanup

**Scenario:** Purge expired soft-deleted users from GCP.

**Pattern:** Delete from database FIRST, then GCP (best effort):

```typescript
// CRITICAL FIX #3: Delete from database FIRST (within transaction)
await this.db.transaction(async (tx) => {
  await this.authRepository.hardDeletePermanently(String(user.organizationId), Number(user.id));
  await this.outboxRepo.insert(tx, { eventType: 'user.purged', ... });
});

// CRITICAL FIX #3: Delete from GCP AFTER successful DB deletion (best effort)
if (gcpUid && gcpTenantId) {
  try {
    await this.getProvider().deleteUser(gcpUid, gcpTenantId);
  } catch (error) {
    // Log but don't fail - DB deletion already succeeded
    this.logger.warn('Could not delete GCP user after DB deletion', error);
  }
}
```

**Rationale:** Database is source of truth. If GCP deletion fails, user is still purged from database.

---

## Documentation References

- [GDPR Compliance](./gdpr.md) - Data export and deletion
- [Background Jobs](./jobs.md) - Purge job configuration
- [Authentication Flow](./flows.md) - Login and token management
- [Repository Patterns](./repositories.md) - Database operations
