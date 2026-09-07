# @package/errors

Framework-agnostic error handling with centralized registry, type-safe factories, and i18n support.

## Purpose

This package provides a unified error handling system for the Node Monorepo Boilerplate. It includes a centralized error code registry, type-safe error factory methods with autocomplete support, internationalization (i18n) for error messages, and standardized error response types for consistent API responses across frameworks (NestJS, Next.js/tRPC).

## Structure

```text
src/
├── exceptions/              # Exception classes
│   ├── registered-error.exception.ts  # Base registered error class
│   ├── errors.factory.ts              # Type-safe error factory (auto-generated)
│   └── index.ts
├── i18n/                    # Internationalization support
│   ├── i18n.types.ts        # Locale and translation types
│   ├── locale-context.ts    # Request-scoped locale context
│   ├── locale-loader.ts     # Dynamic locale file loading
│   ├── translation.service.ts  # Translation service
│   └── locales/             # Locale translation files
├── registry/                # Error code registry
│   ├── error-registry.ts    # Main registry exports
│   ├── error-registry.types.ts  # Registry types
│   └── definitions/         # Error code definitions by category
├── types/                   # Error data types
│   └── error-data.types.ts  # Unified error response types
├── utils/                   # Utility functions
└── index.ts
```

## Usage

```typescript
import { Errors, RegisteredError, TranslationService } from '@package/errors';
import type { ErrorResponseData, ErrorCode } from '@package/errors';

// Throw type-safe errors using the factory
// Factory methods are strongly typed per error code definition
throw Errors.useruserWithId001({ userId: '123' });
throw Errors.authauthInvalidEmail001({});
throw Errors.validationvalidationFailedField001({ field: 'email' });

// Initialize translation service at app startup
await TranslationService.initialize();

// Translate error messages
const result = TranslationService.translate('USER_001', { userId: '123' }, { locale: 'ar-SA' });
// Returns: { message: "المستخدم بالمعرف 123 غير موجود", locale: 'ar-SA', ... }

// Check error registry
import { ERROR_REGISTRY, getErrorDefinition, isErrorCode } from '@package/errors';
const definition = getErrorDefinition('USER_001');
```

## Key Exports

### Exception Classes

- `RegisteredError` - Base error class that extends `HttpException` with error code, parameters, and metadata
- `Errors` - Type-safe factory class with static methods for each error code (auto-generated)

### Registry

- `ERROR_REGISTRY` - Centralized map of all error codes to their definitions
- `ErrorCode` - Union type of all valid error codes
- `getErrorDefinition()` - Get error definition by code
- `isErrorCode()` - Type guard for error codes
- `getErrorCodesByType()` - Get error codes by category
- `validateErrorParameters()` - Validate parameters for an error code

### Error Categories

- `USER_ERRORS` - User-related errors (USER_001 - USER_010)
- `AUTH_ERRORS` - Authentication errors (AUTH_001 - AUTH_010)
- `VALIDATION_ERRORS` - Validation errors (VAL_001 - VAL_009)
- `DATABASE_ERRORS` - Database errors (DB_001 - DB_010)
- `BUSINESS_ERRORS` - Business logic errors (BIZ_001 - BIZ_008)
- `EXTERNAL_ERRORS` - External service errors (EXT_001 - EXT_007)
- `FILE_ERRORS` - File operation errors (FILE_001 - FILE_008)
- `SYSTEM_ERRORS` - System errors (SYS_001 - SYS_010)

### i18n Support

- `TranslationService` - Error message translation with locale fallback
- `LocaleContext` - Request-scoped locale context for NestJS

### Response Types

- `ErrorResponseData` - Unified error response data structure
- `ErrorResponseMetadata` - Error metadata for responses
- `ResponseErrorSeverity` - Error severity levels (LOW, MEDIUM, HIGH, CRITICAL)
- `ResponseErrorCategory` - Error categories for responses
- `isErrorResponseData()` - Type guard for error response data
- `isErrorResponse()` - Type guard for error responses

## Associated Packages

- `@package/constants` - ErrorCode and ErrorType constants
- `@package/core` - Infrastructure error classes
- `@package/schema` - Validation error handling
- `@package/observability` - Error logging integration

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |
