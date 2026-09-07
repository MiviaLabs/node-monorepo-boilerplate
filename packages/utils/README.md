# @package/utils

**Shared utility functions for common operations in the Node Monorepo Boilerplate.**

## What is it?

`@package/utils` provides a comprehensive collection of utility functions for common operations across the Node Monorepo Boilerplate, including date manipulation, string formatting, array operations, object manipulation, and number formatting.

## Features

- **Date Utilities** - Format, parse, validate, and timezone utilities
- **String Utilities** - Slugify, truncate, capitalize, case conversion
- **Array Utilities** - Chunk, group by, sort, unique, shuffle
- **Object Utilities** - Clone, deep merge, pick, omit, invert
- **Number Utilities** - Format numbers, percentages, rounding
- **Random Utilities** - Random integers, floats, bytes, UUIDs

## Installation

This package is part of the Node Monorepo Boilerplate monorepo.

```bash
pnpm install @package/utils
```

## Quick Start

```typescript
// Date utilities
import { formatDate, parseDate, isValidDate, getTimezoneOffset } from '@package/utils/date';

// String utilities
import { slugify, truncate, capitalize, kebabCase, camelCase } from '@package/utils/string';

// Array utilities
import { chunk, groupBy, sortBy, uniq, shuffle } from '@package/utils/array';

// Object utilities
import { clone, deepMerge, pick, omit, invert } from '@package/utils/object';

// Number utilities
import { formatNumber, formatPercent, ceil, floor, round } from '@package/utils/number';

// Random utilities
import { randomInt, randomFloat, randomBytes, randomUuid } from '@package/utils/random';
```

## Usage Examples

### Date Utilities

```typescript
import { formatDate, parseDate, isValidDate } from '@package/utils/date';

// Format dates
const formatted = formatDate(new Date(), 'YYYY-MM-DD');
// '2024-12-31'

// Parse dates
const parsed = parseDate('2024-12-31', 'YYYY-MM-DD');
// Date object

// Validate dates
const valid = isValidDate(new Date());
// true
```

### String Utilities

```typescript
import { slugify, truncate, capitalize, kebabCase, camelCase } from '@package/utils/string';

// Create URL-friendly slugs
const slug = slugify('Hello World!');
// 'hello-world'

// Truncate long strings
const short = truncate('This is a very long string', 10);
// 'This is a...'

// Capitalize strings
const title = capitalize('hello world');
// 'Hello World'

// Case conversion
const kebab = kebabCase('helloWorld');
// 'hello-world'
const camel = camelCase('hello-world');
// 'helloWorld'
```

### Array Utilities

```typescript
import { chunk, groupBy, sortBy, uniq, shuffle } from '@package/utils/array';

// Split array into chunks
const chunks = chunk([1, 2, 3, 4, 5], 2);
// [[1, 2], [3, 4], [5]]

// Group by property
const grouped = groupBy(
  [
    { id: 1, type: 'a' },
    { id: 2, type: 'b' }
  ],
  'type'
);
// { a: [{ id: 1, type: 'a' }], b: [{ id: 2, type: 'b' }] }

// Sort array
const sorted = sortBy([3, 1, 2], (x) => x);
// [1, 2, 3]

// Unique values
const unique = uniq([1, 2, 2, 3, 3, 3]);
// [1, 2, 3]

// Shuffle array
const shuffled = shuffle([1, 2, 3, 4, 5]);
// [3, 1, 5, 2, 4] (random order)
```

### Object Utilities

```typescript
import { clone, deepMerge, pick, omit, invert } from '@package/utils/object';

// Deep clone
const cloned = clone({ a: 1, b: { c: 2 } });
// { a: 1, b: { c: 2 } }

// Deep merge
const merged = deepMerge({ a: 1 }, { b: 2 });
// { a: 1, b: 2 }

// Pick properties
const picked = pick({ a: 1, b: 2, c: 3 }, ['a', 'c']);
// { a: 1, c: 3 }

// Omit properties
const omitted = omit({ a: 1, b: 2, c: 3 }, ['b']);
// { a: 1, c: 3 }

// Invert object
const inverted = invert({ a: '1', b: '2' });
// { 1: 'a', 2: 'b' }
```

### Number Utilities

```typescript
import { formatNumber, formatPercent, ceil, floor, round } from '@package/utils/number';

// Format numbers
const formatted = formatNumber(1234.56, { decimals: 2 });
// '1,234.56'

// Format percentages
const percent = formatPercent(0.1234, { decimals: 2 });
// '12.34%'

// Rounding
const up = ceil(1.23);
// 2
const down = floor(1.78);
// 1
const nearest = round(1.56);
// 2
```

### Random Utilities

```typescript
import { randomInt, randomFloat, randomBytes, randomUuid } from '@package/utils/random';

// Random integer (inclusive)
const num = randomInt(1, 10);
// 5 (random between 1-10)

// Random float
const float = randomFloat(0, 1);
// 0.423...

// Random bytes
const bytes = randomBytes(16);
// Buffer(16)

// Random UUID
const uuid = randomUuid();
// '550e8400-e29b-41d4-a716-446655440000'
```

## Available Functions

### Date Functions

- `formatDate()` - Format date to string
- `parseDate()` - Parse string to date
- `isValidDate()` - Validate date
- `getTimezoneOffset()` - Get timezone offset in minutes
- `addDays()` / `addMonths()` / `addYears()` - Date arithmetic
- `diffDays()` / `diffHours()` - Date differences

### String Functions

- `slugify()` - Create URL-friendly slugs
- `truncate()` - Truncate with ellipsis
- `capitalize()` - Capitalize first letter
- `kebabCase()` - Convert to kebab-case
- `camelCase()` - Convert to camelCase
- `snakeCase()` - Convert to snake_case
- `startsWith()` / `endsWith()` - String checks
- `includes()` / `contains()` - Substring checks

### Array Functions

- `chunk()` - Split into chunks
- `groupBy()` - Group by property
- `sortBy()` - Sort by criteria
- `uniq()` / `unique()` - Remove duplicates
- `shuffle()` - Random shuffle
- `first()` / `last()` - Get elements
- `flatten()` - Flatten nested arrays
- `partition()` - Split by predicate

### Object Functions

- `clone()` - Deep clone
- `deepMerge()` - Deep merge objects
- `pick()` - Select properties
- `omit()` - Remove properties
- `invert()` - Swap keys/values
- `keys()` / `values()` - Get keys/values
- `isEmpty()` - Check if empty
- `isEqual()` - Deep equality check

### Number Functions

- `formatNumber()` - Format with separators
- `formatPercent()` - Format as percentage
- `ceil()` - Round up
- `floor()` - Round down
- `round()` - Round to nearest
- `clamp()` - Clamp between min/max
- `isInteger()` / `isFloat()` - Type checks

### Random Functions

- `randomInt()` - Random integer
- `randomFloat()` - Random float
- `randomBytes()` - Random bytes buffer
- `randomUuid()` - Random UUID v4

## Structure

```text
src/
├── array/               # Array utilities
│   ├── chunk.ts
│   ├── groupBy.ts
│   ├── sortBy.ts
│   ├── uniq.ts
│   └── index.ts
├── date/                # Date and timezone utilities
│   ├── format.ts
│   ├── parse.ts
│   ├── range.ts
│   ├── timezone.ts
│   └── index.ts
├── number/              # Math, random, and numeric formatters
│   ├── format.ts
│   ├── math.ts
│   ├── random.ts
│   └── index.ts
├── object/              # Immutability and object operations
│   ├── clone.ts
│   ├── merge.ts
│   ├── pick.ts
│   ├── transform.ts
│   └── index.ts
├── string/              # Formatting, slugify, transforms, validation
│   ├── format.ts
│   ├── slugify.ts
│   ├── transform.ts
│   ├── validate.ts
│   └── index.ts
├── crypto.util.ts       # Cryptographic hashing helpers
└── index.ts
```

## Building

```bash
pnpm nx build utils
```

## Running Tests

The package includes comprehensive unit tests:

```bash
pnpm nx test utils
```

## Associated Packages

- [`@package/types`](../types/) - Shared TypeScript types
- [`@package/schema`](../schema/) - Zod validation schemas

## Links

- [Main Repository](../../README.md)
- [Package Documentation](./AGENTS.md)
