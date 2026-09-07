# API Errors Module

API-specific error handling for the NestJS application. This module provides type-safe error codes, internationalized error messages, and helper functions for throwing API errors.

## Architecture

This module is **completely contained within the API app** and extends the generic `@package/errors` package without modifying it:

- **Error Codes**: Defined in `apps/api/src/common/errors/api-error-codes.ts`
- **Exception Class**: `ApiException` extends `RegisteredError` from `@package/errors`
- **Translations**: Located in `apps/api/src/i18n/messages/*.ts`
- **Helpers**: Convenience functions for common error scenarios

## Quick Start

### Basic Usage

```typescript
import { ApiException, throwTenantContextMissing } from '@/common/errors';

// Option 1: Using helper function (recommended)
if (!tenantId) {
  throwTenantContextMissing();
}

// Option 2: Using ApiException class directly
if (!tenantId) {
  throw new ApiException('API_001');
}

// Option 3: Using static factory method
if (!tenantId) {
  throw ApiException.tenantContextMissing();
}
```

### With Parameters

```typescript
import { throwRateLimitExceeded } from '@/common/errors';

// Rate limit error with parameters
throwRateLimitExceeded(100, 60, 30);
// Error: Rate limit exceeded. Maximum 100 requests per 60 seconds. Retry after 30 seconds
```

### With Metadata

```typescript
import { ApiException } from '@/common/errors';

throw new ApiException(
  'API_013',
  {
    keyId: 'key_abc123'
  },
  {
    requestId: 'req_xyz',
    userId: 'user_456',
    timestamp: new Date().toISOString()
  }
);
```

## Error Codes Reference

### API_001 - Tenant Context Missing

**HTTP Status**: 400 Bad Request
**Parameters**: None

```typescript
throwTenantContextMissing();
// Error: Tenant context is required for this request
```

Use when the `x-tenant-id` header is missing from a request.

---

### API_002 - Tenant Context Invalid

**HTTP Status**: 400 Bad Request
**Parameters**: None

```typescript
throwTenantContextInvalid();
// Error: Invalid tenant context provided
```

Use when the `x-tenant-id` header has invalid format (e.g., not a valid UUID).

---

### API_003 - API Version Not Found

**HTTP Status**: 404 Not Found
**Parameters**: `version` (optional)

```typescript
throwApiVersionNotFound('v3');
// Error: API version v3 not found
```

Use when the requested API version does not exist.

---

### API_004 - API Version Deprecated

**HTTP Status**: 400 Bad Request
**Parameters**: `version`, `sunsetDate`

```typescript
throwApiVersionDeprecated('v1', '2026-06-30');
// Error: API version v1 is deprecated and will be sunset on 2026-06-30
```

Use when a client attempts to use a deprecated API version.

---

### API_005 - Rate Limit Exceeded

**HTTP Status**: 429 Too Many Requests
**Parameters**: `limit`, `window`, `retryAfter`

```typescript
throwRateLimitExceeded(100, 60, 30);
// Error: Rate limit exceeded. Maximum 100 requests per 60 seconds. Retry after 30 seconds
```

Use when a client exceeds the allowed rate limit.

---

### API_006 - Request Validation Failed

**HTTP Status**: 400 Bad Request
**Parameters**: `field`, `constraint`

```typescript
throwRequestValidationFailed('email', 'must be a valid email address');
// Error: Request validation failed for field email: must be a valid email address
```

Use when request field validation fails.

---

### API_007 - Invalid Query Parameter

**HTTP Status**: 400 Bad Request
**Parameters**: `param`, `value`

```typescript
throwInvalidQueryParameter('order', 'invalid');
// Error: Invalid query parameter order: invalid
```

Use when a query parameter has an invalid value.

---

### API_008 - Missing Required Header

**HTTP Status**: 400 Bad Request
**Parameters**: `header`

```typescript
throwMissingRequiredHeader('authorization');
// Error: Missing required header: authorization
```

Use when a required HTTP header is missing.

---

### API_009 - Invalid Request Body Format

**HTTP Status**: 400 Bad Request
**Parameters**: `format`

```typescript
throwInvalidRequestBodyFormat('JSON');
// Error: Invalid request body format. Expected JSON
```

Use when the request body cannot be parsed.

---

### API_010 - Feature Not Enabled

**HTTP Status**: 503 Service Unavailable
**Parameters**: `feature`

```typescript
throwFeatureNotEnabled('advanced-analytics');
// Error: Feature advanced-analytics is not enabled
```

Use when attempting to access a feature not enabled for the tenant.

---

### API_011 - Service Temporarily Unavailable

**HTTP Status**: 503 Service Unavailable
**Parameters**: `service`, `retryAfter`

```typescript
throwServiceUnavailable('payment-gateway', 60);
// Error: Service payment-gateway is temporarily unavailable. Retry after 60 seconds
```

Use when a required service is down or unavailable.

---

### API_012 - Configuration Error

**HTTP Status**: 500 Internal Server Error
**Parameters**: `setting`

```typescript
throwConfigurationError('databaseUrl');
// Error: Configuration error: databaseUrl
```

Use when there's a server-side configuration issue.

---

### API_013 - Invalid API Key

**HTTP Status**: 401 Unauthorized
**Parameters**: `keyId`

```typescript
throwInvalidApiKey('key_abc123');
// Error: Invalid API key: key_abc123
```

Use when an API key validation fails.

---

### API_014 - API Key Expired

**HTTP Status**: 401 Unauthorized
**Parameters**: `keyId`, `expiredAt`

```typescript
throwApiKeyExpired('key_abc123', '2024-01-01T00:00:00Z');
// Error: API key key_abc123 expired on 2024-01-01T00:00:00Z
```

Use when an API key has expired.

---

### API_015 - Webhook Delivery Failed

**HTTP Status**: 500 Internal Server Error
**Parameters**: `webhookUrl`, `attempt`, `reason`

```typescript
throwWebhookDeliveryFailed('https://example.com/webhook', 3, 'connection refused');
// Error: Webhook delivery failed to https://example.com/webhook after 3 attempts: connection refused
```

Use when webhook delivery fails after all retries.

---

### API_016 - Batch Request Too Large

**HTTP Status**: 413 Payload Too Large
**Parameters**: `maxSize`, `actualSize`, `unit`

```typescript
throwBatchRequestTooLarge(100, 150, 'items');
// Error: Batch request too large. Maximum 100 items, got 150 items
```

Use when a batch request exceeds size limits.

---

### API_017 - Request Timeout

**HTTP Status**: 408 Request Timeout
**Parameters**: `timeout`

```typescript
throwRequestTimeout(30);
// Error: Request timeout after 30 seconds
```

Use when a request takes longer than allowed timeout.

---

### API_018 - Invalid Pagination Parameters

**HTTP Status**: 400 Bad Request
**Parameters**: `page`, `pageSize`, `maxPageSize`

```typescript
throwInvalidPaginationParameters(1, 1000, 100);
// Error: Invalid pagination parameters. Page: 1, PageSize: 1000. Maximum page size: 100
```

Use when pagination parameters are invalid.

---

### API_019 - Invalid Sort Parameters

**HTTP Status**: 400 Bad Request
**Parameters**: `field`, `direction`

```typescript
throwInvalidSortParameters('invalidField', 'invalidDirection');
// Error: Invalid sort parameters. Field: invalidField, Direction: invalidDirection
```

Use when sort parameters are invalid.

---

### API_020 - Concurrent Modification Conflict

**HTTP Status**: 409 Conflict
**Parameters**: `resource`, `id`

```typescript
throwConcurrentModificationConflict('user', 'user_123');
// Error: Concurrent modification conflict for user user_123. The resource was modified by another process
```

Use for optimistic locking failures.

---

## Usage Examples

### In Controllers

```typescript
import { Controller, Get, Headers } from '@nestjs/common';
import { throwTenantContextMissing, throwApiVersionNotFound } from '@/common/errors';

@Controller('users')
export class UsersController {
  @Get()
  findAll(@Headers('x-tenant-id') tenantId: string, @Headers('x-api-version') version: string) {
    if (!tenantId) {
      throwTenantContextMissing();
    }

    if (!this.apiVersionService.isValid(version)) {
      throwApiVersionNotFound(version);
    }

    // ... handler logic
  }
}
```

### In Command Handlers

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { throwFeatureNotEnabled } from '@/common/errors';

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler {
  async execute(command: CreateOrderCommand) {
    const tenant = await this.tenantService.findById(command.tenantId);

    if (!tenant.features.includes('order-management')) {
      throwFeatureNotEnabled('order-management');
    }

    // ... handler logic
  }
}
```

### In Guards

```typescript
import { CanActivate } from '@nestjs/common';
import { throwInvalidApiKey } from '@/common/errors';

export class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || !(await this.apiKeyService.validate(apiKey))) {
      throwInvalidApiKey(apiKey);
    }

    return true;
  }
}
```

### With Error Handling

```typescript
import { isApiException, isClientError, isRetryable } from '@/common/errors';

async function performOperation() {
  try {
    await someOperation();
  } catch (error) {
    if (isApiException(error)) {
      console.log(`API Error ${error.code}: ${error.message}`);
      console.log(`HTTP Status: ${error.getStatus()}`);

      if (isClientError(error)) {
        // Log as client error (don't alert)
        logger.warn('Client error', { code: error.code });
      }

      if (isRetryable(error)) {
        // Schedule retry
        await retryWithBackoff(operation, error.parameters.retryAfter);
      }
    }
    throw error;
  }
}
```

## Internationalization

All API error codes are translated into multiple languages:

- **English** (`en.ts`)
- **Arabic - Saudi Arabia** (`ar-SA.ts`)
- **Tagalog - Philippines** (`tl-PH.ts`)
- **French** (`fr.ts`)

The errors package automatically selects the appropriate translation based on the request's `Accept-Language` header or configured locale.

### Adding New Translations

To add a new language:

1. Create a new translation file in `apps/api/src/i18n/messages/`
2. Add translations for all API_001-020 error codes
3. Register the locale in the i18n configuration

Example translation file structure:

```typescript
// apps/api/src/i18n/messages/es.ts
export const es: ErrorTranslations = {
  // ... other translations

  API_001: 'Se requiere contexto de inquilino para esta solicitud',
  API_002: 'Contexto de inquilino inválido proporcionado'
  // ... all 20 error codes
} as const;
```

## Error Properties

### ApiException Properties

```typescript
const error = new ApiException('API_005', {
  limit: 100,
  window: 60,
  retryAfter: 30
});

// All properties from RegisteredError
error.code; // 'API_005'
error.message; // 'Rate limit exceeded. Maximum 100 requests per 60 seconds...'
error.parameters; // { limit: 100, window: 60, retryAfter: 30 }
error.metadata; // {}
error.httpStatus; // 429
error.timestamp; // '2024-01-01T00:00:00.000Z'
error.definition; // Error definition from registry

// ApiException-specific methods
error.getStatus(); // 429
error.isClientError(); // false (it's a 4xx, so returns true)
error.isServerError(); // false
error.isRetryable(); // true (429 is retryable)
```

## Best Practices

### 1. Use Helper Functions

Prefer helper functions over direct `ApiException` instantiation:

```typescript
// ✅ Good
throwTenantContextMissing();

// ⚠️ Acceptable but more verbose
throw new ApiException('API_001');
```

### 2. Provide Meaningful Parameters

Always provide parameters when available:

```typescript
// ✅ Good
throwRateLimitExceeded(100, 60, 30);

// ⚠️ Less useful
throw new ApiException('API_005');
```

### 3. Include Metadata for Debugging

Add metadata for server-side debugging (not shown to users):

```typescript
throw new ApiException(
  'API_013',
  {
    keyId: 'key_abc123'
  },
  {
    requestId: 'req_xyz',
    userId: 'user_456',
    timestamp: new Date().toISOString(),
    ipAddress: req.ip
  }
);
```

### 4. Use Type Guards

Always use type guards when handling errors:

```typescript
if (isApiException(error)) {
  // Handle API exceptions
  console.log(error.code, error.getStatus());
}
```

### 5. Check Error Categories

Use error category checks for appropriate handling:

```typescript
if (isApiException(error)) {
  if (error.isClientError()) {
    // Don't alert on-call, log as warning
  } else if (error.isServerError()) {
    // Alert on-call, log as error
  }
}
```

## Running Tests

### Unit Tests

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ApiException, throwTenantContextMissing } from '@/common/errors';

describe('ApiException', () => {
  it('should create error with correct code and status', () => {
    const error = new ApiException('API_001');
    assert.strictEqual(error.code, 'API_001');
    assert.strictEqual(error.getStatus(), 400);
  });

  it('should interpolate parameters', () => {
    const error = new ApiException('API_005', {
      limit: 100,
      window: 60,
      retryAfter: 30
    });
    assert.ok(error.message.includes('100'));
    assert.ok(error.message.includes('60'));
    assert.ok(error.message.includes('30'));
  });

  it('should throw helper function', () => {
    assert.throws(
      () => throwTenantContextMissing(),
      (error: ApiException) => {
        assert.strictEqual(error.code, 'API_001');
        assert.strictEqual(error.getStatus(), 400);
        return true;
      }
    );
  });
});
```

## Files Structure

```
apps/api/src/common/errors/
├── api-error-codes.ts    # Error codes registry with HTTP status mappings
├── api-exception.ts      # ApiException class extending RegisteredError
├── error-helpers.ts      # Helper functions for throwing errors
├── index.ts              # Module exports
└── README.md             # This file

apps/api/src/i18n/messages/
├── en.ts                 # English translations (API_001-020)
├── ar-SA.ts              # Arabic translations
├── tl-PH.ts              # Tagalog translations
└── fr.ts                 # French translations
```

## Associated Packages

- **@package/errors**: Generic error handling package (framework-agnostic)
- **@package/i18n**: Internationalization service for translation management
