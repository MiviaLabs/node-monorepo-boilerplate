/**
 * Custom error types for auth
 */

import {
  InfrastructureError,
  ConfigurationError,
  OperationError,
  ConnectionError,
  NotFoundError
} from '@package/core';

/**
 * Base error class for auth errors
 */
export class AuthError extends InfrastructureError {
  override name = 'AuthError';

  constructor(message: string, code: string, cause?: Error | unknown) {
    super(message, code, cause);
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends AuthError {
  override name = 'AuthenticationError';

  constructor(message: string = 'Authentication failed', cause?: Error | unknown) {
    super(message, 'AUTHENTICATION_FAILED', cause);
  }
}

/**
 * Error thrown when token validation fails
 */
export class TokenValidationError extends AuthError {
  override name = 'TokenValidationError';

  constructor(message: string, cause?: Error | unknown) {
    super(message, 'TOKEN_VALIDATION_FAILED', cause);
  }
}

/**
 * Error thrown when token is expired
 */
export class TokenExpiredError extends TokenValidationError {
  override name = 'TokenExpiredError';

  constructor(expiresAt: Date) {
    super(`Token expired at ${expiresAt.toISOString()}`);
  }
}

/**
 * Error thrown when token is invalid or malformed
 */
export class InvalidTokenError extends TokenValidationError {
  override name = 'InvalidTokenError';

  constructor(message: string = 'Invalid token format') {
    super(message);
  }
}

/**
 * Error thrown when refresh token is invalid or not found
 */
export class RefreshTokenError extends AuthError {
  override name = 'RefreshTokenError';

  constructor(message: string = 'Invalid or expired refresh token', cause?: Error | unknown) {
    super(message, 'REFRESH_TOKEN_INVALID', cause);
  }
}

/**
 * Error thrown when auth provider is not found or not configured
 */
export class AuthProviderNotFoundError extends NotFoundError {
  override name = 'AuthProviderNotFoundError';

  constructor(providerName: string) {
    super(`auth-provider`, `Auth provider '${providerName}' not found or not configured`);
  }
}

/**
 * Error thrown when auth provider configuration is invalid
 */
export class InvalidAuthProviderConfigError extends ConfigurationError {
  override name = 'InvalidAuthProviderConfigError';

  constructor(message: string) {
    super(`Invalid auth provider configuration: ${message}`, 'auth-provider');
  }
}

/**
 * Error thrown when connection to auth provider fails
 */
export class AuthProviderConnectionError extends ConnectionError {
  override name = 'AuthProviderConnectionError';

  constructor(providerName: string, reason?: string) {
    super(providerName, reason ?? 'Failed to connect to authentication provider');
  }
}

/**
 * Error thrown when user is not found
 */
export class UserNotFoundError extends NotFoundError {
  override name = 'UserNotFoundError';

  constructor(userId: string) {
    super('user', `User '${userId}' not found`);
  }
}

/**
 * Error thrown when user credentials are invalid
 */
export class InvalidCredentialsError extends AuthenticationError {
  override name = 'InvalidCredentialsError';

  constructor(message: string = 'Invalid username or password') {
    super(message);
  }
}

/**
 * Error thrown when user lacks required role
 */
export class InsufficientRoleError extends AuthError {
  override name = 'InsufficientRoleError';

  constructor(requiredRoles: string[]) {
    super(
      `Insufficient privileges. Required roles: ${requiredRoles.join(', ')}`,
      'INSUFFICIENT_ROLE'
    );
  }
}

/**
 * Error thrown when user lacks required permission
 */
export class InsufficientPermissionError extends AuthError {
  override name = 'InsufficientPermissionError';

  constructor(requiredPermissions: string[]) {
    super(
      `Insufficient privileges. Required permissions: ${requiredPermissions.join(', ')}`,
      'INSUFFICIENT_PERMISSION'
    );
  }
}

/**
 * Error thrown when tenant context is missing or invalid
 */
export class TenantContextError extends AuthError {
  override name = 'TenantContextError';

  constructor(message: string = 'Invalid or missing tenant context') {
    super(message, 'TENANT_CONTEXT_INVALID');
  }
}

/**
 * Error thrown when session is not found or expired
 */
export class SessionNotFoundError extends NotFoundError {
  override name = 'SessionNotFoundError';

  constructor(sessionId: string) {
    super('session', `Session '${sessionId}' not found or expired`);
  }
}

/**
 * Error thrown when token operation fails
 */
export class TokenOperationError extends OperationError {
  override name = 'TokenOperationError';

  constructor(operation: string, message: string, cause?: Error | unknown) {
    super(operation, message, cause);
  }
}

/**
 * Error thrown when user info retrieval fails
 */
export class UserInfoRetrievalError extends OperationError {
  override name = 'UserInfoRetrievalError';

  constructor(message: string, cause?: Error | unknown) {
    super('get-user-info', message, cause);
  }
}

// Note: Internal error types are exported directly from './errors/internal-error.ts
// to avoid circular dependency issues. Import them as:
// import { InternalTokenValidationError } from '@package/auth/errors/internal-error';
