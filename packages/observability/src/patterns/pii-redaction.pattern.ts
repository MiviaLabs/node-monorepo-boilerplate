/**
 * PII Redaction Pattern
 *
 * Utilities for redacting Personally Identifiable Information (PII)
 * from log messages, error responses, and debug output. This module
 * provides automatic detection and masking of sensitive data fields
 * to prevent accidental PII exposure in logs, error messages, and API responses.
 *
 * ## Why Use PII Redaction
 *
 * - **Compliance**: GDPR, CCPA, HIPAA, PCI DSS, and similar regulations require
 *   protecting personal data from unauthorized exposure
 * - **Security**: Prevents sensitive data from appearing in logs that may be
 *   accessible to unauthorized personnel or external services
 * - **Audit Safety**: Enables comprehensive logging without risking PII exposure
 *   in audit trails or debugging sessions
 *
 * ## Automatically Redacted Fields
 *
 * The module recognizes and redacts the following categories of sensitive data:
 *
 * ### Authentication & Security
 * - `password`, `passwordHash`, `hashedPassword`
 * - `token`, `accessToken`, `refreshToken`, `authToken`, `sessionToken`, `csrfToken`
 * - `apiKey`, `apiSecret`, `secret`
 * - `privateKey`, `publicKey`
 *
 * ### Personal Information
 * - `email`, `emailEncrypted`, `emailAddress`
 * - `phone`, `phoneNumber`, `mobile`, `mobileNumber`
 * - `ssn`, `socialSecurityNumber`, `taxId`
 * - `passportNumber`, `nationalId`
 * - `firstName`, `lastName`, `fullName`
 * - `dateOfBirth`, `dob`, `gender`
 *
 * ### Address Information
 * - `address`, `street`, `city`, `state`
 * - `zip`, `postalCode`, `country`
 *
 * ### Financial Data
 * - `creditCard`, `cardNumber`, `cardNumberEncrypted`
 * - `iban`, `bankAccount`, `routingNumber`
 * - `cvv`, `cvc`
 *
 * ### Network Identifiers
 * - `ipAddress`, `ip`, `clientIp`
 *
 * ## Sensitive Headers
 *
 * HTTP headers that are automatically redacted:
 * - `authorization`, `cookie`, `set-cookie`
 * - `x-api-key`, `x-auth-token`, `x-csrf-token`
 * - `proxy-authorization`
 *
 * @module observability/patterns/pii-redaction
 *
 * @example Basic object redaction
 * ```typescript
 * import { redactObject } from '@package/observability';
 *
 * const userPayload = {
 *   id: 'user-123',
 *   email: 'john.doe@example.com',
 *   password: 'secret123',
 *   role: 'admin'
 * };
 *
 * const safePayload = redactObject(userPayload);
 * // Result: { id: 'user-123', email: '***REDACTED***', password: '***REDACTED***', role: 'admin' }
 *
 * logger.info('User updated', safePayload);
 * ```
 *
 * @example Creating safe log context
 * ```typescript
 * import { createSafeLogContext, logger } from '@package/observability';
 *
 * const requestContext = {
 *   userId: 'user-123',
 *   requestId: 'req-abc',
 *   email: 'user@example.com',  // Will be redacted
 *   ipAddress: '192.168.1.1'    // Will be redacted
 * };
 *
 * const safeContext = createSafeLogContext(requestContext);
 * logger.info('Request processed', safeContext);
 * ```
 *
 * @example Partial redaction for debugging
 * ```typescript
 * import { partialRedactEmail, partialRedactCreditCard } from '@package/observability';
 *
 * // Show partial email for debugging while protecting PII
 * const email = partialRedactEmail('john.doe@example.com');
 * // Result: 'jo***@example.com'
 *
 * // Show last 4 digits of credit card (common pattern)
 * const card = partialRedactCreditCard('4111111111111111');
 * // Result: '************1111'
 * ```
 *
 * @see {@link redactObject} for object redaction
 * @see {@link createSafeLogContext} for logging integration
 * @see {@link IRedactStringOptions} for customization options
 */

import type { ILogContext } from '../logger';

/**
 * Sensitive field names that should be redacted.
 *
 * This array contains field names (case-insensitive) that are automatically
 * identified as containing PII or sensitive data. Field matching uses
 * case-insensitive comparison, so 'email', 'Email', and 'EMAIL' are all matched.
 *
 * @internal
 */
const SENSITIVE_FIELDS: readonly string[] = [
  // Authentication
  'password',
  'passwordHash',
  'hashedPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'apiSecret',
  'secret',
  'privateKey',
  'publicKey', // Can be sensitive in some contexts
  'authToken',
  'sessionToken',
  'csrfToken',

  // Personal Information
  'email',
  'emailEncrypted',
  'emailAddress',
  'phoneNumber',
  'phone',
  'mobile',
  'mobileNumber',
  'ssn',
  'socialSecurityNumber',
  'taxId',
  'passportNumber',
  'nationalId',
  'firstName',
  'lastName',
  'fullName',
  'dateOfBirth',
  'dob',
  'gender',

  // Address
  'address',
  'street',
  'city',
  'state',
  'zip',
  'postalCode',
  'country',

  // Financial
  'creditCard',
  'cardNumber',
  'cardNumberEncrypted',
  'iban',
  'bankAccount',
  'routingNumber',
  'cvv',
  'cvc',

  // Other
  'ipAddress',
  'ip',
  'clientIp'
] as const;

/**
 * Sensitive HTTP header names that should be redacted.
 *
 * These headers commonly contain authentication tokens, session identifiers,
 * or other sensitive data that should not appear in logs.
 *
 * @internal
 */
const SENSITIVE_HEADERS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'proxy-authorization'
] as const;

/**
 * Redaction string used to replace sensitive values.
 *
 * This constant is used when a field is fully redacted. The distinctive
 * format makes it easy to identify redacted values in logs while being
 * clearly distinguishable from actual data.
 *
 * @example
 * ```typescript
 * import { REDACTED, redactObject } from '@package/observability';
 *
 * const result = redactObject({ password: 'secret123' });
 * console.log(result.password === REDACTED); // true
 * ```
 */
export const REDACTED = '***REDACTED***';

/**
 * Redaction string for partial redaction.
 *
 * Used by partial redaction functions (like {@link partialRedactEmail}) to
 * indicate masked portions of a value while preserving some identifying
 * characters for debugging purposes.
 *
 * @example
 * ```typescript
 * import { PARTIAL_REDACTED } from '@package/observability';
 *
 * // partialRedactEmail uses this constant
 * // Result format: 'jo***@example.com'
 * ```
 */
export const PARTIAL_REDACTED = '***';

/**
 * Checks if a field name is considered sensitive and should be redacted.
 *
 * Field name matching is case-insensitive. The function checks against
 * the built-in list of sensitive field names including authentication
 * credentials, personal information, addresses, and financial data.
 *
 * @param fieldName - The field name to check (e.g., 'email', 'password', 'ssn')
 * @returns `true` if the field is considered sensitive, `false` otherwise
 *
 * @example Basic usage
 * ```typescript
 * import { isSensitiveField } from '@package/observability';
 *
 * isSensitiveField('email');     // true
 * isSensitiveField('EMAIL');     // true (case-insensitive)
 * isSensitiveField('password');  // true
 * isSensitiveField('userId');    // false
 * isSensitiveField('status');    // false
 * ```
 *
 * @example Conditional logging
 * ```typescript
 * import { isSensitiveField, REDACTED } from '@package/observability';
 *
 * function logFieldChange(fieldName: string, oldValue: unknown, newValue: unknown) {
 *   const safeOld = isSensitiveField(fieldName) ? REDACTED : oldValue;
 *   const safeNew = isSensitiveField(fieldName) ? REDACTED : newValue;
 *
 *   logger.info('Field changed', { field: fieldName, oldValue: safeOld, newValue: safeNew });
 * }
 * ```
 *
 * Uses the built-in list of sensitive field names including password, ssn, creditCard, etc.
 */
export function isSensitiveField(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  return SENSITIVE_FIELDS.some((field) => lowerFieldName === field.toLowerCase());
}

/**
 * Checks if an HTTP header name is considered sensitive and should be redacted.
 *
 * Header name matching is case-insensitive per HTTP specification. The function
 * checks against the built-in list of sensitive headers including authentication
 * tokens, cookies, and API keys.
 *
 * @param headerName - The HTTP header name to check (e.g., 'authorization', 'cookie')
 * @returns `true` if the header is considered sensitive, `false` otherwise
 *
 * @example Basic usage
 * ```typescript
 * import { isSensitiveHeader } from '@package/observability';
 *
 * isSensitiveHeader('authorization');     // true
 * isSensitiveHeader('Authorization');     // true (case-insensitive)
 * isSensitiveHeader('cookie');            // true
 * isSensitiveHeader('x-api-key');         // true
 * isSensitiveHeader('content-type');      // false
 * isSensitiveHeader('x-request-id');      // false
 * ```
 *
 * @example Logging HTTP requests safely
 * ```typescript
 * import { isSensitiveHeader, REDACTED } from '@package/observability';
 *
 * function logRequest(method: string, url: string, headers: Record<string, string>) {
 *   const safeHeaders: Record<string, string> = {};
 *   for (const [name, value] of Object.entries(headers)) {
 *     safeHeaders[name] = isSensitiveHeader(name) ? REDACTED : value;
 *   }
 *
 *   logger.info('HTTP request', { method, url, headers: safeHeaders });
 * }
 * ```
 *
 * @see {@link redactHeaders} for automatic header redaction
 * Uses the built-in list of sensitive headers including authorization, cookie, x-api-key, etc.
 */
export function isSensitiveHeader(headerName: string): boolean {
  const lowerHeader = headerName.toLowerCase();
  return SENSITIVE_HEADERS.some((header) => lowerHeader === header.toLowerCase());
}

/**
 * Redacts sensitive fields from an object, replacing PII with {@link REDACTED}.
 *
 * This function performs a shallow copy of the input object and replaces any
 * field values whose names match the sensitive fields list with the redaction
 * string. Nested objects are recursively processed.
 *
 * ## Behavior
 *
 * - Creates a shallow copy of the input object (original is not modified)
 * - Recursively processes nested objects
 * - Arrays are recursively processed (each element is redacted)
 * - Field name matching is case-insensitive
 * - Non-sensitive fields are preserved as-is
 *
 * ## When to Use
 *
 * - Before logging user data or request payloads
 * - When returning error details that may contain user input
 * - In debugging output that may be shared or stored
 * - When serializing objects for external services (analytics, error tracking)
 *
 * @param obj - The object to redact. The original object is not modified.
 * @returns A new object with sensitive fields replaced by {@link REDACTED}
 *
 * @example Basic usage
 * ```typescript
 * import { redactObject } from '@package/observability';
 *
 * const user = { id: 1, email: 'user@example.com', password: 'secret' };
 * const safe = redactObject(user);
 * // { id: 1, email: '***REDACTED***', password: '***REDACTED***' }
 * ```
 *
 * @example Logging user actions safely
 * ```typescript
 * import { redactObject, logger } from '@package/observability';
 *
 * async function createUser(userData: CreateUserDto): Promise<User> {
 *   logger.info('Creating user', redactObject(userData));
 *
 *   const user = await userRepository.create(userData);
 *
 *   logger.info('User created', {
 *     userId: user.id,
 *     ...redactObject({ email: userData.email, phone: userData.phone })
 *   });
 *
 *   return user;
 * }
 * ```
 *
 * @example Nested objects
 * ```typescript
 * const data = {
 *   user: {
 *     id: 'user-123',
 *     email: 'user@example.com',
 *     profile: {
 *       firstName: 'John',
 *       lastName: 'Doe',
 *       bio: 'Software developer'  // Not sensitive, preserved
 *     }
 *   },
 *   action: 'login'
 * };
 *
 * const safe = redactObject(data);
 * // {
 * //   user: {
 * //     id: 'user-123',
 * //     email: '***REDACTED***',
 * //     profile: {
 * //       firstName: '***REDACTED***',
 * //       lastName: '***REDACTED***',
 * //       bio: 'Software developer'
 * //     }
 * //   },
 * //   action: 'login'
 * // }
 * ```
 *
 * @see {@link isSensitiveField} to check individual field names
 * @see {@link redactArray} for arrays of objects
 * @see {@link createSafeLogContext} for logging integration
 */
export function redactObject<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...obj };

  for (const fieldName in sanitized) {
    if (isSensitiveField(fieldName)) {
      sanitized[fieldName] = REDACTED;
    } else if (Array.isArray(sanitized[fieldName])) {
      // Recursively redact arrays
      sanitized[fieldName] = redactArray(sanitized[fieldName] as unknown[]);
    } else if (typeof sanitized[fieldName] === 'object' && sanitized[fieldName] !== null) {
      // Recursively redact nested objects
      sanitized[fieldName] = redactObject(sanitized[fieldName] as Record<string, unknown>);
    }
  }

  return sanitized;
}

/**
 * Redacts sensitive headers from an HTTP headers object.
 *
 * This function creates a shallow copy of the headers object and replaces
 * values of sensitive headers (like `authorization`, `cookie`, `x-api-key`)
 * with the redaction string. Unlike {@link redactObject}, this function
 * uses the sensitive headers list, which is specific to HTTP headers.
 *
 * ## Behavior
 *
 * - Creates a shallow copy of the headers object (original is not modified)
 * - Header name matching is case-insensitive (per HTTP specification)
 * - Non-sensitive headers are preserved as-is
 * - Does NOT perform recursive redaction (headers are typically flat)
 *
 * ## When to Use
 *
 * - Before logging HTTP request/response details
 * - When forwarding request metadata to external services
 * - In error reports that include HTTP context
 * - When debugging HTTP-related issues
 *
 * @param headers - The HTTP headers object to redact. The original is not modified.
 * @returns A new object with sensitive headers replaced by {@link REDACTED}
 *
 * @example Basic usage
 * ```typescript
 * import { redactHeaders } from '@package/observability';
 *
 * const headers = { authorization: 'Bearer token', 'content-type': 'application/json' };
 * const safe = redactHeaders(headers);
 * // { authorization: '***REDACTED***', 'content-type': 'application/json' }
 * ```
 *
 * @example Logging HTTP requests
 * ```typescript
 * import { redactHeaders, logger } from '@package/observability';
 *
 * function logIncomingRequest(req: Request) {
 *   logger.info('Incoming request', {
 *     method: req.method,
 *     url: req.url,
 *     headers: redactHeaders(req.headers as Record<string, string>),
 *     requestId: req.id
 *   });
 * }
 * ```
 *
 * @example With multiple sensitive headers
 * ```typescript
 * const headers = {
 *   'authorization': 'Bearer eyJhbGc...',
 *   'x-api-key': 'sk_live_abc123',
 *   'cookie': 'session=xyz789',
 *   'content-type': 'application/json',
 *   'x-request-id': 'req-123'
 * };
 *
 * const safe = redactHeaders(headers);
 * // {
 * //   'authorization': '***REDACTED***',
 * //   'x-api-key': '***REDACTED***',
 * //   'cookie': '***REDACTED***',
 * //   'content-type': 'application/json',
 * //   'x-request-id': 'req-123'
 * // }
 * ```
 *
 * @see {@link isSensitiveHeader} to check individual header names
 * @see {@link redactObject} for general object redaction
 */
export function redactHeaders<T extends Record<string, unknown>>(
  headers: T
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...headers };

  for (const headerName in sanitized) {
    if (isSensitiveHeader(headerName)) {
      (sanitized as Record<string, unknown>)[headerName] = REDACTED;
    }
  }

  return sanitized;
}

/**
 * Recursively redacts a value, handling objects, arrays, and primitives.
 *
 * This is the core recursive helper that properly handles all value types:
 * - Objects are processed by {@link redactObject}
 * - Arrays are processed recursively, preserving nested array structure
 * - Primitives (string, number, boolean, null, undefined) are returned as-is
 *
 * @param value - The value to redact
 * @returns The redacted value with sensitive fields replaced by {@link REDACTED}
 * @internal
 */
function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    return redactObject(value as Record<string, unknown>);
  }

  // Primitives are returned as-is
  return value;
}

/**
 * Redacts sensitive fields from an array of objects.
 *
 * This function applies {@link redactObject} to each element in the array,
 * returning a new array with all sensitive fields redacted. The original
 * array and its objects are not modified.
 *
 * ## Behavior
 *
 * - Creates a new array (original is not modified)
 * - Each object in the array is processed by {@link redactObject}
 * - Nested objects within array elements are recursively processed
 * - Nested arrays are recursively processed, preserving array structure
 * - Empty arrays return empty arrays
 *
 * ## When to Use
 *
 * - When logging lists of users, orders, or other entities with PII
 * - Before sending batch data to external services
 * - In API responses that may be logged or cached
 * - When debugging operations involving multiple records
 *
 * @param arr - The array to redact. Can contain objects, primitives, or nested arrays. The original array is not modified.
 * @returns A new array with sensitive fields in each object replaced by {@link REDACTED}
 *
 * @example Basic usage
 * ```typescript
 * import { redactArray } from '@package/observability';
 *
 * const users = [
 *   { id: 1, email: 'user1@example.com' },
 *   { id: 2, email: 'user2@example.com' }
 * ];
 * const safe = redactArray(users);
 * // [{ id: 1, email: '***REDACTED***' }, { id: 2, email: '***REDACTED***' }]
 * ```
 *
 * @example Logging batch operations
 * ```typescript
 * import { redactArray, logger } from '@package/observability';
 *
 * async function processUserBatch(users: User[]): Promise<void> {
 *   logger.info('Processing user batch', {
 *     count: users.length,
 *     users: redactArray(users)
 *   });
 *
 *   for (const user of users) {
 *     await processUser(user);
 *   }
 *
 *   logger.info('Batch processing complete', { count: users.length });
 * }
 * ```
 *
 * @example With complex objects
 * ```typescript
 * const orders = [
 *   {
 *     orderId: 'order-1',
 *     customer: {
 *       email: 'customer1@example.com',
 *       phone: '+1234567890'
 *     },
 *     total: 99.99
 *   },
 *   {
 *     orderId: 'order-2',
 *     customer: {
 *       email: 'customer2@example.com',
 *       phone: '+0987654321'
 *     },
 *     total: 149.99
 *   }
 * ];
 *
 * const safe = redactArray(orders);
 * // Emails and phones in customer objects are redacted
 * ```
 *
 * @see {@link redactObject} for single object redaction
 */
export function redactArray(arr: readonly unknown[]): unknown[] {
  return arr.map((item) => redactValue(item));
}

/**
 * Partially redacts an email address, preserving the first 2 characters and domain.
 *
 * This function provides a balance between privacy and debuggability by showing
 * enough of the email to identify the user in support scenarios while protecting
 * the full email address from exposure.
 *
 * ## Format
 *
 * Input: `john.doe@example.com`
 * Output: `jo***@example.com`
 *
 * ## Edge Cases
 *
 * - Invalid emails (no `@` sign) return {@link REDACTED}
 * - Empty or non-string input returns {@link REDACTED}
 * - Short local parts (< 2 chars) show available characters
 *
 * ## When to Use
 *
 * - In user-facing error messages that need email context
 * - In support tickets or admin logs
 * - When partial identification is needed for debugging
 * - In audit logs where full redaction is too restrictive
 *
 * @param email - The email address to partially redact
 * @returns The partially redacted email, or {@link REDACTED} if input is invalid
 *
 * @example Basic usage
 * ```typescript
 * import { partialRedactEmail } from '@package/observability';
 *
 * partialRedactEmail('user@example.com');
 * // 'us***@example.com'
 *
 * partialRedactEmail('john.doe@company.org');
 * // 'jo***@company.org'
 * ```
 *
 * @example In error messages
 * ```typescript
 * import { partialRedactEmail } from '@package/observability';
 *
 * function handleDuplicateEmailError(email: string): string {
 *   return `An account already exists for ${partialRedactEmail(email)}`;
 * }
 *
 * handleDuplicateEmailError('user@example.com');
 * // 'An account already exists for us***@example.com'
 * ```
 *
 * @example Edge cases
 * ```typescript
 * partialRedactEmail('a@b.com');      // 'a***@b.com' (short local part)
 * partialRedactEmail('invalid');       // '***REDACTED***' (no @ sign)
 * partialRedactEmail('');              // '***REDACTED***' (empty)
 * partialRedactEmail(null as any);     // '***REDACTED***' (invalid type)
 * ```
 *
 * @see {@link redactObject} for full email redaction in objects
 * @see {@link PARTIAL_REDACTED} for the masking string used
 */
export function partialRedactEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return REDACTED;
  }

  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return REDACTED;
  }

  const visibleChars = Math.min(2, local.length);
  const localPart = local.substring(0, visibleChars);
  return `${localPart}${PARTIAL_REDACTED}@${domain}`;
}

/**
 * Partially redacts a credit card number, showing only the last 4 digits.
 *
 * This follows the common PCI DSS-compliant pattern of displaying only the
 * last 4 digits of a card number, which is the maximum allowed for display
 * in most payment contexts.
 *
 * ## Format
 *
 * Input: `4111111111111111`
 * Output: `************1111`
 *
 * ## Behavior
 *
 * - Non-digit characters are stripped before processing
 * - Card numbers with fewer than 4 digits return {@link REDACTED}
 * - Empty or non-string input returns {@link REDACTED}
 * - The mask length matches the original digit count minus 4
 *
 * ## When to Use
 *
 * - In order confirmations or receipts
 * - In payment history displays
 * - In support or admin interfaces
 * - In audit logs for payment operations
 *
 * @param cardNumber - The credit card number to partially redact
 * @returns The partially redacted card number, or {@link REDACTED} if input is invalid
 *
 * @example Basic usage
 * ```typescript
 * import { partialRedactCreditCard } from '@package/observability';
 *
 * partialRedactCreditCard('4111111111111111');
 * // '************1111'
 *
 * partialRedactCreditCard('5500 0000 0000 0004');
 * // '************0004' (spaces are stripped)
 * ```
 *
 * @example Logging payment operations
 * ```typescript
 * import { partialRedactCreditCard, logger } from '@package/observability';
 *
 * async function processPayment(cardNumber: string, amount: number): Promise<void> {
 *   logger.info('Processing payment', {
 *     cardLast4: partialRedactCreditCard(cardNumber),
 *     amount,
 *     currency: 'USD'
 *   });
 *
 *   // Process payment...
 *
 *   logger.info('Payment successful', {
 *     cardLast4: partialRedactCreditCard(cardNumber),
 *     amount
 *   });
 * }
 * ```
 *
 * @example Edge cases
 * ```typescript
 * partialRedactCreditCard('1234');           // '1234' (exactly 4 digits, nothing to mask)
 * partialRedactCreditCard('123');            // '***REDACTED***' (too short)
 * partialRedactCreditCard('');               // '***REDACTED***' (empty)
 * partialRedactCreditCard('4111-1111-1111-1111'); // '************1111' (dashes stripped)
 * ```
 *
 * @see {@link redactObject} for full card number redaction in objects
 */
export function partialRedactCreditCard(cardNumber: string): string {
  if (!cardNumber || typeof cardNumber !== 'string') {
    return REDACTED;
  }

  const digitsOnly = cardNumber.replace(/\D/g, '');
  if (digitsOnly.length < 4) {
    return REDACTED;
  }

  const lastFour = digitsOnly.slice(-4);
  return '*'.repeat(digitsOnly.length - 4) + lastFour;
}

/**
 * Partially redacts a phone number, showing only the last 4 digits.
 *
 * This function provides a standardized way to display phone numbers
 * that protects privacy while allowing users to identify their own
 * phone number in verification or support contexts.
 *
 * ## Format
 *
 * Input: `+1234567890`
 * Output: `******7890`
 *
 * ## Behavior
 *
 * - Non-digit characters (spaces, dashes, parentheses, plus signs) are stripped
 * - Phone numbers with fewer than 4 digits return {@link REDACTED}
 * - Empty or non-string input returns {@link REDACTED}
 * - The mask length matches the original digit count minus 4
 *
 * ## When to Use
 *
 * - In SMS verification confirmations
 * - In account settings displays
 * - In support or admin interfaces
 * - In audit logs for communication operations
 *
 * @param phone - The phone number to partially redact
 * @returns The partially redacted phone number, or {@link REDACTED} if input is invalid
 *
 * @example Basic usage
 * ```typescript
 * import { partialRedactPhone } from '@package/observability';
 *
 * partialRedactPhone('+1234567890');
 * // '******7890'
 *
 * partialRedactPhone('(555) 123-4567');
 * // '******4567' (formatting stripped)
 * ```
 *
 * @example In verification messages
 * ```typescript
 * import { partialRedactPhone } from '@package/observability';
 *
 * function getVerificationMessage(phone: string): string {
 *   return `A verification code was sent to ${partialRedactPhone(phone)}`;
 * }
 *
 * getVerificationMessage('+14155551234');
 * // 'A verification code was sent to *******1234'
 * ```
 *
 * @example Edge cases
 * ```typescript
 * partialRedactPhone('1234');           // '1234' (exactly 4 digits)
 * partialRedactPhone('123');            // '***REDACTED***' (too short)
 * partialRedactPhone('');               // '***REDACTED***' (empty)
 * partialRedactPhone('+1 (555) 123-4567'); // '*******4567' (all formatting stripped)
 * ```
 *
 * @see {@link redactObject} for full phone number redaction in objects
 */
export function partialRedactPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    return REDACTED;
  }

  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length < 4) {
    return REDACTED;
  }

  const lastFour = digitsOnly.slice(-4);
  return '*'.repeat(digitsOnly.length - 4) + lastFour;
}

/**
 * Creates a safe log context by redacting PII fields from an {@link ILogContext}.
 *
 * This function is specifically designed for use with the observability package's
 * logger. It applies {@link redactObject} to the context and returns a properly
 * typed {@link ILogContext} suitable for structured logging.
 *
 * ## Behavior
 *
 * - Applies standard PII redaction rules to all context fields
 * - Preserves non-sensitive fields (userId, organizationId, requestId, etc.)
 * - Returns a new object (original context is not modified)
 * - Nested objects are recursively processed
 *
 * ## Standard Context Fields
 *
 * These common context fields are **NOT** redacted (they are identifiers, not PII):
 * - `userId` - Typically a UUID, not the actual username
 * - `organizationId` - Tenant identifier
 * - `requestId` - Correlation ID for tracing
 *
 * These fields **ARE** redacted when present:
 * - `email`, `phone`, `firstName`, `lastName`
 * - Any other field matching the sensitive fields list
 *
 * ## When to Use
 *
 * - Before passing context to `logger.info()`, `logger.debug()`, etc.
 * - When creating child loggers with user-provided context
 * - When forwarding request context to downstream services
 *
 * @param context - The log context object to sanitize
 * @returns A new {@link ILogContext} with sensitive fields replaced by {@link REDACTED}
 *
 * @example Basic usage
 * ```typescript
 * import { createSafeLogContext, logger } from '@package/observability';
 *
 * const context = { userId: '123', email: 'user@example.com', action: 'login' };
 * const safeContext = createSafeLogContext(context);
 * // { userId: '123', email: '***REDACTED***', action: 'login' }
 *
 * logger.info('User action', safeContext);
 * ```
 *
 * @example In middleware
 * ```typescript
 * import { createSafeLogContext, logger } from '@package/observability';
 *
 * function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
 *   const context = {
 *     requestId: req.id,
 *     userId: req.user?.id,
 *     email: req.user?.email,     // Will be redacted
 *     ipAddress: req.ip,          // Will be redacted
 *     path: req.path,
 *     method: req.method
 *   };
 *
 *   logger.info('Request received', createSafeLogContext(context));
 *   next();
 * }
 * ```
 *
 * @example With child logger
 * ```typescript
 * import { createSafeLogContext, logger } from '@package/observability';
 *
 * function createRequestLogger(req: Request) {
 *   const context = createSafeLogContext({
 *     requestId: req.id,
 *     userId: req.user?.id,
 *     email: req.user?.email,
 *     organizationId: req.user?.organizationId
 *   });
 *
 *   return logger.child(context);
 * }
 * ```
 *
 * @see {@link ILogContext} for context interface definition
 * @see {@link redactObject} for the underlying redaction logic
 * @see {@link Logger.child} for creating child loggers with context
 */
export function createSafeLogContext(context: ILogContext): ILogContext {
  const safe = redactObject(context);
  // Safety: This cast is sound because redactObject preserves all keys and only
  // masks values with REDACTED strings. ILogContext fields remain structurally
  // intact. If redactObject ever removes keys, replace this cast with runtime
  // validation to ensure the result satisfies ILogContext.
  return safe as ILogContext;
}

/**
 * Configuration options for customizing string-based redaction behavior.
 *
 * This interface provides fine-grained control over the redaction process,
 * allowing you to specify custom field lists, redaction values, and
 * field-specific redaction functions.
 *
 * ## Customization Options
 *
 * - **fields**: Override the default sensitive fields list
 * - **redactionValue**: Use a custom redaction string instead of `***REDACTED***`
 * - **partial**: Enable partial redaction mode for supported fields
 * - **partialRedactors**: Provide custom redaction functions for specific fields
 *
 * ## When to Use
 *
 * - When you need to redact additional custom fields
 * - When your logging format requires a different redaction marker
 * - When you need field-specific partial redaction behavior
 * - When compliance requirements mandate specific redaction formats
 *
 * @example Custom redaction value
 * ```typescript
 * const options: IRedactStringOptions = {
 *   redactionValue: '[HIDDEN]'
 * };
 *
 * const result = redactJsonString(json, options);
 * // Fields are replaced with '[HIDDEN]' instead of '***REDACTED***'
 * ```
 *
 * @example Custom field list
 * ```typescript
 * const options: IRedactStringOptions = {
 *   fields: ['customSecret', 'internalId', 'debugToken']
 * };
 * ```
 *
 * @example Field-specific partial redactors
 * ```typescript
 * const options: IRedactStringOptions = {
 *   partial: true,
 *   partialRedactors: {
 *     email: (value) => partialRedactEmail(value),
 *     phone: (value) => partialRedactPhone(value),
 *     accountNumber: (value) => `****${value.slice(-4)}`
 *   }
 * };
 * ```
 *
 * @see {@link redactJsonString} for JSON string redaction
 */
export interface IRedactStringOptions {
  /**
   * Fields to redact. When provided, replaces the default sensitive fields list.
   * If not specified, uses the built-in list of sensitive fields.
   */
  fields?: readonly string[];

  /**
   * Custom redaction value to use instead of {@link REDACTED}.
   * Useful when your logging system requires a specific format.
   *
   * @default '***REDACTED***'
   */
  redactionValue?: string;

  /**
   * Enable partial redaction mode. When `true` and `partialRedactors` are
   * configured, uses partial redaction for supported fields instead of
   * full replacement.
   *
   * @default false
   */
  partial?: boolean;

  /**
   * Field-specific partial redaction functions. Each key is a field name,
   * and the value is a function that takes the original value and returns
   * the partially redacted version.
   *
   * @example
   * ```typescript
   * {
   *   email: (value) => partialRedactEmail(value),
   *   creditCard: (value) => partialRedactCreditCard(value)
   * }
   * ```
   */
  partialRedactors?: Record<string, (value: string) => string>;
}

/**
 * Redacts sensitive fields from a JSON string.
 *
 * This function parses a JSON string, applies {@link redactObject} to the
 * resulting object, and returns the redacted object as a JSON string.
 * It's useful for processing JSON payloads from external sources or logs.
 *
 * ## Behavior
 *
 * - Parses the input as JSON
 * - Applies standard PII redaction to the parsed object
 * - Returns the redacted object as a JSON string
 * - If the input is not valid JSON, returns the original string unchanged
 * - The `_options` parameter is reserved for future customization
 *
 * ## When to Use
 *
 * - Processing webhook payloads before logging
 * - Redacting JSON from external API responses
 * - Sanitizing JSON error messages
 * - Processing stringified objects in legacy systems
 *
 * @param jsonString - The JSON string to parse and redact
 * @param _options - Reserved for future use (currently unused)
 * @returns The redacted JSON string, or the original string if parsing fails
 *
 * @example Basic usage
 * ```typescript
 * import { redactJsonString } from '@package/observability';
 *
 * const json = '{"email":"user@example.com","password":"secret"}';
 * const safe = redactJsonString(json);
 * // '{"email":"***REDACTED***","password":"***REDACTED***"}'
 * ```
 *
 * @example Processing webhook payload
 * ```typescript
 * import { redactJsonString, logger } from '@package/observability';
 *
 * function logWebhookPayload(rawBody: string, webhookType: string) {
 *   logger.info('Webhook received', {
 *     type: webhookType,
 *     payload: redactJsonString(rawBody)
 *   });
 * }
 * ```
 *
 * @example Invalid JSON handling
 * ```typescript
 * // Invalid JSON is returned unchanged
 * redactJsonString('not valid json');
 * // Returns: 'not valid json'
 *
 * redactJsonString('');
 * // Returns: ''
 * ```
 *
 * @example Nested JSON objects
 * ```typescript
 * const json = JSON.stringify({
 *   user: {
 *     id: '123',
 *     email: 'user@example.com',
 *     profile: {
 *       firstName: 'John',
 *       lastName: 'Doe'
 *     }
 *   },
 *   action: 'update'
 * });
 *
 * const safe = redactJsonString(json);
 * // Nested email, firstName, lastName are all redacted
 * ```
 *
 * @see {@link redactObject} for direct object redaction
 * @see {@link IRedactStringOptions} for future customization options
 */
export function redactJsonString(jsonString: string, _options?: IRedactStringOptions): string {
  try {
    const parsed: unknown = JSON.parse(jsonString);

    // Use redactValue to handle all cases: arrays (including nested), objects, and primitives
    const redacted = redactValue(parsed);
    return JSON.stringify(redacted);
  } catch {
    // If not valid JSON, return as-is
    return jsonString;
  }
}

/**
 * Masks a value by showing only the first N and last M characters.
 *
 * This is a general-purpose masking function that can be used for any
 * sensitive value that needs partial display. It's the underlying
 * mechanism used by more specific functions like {@link partialRedactEmail}.
 *
 * ## Format
 *
 * Input: `abcdef123456` (showFirst=2, showLast=4)
 * Output: `ab******3456`
 *
 * ## Behavior
 *
 * - Values shorter than `showFirst + showLast` return {@link REDACTED}
 * - Empty or non-string input returns {@link REDACTED}
 * - The middle portion is replaced with asterisks (`*`)
 * - The mask length equals `value.length - showFirst - showLast`
 *
 * ## When to Use
 *
 * - Creating custom partial redaction for domain-specific fields
 * - Masking API keys, tokens, or other identifiers
 * - Displaying partial account numbers or reference codes
 *
 * @param value - The string value to mask
 * @param showFirst - Number of characters to show at the beginning (default: 2)
 * @param showLast - Number of characters to show at the end (default: 4)
 * @returns The masked value, or {@link REDACTED} if the value is too short
 *
 * @example Basic usage
 * ```typescript
 * import { maskValue } from '@package/observability';
 *
 * maskValue('abcdef123456', 2, 4);
 * // 'ab******3456'
 *
 * maskValue('secrettoken123', 3, 3);
 * // 'sec********123'
 * ```
 *
 * @example Masking API keys
 * ```typescript
 * import { maskValue, logger } from '@package/observability';
 *
 * function logApiKeyUsage(apiKey: string, endpoint: string) {
 *   logger.info('API key used', {
 *     key: maskValue(apiKey, 4, 4),  // Show first 4 and last 4
 *     endpoint
 *   });
 * }
 *
 * logApiKeyUsage('sk_live_abc123def456xyz789', '/api/users');
 * // Logs: { key: 'sk_l***************z789', endpoint: '/api/users' }
 * ```
 *
 * @example Edge cases
 * ```typescript
 * maskValue('short', 2, 4);      // '***REDACTED***' (too short: 5 < 2+4)
 * maskValue('sixchr', 2, 4);     // '***REDACTED***' (too short: 6 <= 2+4)
 * maskValue('', 2, 4);           // '***REDACTED***' (empty)
 * maskValue('longenough', 2, 4); // 'lo****ough' (10 chars, shows 2+4)
 * ```
 *
 * @see {@link partialRedactEmail} for email-specific masking
 * @see {@link partialRedactCreditCard} for credit card masking
 * @see {@link partialRedactPhone} for phone number masking
 */
export function maskValue(value: string, showFirst = 2, showLast = 4): string {
  if (!value || typeof value !== 'string') {
    return REDACTED;
  }

  if (value.length <= showFirst + showLast) {
    return REDACTED;
  }

  const first = value.substring(0, showFirst);
  const last = value.substring(value.length - showLast);
  const maskedLength = value.length - showFirst - showLast;
  return `${first}${'*'.repeat(maskedLength)}${last}`;
}
