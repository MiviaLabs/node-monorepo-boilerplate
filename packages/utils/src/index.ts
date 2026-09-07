/**
 * @package/utils
 *
 * Pure, side-effect-free utility functions for the Node Monorepo Boilerplate monorepo.
 * All utilities are organized by domain and designed for use across applications
 * and packages without external dependencies.
 *
 * ## Features
 *
 * - **Date Utilities**: Locale-aware formatting with {@link formatDate}, {@link formatDateTime},
 *   {@link formatRelative}, parsing with {@link parseDate}, {@link parseISO}, timezone operations
 *   with {@link getCurrentTimezone}, {@link convertTimezone}, and range utilities with
 *   {@link createDateRange}, {@link isDateInRange}, {@link overlapRanges}
 *
 * - **String Utilities**: Case conversion with {@link capitalize}, {@link camelCase},
 *   {@link snakeCase}, {@link kebabCase}, {@link pascalCase}, validation with {@link isEmail},
 *   {@link isUUID}, {@link isURL}, {@link isEmpty}, transformation with {@link truncate},
 *   {@link ellipsize}, {@link normalizeWhitespace}, and URL-safe slugs with {@link slugify},
 *   {@link generateSlug}
 *
 * - **Array Utilities**: Chunking with {@link chunk}, grouping with {@link groupBy},
 *   deduplication with {@link uniq}, {@link uniqBy}, and sorting with {@link sortBy},
 *   {@link sortWith}
 *
 * - **Object Utilities**: Cloning with {@link deepClone}, {@link shallowClone}, merging with
 *   {@link deepMerge}, {@link shallowMerge}, property selection with {@link pick}, {@link omit},
 *   and transformation with {@link mapKeys}, {@link mapValues}
 *
 * - **Number Utilities**: Locale-aware formatting with {@link formatCurrency}, {@link formatPercent},
 *   {@link formatNumber}, math operations with {@link clamp}, {@link round}, {@link floor},
 *   {@link ceil}, {@link safeDivide}, and random generation with {@link randomInt},
 *   {@link randomFloat}, {@link randomUUID}
 *
 * - **Crypto Utilities**: Secure hashing with {@link hashEmail} for deterministic email lookups
 *
 * ## Usage Examples
 *
 * ### Date Operations
 * ```typescript
 * import {
 *   formatDate,
 *   formatRelative,
 *   parseDate,
 *   createDateRange,
 *   isDateInRange
 * } from '@package/utils';
 *
 * // Locale-aware formatting
 * formatDate(new Date(), 'en-US');     // '2/22/2026'
 * formatDate(new Date(), 'de-DE');     // '22.2.2026'
 *
 * // Relative time formatting
 * formatRelative(new Date(Date.now() - 3600000)); // '1 hour ago'
 *
 * // Safe parsing (returns null for invalid input)
 * const date = parseDate('2026-02-22');
 * if (date) {
 *   // date is valid
 * }
 *
 * // Date range operations
 * const q1 = createDateRange(new Date('2026-01-01'), new Date('2026-03-31'));
 * isDateInRange(new Date('2026-02-15'), q1); // true
 * ```
 *
 * ### String Operations
 * ```typescript
 * import {
 *   slugify,
 *   capitalize,
 *   camelCase,
 *   truncate,
 *   isEmail
 * } from '@package/utils';
 *
 * // URL-safe slug generation
 * slugify('Hello World!');           // 'hello-world'
 *
 * // Case transformations
 * capitalize('hello');               // 'Hello'
 * camelCase('hello-world');          // 'helloWorld'
 *
 * // String truncation
 * truncate('Long text here', 10);    // 'Long te...'
 *
 * // Validation
 * isEmail('user@example.com');       // true
 * ```
 *
 * ### Array Operations
 * ```typescript
 * import { chunk, groupBy, sortBy, uniqBy } from '@package/utils';
 *
 * // Split into chunks for batch processing
 * chunk([1, 2, 3, 4, 5], 2);         // [[1, 2], [3, 4], [5]]
 *
 * // Group by a key
 * const users = [{ role: 'admin', name: 'Alice' }, { role: 'user', name: 'Bob' }];
 * groupBy(users, u => u.role);       // { admin: [...], user: [...] }
 *
 * // Sort by property
 * sortBy(users, u => u.name);        // sorted by name ascending
 *
 * // Deduplicate by key
 * uniqBy(users, u => u.name);        // unique users by name
 * ```
 *
 * ### Object Operations
 * ```typescript
 * import { deepClone, deepMerge, pick, omit } from '@package/utils';
 *
 * // Deep clone for immutable operations
 * const original = { a: { b: 1 } };
 * const cloned = deepClone(original);
 *
 * // Deep merge for configuration
 * const config = deepMerge({}, defaults, userConfig);
 *
 * // Select specific properties
 * const publicUser = pick(user, ['id', 'name', 'email']);
 *
 * // Remove sensitive properties
 * const safeUser = omit(user, ['password', 'token']);
 * ```
 *
 * ### Number Operations
 * ```typescript
 * import {
 *   formatCurrency,
 *   formatPercent,
 *   clamp,
 *   randomInt
 * } from '@package/utils';
 *
 * // Locale-aware currency formatting
 * formatCurrency(1234.56, 'USD');    // '$1,234.56'
 * formatCurrency(1234.56, 'EUR', 'de-DE'); // '1.234,56 €'
 *
 * // Percentage formatting
 * formatPercent(0.1234);             // '12.34%'
 *
 * // Constrain values to a range
 * clamp(150, 0, 100);                // 100
 *
 * // Random integers (non-cryptographic)
 * randomInt(1, 6);                   // dice roll
 * ```
 *
 * @remarks
 * All functions in this package are pure (no side effects) and designed to:
 * - Accept readonly arrays/objects where applicable
 * - Return new objects/arrays rather than mutating inputs
 * - Handle edge cases (null, undefined, empty inputs) gracefully
 * - Use native APIs (Intl, URL, Date) for standards compliance
 *
 * @see {@link formatDate} for locale-aware date formatting
 * @see {@link slugify} for URL-safe string conversion
 * @see {@link deepClone} for immutable object cloning
 * @see {@link chunk} for array batch processing
 *
 * Related packages:
 * - `@package/types` - Shared type definitions used by utilities
 * - `@package/schema` - Zod validation schemas that complement these utilities
 *
 * @packageDocumentation
 */

// Date utilities
export * from './date';

// String utilities
export * from './string';

// Array utilities
export * from './array';

// Object utilities
export * from './object';

// Number utilities
export * from './number';

// Crypto utilities
export * from './crypto.util';
