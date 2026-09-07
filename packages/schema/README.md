# @package/schema

Enterprise-grade Zod validation schemas, domain contracts, and parsing utilities for type-safe applications across the monorepo.

## Overview

`@package/schema` provides centralized, reusable Zod schemas and validation helpers for validating base data types, domain models, pagination criteria, sorting parameters, and specialized string formats (passwords, phone numbers, postal codes). It standardizes API input and output validation, guarantees runtime type safety, and automatically infers TypeScript definitions.

## Features

- **Base Primitives** - Standardized validation schemas for strings, emails, UUIDs (v4/v7), URLs, numbers, booleans, dates, and objects
- **Domain Contracts** - Reusable schemas for users, organizations, multi-tenant entities, pagination, sorting, and filtering
- **Custom Validators** - Security and format validators for passwords, usernames, E.164 phone numbers, and postal codes
- **Safe Parsing & Helpers** - Error formatting for API responses, safe parsing wrappers, async validation, and string transformers
- **Strict Type Inference** - Automatic TypeScript type generation via `z.infer<typeof schema>`

## Installation

This package is part of the enterprise starter monorepo.

```bash
pnpm install @package/schema
```

## Quick Start

```typescript
import {
  emailSchema,
  uuidSchema,
  nonEmptyString,
  paginationParamsSchema,
  sortParamSchema,
  strongPasswordSchema,
  phoneNumberSchema,
  formatZodError,
  parseSafe
} from '@package/schema';

// Base validation
const emailResult = emailSchema.safeParse('user@example.com');
if (emailResult.success) {
  console.log('Validated email:', emailResult.data);
}

// Domain parameter validation
const pagination = paginationParamsSchema.parse({ page: 1, limit: 20 });
// { page: 1, limit: 20 }

// Password validation
const passwordCheck = strongPasswordSchema.safeParse('P@ssw0rd123!');
if (!passwordCheck.success) {
  const formattedErrors = formatZodError(passwordCheck.error);
  console.error('Validation error:', formattedErrors);
}
```

## Usage Examples

### Base Primitive Validation

```typescript
import {
  emailSchema,
  nonEmptyString,
  nonBlankString,
  uuidv4Schema,
  uuidv7Schema,
  dateSchema,
  positiveNumber
} from '@package/schema';

// String validations
const name = nonEmptyString.parse('Alice');
const trimmed = nonBlankString.parse('  Valid Non-Blank Text  '); // Trims automatically

// UUID validations
const id = uuidv4Schema.parse('550e8400-e29b-41d4-a716-446655440000');
const timeId = uuidv7Schema.parse('01890a5d-df12-7000-9a2c-09b68a3f8b01');

// Coerced date and number validation
const createdAt = dateSchema.parse('2026-09-07T12:00:00.000Z');
const amount = positiveNumber.parse(42.5);
```

### Domain Schemas & Pagination

```typescript
import {
  createUserSchema,
  updateUserSchema,
  createOrganizationSchema,
  paginationParamsSchema,
  cursorPaginationSchema,
  sortParamSchema,
  filterParamSchema
} from '@package/schema';

// User creation
const newUser = createUserSchema.parse({
  email: 'alice@example.com',
  name: 'Alice Smith',
  role: 'user'
});

// Offset pagination query parsing (supports string coercion from query params)
const pagination = paginationParamsSchema.parse({
  page: '2',
  limit: '50'
});
// Result: { page: 2, limit: 50 }

// Sorting
const sorting = sortParamSchema.parse({
  field: 'createdAt',
  order: 'desc'
});
// Result: { field: 'createdAt', order: 'desc' }
```

### Custom Format Validators

```typescript
import {
  strongPasswordSchema,
  mediumPasswordSchema,
  basicPasswordSchema,
  usernameSchema,
  phoneNumberSchema,
  usPhoneNumberSchema,
  usZipCodeSchema
} from '@package/schema';

// Strong password check (min 8 chars, lowercase, uppercase, number, special character)
strongPasswordSchema.parse('Sup3r$ecurePass');

// E.164 international phone number format
phoneNumberSchema.parse('+14155551234');

// US ZIP code validation
usZipCodeSchema.parse('94105-0001');

// Username validation (3-30 chars, alphanumeric, underscore, hyphen)
usernameSchema.parse('dev_lead-01');
```

### Validation Helpers & Error Formatting

```typescript
import {
  formatZodError,
  formatZodErrorMessage,
  parseSafe,
  parseOrThrow,
  validateAsync,
  emailSchema
} from '@package/schema';

// Safe parse with fallback
const safeEmail = parseSafe(emailSchema, 'invalid-input', 'fallback@example.com');
// safeEmail = 'fallback@example.com'

// API error formatting
const result = emailSchema.safeParse('not-an-email');
if (!result.success) {
  const apiResponse = formatZodError(result.error);
  // Structured error response with field paths and messages
}

// Async validation
const asyncResult = await validateAsync(emailSchema, 'user@example.com');
```

## Available Schemas & Validators

### Base Schemas (`@package/schema/base`)

| Schema | Description |
| ------ | ----------- |
| `nonEmptyString` | Validates strings with length $\ge$ 1 |
| `nonBlankString` | Trims whitespace and rejects blank strings |
| `minLength(min, msg?)` | String factory with minimum length constraint |
| `maxLength(max, msg?)` | String factory with maximum length constraint |
| `pattern(regex, msg?)` | String factory matching regex pattern |
| `slug` | URL slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` |
| `emailSchema` | Email validation with trim and lowercasing |
| `optionalEmailSchema` | Optional email validation |
| `uuidSchema` | Generic UUID string validation |
| `uuidv4Schema` | UUID version 4 format validation |
| `uuidv7Schema` | UUID version 7 time-sorted format validation |
| `urlSchema` | URL format validation |
| `httpsUrlSchema` | Validates URLs starting with `https://` |
| `dateSchema` | Date coercion from string, number, or Date |
| `dateTimeSchema` | ISO DateTime parsing |
| `dateRangeSchema` | Validates `{ start: Date, end: Date }` |
| `positiveNumber` | Number > 0 |
| `nonNegativeNumber` | Number $\ge$ 0 |
| `integerSchema` | Integer validation |
| `numberRange(min, max)` | Number within range $[min, max]$ |
| `booleanSchema` | Coerced boolean validation |
| `strictBooleanSchema` | Strict boolean type validation |
| `nonEmptyArray(schema)` | Array with at least one element |
| `baseObjectSchema` | Base entity object with `id`, `createdAt`, `updatedAt` |
| `softDeletableObjectSchema` | Base entity object extended with `deletedAt` |

### Domain Schemas (`@package/schema/domain`)

| Schema | Description |
| ------ | ----------- |
| `createUserSchema` | Validates user registration payload |
| `updateUserSchema` | Validates partial user update payload |
| `createOrganizationSchema` | Validates organization creation payload |
| `updateOrganizationSchema` | Validates partial organization update payload |
| `createTenantSchema` | Multi-tenant tenant creation schema |
| `updateTenantSchema` | Multi-tenant tenant update schema |
| `paginationParamsSchema` | Offset pagination parameters (`page`, `limit`) |
| `cursorPaginationSchema` | Cursor-based pagination (`cursor`, `limit`, `direction`) |
| `sortParamSchema` | Sorting criteria (`field`, `order: 'asc' \| 'desc'`) |
| `sortParamsSchema` | Array of sorting criteria |
| `filterParamSchema` | Filtering criteria (`field`, `operator`, `value`) |
| `filterGroupSchema` | Composite filter conditions with logical operators (`and`, `or`) |

### Custom Validators (`@package/schema/custom`)

| Validator | Description |
| --------- | ----------- |
| `strongPasswordSchema` | Password with $\ge$8 chars, uppercase, lowercase, number, special char |
| `mediumPasswordSchema` | Password with $\ge$8 chars, uppercase, lowercase, number |
| `basicPasswordSchema` | Password with minimum 8 characters |
| `usernameSchema` | Username with 3–30 alphanumeric, underscore, or hyphen characters |
| `strictUsernameSchema` | Strict alphanumeric username |
| `phoneNumberSchema` | E.164 international phone number (`+14155551234`) |
| `usPhoneNumberSchema` | US phone number formats |
| `usZipCodeSchema` | US ZIP code (`12345` or `12345-6789`) |
| `caPostalCodeSchema` | Canadian postal code format |
| `ukPostalCodeSchema` | UK postal code format |

### Validation Helpers (`@package/schema/helpers`)

| Function | Description |
| -------- | ----------- |
| `formatZodError(error)` | Formats Zod errors into structured field-level response objects |
| `formatZodErrorMessage(error)` | Formats Zod errors into a single concatenated string |
| `parseSafe(schema, input, fallback)` | Safely parses input, returning the fallback value on validation failure |
| `parseOrThrow(schema, input)` | Parses input or throws a typed application exception |
| `validateAsync(schema, input)` | Wraps schema parsing in an asynchronous promise |
| `trimString(schema)` | Transformer pipeline trimming string inputs |
| `toLowercase(schema)` | Transformer pipeline converting strings to lowercase |
| `toUppercase(schema)` | Transformer pipeline converting strings to uppercase |

## Type Inference

Zod automatically infers TypeScript types from schemas:

```typescript
import { z } from 'zod';
import { paginationParamsSchema, createUserSchema } from '@package/schema';

export type PaginationParams = z.infer<typeof paginationParamsSchema>;
// { page: number; limit: number }

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

## Structure

```text
src/
├── base/                   # Primitive schemas (string, number, date, uuid, url, boolean, array, object)
├── domain/                 # Domain schemas (user, organization, tenant, pagination, sorting, filtering)
├── custom/                 # Specialized format validators (password, phone, postal code, username)
├── helpers/                # Error formatting, safe parsing, async validation, and transforms
└── index.ts                # Public exports
```

## Building

```bash
pnpm nx build schema
```

## Running Tests

Comprehensive unit tests validate all primitives, domain contracts, and edge cases:

```bash
pnpm nx test schema
```

## Associated Packages

- [`@package/types`](../types/) - TypeScript interfaces and types
- [`@package/errors`](../errors/) - Standardized application error classes
- [`@package/constants`](../constants/) - System-wide constants and validation limits
