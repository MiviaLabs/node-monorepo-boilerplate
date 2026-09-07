# NestJS Integration Guide

How to integrate `@package/errors` with NestJS applications.

## Overview

This guide covers integrating `@package/errors` with NestJS, including:

- Setting up the translation service
- Creating a global exception filter
- Handling errors in controllers and services
- Using LocaleContext middleware for automatic locale detection
- Auto-translation with the `error.translated` getter

## Installation

```bash
pnpm add @package/errors
```

## Setup

### 1. Initialize Translation Service

In your `main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { TranslationService } from '@package/errors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Initialize translation service
  await TranslationService.initialize();

  // Use validation pipe
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  await app.listen(3000);
}

bootstrap();
```

### 2. Create Global Exception Filter

Create `src/common/filters/errors-exception.filter.ts`:

```typescript
import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  RegisteredError,
  TranslationService,
  ErrorResponseData,
  ErrorResponseMetadata,
  ResponseErrorCategory,
  ResponseErrorSeverity
} from '@package/errors';
import { BaseResponseDto } from '@/common/dtos/base-response.dto';

@Catch()
export class ErrorsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorsExceptionFilter.name);

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract locale from request
    const locale = this.extractLocale(request);

    // Handle RegisteredError
    if (exception instanceof RegisteredError) {
      return this.handleRegisteredError(exception, response, request, locale);
    }

    // Handle HttpException
    if (exception instanceof HttpException) {
      return this.handleHttpException(exception, response, request);
    }

    // Handle unknown errors
    return this.handleUnknownError(exception, response, request);
  }

  private async handleRegisteredError(
    error: RegisteredError,
    response: Response,
    request: Request,
    locale: string
  ) {
    // Use error.translated getter for automatic translation via LocaleContext
    // No need to manually call TranslationService.translate()!
    const translation = error.translated;

    const errorData: ErrorResponseData = {
      code: error.code,
      message: error.definition.message, // Use template from definition, not interpolated
      translated: translation.message,
      parameters: error.parameters
    };

    const errorMetadata: ErrorResponseMetadata = {
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'] as string,
      error: {
        category: error.definition.type as ResponseErrorCategory,
        severity: error.definition.severity as ResponseErrorSeverity,
        httpStatus: error.httpStatus,
        debugInfo: {
          path: request.path,
          method: request.method
        }
      }
    };

    // Log error
    this.logger.error(`${error.code}: ${error.message}`, error.stack, {
      requestId: request.headers['x-request-id'],
      ...error.metadata
    });

    return response.status(error.httpStatus).json(BaseResponseDto.error(errorData, errorMetadata));
  }

  private handleHttpException(exception: HttpException, response: Response, request: Request) {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : (exceptionResponse as any).message || 'Internal server error';

    const errorData: ErrorResponseData = {
      code: 'SYS_001',
      message,
      translated: message
    };

    const errorMetadata: ErrorResponseMetadata = {
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'] as string,
      error: {
        category: ResponseErrorCategory.SYSTEM,
        severity: ResponseErrorSeverity.MEDIUM,
        httpStatus: status,
        debugInfo: {
          path: request.path,
          method: request.method
        }
      }
    };

    return response.status(status).json(BaseResponseDto.error(errorData, errorMetadata));
  }

  private handleUnknownError(exception: unknown, response: Response, request: Request) {
    const errorData: ErrorResponseData = {
      code: 'SYS_001',
      message: 'Internal server error',
      translated: 'Internal server error'
    };

    const errorMetadata: ErrorResponseMetadata = {
      timestamp: new Date().toISOString(),
      requestId: request.headers['x-request-id'] as string,
      error: {
        category: ResponseErrorCategory.SYSTEM,
        severity: ResponseErrorSeverity.CRITICAL,
        httpStatus: 500,
        debugInfo: {
          path: request.path,
          method: request.method
        }
      }
    };

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
      {
        requestId: request.headers['x-request-id']
      }
    );

    return response.status(500).json(BaseResponseDto.error(errorData, errorMetadata));
  }

  private extractLocale(request: Request): string {
    // Try in order: header, query, cookie, default
    return (
      (request.headers['x-locale'] as string) ||
      (request.query['locale'] as string) ||
      (request.cookies['locale'] as string) ||
      'en'
    );
  }
}
```

### 3. Register Exception Filter

In your `main.ts`:

```typescript
import { ErrorsExceptionFilter } from './common/filters/errors-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Register global exception filter
  app.useGlobalFilters(new ErrorsExceptionFilter());

  await app.listen(3000);
}
```

Or in `app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ErrorsExceptionFilter } from './common/filters/errors-exception.filter';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: ErrorsExceptionFilter
    }
  ]
})
export class AppModule {}
```

## Usage in Services

Throw errors in your services or command handlers:

```typescript
import { Injectable } from '@nestjs/common';
import { Errors } from '@package/errors';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getUser(userId: string) {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw Errors.useruserWithId001({ userId });
    }

    return user;
  }

  async createUser(dto: CreateUserDto) {
    // Check if user exists
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw Errors.useruserWithEmail002({ email: dto.email });
    }

    // Validate email
    if (!this.isValidEmail(dto.email)) {
      throw Errors.userinvalidEmailFormat003({ email: dto.email });
    }

    return this.usersRepository.create(dto);
  }
}
```

## Usage in Controllers

```typescript
import { Controller, Get, Post, Body, Param, Headers } from '@nestjs/common';
import { Errors } from '@package/errors';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async getUser(@Param('id') id: string, @Headers('x-locale') locale: string) {
    // Locale is automatically extracted by the filter
    return this.usersService.getUser(id);
  }

  @Post()
  async createUser(@Body() dto: CreateUserDto) {
    // Errors thrown here are caught by the global filter
    return this.usersService.createUser(dto);
  }
}
```

## Request-Scoped Locale

### LocaleContext Middleware (Recommended)

The recommended approach is to use `LocaleContext` middleware for automatic locale detection:

```typescript
// src/common/middleware/locale-context.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LocaleContext } from '@package/errors';
import { extractLocaleFromRequest } from '../utils/locale-extractor';

@Injectable()
export class LocaleContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Extract locale from request (query param, Accept-Language header, or default)
    const locale = extractLocaleFromRequest(req);

    // Set locale in LocaleContext (AsyncLocalStorage)
    LocaleContext.setLocale(locale);

    next();
  }
}
```

Register the middleware in `app.module.ts`:

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocaleContextMiddleware).forRoutes('*'); // Apply to all routes
  }
}
```

**Benefits of LocaleContext:**

1. **Automatic locale detection** - No need to pass locale explicitly
2. **Request-scoped** - Each request has its own locale context
3. **Works with error.translated getter** - RegisteredError automatically uses LocaleContext
4. **Cleaner code** - No manual locale passing required

### Using error.translated Getter

With `LocaleContext` middleware, you can use the `error.translated` getter for automatic translation:

```typescript
// In your exception filter or error handler
if (RegisteredError.isRegisteredError(exception)) {
  // No need to call TranslationService.translate()!
  // The getter automatically uses LocaleContext locale
  const translation = exception.translated;

  console.log(translation.message); // Translated message
  console.log(translation.locale); // The locale used for translation
  console.log(translation.usedFallback); // Whether fallback was used
}
```

### Locale Detection Priority

When using `LocaleContext` middleware, locale is detected in this order:

1. Query parameter `locale` (e.g., `?locale=ar-SA`)
2. `Accept-Language` header (e.g., `Accept-Language: ar-SA,en-US;q=0.9`)
3. Default locale (from config or TranslationService)

### Manual Locale Extraction (Legacy)

If you're not using `LocaleContext` middleware, you can extract locale manually:

The exception filter extracts locale in this order:

1. `x-locale` header
2. `locale` query parameter
3. `locale` cookie
4. Default: `en`

### Client-Side Usage

Clients can specify locale using any method:

```bash
# Using query parameter (recommended for LocaleContext)
curl http://localhost:3000/users/123?locale=ar-SA

# Using Accept-Language header (recommended for LocaleContext)
curl -H "Accept-Language: ar-SA,en-US;q=0.9" http://localhost:3000/users/123

# Using custom header (legacy/manual extraction)
curl -H "x-locale: ar-SA" http://localhost:3000/users/123

# Using cookie (legacy/manual extraction)
curl --cookie "locale=ar-SA" http://localhost:3000/users/123
```

### Response Format

All error responses follow the `BaseResponseDto` pattern with `ErrorResponseData`:

```json
{
  "data": {
    "code": "USER_001",
    "message": "User with ID 123 not found",
    "translated": "المستخدم بالمعرف 123 غير موجود",
    "parameters": { "userId": "123" }
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "requestId": "abc-123",
    "error": {
      "category": "USER",
      "severity": "LOW",
      "httpStatus": 404,
      "debugInfo": {
        "path": "/users/123",
        "method": "GET"
      }
    }
  }
}
```

See [Response Types](./response-types.md) for complete documentation on error response structures.

## CQRS Integration

### Command Handlers

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

export class CreateUserCommand {
  constructor(
    public readonly tenantId: string,
    public readonly email: string,
    public readonly name: string
  ) {}
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(command: CreateUserCommand) {
    // Check if user exists
    const existing = await this.usersRepository.findByEmail(command.tenantId, command.email);
    if (existing) {
      throw Errors.useruserWithEmail002({ email: command.email });
    }

    // Create user
    const user = await this.usersRepository.create(command.tenantId, {
      email: command.email,
      name: command.name
    });

    return user;
  }
}
```

### Query Handlers

```typescript
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';

export class GetUserQuery {
  constructor(
    public readonly tenantId: string,
    public readonly userId: string
  ) {}
}

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(query: GetUserQuery) {
    const user = await this.usersRepository.findById(query.tenantId, query.userId);

    if (!user) {
      throw Errors.useruserWithId001({ userId: query.userId });
    }

    return user;
  }
}
```

## Guards and Interceptors

### Auth Guard

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Errors } from '@package/errors';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw Errors.authauthenticationTokenIs002({});
    }

    try {
      const user = this.validateToken(token);
      request.user = user;
      return true;
    } catch {
      throw Errors.authauthenticationTokenIs003({});
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    return request.headers.authorization?.replace('Bearer ', '');
  }

  private validateToken(token: string): any {
    // JWT validation logic
  }
}
```

### Roles Guard

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Errors } from '@package/errors';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role));
    if (!hasRole) {
      throw Errors.authinsufficientPermissionsRequiredpermission004({
        requiredPermission: requiredRoles.join(' or ')
      });
    }

    return true;
  }
}
```

## Running Tests

### Unit Tests

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorsExceptionFilter } from './errors-exception.filter';
import { TranslationService } from '@package/errors';
import { Errors } from '@package/errors';

describe('ErrorsExceptionFilter', () => {
  let filter: ErrorsExceptionFilter;

  beforeAll(async () => {
    await TranslationService.initialize();
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ErrorsExceptionFilter]
    }).compile();

    filter = module.get<ErrorsExceptionFilter>(ErrorsExceptionFilter);
  });

  it('should catch and translate RegisteredError', async () => {
    const error = Errors.useruserWithId001({ userId: '123' });
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const mockRequest = {
      headers: { 'x-locale': 'ar-SA', 'x-request-id': 'abc-123' },
      path: '/users/123',
      query: {},
      cookies: {}
    };

    await filter.catch(error, {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest
      })
    } as any);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'USER_001',
          message: 'المستخدم بالمعرف 123 غير موجود'
        })
      })
    );
  });
});
```

### E2E Tests

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { TranslationService } from '@package/errors';

describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await TranslationService.initialize();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/users/:id (GET) - should return translated error', () => {
    return request(app.getHttpServer())
      .get('/users/non-existent-id')
      .set('x-locale', 'ar-SA')
      .expect(404)
      .expect((res) => {
        expect(res.body.data.code).toBe('USER_001');
        expect(res.body.data.message).toContain('غير موجود');
        expect(res.body.metadata.locale).toBe('ar-SA');
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

## Best Practices

1. **Always use the Errors factory** - Never create `RegisteredError` directly
2. **Throw errors in services/handlers** - Not in controllers
3. **Use metadata for debugging** - Include request context
4. **Initialize TranslationService early** - In `main.ts` before `app.listen()`
5. **Use LocaleContext middleware** - For automatic locale detection and cleaner code
6. **Use error.translated getter** - For RegisteredError, no need to call TranslationService.translate() manually
7. **Keep HttpException manual translation** - HttpException is not RegisteredError, so manual translation is still needed
8. **Log errors with context** - Include request ID and metadata

## Troubleshooting

### Translation not working

Ensure `TranslationService.initialize()` is called before any translation:

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Initialize BEFORE app.listen()
  await TranslationService.initialize();

  await app.listen(3000);
}
```

### Locale not being detected

Check your exception filter's `extractLocale()` method and ensure headers are being passed correctly:

```typescript
private extractLocale(request: Request): string {
  console.log('Headers:', request.headers);
  return (
    (request.headers['x-locale'] as string) ||
    (request.query['locale'] as string) ||
    (request.cookies['locale'] as string) ||
    'en'
  );
}
```

### Errors not being caught

Ensure the filter is registered as a global filter:

```typescript
// In main.ts
app.useGlobalFilters(new ErrorsExceptionFilter());

// OR in app.module.ts
providers: [
  {
    provide: APP_FILTER,
    useClass: ErrorsExceptionFilter
  }
];
```

## See Also

- [Usage Guide](./usage-guide.md) - General usage patterns
- [API Reference](./api-reference.md) - Complete API documentation
- [Error Codes Reference](./error-codes.md) - All error codes
