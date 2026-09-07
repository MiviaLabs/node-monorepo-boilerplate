# API Reference

Complete API documentation for `@package/errors`.

## Core Classes

### RegisteredError

Framework-agnostic exception class for registered errors.

#### Constructor

```typescript
constructor(
  code: ErrorCode,
  parameters?: ErrorParameters,
  metadata?: ErrorMetadata,
  skipValidation?: boolean
)
```

**Parameters:**

| Parameter        | Type              | Required | Description                                  |
| ---------------- | ----------------- | -------- | -------------------------------------------- |
| `code`           | `ErrorCode`       | Yes      | Error code from registry (e.g., 'USER_001')  |
| `parameters`     | `ErrorParameters` | No       | Parameters for message interpolation         |
| `metadata`       | `ErrorMetadata`   | No       | Debugging context (not shown to users)       |
| `skipValidation` | `boolean`         | No       | Skip parameter validation (for internal use) |

**Example:**

```typescript
const error = new RegisteredError('USER_001', { userId: '123' }, { requestId: 'abc-123' });
```

#### Properties

| Property     | Type              | Description                          |
| ------------ | ----------------- | ------------------------------------ |
| `code`       | `ErrorCode`       | Unique error code                    |
| `definition` | `ErrorDefinition` | Error definition from registry       |
| `parameters` | `ErrorParameters` | Message interpolation parameters     |
| `metadata`   | `ErrorMetadata`   | Debugging context                    |
| `httpStatus` | `HttpStatusCode`  | HTTP status code                     |
| `timestamp`  | `string`          | ISO timestamp when error was created |
| `message`    | `string`          | Interpolated error message           |
| `name`       | `string`          | Error code (same as `code`)          |
| `stack`      | `string?`         | Stack trace (if available)           |

#### Methods

##### toJSON()

Converts error to plain object for serialization.

```typescript
toJSON(): {
  code: string;
  message: string;
  parameters: ErrorParameters;
  metadata: ErrorMetadata;
  httpStatus: number;
  timestamp: string;
  stack?: string;
}
```

**Example:**

```typescript
const error = Errors.useruserWithId001({ userId: '123' });
console.log(error.toJSON());
// {
//   code: 'USER_001',
//   message: 'User with ID 123 not found',
//   parameters: { userId: '123' },
//   metadata: {},
//   httpStatus: 404,
//   timestamp: '2024-01-01T00:00:00.000Z',
//   stack: '...'
// }
```

##### isRegisteredError()

Type guard to check if an error is a RegisteredError.

```typescript
static isRegisteredError(error: unknown): error is RegisteredError
```

**Example:**

```typescript
try {
  // some operation
} catch (error) {
  if (RegisteredError.isRegisteredError(error)) {
    console.log('Error code:', error.code);
  }
}
```

##### fromError()

Converts a standard Error to RegisteredError if possible.

```typescript
static fromError(error: unknown): RegisteredError | Error
```

**Example:**

```typescript
try {
  // some operation
} catch (error) {
  const registered = RegisteredError.fromError(error);
  throw registered;
}
```

---

### Errors Factory

Type-safe factory class for creating RegisteredError instances.

#### Methods

All factory methods follow this pattern:

```typescript
static [errorMethodName](
  parameters: Partial<ErrorParameters> | Record<string, never>,
  metadata?: ErrorMetadata
): RegisteredError
```

**Example:**

```typescript
// User not found (required parameter)
Errors.useruserWithId001({ userId: '123' });

// Auth error (no parameters)
Errors.authinvalidEmailOr001({});

// Validation error with metadata
Errors.validationvalidationFailedField001({ field: 'email' }, { requestId: 'abc-123' });
```

**Factory Method Naming:**

Factory methods are auto-generated from error codes:

- Error code: `USER_001`
- Factory method: `Errors.useruserWithId001()`

---

### TranslationService

Service for translating error messages with locale fallback support.

#### Static Methods

##### initialize()

Initialize the translation service. Call during application startup.

```typescript
static async initialize(): Promise<void>
```

**Example:**

```typescript
import { TranslationService } from '@package/errors';

async function bootstrap() {
  await TranslationService.initialize();
  await app.listen(3000);
}
```

##### translateAsync()

Translate an error message asynchronously.

```typescript
static async translateAsync(
  code: ErrorCode,
  parameters?: ErrorParameters,
  options?: TranslationOptions
): Promise<TranslationResult>
```

**Parameters:**

| Parameter    | Type                 | Required | Default            | Description                  |
| ------------ | -------------------- | -------- | ------------------ | ---------------------------- |
| `code`       | `ErrorCode`          | Yes      | -                  | Error code to translate      |
| `parameters` | `ErrorParameters`    | No       | `{}`               | Parameters for interpolation |
| `options`    | `TranslationOptions` | No       | `{ locale: 'en' }` | Translation options          |

**Returns:** `TranslationResult`

```typescript
interface TranslationResult {
  message: string; // Translated message
  locale: Locale; // Actual locale used
  usedFallback: boolean; // Whether fallback was used
  code: ErrorCode; // Error code
}
```

**Example:**

```typescript
const result = await TranslationService.translateAsync(
  'USER_001',
  { userId: '123' },
  { locale: 'ar-SA' }
);

console.log(result.message);
// "المستخدم بالمعرف 123 غير موجود"

console.log(result.usedFallback);
// false (if Arabic translation exists)
```

##### translate()

Translate an error message synchronously (requires initialization).

```typescript
static translate(
  code: ErrorCode,
  parameters?: ErrorParameters,
  options?: TranslationOptions
): TranslationResult
```

**Note:** Throws if `TranslationService.initialize()` has not been called.

##### getAllTranslations()

Get all translations (async).

```typescript
static async getAllTranslations(): Promise<Record<string, ErrorTranslations>>
```

**Example:**

```typescript
const translations = await TranslationService.getAllTranslations();
console.log(translations['en']['USER_001']);
// "User with ID {userId} not found"
```

##### getTranslations()

Get translations for a specific locale (sync, requires initialization).

```typescript
static getTranslations(locale: Locale): ErrorTranslations
```

##### getTranslationsAsync()

Get translations for a specific locale (async).

```typescript
static async getTranslationsAsync(locale: Locale): Promise<ErrorTranslations>
```

##### getAvailableLocales()

Get all available locale codes.

```typescript
static async getAvailableLocales(): Promise<readonly Locale[]>
```

**Example:**

```typescript
const locales = await TranslationService.getAvailableLocales();
console.log(locales);
// ['en', 'ar-SA', 'tl-PH', 'fr']
```

##### isLocaleSupported()

Check if a locale is supported (sync, requires initialization).

```typescript
static isLocaleSupported(locale: string): boolean
```

##### isLocaleSupportedAsync()

Check if a locale is supported (async).

```typescript
static async isLocaleSupportedAsync(locale: string): Promise<boolean>
```

##### validateTranslations()

Validate translations against error registry (sync, requires initialization).

```typescript
static validateTranslations(
  registryCodes: readonly string[]
): TranslationValidationResult
```

**Returns:**

```typescript
interface TranslationValidationResult {
  valid: boolean;
  missing: Readonly<Record<Locale, string[]>>;
  extra: Readonly<Record<Locale, string[]>>;
  totalCodes: number;
}
```

##### validateTranslationsAsync()

Validate translations against error registry (async).

```typescript
static async validateTranslationsAsync(
  registryCodes: readonly string[]
): Promise<TranslationValidationResult>
```

##### addTranslations()

Add or override translations for a locale (for testing/overrides).

```typescript
static addTranslations(
  locale: Locale,
  translations: Record<string, string>
): void
```

**Example:**

```typescript
TranslationService.addTranslations('en', {
  USER_001: 'Custom message: User {userId} not found'
});
```

##### interpolateMessage()

Interpolate parameters into a message template.

```typescript
static interpolateMessage(
  template: string,
  parameters: ErrorParameters
): string
```

**Example:**

```typescript
const message = TranslationService.interpolateMessage('User {name} has {count} items', {
  name: 'John',
  count: 5
});
// "User John has 5 items"
```

---

## Types and Interfaces

### ErrorResponseData

Core error response data structure for BaseResponseDto pattern.

```typescript
interface ErrorResponseData {
  code: string; // Error code (e.g., "VAL_001", "USER_001")
  message: string; // Original error message (untranslated)
  translated: string; // Translated error message (in requested locale)
  translationKey?: string; // Translation key for i18n lookup
  parameters?: Readonly<Record<string, unknown>>; // Interpolation parameters
  [key: string]: unknown; // Additional flexible properties
}
```

### ErrorResponseMetadata

Error metadata included in response metadata.

```typescript
interface ErrorResponseMetadata {
  timestamp: string; // Response timestamp
  requestId?: string; // Unique request ID for tracing
  error: ResponseErrorMetadata; // Error-specific metadata
}
```

### ResponseErrorMetadata

Error-specific metadata for responses.

```typescript
interface ResponseErrorMetadata {
  category: ResponseErrorCategory; // Error category
  severity: ResponseErrorSeverity; // Error severity
  httpStatus: number; // HTTP status code
  debugInfo?: ResponseErrorDebugInfo; // Debug information (non-production only)
  errors?: string[]; // Detailed validation errors
  stack?: string; // Stack trace (non-production only)
}
```

### ResponseErrorDebugInfo

Debug information for error responses.

```typescript
interface ResponseErrorDebugInfo {
  path?: string; // Request path
  method?: string; // Request method
  [key: string]: unknown; // Additional error details
}
```

### ResponseErrorCategory

Error category enum.

```typescript
enum ResponseErrorCategory {
  VALIDATION = 'VALIDATION',
  AUTH = 'AUTH',
  AUTHORIZATION = 'AUTHORIZATION',
  USER = 'USER',
  DATABASE = 'DATABASE',
  BUSINESS = 'BUSINESS',
  EXTERNAL = 'EXTERNAL',
  FILE = 'FILE',
  SYSTEM = 'SYSTEM',
  AGGREGATED = 'AGGREGATED'
}
```

### ResponseErrorSeverity

Error severity enum.

```typescript
enum ResponseErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
```

### BaseResponseDto

Base response DTO interface (matches the BaseResponseDto class structure).

```typescript
interface BaseResponseDto<T = unknown> {
  readonly data: T;
  readonly metadata?: ResponseMetadata;
}
```

### ResponseMetadata

Response metadata interface.

```typescript
interface ResponseMetadata {
  timestamp?: string;
  version?: string;
  requestId?: string;
  error?: ResponseErrorMetadata;
}
```

### ErrorCode

Union type of all registered error codes.

```typescript
type ErrorCode =
  | 'USER_001' | 'USER_002' | ... | 'USER_010'
  | 'AUTH_001' | 'AUTH_002' | ... | 'AUTH_010'
  | 'VAL_001' | 'VAL_002' | ... | 'VAL_009'
  | 'DB_001' | 'DB_002' | ... | 'DB_010'
  | 'BIZ_001' | 'BIZ_002' | ... | 'BIZ_008'
  | 'EXT_001' | 'EXT_002' | ... | 'EXT_007'
  | 'FILE_001' | 'FILE_002' | ... | 'FILE_008'
  | 'SYS_001' | 'SYS_002' | ... | 'SYS_010';
```

### ErrorParameters

Parameters for message interpolation.

```typescript
type ErrorParameters = Readonly<Record<string, unknown>>;
```

### ErrorMetadata

Debugging context (not shown to users).

```typescript
interface ErrorMetadata {
  tenantId?: string;
  organizationId?: string;
  userId?: string;
  requestId?: string;
  timestamp?: string;
  stack?: string;
  sourceFile?: string;
  sourceFunction?: string;
  lineNumber?: number;
  [key: string]: unknown;
}
```

### ErrorDefinition

Error definition from the registry.

```typescript
interface ErrorDefinition {
  code: string;
  type: ErrorType;
  severity: ErrorSeverity;
  httpStatus: HttpStatusCode;
  message: string;
  parameters?: readonly ErrorParameter[];
  description?: string;
  deprecationMessage?: string;
  safeForUser: boolean;
  resolution?: string;
}
```

### ErrorType

Error type categories.

```typescript
enum ErrorType {
  USER = 'USER',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  DATABASE = 'DATABASE',
  BUSINESS = 'BUSINESS',
  EXTERNAL = 'EXTERNAL',
  FILE = 'FILE',
  SYSTEM = 'SYSTEM'
}
```

### ErrorSeverity

Error severity levels.

```typescript
enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
```

### HttpStatusCode

HTTP status codes for error responses.

```typescript
type HttpStatusCode = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504 | 507;
```

### Locale

Supported locale codes.

```typescript
type Locale = 'en' | 'ar-SA' | 'tl-PH' | 'fr';
```

### TranslationOptions

Options for translation.

```typescript
interface TranslationOptions {
  locale?: Locale; // Requested locale (default: 'en')
  useFallback?: boolean; // Use fallback chain (default: true)
  fallbackLocale?: Locale; // Fallback locale (default: 'en')
}
```

### ErrorTranslations

Translation map for a locale.

```typescript
type ErrorTranslations = Record<ErrorCode, string>;
```

### TranslationResult

Result of a translation operation.

```typescript
interface TranslationResult {
  message: string; // Translated and interpolated message
  locale: Locale; // Actual locale used (may be fallback)
  usedFallback: boolean; // Whether fallback was used
  code: ErrorCode; // Error code
}
```

---

## Error Registry

### ERROR_REGISTRY

Read-only registry of all error definitions.

```typescript
const ERROR_REGISTRY: ErrorRegistryMap;
```

**Example:**

```typescript
import { ERROR_REGISTRY } from '@package/errors';

const userError = ERROR_REGISTRY['USER_001'];
console.log(userError);
// {
//   code: 'USER_001',
//   type: 'USER',
//   severity: 'HIGH',
//   httpStatus: 404,
//   message: 'User with ID {userId} not found',
//   parameters: [{ name: 'userId', type: 'string', required: true }],
//   ...
// }
```

### getErrorDefinition()

Get error definition by code.

```typescript
function getErrorDefinition(code: ErrorCode): ErrorDefinition | undefined;
```

**Example:**

```typescript
import { getErrorDefinition } from '@package/errors';

const definition = getErrorDefinition('USER_001');
if (definition) {
  console.log(definition.message);
}
```

---

## Type Guards

### isErrorData()

Check if an object is ErrorData.

```typescript
function isErrorData(obj: unknown): obj is ErrorData;
```

### isErrorResponse()

Check if a response is an error response.

```typescript
function isErrorResponse(obj: unknown): obj is {
  data: ErrorData;
  metadata?: Record<string, unknown>;
};
```

### isErrorResponseData()

Check if an object is ErrorResponseData (for BaseResponseDto pattern).

```typescript
function isErrorResponseData(value: unknown): value is ErrorResponseData;
```

**Example:**

```typescript
import { isErrorResponseData } from '@package/errors';

if (isErrorResponseData(response.data)) {
  console.log('Error code:', response.data.code);
  console.log('Translated message:', response.data.translated);
}
```

### isErrorResponseMetadata()

Check if an object is ErrorResponseMetadata.

```typescript
function isErrorResponseMetadata(value: unknown): value is ErrorResponseMetadata;
```

**Example:**

```typescript
import { isErrorResponseMetadata } from '@package/errors';

if (isErrorResponseMetadata(response.metadata)) {
  console.log('Error category:', response.metadata.error.category);
  console.log('HTTP status:', response.metadata.error.httpStatus);
}
```

### isErrorResponse() (Enhanced)

Check if a response is an error response (BaseResponseDto with error metadata).

```typescript
function isErrorResponse(
  response: unknown
): response is BaseResponseDto<ErrorResponseData> & { metadata: ErrorResponseMetadata };
```

**Example:**

```typescript
import { isErrorResponse } from '@package/errors';

if (isErrorResponse(response)) {
  console.log('Error response detected');
  console.log('Code:', response.data.code);
  console.log('Category:', response.metadata.error.category);
  console.log('Severity:', response.metadata.error.severity);
  console.log('HTTP Status:', response.metadata.error.httpStatus);
}
```

---

## See Also

- [Getting Started](./getting-started.md) - Installation and setup
- [Usage Guide](./usage-guide.md) - Comprehensive usage examples
- [Error Codes Reference](./error-codes.md) - All error codes
- [Adding Locales](./adding-locales.md) - Adding new languages
- [Response Types](./response-types.md) - BaseResponseDto integration and error response patterns
