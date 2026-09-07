import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * Authentication domain error definitions (AUTH_001-099)
 *
 * Errors related to authentication, authorization,
 * tokens, and permissions.
 */
export const AUTH_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'AUTH_001',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.HIGH,
    httpStatus: 401,
    message: 'Invalid email or password',
    parameters: [],
    description: 'Authentication credentials are incorrect',
    safeForUser: true,
    resolution: 'Check your email and password, then try again'
  },
  {
    code: 'AUTH_002',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.HIGH,
    httpStatus: 401,
    message: 'Authentication token is missing',
    parameters: [],
    description: 'No authentication token provided in request',
    safeForUser: false,
    resolution: 'Provide a valid authentication token in the Authorization header'
  },
  {
    code: 'AUTH_003',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.HIGH,
    httpStatus: 401,
    message: 'Authentication token is invalid or expired',
    parameters: [],
    description: 'Provided authentication token is invalid or has expired',
    safeForUser: true,
    resolution: 'Login again to get a new token'
  },
  {
    code: 'AUTH_004',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.HIGH,
    httpStatus: 403,
    message: 'Insufficient permissions: {requiredPermission} required',
    parameters: [
      {
        name: 'requiredPermission',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Required permission'
      }
    ],
    description: 'User lacks required permissions for the requested operation',
    safeForUser: true,
    resolution: 'Contact your administrator to request the necessary permissions'
  },
  {
    code: 'AUTH_005',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid 2FA code provided',
    parameters: [],
    description: 'Two-factor authentication code is incorrect',
    safeForUser: true,
    resolution: 'Check your authentication app and enter the correct code'
  },
  {
    code: 'AUTH_006',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.HIGH,
    httpStatus: 429,
    message: 'Too many failed login attempts. Account locked for {lockoutMinutes} minutes',
    parameters: [
      {
        name: 'lockoutMinutes',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Lockout duration'
      }
    ],
    description: 'Account has been temporarily locked due to too many failed attempts',
    safeForUser: true,
    resolution: 'Wait for the lockout period to expire or contact support'
  },
  {
    code: 'AUTH_007',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Password reset token is invalid or expired',
    parameters: [],
    description: 'Password reset link is no longer valid',
    safeForUser: true,
    resolution: 'Request a new password reset link'
  },
  {
    code: 'AUTH_008',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.HIGH,
    httpStatus: 403,
    message: 'Session expired. Please login again',
    parameters: [],
    description: 'User session has timed out',
    safeForUser: true,
    resolution: 'Login to continue'
  },
  {
    code: 'AUTH_009',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 403,
    message: 'Access denied from location: {country}',
    parameters: [
      {
        name: 'country',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Country code'
      }
    ],
    description: 'Access is restricted from this geographic location',
    safeForUser: true,
    resolution: 'Contact support if you believe this is an error'
  },
  {
    code: 'AUTH_010',
    type: ErrorType.AUTH,
    severity: ErrorSeverity.HIGH,
    httpStatus: 403,
    message: 'Invalid role assignment: user cannot have role {role}',
    parameters: [
      {
        name: 'role',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Invalid role'
      }
    ],
    description: 'Attempted to assign an invalid or restricted role',
    safeForUser: false,
    resolution: 'Assign a valid role that the user is eligible for'
  }
] as const;
