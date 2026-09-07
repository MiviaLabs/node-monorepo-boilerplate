# Usage Guide

Comprehensive guide to using `@package/errors` in your application.

## Two-Step Error Handling Pattern

The package is designed around a simple two-step pattern:

1. **Throw errors** using the `Errors` factory
2. **Use error.translated getter** for automatic translation (via LocaleContext)

### Auto-Translation with error.translated Getter

When using `LocaleContext` middleware, `RegisteredError` instances provide automatic translation via the `translated` getter:

```typescript
import { RegisteredError, LocaleContext } from '@package/errors';

// In your error handler or exception filter
if (error instanceof RegisteredError) {
  // Automatic translation via LocaleContext
  const translation = error.translated;

  console.log(translation.message); // Translated message
  console.log(translation.locale); // The locale used
  console.log(translation.usedFallback); // Whether fallback locale was used
}
```

**Benefits:**

- No need to manually call `TranslationService.translate()`
- Automatically uses locale from `LocaleContext` (set by middleware)
- Cleaner, more maintainable code

### Setting Up LocaleContext (Recommended)

Add `LocaleContextMiddleware` to automatically set locale for each request:

```typescript
// src/common/middleware/locale-context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LocaleContext } from '@package/errors';

@Injectable()
export class LocaleContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Extract locale from request (query param, Accept-Language header, or default)
    const locale = extractLocaleFromRequest(req);
    LocaleContext.setLocale(locale);
    next();
  }
}
```

Register in `app.module.ts`:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocaleContextMiddleware).forRoutes('*');
  }
}
```

### Manual Translation (For Non-RegisteredError)

For errors that are not `RegisteredError` (e.g., `HttpException`), or when not using `LocaleContext`:

```typescript
import { TranslationService } from '@package/errors';

const translation = TranslationService.translate(
  'ERROR_CODE',
  { param: 'value' },
  { locale: 'ar-SA' }
);
```

### Step 1: Throwing Errors

Throw errors anywhere in your application code:

```typescript
import { Errors } from '@package/errors';

export class UserService {
  async getUser(userId: string) {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      // Throw error with required parameters
      throw Errors.useruserWithId001({ userId });
    }

    return user;
  }

  async createUser(data: CreateUserDto) {
    // Check if user already exists
    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw Errors.useruserWithEmail002({ email: data.email });
    }

    // Validate email format
    if (!this.isValidEmail(data.email)) {
      throw Errors.userinvalidEmailFormat003({ email: data.email });
    }

    return await this.userRepository.create(data);
  }

  async deleteUser(userId: string, currentUserId: string) {
    // Prevent self-deletion
    if (userId === currentUserId) {
      throw Errors.usercannotDeleteYour010({});
    }

    return await this.userRepository.delete(userId);
  }
}
```

### Step 2: Handling Errors

In your error handler or middleware, use the `error.translated` getter for automatic translation:

```typescript
import { RegisteredError } from '@package/errors';
import type { ErrorData } from '@package/errors';

export class ErrorHandler {
  handleError(error: unknown): ErrorData {
    if (error instanceof RegisteredError) {
      // Use error.translated getter - automatic translation via LocaleContext!
      const translation = error.translated;

      // Return formatted error data
      return {
        code: error.code,
        message: error.definition.message, // Use template from definition
        translated: translation.message, // Translated message
        statusCode: error.httpStatus,
        severity: error.definition.severity,
        type: error.definition.type,
        timestamp: error.timestamp,
        resolution: error.definition.resolution
      };
    }

    // Handle non-registered errors
    return {
      code: 'SYS_001',
      message: 'Internal server error',
      translated: 'Internal server error',
      statusCode: 500,
      severity: 'CRITICAL',
      type: 'SYSTEM',
      timestamp: new Date().toISOString()
    };
  }
}
```

**Note:** This assumes you have `LocaleContextMiddleware` set up (see above). If not, you'll need to manually call `TranslationService.translate()` with the locale.

## Usage Patterns

### With Metadata (Debugging Context)

Add metadata for debugging without exposing it to users:

```typescript
throw Errors.databasefailedToConnect001(
  {}, // No parameters needed
  {
    requestId: 'abc-123',
    userId: '456',
    databaseHost: 'db.example.com',
    query: 'SELECT * FROM users'
  }
);

// Metadata is included in error but NOT translated into message
console.log(error.metadata); // { requestId: 'abc-123', ... }
console.log(error.message); // "Failed to connect to database"
```

### Validation Errors

```typescript
export class ValidationService {
  validateEmail(email: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw Errors.userinvalidEmailFormat003({ email });
    }
  }

  validatePassword(password: string) {
    if (password.length < 8) {
      throw Errors.validationvalueForField003({
        field: 'password',
        min: 8,
        max: 128
      });
    }
  }

  validateDate(dateString: string) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw Errors.validationinvalidDateFormat006({
        date: dateString,
        expectedFormat: 'ISO 8601 (YYYY-MM-DD)'
      });
    }
  }
}
```

### Database Errors

```typescript
export class UserRepository {
  async findById(id: string) {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        throw Errors.databaseuniqueConstraintViolation010({
          field: 'id'
        });
      }
      throw Errors.databasedatabaseQueryFailed005({
        query: `SELECT * FROM users WHERE id = ${id}`
      });
    }
  }

  async create(data: any) {
    try {
      const [user] = await db.insert(users).values(data).returning();
      return user;
    } catch (error) {
      if (error.code === '23503') {
        // Foreign key constraint
        throw Errors.databaseforeignKeyConstraint006({
          constraint: error.constraint
        });
      }
      throw Errors.databaserecordAlreadyExists003({
        entity: 'user'
      });
    }
  }
}
```

### Business Logic Errors

```typescript
export class PaymentService {
  async processPayment(userId: string, amount: number) {
    const balance = await this.getBalance(userId);

    if (balance < amount) {
      throw Errors.businessinsufficientBalanceRequired003({
        required: amount,
        available: balance
      });
    }

    // Process payment
  }

  async cancelOrder(orderId: string) {
    const order = await this.getOrder(orderId);

    if (order.status === 'shipped') {
      throw Errors.businesscannotModifyEntity002({
        entity: 'order',
        status: 'shipped'
      });
    }

    if (order.status === 'cancelled') {
      throw Errors.businessresourceIsAlready004({
        action: 'cancelled'
      });
    }

    // Cancel order
  }
}
```

### File Upload Errors

```typescript
export class FileUploadService {
  async uploadFile(file: Express.Multer.File) {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw Errors.fileinvalidFileType002({
        fileType: file.mimetype,
        allowedTypes: allowedTypes.join(', ')
      });
    }

    // Check file size (max 5MB)
    const maxSizeMB = 5;
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      throw Errors.filefileSizeSizemb003({
        size: Math.round(fileSizeMB * 10) / 10,
        maxSize: maxSizeMB
      });
    }

    // Upload file
  }
}
```

## Framework Integration

### NestJS

```typescript
// In your exception filter
import { Catch } from '@nestjs/common';
import { RegisteredError } from '@package/errors';

@Catch()
export class GlobalExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    if (exception instanceof RegisteredError) {
      // Use error.translated getter for automatic translation via LocaleContext
      const translation = exception.translated;

      response.status(exception.httpStatus).json({
        code: exception.code,
        message: exception.definition.message, // Template from definition
        translated: translation.message, // Translated message
        statusCode: exception.httpStatus,
        timestamp: exception.timestamp
      });
    }

    // Handle other exceptions (HttpException, etc.)
  }
}
```

### Express

```typescript
import { RegisteredError } from '@package/errors';

app.use((err, req, res, next) => {
  if (err instanceof RegisteredError) {
    // Use error.translated getter for automatic translation
    const translation = err.translated;

    return res.status(err.httpStatus).json({
      code: err.code,
      message: err.definition.message, // Template from definition
      translated: translation.message, // Translated message
      timestamp: err.timestamp
    });
  }

  next(err);
});
```

### Next.js (API Routes)

```typescript
import { RegisteredError } from '@package/errors';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Your API logic
    const user = await getUser(req.query.id);
    res.status(200).json(user);
  } catch (error) {
    if (error instanceof RegisteredError) {
      // Use error.translated getter for automatic translation
      const translation = error.translated;

      return res.status(error.httpStatus).json({
        code: error.code,
        message: error.definition.message, // Template from definition
        translated: translation.message, // Translated message
        timestamp: error.timestamp
      });
    }

    res.status(500).json({ message: 'Internal server error' });
  }
}
```

## Running Tests

```typescript
import { Errors, RegisteredError } from '@package/errors';
import assert from 'node:test';

assert.test('throws user not found error', () => {
  const error = Errors.useruserWithId001({ userId: '123' });

  assert(error instanceof RegisteredError);
  assert.strictEqual(error.code, 'USER_001');
  assert.strictEqual(error.httpStatus, 404);
  assert.strictEqual(error.message, 'User with ID 123 not found');
  assert.deepStrictEqual(error.parameters, { userId: '123' });
});
```

## Best Practices

1. **Always use the Errors factory** - Never create `RegisteredError` directly
2. **Provide all required parameters** - TypeScript will enforce this
3. **Use metadata for debugging** - Don't include sensitive data in parameters
4. **Use error.translated getter** - For RegisteredError, automatic translation via LocaleContext
5. **Initialize TranslationService early** - Call during application startup
6. **Set up LocaleContext middleware** - For automatic locale detection
7. **Handle fallback gracefully** - Always have a fallback locale configured
8. **Keep HttpException manual translation** - HttpException is not RegisteredError, so manual translation is still needed

## Advanced Topics

### Extending for Application-Specific Errors

The `@package/errors` package is designed to be extended for application-specific error codes. For example, in a NestJS API application, you might want to add API-specific errors (API_001-020) without modifying the shared package.

#### Pattern: App-Specific Error Extension

```typescript
// apps/api/src/common/errors/api-error-codes.ts
import { ERROR_REGISTRY, ErrorCode } from '@package/errors';

// Define API-specific error registry
const API_ERROR_REGISTRY = {
  API_001: {
    code: 'API_001' as ErrorCode,
    type: 'VALIDATION',
    severity: 'LOW',
    httpStatus: 400,
    message: 'Tenant context is required for this request',
    safeForUser: true
  },
  API_002: {
    code: 'API_002' as ErrorCode,
    type: 'VALIDATION',
    severity: 'LOW',
    httpStatus: 400,
    message: 'Invalid tenant context provided',
    safeForUser: true
  },
  API_003: {
    code: 'API_003' as ErrorCode,
    type: 'USER',
    severity: 'MEDIUM',
    httpStatus: 404,
    message: 'API version {version} not found',
    parameters: [{ name: 'version', type: 'string', required: false }],
    safeForUser: true
  }
  // ... API_004 through API_020
} as const;

// Merge with base registry for type safety
export const FULL_ERROR_REGISTRY = {
  ...ERROR_REGISTRY,
  ...API_ERROR_REGISTRY
};
```

#### Creating App-Specific Exception Class

```typescript
// apps/api/src/common/errors/api-exception.ts
import { RegisteredError } from '@package/errors';
import { API_ERROR_REGISTRY } from './api-error-codes';

export class ApiException extends RegisteredError {
  constructor(
    code: keyof typeof API_ERROR_REGISTRY,
    parameters?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ) {
    super(code as any, parameters, metadata, true);
  }

  // Convenience static methods
  static tenantContextMissing() {
    return new ApiException('API_001');
  }

  static tenantContextInvalid() {
    return new ApiException('API_002');
  }

  static apiVersionNotFound(version?: string) {
    return new ApiException('API_003', { version });
  }

  // ... more helper methods
}
```

#### Adding App-Specific Translations

```typescript
// apps/api/src/i18n/messages/en.ts
import { ErrorTranslations } from '@package/errors';

export const en: ErrorTranslations = {
  // Import base translations
  ...'@package/errors/locales/en',

  // Add API-specific translations
  API_001: 'Tenant context is required for this request',
  API_002: 'Invalid tenant context provided',
  API_003: 'API version {version} not found',
  API_004: 'API version {version} is deprecated and will be sunset on {sunsetDate}'
  // ... all 20 API error codes
};
```

#### Using App-Specific Errors

```typescript
// In controllers, guards, or services
import { ApiException } from '@/common/errors';

@Controller('users')
export class UsersController {
  @Get()
  findAll(@Headers('x-tenant-id') tenantId: string) {
    if (!tenantId) {
      throw ApiException.tenantContextMissing();
    }
    // ...
  }
}
```

This pattern allows you to:

1. **Keep the base package generic** - No framework or app-specific codes
2. **Add app-specific codes** - Without modifying the shared package
3. **Maintain type safety** - Full TypeScript support for all error codes
4. **Reuse infrastructure** - Same translation service, error handling, etc.

For a complete example, see the NestJS API application's error module at `apps/api/src/common/errors/`.

See [API Reference](./api-reference.md) for complete API documentation.
