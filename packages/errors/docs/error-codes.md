# Error Codes Reference

Complete reference of all 72 error codes in `@package/errors`.

## Error Domains

| Domain | Code Range   | Description                             |
| ------ | ------------ | --------------------------------------- |
| USER   | USER_001-010 | User management and profile errors      |
| AUTH   | AUTH_001-010 | Authentication and authorization errors |
| VAL    | VAL_001-009  | Input validation errors                 |
| DB     | DB_001-010   | Database operation errors               |
| BIZ    | BIZ_001-008  | Business logic errors                   |
| EXT    | EXT_001-007  | External service errors                 |
| FILE   | FILE_001-008 | File operation errors                   |
| SYS    | SYS_001-010  | System and infrastructure errors        |

## User Errors (USER_001-010)

User-related errors for account management, profile operations, and user data.

| Code     | HTTP Status | Message                                                        | Parameters                   |
| -------- | ----------- | -------------------------------------------------------------- | ---------------------------- |
| USER_001 | 404         | User with ID {userId} not found                                | `userId` (required, string)  |
| USER_002 | 409         | User with email {email} already exists                         | `email` (required, string)   |
| USER_003 | 400         | Invalid email format: {email}                                  | `email` (required, string)   |
| USER_004 | 400         | Password does not meet security requirements                   | -                            |
| USER_005 | 400         | Passwords do not match                                         | -                            |
| USER_006 | 403         | User account is disabled                                       | -                            |
| USER_007 | 403         | User account is suspended: {reason}                            | `reason` (optional, string)  |
| USER_008 | 400         | Invalid phone number format: {phone}                           | `phone` (required, string)   |
| USER_009 | 400         | Profile image size exceeds maximum allowed size of {maxSize}MB | `maxSize` (required, number) |
| USER_010 | 422         | Cannot delete your own account                                 | -                            |

### Examples

```typescript
// User not found
throw Errors.useruserWithId001({ userId: '123' });
// => "User with ID 123 not found"

// Email already exists
throw Errors.useruserWithEmail002({ email: 'user@example.com' });
// => "User with email user@example.com already exists"

// Account suspended
throw Errors.useruserAccountIs007({ reason: 'Too many failed login attempts' });
// => "User account is suspended: Too many failed login attempts"
```

## Authentication Errors (AUTH_001-010)

Authentication, authorization, and access control errors.

| Code     | HTTP Status | Message                                                                     | Parameters                              |
| -------- | ----------- | --------------------------------------------------------------------------- | --------------------------------------- |
| AUTH_001 | 401         | Invalid email or password                                                   | -                                       |
| AUTH_002 | 401         | Authentication token is missing                                             | -                                       |
| AUTH_003 | 401         | Authentication token is invalid or expired                                  | -                                       |
| AUTH_004 | 403         | Insufficient permissions: {requiredPermission} required                     | `requiredPermission` (optional, string) |
| AUTH_005 | 400         | Invalid 2FA code provided                                                   | -                                       |
| AUTH_006 | 429         | Too many failed login attempts. Account locked for {lockoutMinutes} minutes | `lockoutMinutes` (required, number)     |
| AUTH_007 | 400         | Password reset token is invalid or expired                                  | -                                       |
| AUTH_008 | 401         | Session expired. Please login again                                         | -                                       |
| AUTH_009 | 403         | Access denied from location: {country}                                      | `country` (optional, string)            |
| AUTH_010 | 400         | Invalid role assignment: user cannot have role {role}                       | `role` (required, string)               |

### Examples

```typescript
// Invalid credentials
throw Errors.authinvalidEmailOr001({});
// => "Invalid email or password"

// Insufficient permissions
throw Errors.authinsufficientPermissionsRequiredpermission004({
  requiredPermission: 'admin'
});
// => "Insufficient permissions: admin required"

// Account locked
throw Errors.authtooManyFailed006({ lockoutMinutes: 15 });
// => "Too many failed login attempts. Account locked for 15 minutes"
```

## Validation Errors (VAL_001-009)

Input validation and data format errors.

| Code    | HTTP Status | Message                                                                 | Parameters                                                                                 |
| ------- | ----------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| VAL_001 | 400         | Validation failed: {field} is required                                  | `field` (required, string)                                                                 |
| VAL_002 | 400         | Invalid value for {field}: expected {expectedType}                      | `field` (required, string), `expectedType` (required, string)                              |
| VAL_003 | 400         | Value for {field} must be between {min} and {max}                       | `field` (required, string), `min` (required, number), `max` (required, number)             |
| VAL_004 | 400         | Text for {field} must be between {minLength} and {maxLength} characters | `field` (required, string), `minLength` (required, number), `maxLength` (required, number) |
| VAL_005 | 400         | Invalid UUID format: {value}                                            | `value` (required, string)                                                                 |
| VAL_006 | 400         | Invalid date format: {date}. Expected format: {expectedFormat}          | `date` (required, string), `expectedFormat` (required, string)                             |
| VAL_007 | 400         | Invalid URL format: {url}                                               | `url` (required, string)                                                                   |
| VAL_008 | 400         | Date {field} must be in the future                                      | `field` (required, string)                                                                 |
| VAL_009 | 400         | Date {field} must be in the past                                        | `field` (required, string)                                                                 |

### Examples

```typescript
// Required field
throw Errors.validationvalidationFailedField001({ field: 'email' });
// => "Validation failed: email is required"

// Invalid type
throw Errors.validationinvalidValueFor002({
  field: 'age',
  expectedType: 'number'
});
// => "Invalid value for age: expected number"

// Range validation
throw Errors.validationvalueForField003({
  field: 'quantity',
  min: 1,
  max: 100
});
// => "Value for quantity must be between 1 and 100"
```

## Database Errors (DB_001-010)

Database connection, query, and constraint errors.

| Code   | HTTP Status | Message                              | Parameters                      |
| ------ | ----------- | ------------------------------------ | ------------------------------- |
| DB_001 | 500         | Failed to connect to database        | -                               |
| DB_002 | 500         | Database connection lost             | -                               |
| DB_003 | 409         | Record already exists: {entity}      | `entity` (optional, string)     |
| DB_004 | 404         | Record not found in database         | `entity` (optional, string)     |
| DB_005 | 500         | Database query failed                | `query` (optional, string)      |
| DB_006 | 500         | Foreign key constraint violation     | `constraint` (optional, string) |
| DB_007 | 500         | Database transaction failed          | -                               |
| DB_008 | 500         | Too many database connections        | -                               |
| DB_009 | 400         | Invalid query parameter: {parameter} | `parameter` (required, string)  |
| DB_010 | 409         | Unique constraint violation          | `field` (optional, string)      |

### Examples

```typescript
// Connection failed
throw Errors.databasefailedToConnect001({});
// => "Failed to connect to database"

// Record not found
throw Errors.databaserecordNotFound004({ entity: 'User' });
// => "Record not found in database"

// Query failed
throw Errors.databasedatabaseQueryFailed005({
  query: 'SELECT * FROM users WHERE id = ?'
});
// => "Database query failed"
```

## Business Logic Errors (BIZ_001-008)

Business rule violations and workflow errors.

| Code    | HTTP Status | Message                                                          | Parameters                                                         |
| ------- | ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| BIZ_001 | 400         | Operation not allowed: {reason}                                  | `reason` (required, string)                                        |
| BIZ_002 | 400         | Cannot modify {entity} in {status} status                        | `entity` (required, string), `status` (required, string)           |
| BIZ_003 | 400         | Insufficient balance: required {required}, available {available} | `required` (required, number), `available` (required, number)      |
| BIZ_004 | 400         | Resource is already {action}                                     | `action` (required, string)                                        |
| BIZ_005 | 400         | Maximum limit of {limit} {entity} reached                        | `limit` (required, number), `entity` (required, string)            |
| BIZ_006 | 403         | Subscription is required for this feature                        | -                                                                  |
| BIZ_007 | 403         | Trial period has expired                                         | -                                                                  |
| BIZ_008 | 400         | Invalid workflow transition from {currentStatus} to {newStatus}  | `currentStatus` (required, string), `newStatus` (required, string) |

### Examples

```typescript
// Operation not allowed
throw Errors.businessoperationNotAllowed001({
  reason: 'Account is suspended'
});
// => "Operation not allowed: Account is suspended"

// Insufficient balance
throw Errors.businessinsufficientBalanceRequired003({
  required: 100,
  available: 50
});
// => "Insufficient balance: required 100, available 50"

// Invalid workflow transition
throw Errors.businessinvalidWorkflowTransition008({
  currentStatus: 'pending',
  newStatus: 'completed'
});
// => "Invalid workflow transition from pending to completed"
```

## External Service Errors (EXT_001-007)

Third-party service integration errors.

| Code    | HTTP Status | Message                                                             | Parameters                                                      |
| ------- | ----------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| EXT_001 | 502         | Failed to connect to {service}                                      | `service` (required, string)                                    |
| EXT_002 | 502         | {service} returned an error: {errorMessage}                         | `service` (required, string), `errorMessage` (required, string) |
| EXT_003 | 504         | {service} request timed out                                         | `service` (required, string)                                    |
| EXT_004 | 401         | Invalid API key for {service}                                       | `service` (required, string)                                    |
| EXT_005 | 429         | Rate limit exceeded for {service}. Retry after {retryAfter} seconds | `service` (required, string), `retryAfter` (required, number)   |
| EXT_006 | 503         | {service} is currently unavailable                                  | `service` (required, string)                                    |
| EXT_007 | 500         | Webhook delivery failed: {reason}                                   | `reason` (required, string)                                     |

### Examples

```typescript
// Service connection failed
throw Errors.externalfailedToConnect001({ service: 'Stripe API' });
// => "Failed to connect to Stripe API"

// Rate limit exceeded
throw Errors.externalrateLimitExceeded005({
  service: 'GitHub API',
  retryAfter: 60
});
// => "Rate limit exceeded for GitHub API. Retry after 60 seconds"

// Service timeout
throw Errors.externalserviceRequestTimed003({ service: 'Payment Gateway' });
// => "Payment Gateway request timed out"
```

## File Operation Errors (FILE_001-008)

File upload, storage, and processing errors.

| Code     | HTTP Status | Message                                                        | Parameters                                                       |
| -------- | ----------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| FILE_001 | 400         | File upload failed: {reason}                                   | `reason` (required, string)                                      |
| FILE_002 | 400         | Invalid file type: {fileType}. Allowed types: {allowedTypes}   | `fileType` (required, string), `allowedTypes` (required, string) |
| FILE_003 | 400         | File size {size}MB exceeds maximum allowed size of {maxSize}MB | `size` (required, number), `maxSize` (required, number)          |
| FILE_004 | 404         | File not found: {filename}                                     | `filename` (required, string)                                    |
| FILE_005 | 403         | Permission denied to access file: {filename}                   | `filename` (required, string)                                    |
| FILE_006 | 500         | File storage error: {reason}                                   | `reason` (required, string)                                      |
| FILE_007 | 400         | File corrupted or invalid: {filename}                          | `filename` (required, string)                                    |
| FILE_008 | 507         | Insufficient storage space                                     | -                                                                |

### Examples

```typescript
// Invalid file type
throw Errors.fileinvalidFileType002({
  fileType: 'application/exe',
  allowedTypes: 'image/jpeg, image/png, application/pdf'
});
// => "Invalid file type: application/exe. Allowed types: image/jpeg, image/png, application/pdf"

// File too large
throw Errors.filefileSizeSizemb003({
  size: 15.5,
  maxSize: 5
});
// => "File size 15.5MB exceeds maximum allowed size of 5MB"

// File not found
throw Errors.filefileNotFound004({ filename: 'profile.jpg' });
// => "File not found: profile.jpg"
```

## System Errors (SYS_001-010)

Infrastructure, configuration, and system-level errors.

| Code    | HTTP Status | Message                                                | Parameters                      |
| ------- | ----------- | ------------------------------------------------------ | ------------------------------- |
| SYS_001 | 500         | Internal server error                                  | -                               |
| SYS_002 | 503         | Service temporarily unavailable                        | -                               |
| SYS_003 | 500         | Configuration error: {configKey}                       | `configKey` (required, string)  |
| SYS_004 | 501         | Feature {feature} is not enabled                       | `feature` (required, string)    |
| SYS_005 | 429         | Rate limit exceeded. Try again in {retryAfter} seconds | `retryAfter` (required, number) |
| SYS_006 | 500         | Cache service error                                    | -                               |
| SYS_007 | 500         | Job processing failed: {jobType}                       | `jobType` (required, string)    |
| SYS_008 | 500         | Message queue error                                    | -                               |
| SYS_009 | 500         | Email sending failed                                   | -                               |
| SYS_010 | 500         | Scheduler error: {task}                                | `task` (required, string)       |

### Examples

```typescript
// Internal server error
throw Errors.systeminternalServerError001({});
// => "Internal server error"

// Configuration error
throw Errors.systemconfigurationErrorConfigkey003({
  configKey: 'DATABASE_URL'
});
// => "Configuration error: DATABASE_URL"

// Feature not enabled
throw Errors.systemfeatureFeatureIs004({ feature: 'Advanced Analytics' });
// => "Feature Advanced Analytics is not enabled"
```

## Adding New Error Codes

Dedicated error-code authoring docs are not published yet.

For now, you can add errors by:

1. Creating a new error definition in the appropriate domain file
2. Running the factory generator script
3. Adding translations for all locales

See [Adding Locales](./adding-locales.md) for translation instructions.
