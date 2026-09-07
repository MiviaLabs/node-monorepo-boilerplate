# @package/schema

Production-ready shared Zod validation schemas and type contracts across the enterprise monorepo.

## Purpose

This package provides centralized, reusable Zod schemas for validating common base primitives, domain entities, pagination parameters, and custom formats (passwords, phone numbers, postal codes). It includes validation helpers for safe parsing, asynchronous execution, and standardized API error formatting.

## Structure

```
src/
├── base/                # Base validation schemas
│   ├── string.schema.ts
│   ├── email.schema.ts
│   ├── uuid.schema.ts
│   ├── url.schema.ts
│   ├── date.schema.ts
│   ├── number.schema.ts
│   ├── boolean.schema.ts
│   ├── array.schema.ts
│   ├── object.schema.ts
│   └── index.ts
├── domain/              # Domain validation schemas
│   ├── user.schema.ts
│   ├── organization.schema.ts
│   ├── entity.schema.ts
│   ├── pagination.schema.ts
│   ├── sorting.schema.ts
│   ├── filtering.schema.ts
│   └── index.ts
├── helpers/             # Validation helpers
│   ├── error-formatter.ts
│   ├── parse-safe.ts
│   ├── validate-async.ts
│   ├── transform.ts
│   └── index.ts
├── custom/              # Custom validators
│   ├── password.validator.ts
│   ├── username.validator.ts
│   ├── phone.validator.ts
│   ├── postal-code.validator.ts
│   └── index.ts
└── index.ts
```

## Usage

```typescript
import {
  emailSchema,
  uuidSchema,
  urlSchema,
  dateSchema,
  positiveNumber
} from '@package/schema/base';

import {
  createUserSchema,
  updateUserSchema,
  userRoleEnum,
  userStatusEnum
} from '@package/schema/domain';

import { paginationParamsSchema, sortParamSchema, filterParamSchema } from '@package/schema/domain';

import { formatZodError, parseSafe } from '@package/schema/helpers';

import { strongPasswordSchema, usernameSchema, phoneNumberSchema } from '@package/schema/custom';
```

## Key Schemas

### Base Schemas

- `nonEmptyString` - String that cannot be empty
- `minLength(min)` - String with minimum length
- `maxLength(max)` - String with maximum length
- `emailSchema` - Email validation (with toLowerCase and trim)
- `uuidSchema` - Generic UUID validation
- `uuidv4Schema` - UUID v4 validation
- `urlSchema` - URL validation
- `dateSchema` - Date parsing (coerces from string/number)
- `positiveNumber` - Number > 0
- `nonNegativeNumber` - Number >= 0
- `integerSchema` - Integer validation
- `booleanSchema` - Boolean with coercion
- `nonEmptyArray(schema)` - Non-empty array
- `baseObjectSchema` - Base entity with id, timestamps

### Domain Schemas

- `createUserSchema` - User creation validation
- `updateUserSchema` - User update validation
- `createOrganizationSchema` - Organization creation
- `updateOrganizationSchema` - Organization update
- `paginationParamsSchema` - Page and limit validation
- `cursorPaginationSchema` - Cursor-based pagination
- `sortParamSchema` - Sort field and direction
- `filterParamSchema` - Filter field, operator, value

### Custom Validators

- `strongPasswordSchema` - Strong password (uppercase, lowercase, number, special)
- `mediumPasswordSchema` - Medium password (uppercase, lowercase, number)
- `basicPasswordSchema` - Basic password (8+ characters)
- `usernameSchema` - Username (alphanumeric, underscore, hyphen)
- `phoneNumberSchema` - E.164 phone number format
- `usPhoneNumberSchema` - US phone number format
- `usZipCodeSchema` - US ZIP code format

### Helpers

- `formatZodError(error)` - Format Zod error for API responses
- `formatZodErrorMessage(error)` - Format Zod error as single message
- `parseSafe(schema, data)` - Safe parse with detailed result
- `parseOrThrow(schema, data)` - Parse or throw exception
- `validateAsync(schema, data)` - Async validation
- `trimString(schema)` - Transform schema to trim strings
- `toLowercase(schema)` - Transform to lowercase
- `toUppercase(schema)` - Transform to uppercase

## Guidelines

- Use `as const` for enum-like types
- Provide clear error messages
- Use `refine()` for custom validation logic
- Keep schemas focused and single-purpose
- Compose schemas from smaller pieces
- Use `z.coerce` for automatic type conversion
