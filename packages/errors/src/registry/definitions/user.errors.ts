import { ErrorParameterType, ErrorSeverity, ErrorType } from '../error-registry.types';

import type { ErrorDefinition } from '../error-registry.types';

/**
 * User domain error definitions (USER_001-099)
 *
 * Errors related to user management, profile operations,
 * and user data handling.
 */
export const USER_ERRORS: readonly ErrorDefinition[] = [
  {
    code: 'USER_001',
    type: ErrorType.USER,
    severity: ErrorSeverity.HIGH,
    httpStatus: 404,
    message: 'User with ID {userId} not found',
    parameters: [
      { name: 'userId', type: ErrorParameterType.STRING, required: true, description: 'User ID' }
    ],
    description: 'User could not be found in the database',
    safeForUser: true,
    resolution: 'Verify the user ID is correct and the user exists in the system'
  },
  {
    code: 'USER_002',
    type: ErrorType.USER,
    severity: ErrorSeverity.HIGH,
    httpStatus: 409,
    message: 'User with email {email} already exists',
    parameters: [
      { name: 'email', type: ErrorParameterType.STRING, required: true, description: 'User email' }
    ],
    description: 'A user with this email address already exists',
    safeForUser: true,
    resolution: 'Use a different email address or login with existing account'
  },
  {
    code: 'USER_003',
    type: ErrorType.USER,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid email format: {email}',
    parameters: [
      {
        name: 'email',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Invalid email'
      }
    ],
    description: 'Email address format is invalid',
    safeForUser: true,
    resolution: 'Provide a valid email address (e.g., user@example.com)'
  },
  {
    code: 'USER_004',
    type: ErrorType.USER,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Password does not meet security requirements',
    parameters: [],
    description: 'Password fails validation rules',
    safeForUser: true,
    resolution:
      'Use a stronger password with at least 8 characters, including uppercase, lowercase, numbers, and symbols'
  },
  {
    code: 'USER_005',
    type: ErrorType.USER,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Passwords do not match',
    parameters: [],
    description: 'Password confirmation does not match original password',
    safeForUser: true,
    resolution: 'Ensure both password fields contain the same value'
  },
  {
    code: 'USER_006',
    type: ErrorType.USER,
    severity: ErrorSeverity.HIGH,
    httpStatus: 403,
    message: 'User account is disabled',
    parameters: [],
    description: 'User account has been disabled by administrator',
    safeForUser: true,
    resolution: 'Contact support to re-enable your account'
  },
  {
    code: 'USER_007',
    type: ErrorType.USER,
    severity: ErrorSeverity.HIGH,
    httpStatus: 403,
    message: 'User account is suspended: {reason}',
    parameters: [
      {
        name: 'reason',
        type: ErrorParameterType.STRING,
        required: false,
        description: 'Suspension reason'
      }
    ],
    description: 'User account has been temporarily suspended',
    safeForUser: true,
    resolution: 'Wait for suspension to expire or contact support'
  },
  {
    code: 'USER_008',
    type: ErrorType.USER,
    severity: ErrorSeverity.MEDIUM,
    httpStatus: 400,
    message: 'Invalid phone number format: {phone}',
    parameters: [
      {
        name: 'phone',
        type: ErrorParameterType.STRING,
        required: true,
        description: 'Phone number'
      }
    ],
    description: 'Phone number format is invalid',
    safeForUser: true,
    resolution: 'Provide a valid phone number in international format'
  },
  {
    code: 'USER_009',
    type: ErrorType.USER,
    severity: ErrorSeverity.LOW,
    httpStatus: 400,
    message: 'Profile image size exceeds maximum allowed size of {maxSize}MB',
    parameters: [
      {
        name: 'maxSize',
        type: ErrorParameterType.NUMBER,
        required: true,
        description: 'Maximum size in MB'
      }
    ],
    description: 'Uploaded profile image is too large',
    safeForUser: true,
    resolution: 'Compress the image or use a smaller file'
  },
  {
    code: 'USER_010',
    type: ErrorType.USER,
    severity: ErrorSeverity.HIGH,
    httpStatus: 422,
    message: 'Cannot delete your own account',
    parameters: [],
    description: 'Users cannot delete their own accounts for safety reasons',
    safeForUser: true,
    resolution: 'Contact an administrator to delete your account'
  }
] as const;
