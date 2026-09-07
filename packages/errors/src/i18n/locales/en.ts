/**
 * English (en) locale translations
 *
 * Default locale for error messages
 */

import type { ErrorTranslations } from '../i18n.types';

/**
 * English error translations
 */
export const en: ErrorTranslations = {
  // User errors (USER_001-010)
  USER_001: 'User with ID {userId} not found',
  USER_002: 'User with email {email} already exists',
  USER_003: 'Invalid email format: {email}',
  USER_004: 'Password does not meet security requirements',
  USER_005: 'Passwords do not match',
  USER_006: 'User account is disabled',
  USER_007: 'User account is suspended: {reason}',
  USER_008: 'Invalid phone number format: {phone}',
  USER_009: 'Profile image size exceeds maximum allowed size of {maxSize}MB',
  USER_010: 'Cannot delete your own account',

  // Authentication errors (AUTH_001-010)
  AUTH_001: 'Invalid email or password',
  AUTH_002: 'Authentication token is missing',
  AUTH_003: 'Authentication token is invalid or expired',
  AUTH_004: 'Insufficient permissions: {requiredPermission} required',
  AUTH_005: 'Invalid 2FA code provided',
  AUTH_006: 'Too many failed login attempts. Account locked for {lockoutMinutes} minutes',
  AUTH_007: 'Password reset token is invalid or expired',
  AUTH_008: 'Session expired. Please login again',
  AUTH_009: 'Access denied from location: {country}',
  AUTH_010: 'Invalid role assignment: user cannot have role {role}',

  // Validation errors (VAL_001-009)
  VAL_001: 'Validation failed: {field} is required',
  VAL_002: 'Invalid value for {field}: expected {expectedType}',
  VAL_003: 'Value for {field} must be between {min} and {max}',
  VAL_004: 'Text for {field} must be between {minLength} and {maxLength} characters',
  VAL_005: 'Invalid UUID format: {value}',
  VAL_006: 'Invalid date format: {date}. Expected format: {expectedFormat}',
  VAL_007: 'Invalid URL format: {url}',
  VAL_008: 'Date {field} must be in the future',
  VAL_009: 'Date {field} must be in the past',

  // Database errors (DB_001-010)
  DB_001: 'Failed to connect to database',
  DB_002: 'Database connection lost',
  DB_003: 'Record already exists: {entity}',
  DB_004: 'Record not found in database',
  DB_005: 'Database query failed',
  DB_006: 'Foreign key constraint violation',
  DB_007: 'Database transaction failed',
  DB_008: 'Too many database connections',
  DB_009: 'Invalid query parameter: {parameter}',
  DB_010: 'Unique constraint violation',

  // Business errors (BIZ_001-008)
  BIZ_001: 'Operation not allowed: {reason}',
  BIZ_002: 'Cannot modify {entity} in {status} status',
  BIZ_003: 'Insufficient balance: required {required}, available {available}',
  BIZ_004: 'Resource is already {action}',
  BIZ_005: 'Maximum limit of {limit} {entity} reached',
  BIZ_006: 'Subscription is required for this feature',
  BIZ_007: 'Trial period has expired',
  BIZ_008: 'Invalid workflow transition from {currentStatus} to {newStatus}',

  // External service errors (EXT_001-007)
  EXT_001: 'Failed to connect to {service}',
  EXT_002: '{service} returned an error: {errorMessage}',
  EXT_003: '{service} request timed out',
  EXT_004: 'Invalid API key for {service}',
  EXT_005: 'Rate limit exceeded for {service}. Retry after {retryAfter} seconds',
  EXT_006: '{service} is currently unavailable',
  EXT_007: 'Webhook delivery failed: {reason}',

  // File errors (FILE_001-008)
  FILE_001: 'File upload failed: {reason}',
  FILE_002: 'Invalid file type: {fileType}. Allowed types: {allowedTypes}',
  FILE_003: 'File size {size}MB exceeds maximum allowed size of {maxSize}MB',
  FILE_004: 'File not found: {filename}',
  FILE_005: 'Permission denied to access file: {filename}',
  FILE_006: 'File storage error: {reason}',
  FILE_007: 'File corrupted or invalid: {filename}',
  FILE_008: 'Insufficient storage space',

  // System errors (SYS_001-010)
  SYS_001: 'Internal server error',
  SYS_002: 'Service temporarily unavailable',
  SYS_003: 'Configuration error: {configKey}',
  SYS_004: 'Feature {feature} is not enabled',
  SYS_005: 'Rate limit exceeded. Try again in {retryAfter} seconds',
  SYS_006: 'Cache service error',
  SYS_007: 'Job processing failed: {jobType}',
  SYS_008: 'Message queue error',
  SYS_009: 'Email sending failed',
  SYS_010: 'Scheduler error: {task}'
};
