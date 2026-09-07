/**
 * Pagination constants
 *
 * Configuration values for API pagination to optimize query performance,
 * prevent memory exhaustion, and provide consistent UX across endpoints.
 *
 * **Why Pagination Matters:**
 * - **Memory:** Unbounded result sets can exhaust server memory (OOM kills)
 * - **Database:** Large OFFSET values cause slow sequential scans
 * - **Network:** Massive JSON payloads increase latency and bandwidth costs
 * - **Frontend:** Rendering thousands of items degrades UI performance
 *
 * **Pagination Strategies:**
 * 1. **Offset-based** (page/limit): Simple but slow for large offsets
 * 2. **Cursor-based** (cursor/limit): Efficient for large datasets, keyset pagination
 *
 * This codebase supports both strategies via Zod schemas in `@package/schema`.
 *
 * **Current Enforcement Status:**
 * ⚠️ These constants are canonical reference values. The actual enforcement
 * happens in Zod schemas with hardcoded values that SHOULD match these.
 * A future refactoring task should update schemas to import from here.
 *
 * @see packages/schema/src/domain/pagination.schema.ts - Zod validation schemas
 * @see packages/constants/src/domain/limits.ts - Overlapping MAX_PAGE_SIZE constant
 *
 * @example Using PAGINATION constants in CQRS query handlers
 * ```typescript
 * import { PAGINATION } from '@package/constants/domain';
 *
 * @QueryHandler(ListUsersQuery)
 * export class ListUsersHandler {
 *   async execute(query: ListUsersQuery) {
 *     // Apply defaults if not provided
 *     const page = query.page ?? PAGINATION.DEFAULT_PAGE;
 *     const limit = Math.min(
 *       query.limit ?? PAGINATION.DEFAULT_LIMIT,
 *       PAGINATION.MAX_LIMIT
 *     );
 *
 *     // Calculate offset (1-based pagination)
 *     const offset = (page - PAGINATION.DEFAULT_PAGE) * limit;
 *
 *     const [users, total] = await Promise.all([
 *       this.userRepository.findMany({ limit, offset }),
 *       this.userRepository.count()
 *     ]);
 *
 *     return {
 *       data: users,
 *       pagination: {
 *         page,
 *         limit,
 *         total,
 *         totalPages: Math.ceil(total / limit),
 *         hasNext: page * limit < total,
 *         hasPrevious: page > PAGINATION.DEFAULT_PAGE
 *       }
 *     };
 *   }
 * }
 * ```
 *
 * @example Page size validation in DTO
 * ```typescript
 * import { PAGINATION } from '@package/constants/domain';
 * import { IsInt, Min, Max, IsOptional } from 'class-validator';
 *
 * export class PaginationDto {
 *   @IsOptional()
 *   @IsInt()
 *   @Min(PAGINATION.DEFAULT_PAGE)
 *   page: number = PAGINATION.DEFAULT_PAGE;
 *
 *   @IsOptional()
 *   @IsInt()
 *   @Min(PAGINATION.MIN_LIMIT)
 *   @Max(PAGINATION.MAX_LIMIT)
 *   limit: number = PAGINATION.DEFAULT_LIMIT;
 * }
 *
 * // Validation error messages
 * // - "limit must not be greater than 100" (MAX_LIMIT)
 * // - "limit must not be less than 1" (MIN_LIMIT)
 * ```
 *
 * @example Zod schema with PAGINATION constants
 * ```typescript
 * import { PAGINATION } from '@package/constants/domain';
 * import { z } from 'zod';
 *
 * export const paginationSchema = z.object({
 *   page: z.coerce.number()
 *     .int()
 *     .positive()
 *     .default(PAGINATION.DEFAULT_PAGE),
 *   limit: z.coerce.number()
 *     .int()
 *     .min(PAGINATION.MIN_LIMIT, `Minimum page size is ${PAGINATION.MIN_LIMIT}`)
 *     .max(PAGINATION.MAX_LIMIT, `Maximum page size is ${PAGINATION.MAX_LIMIT}`)
 *     .default(PAGINATION.DEFAULT_LIMIT)
 * });
 *
 * // Usage in controller
 * @Get()
 * async list(@Query() query: unknown) {
 *   const { page, limit } = paginationSchema.parse(query);
 *   return this.service.list(page, limit);
 * }
 * ```
 *
 * @example Preventing excessive pagination (security)
 * ```typescript
 * import { PAGINATION } from '@package/constants/domain';
 *
 * function validatePaginationRequest(page: number, limit: number): void {
 *   // Prevent memory exhaustion attacks
 *   if (limit > PAGINATION.MAX_LIMIT) {
 *     throw new BadRequestException(
 *       `Page size cannot exceed ${PAGINATION.MAX_LIMIT}`
 *     );
 *   }
 *
 *   // Prevent deep pagination (slow OFFSET queries)
 *   const offset = (page - PAGINATION.DEFAULT_PAGE) * limit;
 *   if (offset > PAGINATION.MAX_OFFSET) {
 *     throw new BadRequestException(
 *       `Deep pagination not supported. Maximum offset is ${PAGINATION.MAX_OFFSET}. Use cursor-based pagination for large datasets.`
 *     );
 *   }
 * }
 * ```
 */

export const PAGINATION = {
  // ──────────────────────────────────────────────────────────────────────────
  // Default values - applied when client doesn't specify
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Default starting page: 1
   *
   * **Rationale:** 1-based pagination is more intuitive for users and APIs.
   * Page 1 is the first page, which maps to OFFSET 0 in SQL.
   *
   * Note: Some APIs use 0-based pagination. This codebase uses 1-based.
   */
  DEFAULT_PAGE: 1,

  /**
   * Default page size: 20 items
   *
   * **Rationale:** Balances initial load performance with data availability.
   * - Fast enough for initial render (< 200ms typical)
   * - Enough data to be useful without immediate "load more"
   * - Fits common UI patterns: lists (10-20), tables (20-50), grids (12-24)
   *
   * **Comparison:**
   * - 10: Too few, users paginate immediately
   * - 20: Good balance for most use cases ✓
   * - 50: May cause slow initial loads on mobile
   * - 100: Wasteful for most UI views
   *
   * @see packages/schema/src/domain/pagination.schema.ts - Uses `.default(20)`
   */
  DEFAULT_LIMIT: 20,

  // ──────────────────────────────────────────────────────────────────────────
  // Bounds - security and performance guardrails
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Maximum page size: 100 items
   *
   * **Security:** Unbounded pagination is dangerous because:
   * - Memory exhaustion: Node.js heap can be exhausted by large arrays
   * - Slow queries: Large result sets cause database timeouts
   * - DoS vector: Attackers can request `?limit=999999999`
   *
   * **Performance:** Even 100 items can be problematic:
   * - ~100KB JSON payload (varies by entity size)
   * - Database may still do sequential scan for large offsets
   * - Consider cursor-based pagination for > 100 items
   *
   * **Industry standards:**
   * - GitHub API: 100 max
   * - Stripe API: 100 max
   * - AWS APIs: 100-1000 depending on service
   *
   * @see packages/schema/src/domain/pagination.schema.ts - Uses `.max(100)`
   */
  MAX_LIMIT: 100,

  /**
   * Minimum page size: 1 item
   *
   * **Rationale:** At least 1 item must be requested per page.
   * Zero or negative limits would result in empty or invalid queries.
   *
   * **Note:** Requesting 1 item per page is valid for:
   * - Detail views with "next/previous" navigation
   * - Slow processing of large entities
   * - Rate-limited API integrations
   */
  MIN_LIMIT: 1,

  /**
   * Maximum offset: 10000 rows
   *
   * **Purpose:** Prevents deep pagination which causes severe performance issues.
   *
   * **Why Deep Pagination is Problematic:**
   * - **Database:** Large OFFSET values force sequential scans. OFFSET 10000
   *   means the database must read and discard 10000 rows before returning results.
   * - **Memory:** Each skipped row still consumes memory during query execution.
   * - **Lock contention:** Long-running scans hold locks, blocking other queries.
   *
   * **Security:** Deep pagination can be exploited for DoS attacks:
   * - Attacker requests `?page=999999&limit=100`
   * - Server spends resources scanning millions of rows
   * - Repeat to exhaust database connection pool
   *
   * **Alternative for Large Datasets:**
   * Use cursor-based (keyset) pagination instead:
   * ```sql
   * -- Instead of: SELECT * FROM users OFFSET 10000 LIMIT 20
   * SELECT * FROM users WHERE id > :last_id ORDER BY id LIMIT 20
   * ```
   *
   * @see packages/schema/src/domain/pagination.schema.ts - Zod validation
   */
  MAX_OFFSET: 10000
} as const;
