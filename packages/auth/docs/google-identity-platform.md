# Google Cloud Identity Platform Provider

Complete guide for integrating and configuring the Google Cloud Identity Platform authentication provider for enterprise authentication across platform services.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Multi-Tenancy](#multi-tenancy)
- [Migration Guide](#migration-guide)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Overview

Google Cloud Identity Platform is Firebase Authentication's enterprise-grade offering that provides:

- **User Authentication**: Email/password, OAuth providers, SAML, and OIDC
- **Multi-Tenancy**: Isolated user pools per tenant
- **Security**: Built-in protection against common vulnerabilities
- **Scalability**: Auto-scaling to handle millions of users
- **Integration**: Seamless integration with Google Cloud services

### Key Features

- **Password-based authentication** with email verification
- **OAuth providers** (Google, GitHub, Facebook, etc.)
- **SAML and OIDC** for enterprise SSO
- **Multi-factor authentication** (MFA)
- **Custom claims** for roles and permissions
- **Tenant isolation** for multi-tenant applications
- **Token management** with automatic refresh
- **User management** APIs

## Prerequisites

Before setting up the Google Cloud Identity Platform provider, ensure you have:

### 1. Google Cloud Project

- A Google Cloud project with billing enabled
- Project ID (e.g., `my-project-id`)
- Access to [Google Cloud Console](https://console.cloud.google.com)

### 2. Firebase Project

- Firebase project created within your Google Cloud project
- Or an existing Firebase project linked to Google Cloud

### 3. Identity Platform Enabled

- Identity Platform API enabled in your project
- Authentication providers configured

### 4. Service Account (Optional for Development)

For production or ADC (Application Default Credentials):

- Service account with Firebase Admin SDK permissions
- Service account JSON key file
- Permissions: `Firebase Authentication Admin`

## Setup Guide

### Step 1: Create/Select Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select an existing one
3. Note your **Project ID** (found in project settings)

### Step 2: Enable Identity Platform

1. In Firebase Console, go to **Authentication**
2. Click **Get Started**
3. Choose **Identity Platform** (not legacy Firebase Auth)
4. Accept the terms and enable

### Step 3: Configure Authentication Providers

1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable **Email/Password** provider
3. Optionally enable OAuth providers (Google, GitHub, etc.)
4. Configure provider settings as needed

### Step 4: Create Service Account (Optional)

For production use with service account authentication:

1. Go to [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Create a new service account or use an existing one
3. Grant the service account the **Firebase Authentication Admin** role
4. Create and download a JSON key file
5. Store the key file securely (never commit to git)

### Step 5: Enable APIs

Ensure the following APIs are enabled in Google Cloud Console:

- **Cloud Identity Platform API**
- **Firebase Management API**
- **Google Identity and Access Management (IAM) API**

### Step 6: Install Dependencies

```bash
# In packages/auth
pnpm add firebase-admin google-auth-library
```

## Configuration

### Option 1: Service Account (Production)

```typescript
import { GoogleIdentityPlatformAuthProvider } from '@package/auth';

const provider = new GoogleIdentityPlatformAuthProvider({
  name: 'google-identity-platform',
  projectId: 'my-project-id',
  apiKey: 'my-api-key', // From Firebase Console > Project Settings > General
  serviceAccount: {
    projectId: 'my-project-id',
    clientEmail: 'firebase-adminsdk@my-project-id.iam.gserviceaccount.com',
    privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
  },
  timeout: 10000
});
```

### Option 2: Application Default Credentials (ADC)

Use this for Google Cloud environments (Cloud Run, GKE, Compute Engine):

```typescript
const provider = new GoogleIdentityPlatformAuthProvider({
  name: 'google-identity-platform',
  projectId: 'my-project-id',
  apiKey: 'my-api-key',
  // ADC will be used automatically if serviceAccount is not provided
  timeout: 10000
});
```

### Option 3: Environment Variables

```bash
# .env file
FIREBASE_PROJECT_ID=my-project-id
FIREBASE_API_KEY=AIzaSy...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@my-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

```typescript
const provider = new GoogleIdentityPlatformAuthProvider({
  name: 'google-identity-platform',
  projectId: process.env.FIREBASE_PROJECT_ID,
  apiKey: process.env.FIREBASE_API_KEY,
  serviceAccount: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
  }
});
```

### Option 4: NestJS Module Integration

```typescript
// auth.module.ts
import { Module } from '@nestjs/common';
import { AuthProviderFactory } from '@package/auth';
import { GoogleIdentityPlatformAuthProvider } from '@package/auth';

@Module({
  providers: [
    {
      provide: 'AUTH_PROVIDER',
      useFactory: () => {
        const factory = new AuthProviderFactory();

        factory.register('google-identity-platform', (options) => {
          return new GoogleIdentityPlatformAuthProvider({
            ...options,
            projectId: process.env.FIREBASE_PROJECT_ID,
            apiKey: process.env.FIREBASE_API_KEY,
            serviceAccount: {
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY
            }
          });
        });

        return factory.create('google-identity-platform', {
          name: 'google-identity-platform'
        });
      }
    }
  ],
  exports: ['AUTH_PROVIDER']
})
export class AuthModule {}
```

### Option 5: Using the Convenience Helper Function (Recommended)

The easiest way to integrate Google Identity Platform with NestJS is using the `googleIdentityPlatformAuthConfig()` helper function:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule, googleIdentityPlatformAuthConfig } from '@package/auth';

@Module({
  imports: [
    AuthModule.forRoot({
      providers: [
        googleIdentityPlatformAuthConfig({
          default: true,
          // Optionally override environment values
          timeout: 10000
        })
      ],
      jwt: {
        secretOrKey: process.env.JWT_SECRET,
        issuer: `https://securetoken.google.com/${process.env.GOOGLE_CLOUD_PROJECT_ID}`,
        audience: process.env.FIREBASE_CLIENT_ID,
        algorithm: 'RS256'
      },
      tokenStorage: {
        enabled: true,
        enableRotation: true,
        enableBlacklisting: true
      }
    })
  ]
})
export class AppModule {}
```

**Environment Variables:**

```bash
# Required
GOOGLE_CLOUD_PROJECT_ID=your-project-id
# or
FIREBASE_PROJECT_ID=your-project-id

# Optional
FIREBASE_CLIENT_ID=your-firebase-client-id
FIREBASE_CLIENT_SECRET=your-firebase-client-secret
FIREBASE_API_KEY=your-firebase-api-key
FIREBASE_TENANT_ID=your-firebase-tenant-id
```

### Option 6: Using the New Configuration Layer (Recommended)

For more flexibility, use the new configuration layer:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '@package/auth';
import { resolveConfig } from '@package/auth/config';

// Get resolved configuration
const config = resolveConfig({
  googleIdentityPlatform: {
    projectId: 'my-project-id',
    clientId: 'your-firebase-client-id',
    tenantId: 'tenant-abc123',
    timeout: 10000,
    serviceAccount: {
      projectId: 'my-project-id',
      clientEmail: 'firebase-adminsdk@my-project-id.iam.gserviceaccount.com',
      privateKey: process.env.FIREBASE_PRIVATE_KEY
    }
  }
});

// Use configuration to create provider manually or with AuthModule
console.log(config.googleIdentityPlatform.projectId); // 'my-project-id'
```

## Usage Examples

### Basic Authentication

```typescript
import { GoogleIdentityPlatformAuthProvider } from '@package/auth';

const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key'
});

// Authenticate user with email and password
const result = await provider.authenticate({
  username: 'user@example.com',
  password: 'secure-password'
});

console.log(result.accessToken); // JWT access token
console.log(result.refreshToken); // Refresh token for token renewal
console.log(result.idToken); // Firebase ID token
console.log(result.expiresIn); // Token expiration in seconds (3600)
```

### Token Validation

```typescript
// Validate an access token
const validation = await provider.validateToken(accessToken);

if (validation.valid) {
  console.log('User ID:', validation.userId);
  console.log('Tenant ID:', validation.tenantId);
  console.log('Expires at:', validation.exp);
} else {
  console.error('Invalid token:', validation.error);
}
```

### Token Refresh

```typescript
// Refresh access token using refresh token
const refreshResult = await provider.refreshToken(refreshToken);

console.log('New access token:', refreshResult.accessToken);
console.log('New refresh token:', refreshResult.refreshToken);
console.log('Token rotated:', refreshResult.rotated); // true if refresh token was rotated
```

### Logout

```typescript
// Logout user and revoke tokens
await provider.logout(refreshToken);

// Optionally blacklist access token
await provider.logout(refreshToken, accessToken);
```

#### Token Blacklisting Limitations

**Important:** Firebase ID tokens do not include a JWT ID (jti) claim by default. This means:

1. **Token Uniqueness:** Traditional token blacklisting relies on unique token identifiers (jti)
2. **Current Implementation:** We use the full token hash as the blacklist key
3. **Implications:**
   - Tokens can still be blacklisted, but the approach is different
   - Blacklisting uses token hash rather than jti
   - Multiple valid tokens for the same user can exist simultaneously
   - Revocation affects only specific token instances

**Workaround Options:**

If you need immediate user-wide revocation:

1. **Revoke all refresh tokens:** Use Firebase Admin SDK's revokeRefreshTokens()

   ```typescript
   import admin from 'firebase-admin';
   const auth = admin.auth();
   await auth.revokeRefreshTokens(uid);
   ```

2. **Disable the user account:** For immediate revocation

   ```typescript
   import admin from 'firebase-admin';
   const auth = admin.auth();
   await auth.updateUser(uid, { disabled: true });
   ```

3. **Use custom claims with version:** Implement token versioning in custom claims

   ```typescript
   import admin from 'firebase-admin';
   const auth = admin.auth();

   // Set token version
   await auth.setCustomUserClaims(uid, { tokenVersion: Date.now() });

   // Validate version in your application
   const decoded = await auth.verifyIdToken(token);
   if (decoded.tokenVersion < latestVersion) {
     throw new Error('Token expired');
   }
   ```

4. **Short-lived tokens:** Use shorter token expiration times (default is 1 hour)

### Get User Information

```typescript
// Get user info by user ID
const userInfo = await provider.getUserInfo(userId, tenantId);

console.log('User ID:', userInfo.userId);
console.log('Email:', userInfo.email);
console.log('Name:', userInfo.name);
console.log('Roles:', userInfo.roles);
console.log('Permissions:', userInfo.permissions);
```

### Extract User Info from Token

```typescript
// Extract user info directly from token (no API call)
const userInfo = await provider.getUserInfoFromToken(idToken);

console.log('User ID:', userInfo.userId);
console.log('Email:', userInfo.email);
console.log('Email Verified:', userInfo.emailVerified);
console.log('Roles:', userInfo.roles); // From custom claims
console.log('Permissions:', userInfo.permissions); // From custom claims
```

### Get User Roles

```typescript
// Get roles from Firebase custom claims
const roles = await provider.getRoles(userId, tenantId);

console.log('User roles:', roles);
// Output: ['admin', 'user']
```

### Extract Roles from Token

```typescript
// Extract roles directly from token custom claims
const roles = await provider.getRolesFromToken(idToken);

console.log('Roles from token:', roles);
// Output: ['admin', 'user']
```

### Get User Permissions

```typescript
// Get permissions from Firebase custom claims
const permissions = await provider.getPermissions(userId, tenantId);

console.log('Permissions:', permissions);
// Output: ['read:own', 'write:own', 'delete:own']
```

### Extract Permissions from Token

```typescript
// Extract permissions directly from token custom claims
const permissions = await provider.getPermissionsFromToken(idToken);

console.log('Permissions from token:', permissions);
// Output: ['read:own', 'write:own', 'delete:own']
```

### Health Check

```typescript
// Check if the provider is available
const isAvailable = await provider.isAvailable();

if (isAvailable) {
  console.log('Google Identity Platform is available');
} else {
  console.error('Google Identity Platform is not available');
}

// Perform health check
const isHealthy = await provider.healthCheck();

console.log('Health check result:', isHealthy);
```

## Multi-Tenancy

Google Cloud Identity Platform supports multi-tenancy through **Tenant-aware authentication**. Each tenant has an isolated user pool.

### Creating Tenants

1. In Firebase Console, go to **Authentication** > **Tenant management**
2. Click **Add tenant**
3. Configure tenant settings (display name, enable providers, etc.)
4. Note the **Tenant ID**

### Tenant-Specific Authentication

```typescript
const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key',
  tenantId: 'tenant-abc123' // Default tenant for all operations
});

// Authenticate with tenant-specific auth
const result = await provider.authenticate({
  username: 'user@example.com',
  password: 'password',
  tenantId: 'tenant-abc123' // Override default tenant
});

// Token will include tenant_id claim
const validation = await provider.validateToken(result.accessToken);
console.log('Tenant ID:', validation.tenantId);
```

### Tenant-Aware User Management

```typescript
// Get user info for specific tenant
const userInfo = await provider.getUserInfo(userId, 'tenant-abc123');

// Get roles for specific tenant
const roles = await provider.getRoles(userId, 'tenant-abc123');
```

### Custom Claims per Tenant

You can set different custom claims (roles, permissions) for users in different tenants:

```typescript
import admin from 'firebase-admin';

// Set custom claims for a user in a specific tenant
const auth = admin.auth();
const tenantAuth = auth.tenantManager().authForTenant('tenant-abc123');

await tenantAuth.setCustomUserClaims(userId, {
  roles: ['admin'],
  permissions: ['read:all', 'write:all', 'delete:all']
});
```

## Migration Guide

### Migrating from Keycloak

Google Cloud Identity Platform can replace Keycloak for many use cases. Here's how to migrate:

#### Configuration Mapping

| Keycloak      | Google Identity Platform     |
| ------------- | ---------------------------- |
| Realm         | Tenant                       |
| Client        | Firebase Project             |
| User          | User Record                  |
| Role          | Custom Claim (`roles`)       |
| Permission    | Custom Claim (`permissions`) |
| Client Secret | API Key                      |

#### Migration Steps

1. **Create Firebase Project**: Set up a new Firebase project
2. **Create Tenants**: Create a tenant for each Keycloak realm
3. **Migrate Users**: Export users from Keycloak and import to Firebase
4. **Map Roles**: Convert Keycloak roles to Firebase custom claims
5. **Update Application**: Switch from Keycloak adapter to Firebase Admin SDK

#### User Migration Script

```typescript
import admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const auth = admin.auth();

async function migrateUser(keycloakUser: any) {
  try {
    const userRecord = await auth.createUser({
      email: keycloakUser.email,
      emailVerified: keycloakUser.emailVerified,
      password: keycloakUser.password, // Requires password hash migration
      displayName: keycloakUser.firstName + ' ' + keycloakUser.lastName,
      disabled: !keycloakUser.enabled
    });

    // Set custom claims for roles and permissions
    const roles = keycloakUser.realmAccess.roles || [];
    const permissions = keycloakUser.resourceAccess || [];

    await auth.setCustomUserClaims(userRecord.uid, {
      roles,
      permissions
    });

    console.log(`Migrated user: ${keycloakUser.email}`);
  } catch (error) {
    console.error(`Failed to migrate user: ${error.message}`);
  }
}
```

### Migrating from Google OAuth

If you're currently using Google OAuth provider, you can upgrade to Identity Platform for more features:

#### What Changes

- **Before**: Google OAuth provider (social login only)
- **After**: Identity Platform (social + email/password + multi-tenancy)

#### Migration Benefits

- Multi-tenancy support
- Email/password authentication
- Custom claims for roles/permissions
- Better user management
- Token refresh handling

#### Code Changes

```typescript
// Before: Google OAuth provider
const googleProvider = new GoogleAuthProvider();

// After: Google Identity Platform provider
const identityProvider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key'
});

// Authentication calls remain similar
const result = await identityProvider.authenticate({
  username: 'user@example.com',
  password: 'password' // Now supports email/password
});
```

### Data Migration Considerations

When migrating authentication systems:

1. **Password Hashes**: Firebase uses SCRAM; you may need to implement password migration
2. **User IDs**: Generate new Firebase UIDs; maintain mapping table
3. **Sessions**: Existing sessions will be invalidated; users need to re-authenticate
4. **Tokens**: Refresh tokens cannot be migrated; users need to re-login
5. **Custom Data**: Convert user attributes to Firebase custom claims or database fields

## Troubleshooting

### Common Issues and Solutions

#### 1. "Invalid credential" Error

**Symptom**: `app/invalid-credential` error when initializing the provider.

**Causes**:

- Invalid service account private key format
- Missing newlines in private key
- Expired service account key

**Solutions**:

```typescript
// Ensure private key has proper newlines
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key',
  serviceAccount: {
    projectId: 'my-project-id',
    clientEmail: 'firebase-adminsdk@my-project-id.iam.gserviceaccount.com',
    privateKey // Use properly formatted key
  }
});
```

#### 2. "User not found" Error

**Symptom**: `Firebase: No user record found for the given identifier.`

**Causes**:

- User doesn't exist in Firebase
- Wrong tenant ID
- User was deleted

**Solutions**:

```typescript
// Check if user exists
try {
  const userInfo = await provider.getUserInfo(userId, tenantId);
  console.log('User found:', userInfo);
} catch (error) {
  if (error.message.includes('USER_NOT_FOUND')) {
    // User doesn't exist; create the user
    console.log('User not found. Please create the user first.');
  }
}
```

#### 3. Token Validation Fails

**Symptom**: Token validation returns `valid: false`.

**Causes**:

- Token expired
- Token malformed
- Token revoked
- Wrong API key

**Solutions**:

```typescript
const validation = await provider.validateToken(token);

if (!validation.valid) {
  if (validation.error?.includes('Token expired')) {
    // Refresh the token
    const refreshResult = await provider.refreshToken(refreshToken);
    console.log('New token:', refreshResult.accessToken);
  } else if (validation.error?.includes('Token revoked')) {
    // User needs to re-authenticate
    console.log('Token revoked. Please login again.');
  } else {
    console.error('Token validation failed:', validation.error);
  }
}
```

#### 4. Token Revocation Not Working

**Issue:** Revoked tokens are still accepted

**Possible Causes:**

1. Token blacklisting relies on token hash, not jti (Firebase limitation)
2. Multiple valid tokens exist for the same user
3. Redis blacklist not configured properly

**Solutions:**

1. Use `revokeRefreshTokens()` to prevent token refresh:

   ```typescript
   import admin from 'firebase-admin';
   const auth = admin.auth();
   await auth.revokeRefreshTokens(uid);
   ```

2. Disable the user account for immediate revocation:

   ```typescript
   import admin from 'firebase-admin';
   const auth = admin.auth();
   await auth.updateUser(uid, { disabled: true });
   ```

3. Implement token versioning with custom claims:

   ```typescript
   import admin from 'firebase-admin';
   const auth = admin.auth();

   // Increment token version
   await auth.setCustomUserClaims(uid, {
     tokenVersion: Date.now()
   });
   ```

4. Reduce token expiration time for shorter validity windows

#### 5. Multi-Tenancy Issues

**Symptom**: Users from one tenant can access another tenant's data.

**Causes**:

- Not using tenant-aware auth
- Missing tenant ID in requests
- Custom claims not set per tenant

**Solutions**:

```typescript
// Always specify tenant ID
const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key',
  tenantId: 'tenant-abc123' // Set default tenant
});

// Use tenant-aware auth for all operations
const userInfo = await provider.getUserInfo(userId, 'tenant-abc123');
const roles = await provider.getRoles(userId, 'tenant-abc123');
```

#### 6. Performance Issues

**Symptom**: Slow authentication or token validation.

**Causes**:

- Network latency to Firebase servers
- Large custom claims
- Not using token caching

**Solutions**:

```typescript
// Cache token validation results
import { LRUCache } from 'lru-cache';

const tokenCache = new LRUCache<string, TokenValidationResult>({
  max: 1000,
  ttl: 60000 // 1 minute
});

async function validateTokenWithCache(token: string) {
  const cached = tokenCache.get(token);
  if (cached) {
    return cached;
  }

  const result = await provider.validateToken(token);
  if (result.valid) {
    tokenCache.set(token, result);
  }

  return result;
}
```

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
import { logger } from '@package/core';

// Enable debug logging
process.env.DEBUG = 'firebase-admin';

const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key'
});

// Add logging
logger.debug('Firebase provider initialized', {
  projectId: provider.projectId,
  type: provider.type
});
```

### Connection Issues

If you're having trouble connecting to Firebase:

1. **Check network connectivity**:

   ```bash
   curl https://firebase.google.com
   ```

2. **Verify API key** in Firebase Console

3. **Check service account permissions**:
   - Go to IAM & Admin > Service Accounts
   - Verify "Firebase Authentication Admin" role

4. **Test with Firebase Admin SDK directly**:

   ```typescript
   import admin from 'firebase-admin';

   const app = admin.initializeApp({
     credential: admin.credential.applicationDefault()
   });

   const auth = admin.auth();
   const user = await auth.getUser('test-user-id');
   console.log('Connection successful:', user);
   ```

## FAQ

### How does Google Identity Platform differ from Google OAuth provider?

| Feature             | Google OAuth      | Google Identity Platform             |
| ------------------- | ----------------- | ------------------------------------ |
| Authentication      | Social login only | Email/password + OAuth + SAML + OIDC |
| Multi-tenancy       | No                | Yes                                  |
| Custom claims       | No                | Yes                                  |
| User management     | Limited           | Full CRUD operations                 |
| Token refresh       | Manual            | Automatic                            |
| Enterprise features | No                | Yes (SAML, OIDC, MFA)                |

### Can I use multiple providers simultaneously?

Yes! You can use multiple auth providers in your application:

```typescript
import { AuthProviderFactory } from '@package/auth';

const factory = new AuthProviderFactory();

// Register multiple providers
factory.register('keycloak', KeycloakAuthProvider);
factory.register('google-identity', GoogleIdentityPlatformAuthProvider);

// Use different providers for different use cases
const keycloakProvider = factory.create('keycloak', keycloakOptions);
const googleProvider = factory.create('google-identity', googleOptions);
```

### How do I handle token rotation?

Firebase Identity Platform automatically rotates refresh tokens for security. When you call `refreshToken()`, you'll get a new refresh token:

```typescript
const refreshResult = await provider.refreshToken(oldRefreshToken);

if (refreshResult.rotated) {
  // Update stored refresh token
  await saveRefreshToken(refreshResult.refreshToken);
}
```

Always store and use the latest refresh token.

### What about custom claims?

Custom claims are key-value pairs stored in Firebase ID tokens. Use them for roles and permissions:

```typescript
import admin from 'firebase-admin';

const auth = admin.auth();

// Set custom claims
await auth.setCustomUserClaims(userId, {
  roles: ['admin', 'user'],
  permissions: ['read:all', 'write:all'],
  tenantId: 'tenant-abc123',
  subscription: 'premium'
});

// Custom claims are available in tokens
const userInfo = await provider.getUserInfoFromToken(idToken);
console.log(userInfo.roles); // ['admin', 'user']
console.log(userInfo.permissions); // ['read:all', 'write:all']
```

### How does multi-tenancy work?

Each tenant has an isolated user pool:

```typescript
const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'my-project-id',
  apiKey: 'my-api-key',
  tenantId: 'tenant-abc123' // Tenant-specific auth
});

// All operations are scoped to this tenant
const result = await provider.authenticate({
  username: 'user@example.com',
  password: 'password',
  tenantId: 'tenant-abc123'
});

// Token includes tenant_id claim
const validation = await provider.validateToken(result.accessToken);
console.log('Tenant:', validation.tenantId);
```

### Can I use Firebase Authentication Emulator?

Yes! For local development, use the Firebase Auth Emulator:

```bash
# Install Firebase CLI
pnpm add -g firebase-tools

# Start emulator
firebase emulators:start --only auth
```

```typescript
// Set emulator host
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: 'demo-project',
  apiKey: 'demo-api-key'
});
```

### How do I migrate users from another system?

See the [Migration Guide](#migration-guide) section above for detailed steps on migrating from Keycloak or other systems.

### What's the difference between `getUserInfo` and `getUserInfoFromToken`?

- **`getUserInfo(userId, tenantId)`**: Fetches user info from Firebase Admin SDK (requires API call)
- **`getUserInfoFromToken(token)`**: Extracts user info from token (no API call, faster)

Use `getUserInfoFromToken` for performance when you have a valid token.

### How do I handle email verification?

```typescript
import admin from 'firebase-admin';

const auth = admin.auth();

// Send verification email
await auth.generateEmailVerificationLink(userEmail);

// Check if email is verified
const user = await auth.getUser(userId);
console.log('Email verified:', user.emailVerified);

// Verify email
const provider = new GoogleIdentityPlatformAuthProvider(options);
const userInfo = await provider.getUserInfo(userId, tenantId);
console.log('Email verified:', userInfo.emailVerified);
```

### Can I use this with Next.js?

Yes! The provider works with Next.js API routes and server actions:

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleIdentityPlatformAuthProvider } from '@package/auth';

const provider = new GoogleIdentityPlatformAuthProvider({
  projectId: process.env.FIREBASE_PROJECT_ID,
  apiKey: process.env.FIREBASE_API_KEY,
  serviceAccount: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
  }
});

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  const result = await provider.authenticate({
    username: email,
    password
  });

  return NextResponse.json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken
  });
}
```

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Cloud Identity Platform Documentation](https://cloud.google.com/identity-platform)
- [Firebase Admin SDK Reference](https://firebase.google.com/docs/reference/admin)
- [Firebase Authentication Best Practices](https://firebase.google.com/docs/auth/best-practices)

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review [Firebase Documentation](https://firebase.google.com/docs)
3. Open an issue in the repository
