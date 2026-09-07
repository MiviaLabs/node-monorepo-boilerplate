/**
 * @package/auth
 *
 * Enterprise-grade authentication infrastructure with support for:
 * - Multiple auth providers (Keycloak, AWS Cognito, Google, Azure AD)
 * - JWT token validation and verification
 * - Token refresh with rotation
 * - Role and permission-based access control
 * - OpenTelemetry integration
 * - NestJS module support
 *
 * Related packages:
 * - `@package/constants` - SystemRole, TenantRole, and Permission constants
 * - `@package/redis` - Session caching and token storage
 * - `@package/encryption` - Token encryption and key rotation
 * - `@package/db-core` - User data persistence
 * - `@package/observability` - Authentication tracing
 *
 * @packageDocumentation
 */

// ====================================================================
// Core Module
// ====================================================================
export * from './auth.module';

// ====================================================================
// Errors
// ====================================================================
export * from './errors';
export * from './errors/index';

// ====================================================================
// Providers
// {@link IAuthProvider} - Auth provider interface
// {@link BaseAuthProvider} - Base implementation for providers
// {@link AuthProviderFactory} - Factory for creating providers
// {@link KeycloakProvider} - Keycloak integration
// {@link GoogleProvider} - Google OAuth integration
// ====================================================================
export * from './providers/auth-provider.interface';
export * from './providers/base-auth-provider';
export * from './providers/factory';
export * from './providers/factory.types';
export * from './providers/keycloak.provider';
export * from './providers/google.provider';
export * from './providers/google-identity-platform.provider';
// Note: CustomJwtAuthProvider exports selectively to avoid conflicts with factory.types
// ReplayDetectionFailBehavior is exported via factory.types (export * above)
export {
  CustomJwtAuthProvider,
  // CustomJwtProviderDependencies extends the factory.types version
  type CustomJwtProviderDependencies
} from './providers/custom-jwt.provider';

// ====================================================================
// Services
// ====================================================================
export * from './services/auth.service';
export * from './services/jwt.service';
export * from './services/token.service';
export * from './services/token-usage-tracking.service';
export * from './services/permission.service';
export * from './services/role.service';
export * from './services/cached-permission.service';
export * from './services/cached-role.service';
export * from './services/key-rotation.service';

// ====================================================================
// Guards
// {@link JwtAuthGuard} - JWT token validation guard
// {@link RolesGuard} - Role-based access control
// {@link PermissionsGuard} - Permission-based access control
// See `@package/constants` for SystemRole and TenantRole enums
// ====================================================================
export * from './guards';

// ====================================================================
// Decorators
// {@link Public} - Mark route as publicly accessible
// {@link Roles} - Require specific roles for access
// {@link RequirePermissions} - Require specific permissions
// {@link CurrentUser} - Extract authenticated user from request
// See `@package/constants` for role and permission constants
// ====================================================================
export * from './decorators/public.decorator';
export * from './decorators/roles.decorator';
export {
  RequirePermissions,
  RequireAnyPermission,
  CanCreate,
  CanRead,
  CanUpdate,
  CanDelete
} from './decorators/permissions.decorator';
export * from './decorators/user.decorator';
// Note: require-permissions.decorator exports a conflicting RequirePermissions decorator
// Import directly from '@package/auth/decorators/require-permissions.decorator' if needed
export * from './decorators/require-system-role.decorator';
export * from './decorators/require-tenant-role.decorator';

// ====================================================================
// Strategies
// ====================================================================
export * from './strategies/jwt.strategy';

// ====================================================================
// Configuration
// ====================================================================
export * from './config/auth-config';
// Export new configuration layer to avoid conflicts with TokenStorageConfig
export {
  type InfrastructureAuthConfig,
  type ResolvedInfrastructureAuthConfig,
  type KeycloakConfig,
  type GoogleConfig,
  type GoogleIdentityPlatformConfig,
  type JwtConfig,
  type TokenStorageConfig as NewTokenStorageConfig,
  type RedisKeyPrefixConfig,
  type EnvironmentVariableNames,
  type ResolvedKeycloakConfig,
  type ResolvedGoogleConfig,
  type ResolvedGoogleIdentityPlatformConfig,
  type ResolvedJwtConfig,
  DEFAULT_KEYCLOAK_CONFIG,
  DEFAULT_GOOGLE_CONFIG,
  DEFAULT_GOOGLE_IDENTITY_PLATFORM_CONFIG,
  DEFAULT_JWT_CONFIG,
  DEFAULT_TOKEN_STORAGE_CONFIG as DEFAULT_TOKEN_STORAGE_CONFIG_NEW,
  DEFAULT_REDIS_KEY_PREFIX_CONFIG,
  ConfigResolver,
  resolveConfig
} from './config';

// ====================================================================
// Types
// {@link AuthenticatedUser} - Authenticated user context
// {@link JwtPayload} - JWT token payload structure
// {@link Permission} - Permission type definition
// See `@package/types` for base entity types
// ====================================================================
export * from './types/auth.types';
export * from './types/jwt.types';
export * from './types/user.types';
export * from './types/permissions.types';

// ====================================================================
// Constants
// See `@package/constants` for global role and permission constants
// ====================================================================
export * from './constants';

// ====================================================================
// Utilities
// ====================================================================
export * from './utils';

// ====================================================================
// Validators
// ====================================================================
export * from './validators';

// ====================================================================
// Repository Interfaces
// ====================================================================
export * from './repositories';

// ====================================================================
// Telemetry (avoid conflict with auth module exports)
// ====================================================================
export * from './telemetry';
