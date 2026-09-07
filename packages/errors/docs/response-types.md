# Response Types

Error response types for unified API responses using BaseResponseDto pattern.

## Overview

The `@package/errors` package provides TypeScript types for consistent error responses across frameworks:

- **ErrorResponseData** - Core error data structure
- **ErrorResponseMetadata** - Error metadata with category, severity, HTTP status
- **isErrorResponse()** - Type guard to detect error responses

These types integrate with `BaseResponseDto<T>` for unified success and error responses.

## BaseResponseDto Pattern

All API responses follow the `BaseResponseDto<T>` pattern:

```typescript
interface BaseResponseDto<T> {
  readonly data: T;
  readonly metadata?: ResponseMetadata;
}

interface ResponseMetadata {
  timestamp?: string;
  version?: string;
  requestId?: string;
  error?: ResponseErrorMetadata;
}
```

### Success Response

```typescript
// Success response
{
  "data": { "id": "123", "name": "John" },
  "metadata": {
    "timestamp": "2024-12-31T12:00:00.000Z",
    "version": "1.0.0"
  }
}
```

### Error Response

```typescript
// Error response
{
  "data": {
    "code": "USER_001",
    "message": "User with ID 123 not found",
    "translated": "المستخدم بالمعرف 123 غير موجود",
    "parameters": { "userId": "123" }
  },
  "metadata": {
    "timestamp": "2024-12-31T12:00:00.000Z",
    "requestId": "req_abc123",
    "error": {
      "category": "USER",
      "severity": "LOW",
      "httpStatus": 404,
      "debugInfo": {
        "path": "/api/users/123",
        "method": "GET"
      }
    }
  }
}
```

## ErrorResponseData

Core error response data structure.

```typescript
interface ErrorResponseData {
  /** Error code (e.g., "VAL_001", "USER_001") */
  code: string;

  /** Original error message (untranslated) */
  message: string;

  /** Translated error message (in requested locale) */
  translated: string;

  /** Translation key for i18n lookup (e.g., "errors.validation.required") */
  translationKey?: string;

  /** Interpolation parameters for translation */
  parameters?: Readonly<Record<string, unknown>>;

  /** Additional flexible properties (e.g., field, minLength, etc.) */
  [key: string]: unknown;
}
```

### Example

```typescript
const errorData: ErrorResponseData = {
  code: 'USER_001',
  message: 'User with ID {userId} not found',
  translated: 'User with ID 123 not found',
  translationKey: 'errors.user.notFound',
  parameters: { userId: '123' }
};
```

## ErrorResponseMetadata

Error metadata included in response metadata.

```typescript
interface ErrorResponseMetadata {
  /** Response timestamp */
  timestamp: string;

  /** Unique request ID for tracing */
  requestId?: string;

  /** Error-specific metadata */
  error: ResponseErrorMetadata;
}
```

### Example

```typescript
const errorMetadata: ErrorResponseMetadata = {
  timestamp: '2024-12-31T12:00:00.000Z',
  requestId: 'req_abc123',
  error: {
    category: ResponseErrorCategory.USER,
    severity: ResponseErrorSeverity.LOW,
    httpStatus: 404,
    debugInfo: {
      path: '/api/users/123',
      method: 'GET'
    }
  }
};
```

## ResponseErrorMetadata

Error-specific metadata for responses.

```typescript
interface ResponseErrorMetadata {
  /** Error category */
  category: ResponseErrorCategory;

  /** Error severity */
  severity: ResponseErrorSeverity;

  /** HTTP status code */
  httpStatus: number;

  /** Debug information (only in non-production) */
  debugInfo?: ResponseErrorDebugInfo;

  /** Detailed validation errors (if applicable) */
  errors?: string[];

  /** Stack trace (only in non-production) */
  stack?: string;
}
```

### ResponseErrorDebugInfo

```typescript
interface ResponseErrorDebugInfo {
  /** Request path */
  path?: string;

  /** Request method */
  method?: string;

  /** Additional error details */
  [key: string]: unknown;
}
```

## Error Categories

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

## Error Severity Levels

```typescript
enum ResponseErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}
```

## Type Guards

### isErrorResponseData()

Check if an object is ErrorResponseData.

```typescript
function isErrorResponseData(value: unknown): value is ErrorResponseData;

// Example
if (isErrorResponseData(response.data)) {
  console.log('Error code:', response.data.code);
  console.log('Translated message:', response.data.translated);
}
```

### isErrorResponseMetadata()

Check if an object is ErrorResponseMetadata.

```typescript
function isErrorResponseMetadata(value: unknown): value is ErrorResponseMetadata;

// Example
if (isErrorResponseMetadata(response.metadata)) {
  console.log('Error category:', response.metadata.error.category);
  console.log('HTTP status:', response.metadata.error.httpStatus);
}
```

### isErrorResponse()

Check if a response is an error response (has error field in metadata).

```typescript
function isErrorResponse(
  response: unknown
): response is BaseResponseDto<ErrorResponseData> & { metadata: ErrorResponseMetadata };

// Example
if (isErrorResponse(response)) {
  console.log('Error response detected');
  console.log('Code:', response.data.code);
  console.log('Category:', response.metadata.error.category);
  console.log('Severity:', response.metadata.error.severity);
}
```

## Framework Integration

### NestJS

```typescript
import { BaseResponseDto } from '@/common/dtos';
import { ErrorResponseData, ErrorResponseMetadata } from '@package/errors';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof RegisteredError) {
      const translation = TranslationService.translate(exception.code, exception.parameters, {
        locale: extractLocale(request)
      });

      const errorData: ErrorResponseData = {
        code: exception.code,
        message: exception.message,
        translated: translation.message,
        parameters: exception.parameters
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: new Date().toISOString(),
        requestId: request.headers['x-request-id'],
        error: {
          category: exception.definition.type as ResponseErrorCategory,
          severity: exception.definition.severity as ResponseErrorSeverity,
          httpStatus: exception.httpStatus,
          debugInfo: {
            path: request.path,
            method: request.method
          }
        }
      };

      return response
        .status(exception.httpStatus)
        .json(BaseResponseDto.error(errorData, errorMetadata));
    }
  }
}
```

### Next.js (API Routes)

```typescript
import { ErrorResponseData, ErrorResponseMetadata, isErrorResponse } from '@package/errors';

type ApiResponse<T> = { data: T; metadata?: { timestamp?: string; error?: any } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ErrorResponseData>>
) {
  try {
    // Your logic
    const user = await getUser(req.query.id);
    res.status(200).json({ data: user });
  } catch (error) {
    if (error instanceof RegisteredError) {
      const errorData: ErrorResponseData = {
        code: error.code,
        message: error.message,
        translated: error.message // Translate if needed
      };

      const errorMetadata: ErrorResponseMetadata = {
        timestamp: new Date().toISOString(),
        error: {
          category: error.definition.type as any,
          severity: error.definition.severity as any,
          httpStatus: error.httpStatus
        }
      };

      return res.status(error.httpStatus).json({
        data: errorData,
        metadata: errorMetadata
      });
    }

    res.status(500).json({
      data: {
        code: 'SYS_001',
        message: 'Internal server error',
        translated: 'Internal server error'
      }
    });
  }
}
```

### Express

```typescript
import { ErrorResponseData, ErrorResponseMetadata, isErrorResponse } from '@package/errors';

app.use(async (err, req, res, next) => {
  if (err instanceof RegisteredError) {
    const errorData: ErrorResponseData = {
      code: err.code,
      message: err.message,
      translated: err.message
    };

    const errorMetadata: ErrorResponseMetadata = {
      timestamp: new Date().toISOString(),
      error: {
        category: err.definition.type as any,
        severity: err.definition.severity as any,
        httpStatus: err.httpStatus
      }
    };

    return res.status(err.httpStatus).json({
      data: errorData,
      metadata: errorMetadata
    });
  }

  res.status(500).json({
    data: {
      code: 'SYS_001',
      message: 'Internal server error',
      translated: 'Internal server error'
    }
  });
});
```

## Client-Side Usage

### Checking for Error Responses

```typescript
import { isErrorResponse } from '@package/errors';

async function fetchData() {
  const response = await fetch('/api/users/123');
  const data = await response.json();

  if (isErrorResponse(data)) {
    // Handle error response
    console.error('Error:', data.data.translated);
    console.error('Category:', data.metadata.error.category);
    console.error('Severity:', data.metadata.error.severity);

    if (data.metadata.error.httpStatus === 404) {
      // Show not found UI
    }
    return;
  }

  // Handle success response
  console.log('User:', data.data);
}
```

### TypeScript Type Narrowing

```typescript
import { isErrorResponse, BaseResponseDto } from '@package/errors';

type UserResponse = BaseResponseDto<User>;
type ErrorResponse = BaseResponseDto<ErrorResponseData> & { metadata: ErrorResponseMetadata };

type ApiResponse = UserResponse | ErrorResponse;

function handleResponse(response: ApiResponse) {
  if (isErrorResponse(response)) {
    // TypeScript knows this is ErrorResponse
    console.log('Error code:', response.data.code);
    console.log('HTTP status:', response.metadata.error.httpStatus);
  } else {
    // TypeScript knows this is UserResponse
    console.log('User name:', response.data.name);
  }
}
```

## Best Practices

### 1. Always Use Typed Responses

```typescript
// ✅ Good - Typed response
type UserListResponse = BaseResponseDto<User[]>;
type UserError = BaseResponseDto<ErrorResponseData> & { metadata: ErrorResponseMetadata };

async function getUsers(): Promise<UserListResponse | UserError> {
  // ...
}
```

### 2. Include All Required Fields

```typescript
// ✅ Good - All required fields
const errorData: ErrorResponseData = {
  code: 'USER_001',
  message: 'User not found',
  translated: 'User not found'
};

// ❌ Bad - Missing required fields
const errorData = {
  code: 'USER_001'
  // Missing: message, translated
};
```

### 3. Use Type Guards

```typescript
// ✅ Good - Type guard
if (isErrorResponse(response)) {
  handleErrorResponse(response);
}

// ❌ Bad - Type assertion
const errorResponse = response as BaseResponseDto<ErrorResponseData>;
```

### 4. Set Appropriate Severity

```typescript
// Client errors (4xx) - LOW severity
const errorData: ErrorResponseMetadata = {
  error: {
    category: ResponseErrorCategory.VALIDATION,
    severity: ResponseErrorSeverity.LOW,
    httpStatus: 400
  }
};

// Server errors (5xx) - CRITICAL severity
const errorData: ErrorResponseMetadata = {
  error: {
    category: ResponseErrorCategory.SYSTEM,
    severity: ResponseErrorSeverity.CRITICAL,
    httpStatus: 500
  }
};
```

## Running Tests

### Unit Tests

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ErrorResponseData, isErrorResponseData, isErrorResponse } from '@package/errors';

describe('Response Types', () => {
  it('should detect ErrorResponseData', () => {
    const data = {
      code: 'USER_001',
      message: 'User not found',
      translated: 'User not found'
    };

    assert.ok(isErrorResponseData(data));
  });

  it('should detect error response', () => {
    const response = {
      data: {
        code: 'USER_001',
        message: 'User not found',
        translated: 'User not found'
      },
      metadata: {
        timestamp: '2024-12-31T12:00:00.000Z',
        error: {
          category: 'USER',
          severity: 'LOW',
          httpStatus: 404
        }
      }
    };

    assert.ok(isErrorResponse(response));
  });

  it('should not detect success response as error', () => {
    const response = {
      data: { id: '123', name: 'John' },
      metadata: { timestamp: '2024-12-31T12:00:00.000Z' }
    };

    assert.ok(!isErrorResponse(response));
  });
});
```

## See Also

- [Getting Started](./getting-started.md) - Installation and setup
- [Usage Guide](./usage-guide.md) - Comprehensive usage examples
- [API Reference](./api-reference.md) - Complete API documentation
