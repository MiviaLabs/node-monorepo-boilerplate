/**
 * Google Cloud Identity Platform Provider - Complete Usage Example
 *
 * This example demonstrates all major features of the Google Cloud Identity Platform
 * authentication provider including authentication, token management, user management,
 * roles and permissions, multi-tenancy, and error handling.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable @nx/enforce-module-boundaries */
/* eslint-disable import/order */

import { GoogleIdentityPlatformAuthProvider } from '@package/auth';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Option 1: Service Account (Production)
const providerWithServiceAccount = new GoogleIdentityPlatformAuthProvider({
  name: 'google-identity-platform',
  projectId: 'my-project-id',
  apiKey: 'AIzaSy...', // From Firebase Console > Project Settings > General
  serviceAccount: {
    projectId: 'my-project-id',
    clientEmail: 'firebase-adminsdk@my-project-id.iam.gserviceaccount.com',
    privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----\n` // Note the \n for proper line breaks
  },
  timeout: 10000 // Request timeout in milliseconds
});

// Option 2: Application Default Credentials (ADC)
// Use this for Google Cloud environments (Cloud Run, GKE, Compute Engine)
const providerWithADC = new GoogleIdentityPlatformAuthProvider({
  name: 'google-identity-platform',
  projectId: 'my-project-id',
  apiKey: 'AIzaSy...',
  // ADC will be used automatically if serviceAccount is not provided
  timeout: 10000
});

// Option 3: Environment Variables
const providerFromEnv = new GoogleIdentityPlatformAuthProvider({
  name: 'google-identity-platform',
  projectId: process.env['FIREBASE_PROJECT_ID'],
  apiKey: process.env['FIREBASE_API_KEY'],
  serviceAccount: {
    projectId: process.env['FIREBASE_PROJECT_ID'],
    clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
    privateKey: process.env['FIREBASE_PRIVATE_KEY']
  },
  timeout: parseInt(process.env['FIREBASE_TIMEOUT'] || '10000', 10)
});

// Use one of the configured providers
const provider = providerWithServiceAccount;

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Authenticate user with email and password
 */
async function authenticateUser() {
  try {
    const result = await provider.authenticate({
      username: 'user@example.com',
      password: 'secure-password',
      tenantId: 'tenant-abc123' // Optional: for multi-tenancy
    });

    console.log('Authentication successful!');
    console.log('Access Token:', result.accessToken);
    console.log('Refresh Token:', result.refreshToken);
    console.log('ID Token:', result.idToken);
    console.log('Expires In:', result.expiresIn, 'seconds');
    console.log('Refresh Expires In:', result.refreshExpiresIn, 'seconds');

    return result;
  } catch (error) {
    console.error('Authentication failed:', error.message);
    throw error;
  }
}

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

/**
 * Validate an access token
 */
async function validateAccessToken(accessToken: string) {
  const validation = await provider.validateToken(accessToken);

  if (validation.valid) {
    console.log('Token is valid!');
    console.log('User ID:', validation.userId);
    console.log('Tenant ID:', validation.tenantId);
    console.log('Expires at:', new Date(validation.exp * 1000).toISOString());
  } else {
    console.error('Token is invalid:', validation.error);
  }

  return validation;
}

/**
 * Check if token is expired
 */
async function checkTokenExpiration(accessToken: string) {
  const validation = await provider.validateToken(accessToken);

  if (validation.valid && validation.exp) {
    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = validation.exp - now;

    if (timeUntilExpiry < 300) {
      // Less than 5 minutes remaining
      console.warn('Token will expire soon. Consider refreshing.');
      return true;
    }
  }

  return false;
}

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken: string) {
  try {
    const result = await provider.refreshToken(refreshToken);

    console.log('Token refreshed successfully!');
    console.log('New Access Token:', result.accessToken);
    console.log('New Refresh Token:', result.refreshToken);
    console.log('Token Rotated:', result.rotated);

    // Important: Always update your stored refresh token
    // if rotation occurred
    if (result.rotated) {
      console.log('Refresh token was rotated. Update stored token.');
      // await saveRefreshToken(result.refreshToken);
    }

    return result;
  } catch (error) {
    console.error('Token refresh failed:', error.message);
    throw error;
  }
}

/**
 * Proactive token refresh (before expiration)
 */
async function proactiveRefresh(refreshToken: string) {
  const { accessToken } = await provider.refreshToken(refreshToken);
  console.log('Token refreshed proactively:', accessToken);
  return accessToken;
}

// ============================================================================
// LOGOUT
// ============================================================================

/**
 * Logout user and revoke tokens
 */
async function logoutUser(refreshToken: string, accessToken?: string) {
  try {
    // Logout and revoke refresh token
    await provider.logout(refreshToken);

    // Optionally blacklist access token for immediate revocation
    if (accessToken) {
      await provider.logout(refreshToken, accessToken);
      console.log('Access token blacklisted');
    }

    console.log('Logout successful!');
  } catch (error) {
    console.error('Logout failed:', error.message);
    throw error;
  }
}

// ============================================================================
// USER INFORMATION
// ============================================================================

/**
 * Get user information by user ID
 */
async function getUserInformation(userId: string, tenantId: string) {
  try {
    const userInfo = await provider.getUserInfo(userId, tenantId);

    console.log('User Information:');
    console.log('User ID:', userInfo.userId);
    console.log('Username:', userInfo.username);
    console.log('Email:', userInfo.email);
    console.log('Name:', userInfo.name);
    console.log('Given Name:', userInfo.givenName);
    console.log('Family Name:', userInfo.familyName);
    console.log('Email Verified:', userInfo.emailVerified);
    console.log('Tenant ID:', userInfo.tenantId);
    console.log('Roles:', userInfo.roles);
    console.log('Permissions:', userInfo.permissions);
    console.log('Attributes:', userInfo.attributes);

    return userInfo;
  } catch (error) {
    console.error('Failed to get user info:', error.message);
    throw error;
  }
}

/**
 * Extract user information from token (no API call)
 */
async function extractUserInfoFromToken(idToken: string) {
  try {
    const userInfo = await provider.getUserInfoFromToken(idToken);

    console.log('User Info from Token:');
    console.log('User ID:', userInfo.userId);
    console.log('Email:', userInfo.email);
    console.log('Email Verified:', userInfo.emailVerified);
    console.log('Roles:', userInfo.roles);
    console.log('Permissions:', userInfo.permissions);
    console.log('Tenant ID:', userInfo.tenantId);

    return userInfo;
  } catch (error) {
    console.error('Failed to extract user info:', error.message);
    throw error;
  }
}

// ============================================================================
// ROLES AND PERMISSIONS
// ============================================================================

/**
 * Get user roles from Firebase custom claims
 */
async function getUserRoles(userId: string, tenantId: string) {
  try {
    const roles = await provider.getRoles(userId, tenantId);

    console.log('User Roles:', roles);
    // Output: ['admin', 'user', 'moderator']

    return roles;
  } catch (error) {
    console.error('Failed to get roles:', error.message);
    throw error;
  }
}

/**
 * Extract roles from token custom claims (faster, no API call)
 */
async function extractRolesFromToken(idToken: string) {
  try {
    const roles = await provider.getRolesFromToken(idToken);

    console.log('Roles from Token:', roles);
    // Output: ['admin', 'user']

    return roles;
  } catch (error) {
    console.error('Failed to extract roles:', error.message);
    throw error;
  }
}

/**
 * Check if user has specific role
 */
async function hasRole(userId: string, tenantId: string, requiredRole: string) {
  const roles = await provider.getRoles(userId, tenantId);
  return roles.includes(requiredRole);
}

/**
 * Get user permissions from Firebase custom claims
 */
async function getUserPermissions(userId: string, tenantId: string) {
  try {
    const permissions = await provider.getPermissions(userId, tenantId);

    console.log('User Permissions:', permissions);
    // Output: ['read:own', 'write:own', 'delete:own', 'read:all']

    return permissions;
  } catch (error) {
    console.error('Failed to get permissions:', error.message);
    throw error;
  }
}

/**
 * Extract permissions from token custom claims (faster, no API call)
 */
async function extractPermissionsFromToken(idToken: string) {
  try {
    const permissions = await provider.getPermissionsFromToken(idToken);

    console.log('Permissions from Token:', permissions);
    // Output: ['read:own', 'write:own', 'delete:own']

    return permissions;
  } catch (error) {
    console.error('Failed to extract permissions:', error.message);
    throw error;
  }
}

/**
 * Check if user has specific permission
 */
async function hasPermission(userId: string, tenantId: string, requiredPermission: string) {
  const permissions = await provider.getPermissions(userId, tenantId);
  return permissions.includes(requiredPermission);
}

// ============================================================================
// MULTI-TENANCY
// ============================================================================

/**
 * Configure provider for specific tenant
 */
const tenantProvider = new GoogleIdentityPlatformAuthProvider({
  name: 'tenant-provider',
  projectId: 'my-project-id',
  apiKey: 'AIzaSy...',
  tenantId: 'tenant-abc123' // Default tenant for all operations
});

/**
 * Authenticate user in specific tenant
 */
async function authenticateInTenant(username: string, password: string, tenantId: string) {
  const result = await provider.authenticate({
    username,
    password,
    tenantId // Tenant-specific authentication
  });

  // Token will include tenant_id claim
  const validation = await provider.validateToken(result.accessToken);
  console.log('Tenant ID in token:', validation.tenantId);

  return result;
}

/**
 * Get user info for specific tenant
 */
async function getTenantUserInfo(userId: string, tenantId: string) {
  const userInfo = await provider.getUserInfo(userId, tenantId);
  console.log('User in tenant:', tenantId, userInfo);
  return userInfo;
}

/**
 * Get roles for specific tenant
 */
async function getTenantRoles(userId: string, tenantId: string) {
  const roles = await provider.getRoles(userId, tenantId);
  console.log('Roles in tenant:', tenantId, roles);
  return roles;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if the provider is available
 */
async function checkProviderAvailability() {
  const isAvailable = await provider.isAvailable();

  if (isAvailable) {
    console.log('Google Identity Platform is available');
  } else {
    console.error('Google Identity Platform is not available');
  }

  return isAvailable;
}

/**
 * Perform health check
 */
async function healthCheck() {
  const isHealthy = await provider.healthCheck();

  if (isHealthy) {
    console.log('Health check passed');
  } else {
    console.error('Health check failed');
  }

  return isHealthy;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Comprehensive error handling example
 */
async function handleErrors() {
  try {
    // Authentication error
    await provider.authenticate({
      username: 'user@example.com',
      password: 'wrong-password'
    });
  } catch (error) {
    if (error.message.includes('INVALID_EMAIL_OR_PASSWORD')) {
      console.error('Invalid credentials provided');
    } else if (error.message.includes('USER_NOT_FOUND')) {
      console.error('User does not exist');
    } else {
      console.error('Authentication error:', error.message);
    }
  }

  try {
    // Token validation error
    const validation = await provider.validateToken('invalid-token');
    if (!validation.valid) {
      console.error('Token validation failed:', validation.error);
    }
  } catch (error) {
    console.error('Token error:', error.message);
  }

  try {
    // User info retrieval error
    await provider.getUserInfo('non-existent-user', 'tenant-abc123');
  } catch (error) {
    if (error.message.includes('USER_NOT_FOUND')) {
      console.error('User not found');
    } else {
      console.error('User info error:', error.message);
    }
  }
}

// ============================================================================
// NESTJS MODULE INTEGRATION
// ============================================================================

/**
 * Example NestJS module configuration
 */
import { Module } from '@nestjs/common';
import { AuthProviderFactory } from '@package/auth';

@Module({
  providers: [
    {
      provide: 'AUTH_PROVIDER',
      useFactory: () => {
        const factory = new AuthProviderFactory();

        // Register Google Identity Platform provider
        factory.register('google-identity-platform', (options) => {
          return new GoogleIdentityPlatformAuthProvider({
            ...options,
            projectId: process.env['FIREBASE_PROJECT_ID'],
            apiKey: process.env['FIREBASE_API_KEY'],
            serviceAccount: {
              projectId: process.env['FIREBASE_PROJECT_ID'],
              clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
              privateKey: process.env['FIREBASE_PRIVATE_KEY']
            }
          });
        });

        // Create provider instance
        return factory.create('google-identity-platform', {
          name: 'google-identity-platform'
        });
      }
    }
  ],
  exports: ['AUTH_PROVIDER']
})
export class AuthModule {}

// ============================================================================
// COMPLETE AUTHENTICATION FLOW
// ============================================================================

/**
 * Complete authentication workflow
 */
async function completeAuthenticationFlow() {
  try {
    // Step 1: Authenticate user
    console.log('=== Step 1: Authentication ===');
    const authResult = await provider.authenticate({
      username: 'user@example.com',
      password: 'secure-password',
      tenantId: 'tenant-abc123'
    });

    // Step 2: Validate access token
    console.log('\n=== Step 2: Token Validation ===');
    const validation = await provider.validateToken(authResult.accessToken);
    console.log('Token valid:', validation.valid);
    console.log('User ID:', validation.userId);

    // Step 3: Extract user info from token
    console.log('\n=== Step 3: User Information ===');
    const userInfo = await provider.getUserInfoFromToken(authResult.idToken);
    console.log('User:', userInfo.email);
    console.log('Roles:', userInfo.roles);
    console.log('Permissions:', userInfo.permissions);

    // Step 4: Check permissions
    console.log('\n=== Step 4: Permission Check ===');
    const hasReadPermission = userInfo.permissions.includes('read:own');
    console.log('Has read:own permission:', hasReadPermission);

    // Step 5: Refresh token (simulated before expiration)
    console.log('\n=== Step 5: Token Refresh ===');
    const refreshResult = await provider.refreshToken(authResult.refreshToken);
    console.log('New access token:', refreshResult.accessToken);

    // Step 6: Logout
    console.log('\n=== Step 6: Logout ===');
    await provider.logout(refreshResult.refreshToken, refreshResult.accessToken);
    console.log('Logout successful');
  } catch (error) {
    console.error('Authentication flow failed:', error.message);
  }
}

// ============================================================================
// ASYNC OPERATIONS EXAMPLE
// ============================================================================

/**
 * Handle concurrent authentication requests
 */
async function handleConcurrentRequests() {
  const requests = [
    provider.authenticate({
      username: 'user1@example.com',
      password: 'password1'
    }),
    provider.authenticate({
      username: 'user2@example.com',
      password: 'password2'
    }),
    provider.authenticate({
      username: 'user3@example.com',
      password: 'password3'
    })
  ];

  try {
    const results = await Promise.all(requests);
    console.log('All authentications successful:', results.length);
    return results;
  } catch (error) {
    console.error('One or more authentications failed:', error.message);
    throw error;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

/**
 * Main execution function (for demonstration)
 */
async function main() {
  try {
    console.log('=== Google Cloud Identity Platform Example ===\n');

    // Check provider health
    await healthCheck();
    console.log();

    // Run complete authentication flow
    await completeAuthenticationFlow();
    console.log();

    console.log('Example completed successfully!');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

// Run main if executed directly
if (require.main === module) {
  main();
}

// Export functions for testing
export {
  authenticateUser,
  validateAccessToken,
  refreshAccessToken,
  logoutUser,
  getUserInformation,
  extractUserInfoFromToken,
  getUserRoles,
  extractRolesFromToken,
  getUserPermissions,
  extractPermissionsFromToken,
  checkProviderAvailability,
  healthCheck,
  completeAuthenticationFlow
};
