# Getting Started

Installation and setup guide for `@package/errors`.

## Installation

```bash
# Using pnpm (recommended for this monorepo)
pnpm add @package/errors

# Using npm
npm install @package/errors

# Using yarn
yarn add @package/errors
```

## Package Structure

```
@package/errors/
├── src/
│   ├── exceptions/           # Exception classes and factory
│   ├── registry/            # Error code definitions
│   ├── i18n/                # Translation service and locales
│   └── index.ts             # Main exports
├── docs/                    # Documentation
└── package.json
```

## Setup

### 1. Initialize Translation Service (Optional but Recommended)

If you want to use i18n features, initialize the translation service during application startup:

```typescript
import { TranslationService } from '@package/errors';

// In your main.ts or app initialization
async function bootstrap() {
  // Initialize translation service
  await TranslationService.initialize();

  // Start your application
  await app.listen(3000);
}

bootstrap();
```

### 2. Configure Default Locale (Optional)

The default locale is `en` (English). You can change this by setting the `DEFAULT_LOCALE` in your environment:

```bash
# .env
ERROR_LOCALE=en
```

Or programmatically:

```typescript
import { TranslationService } from '@package/errors';

// Get available locales
const locales = await TranslationService.getAvailableLocales();
console.log(locales); // ['en', 'ar-SA', 'tl-PH', 'fr']
```

## Basic Usage

### Throwing Errors

```typescript
import { Errors } from '@package/errors';

// Throw an error with parameters
throw Errors.useruserWithId001({ userId: '123' });

// Throw an error with metadata (for debugging)
throw Errors.authinvalidEmailOr001({}, { requestId: 'abc-123', userId: '456' });
```

### Catching and Handling Errors

```typescript
import { RegisteredError, TranslationService } from '@package/errors';

try {
  // Some operation that throws RegisteredError
  await someOperation();
} catch (error) {
  if (error instanceof RegisteredError) {
    console.error('Error code:', error.code);
    console.error('HTTP status:', error.httpStatus);
    console.error('Message:', error.message);
    console.error('Parameters:', error.parameters);
    console.error('Metadata:', error.metadata);
  }
}
```

## Type Safety

The `Errors` factory provides full type safety for error parameters:

```typescript
// TypeScript will enforce required parameters
throw Errors.useruserWithId001({ userId: '123' }); // ✅ Correct

// TypeScript will show error for missing required parameter
throw Errors.useruserWithId001({}); // ❌ Error: userId is required

// TypeScript will show error for wrong type
throw Errors.useruserWithId001({ userId: 123 }); // ❌ Error: userId must be string

// Optional parameters can be omitted
throw Errors.authinsufficientPermissionsRequiredpermission004({}); // ✅ OK
```

## Next Steps

- [Usage Guide](./usage-guide.md) - Comprehensive usage examples
- [Error Codes Reference](./error-codes.md) - Complete list of all error codes
- [API Reference](./api-reference.md) - Complete API documentation
- [Response Types](./response-types.md) - BaseResponseDto integration and error response patterns
