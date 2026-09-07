# @package/utils

Shared utility functions for Node Monorepo Boilerplate.

## Purpose

This package contains pure, side-effect-free utility functions used across all applications and packages. Functions are organized by domain (date, string, array, object, number).

## Structure

```
src/
├── date/                # Date/time utilities
│   ├── format.ts
│   ├── parse.ts
│   ├── timezone.ts
│   ├── range.ts
│   └── index.ts
├── string/              # String utilities
│   ├── format.ts
│   ├── validate.ts
│   ├── transform.ts
│   ├── slugify.ts
│   └── index.ts
├── array/               # Array utilities
│   ├── chunk.ts
│   ├── groupBy.ts
│   ├── uniq.ts
│   ├── sortBy.ts
│   └── index.ts
├── object/              # Object utilities
│   ├── clone.ts
│   ├── merge.ts
│   ├── pick.ts
│   ├── transform.ts
│   └── index.ts
├── number/              # Number utilities
│   ├── format.ts
│   ├── math.ts
│   ├── random.ts
│   └── index.ts
└── index.ts
```

## Usage

```typescript
import { formatDate, formatRelative, parseDate, createDateRange } from '@package/utils/date';

import {
  slugify,
  isEmail,
  capitalize,
  camelCase,
  snakeCase,
  kebabCase
} from '@package/utils/string';

import { chunk, groupBy, uniq, sortBy } from '@package/utils/array';

import { deepClone, shallowClone, deepMerge, pick, omit } from '@package/utils/object';

import { formatCurrency, formatPercent, clamp, randomInt, randomUUID } from '@package/utils/number';
```

## Key Functions

### Date Utilities

- `formatDate(date, locale?)` - Format as localized date
- `formatDateTime(date, locale?)` - Format as localized date-time
- `formatRelative(date, locale?)` - Format as relative time ("2 hours ago")
- `parseDate(dateStr)` - Parse date string to Date object
- `getCurrentTimezone()` - Get current timezone identifier
- `convertTimezone(date, timeZone)` - Convert to different timezone
- `createDateRange(start, end)` - Create date range object
- `isDateInRange(date, range)` - Check if date is in range
- `overlapRanges(range1, range2)` - Check if ranges overlap

### String Utilities

- `capitalize(str)` - Capitalize first letter
- `camelCase(str)` - Convert to camelCase
- `snakeCase(str)` - Convert to snake_case
- `kebabCase(str)` - Convert to kebab-case
- `pascalCase(str)` - Convert to PascalCase
- `isEmail(str)` - Check if valid email
- `isUUID(str)` - Check if valid UUID
- `isURL(str)` - Check if valid URL
- `isEmpty(str)` - Check if empty or whitespace
- `slugify(str)` - Convert to URL-friendly slug
- `truncate(str, maxLength, suffix?)` - Truncate to max length

### Array Utilities

- `chunk(arr, size)` - Split array into chunks
- `groupBy(arr, keyFn)` - Group by key function
- `uniq(arr)` - Get unique values
- `uniqBy(arr, keyFn)` - Get unique by key
- `sortBy(arr, keyFn, order?)` - Sort by key
- `sortWith(arr, compareFn)` - Sort with custom compare

### Object Utilities

- `deepClone(obj)` - Deep clone an object
- `shallowClone(obj)` - Shallow clone
- `deepMerge(target, ...sources)` - Deep merge objects
- `shallowMerge(target, ...sources)` - Shallow merge
- `pick(obj, keys)` - Pick specific keys
- `omit(obj, keys)` - Omit specific keys
- `mapKeys(obj, keyMapper)` - Map keys
- `mapValues(obj, valueMapper)` - Map values

### Number Utilities

- `formatCurrency(amount, currency?, locale?)` - Format as currency
- `formatPercent(value, decimals?, locale?)` - Format as percentage
- `formatNumber(value, locale?)` - Format with separators
- `clamp(value, min, max)` - Clamp between min and max
- `round(value, decimals?)` - Round to decimal places
- `safeDivide(numerator, denominator, fallback?)` - Safe division
- `randomInt(min, max)` - Random integer
- `randomFloat(min, max)` - Random float
- `randomUUID()` - Random UUID v4

## Guidelines

- All functions are pure (no side effects)
- Functions accept readonly arrays/objects and return new objects
- Handle edge cases (null, undefined, empty inputs)
- Use native APIs when possible (Intl, etc.)
- Avoid external dependencies
