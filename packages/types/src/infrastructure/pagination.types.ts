/**
 * Pagination types
 *
 * This module provides types for implementing pagination in API endpoints and
 * data access layers. Supports both offset-based pagination (page/limit) and
 * cursor-based pagination for efficient traversal of large datasets.
 *
 * @module infrastructure/pagination.types
 */

/**
 * Pagination parameters for offset-based pagination.
 *
 * Used in API query parameters and repository methods to specify which
 * page of results to return. Page numbers are 1-indexed.
 *
 * @example
 * ```typescript
 * // Parse query parameters from URL
 * const params: IPaginationParams = {
 *   page: parseInt(searchParams.get('page') || '1'),
 *   limit: Math.min(parseInt(searchParams.get('limit') || '20'), 100),
 * };
 *
 * // Use in API controller
 * @Get('users')
 * async listUsers(@Query() query: PaginationDto): Promise<IPaginatedResult<User>> {
 *   return this.userService.findPaginated({
 *     page: query.page ?? 1,
 *     limit: query.limit ?? 20,
 *   });
 * }
 *
 * // Calculate offset for database query
 * const offset = (params.page - 1) * params.limit;
 * const users = await db.query.users.findMany({
 *   offset,
 *   limit: params.limit,
 * });
 * ```
 *
 * @see {@link IPaginatedResult} for the paginated response type
 * @see {@link IQuery} for CQRS query types
 * @see {@link IDomainPaginationParams} for domain-layer pagination
 */
export interface IPaginationParams {
  /** The page number (1-indexed) */
  readonly page: number;
  /** Maximum number of items per page */
  readonly limit: number;
}

/**
 * Paginated result wrapper for API responses.
 *
 * Contains the paginated data along with metadata about the pagination state,
 * including total count and total pages for building pagination UI components.
 *
 * @template T - The type of items in the data array
 *
 * @example
 * ```typescript
 * // Return paginated result from service
 * async function findUsers(params: IPaginationParams): Promise<IPaginatedResult<User>> {
 *   const [users, total] = await Promise.all([
 *     db.query.users.findMany({
 *       offset: (params.page - 1) * params.limit,
 *       limit: params.limit,
 *     }),
 *     db.select({ count: count() }).from(users),
 *   ]);
 *
 *   return {
 *     data: users,
 *     meta: {
 *       total,
 *       page: params.page,
 *       limit: params.limit,
 *       totalPages: Math.ceil(total / params.limit),
 *     },
 *   };
 * }
 *
 * // Use in frontend for pagination UI
 * const result = await api.users.list({ page: 2, limit: 10 });
 * console.log(`Page ${result.meta.page} of ${result.meta.totalPages}`);
 * console.log(`Showing ${result.data.length} of ${result.meta.total} users`);
 *
 * // Check for more pages
 * const hasNextPage = result.meta.page < result.meta.totalPages;
 * const hasPrevPage = result.meta.page > 1;
 * ```
 *
 * @see {@link IPaginationParams} for input parameters
 * @see {@link IQueryResult} for CQRS query results
 * @see {@link ICursorPaginatedResult} for cursor-based alternative
 */
export interface IPaginatedResult<T> {
  /** The paginated data items */
  readonly data: readonly T[];
  /** Pagination metadata */
  readonly meta: {
    /** Total number of items across all pages */
    readonly total: number;
    /** Current page number (1-indexed) */
    readonly page: number;
    /** Maximum items per page */
    readonly limit: number;
    /** Total number of pages */
    readonly totalPages: number;
  };
}

/**
 * Pagination cursor for cursor-based pagination.
 *
 * Cursor-based pagination is more efficient than offset-based for large datasets
 * because it doesn't require counting all records. The cursor is typically an
 * encoded representation of the last seen item's sort key.
 *
 * @example
 * ```typescript
 * // Initial request (no cursor)
 * const firstPage: IPaginationCursor = {
 *   cursor: null,
 *   limit: 20,
 * };
 *
 * // Subsequent request with cursor from previous response
 * const nextPage: IPaginationCursor = {
 *   cursor: 'eyJpZCI6IjEyMyIsImNyZWF0ZWRBdCI6IjIwMjQtMDEtMTUifQ==',
 *   limit: 20,
 * };
 *
 * // In API controller
 * @Get('feed')
 * async getFeed(@Query() query: CursorPaginationDto): Promise<ICursorPaginatedResult<Post>> {
 *   return this.feedService.getPosts({
 *     cursor: query.cursor ?? null,
 *     limit: query.limit ?? 20,
 *   });
 * }
 *
 * // Decode cursor in repository
 * function decodeCursor(cursor: string | null): { id: string; createdAt: Date } | null {
 *   if (!cursor) return null;
 *   return JSON.parse(Buffer.from(cursor, 'base64').toString());
 * }
 * ```
 *
 * @see {@link ICursorPaginatedResult} for the cursor-based response type
 * @see {@link IPaginationParams} for offset-based alternative
 */
export interface IPaginationCursor {
  /** The cursor from the previous response, or null for first page */
  readonly cursor: string | null;
  /** Maximum number of items to return */
  readonly limit: number;
}

/**
 * Cursor-based paginated result for infinite scroll and real-time feeds.
 *
 * Provides efficient pagination for large datasets without offset overhead.
 * Ideal for feeds, timelines, and infinite scroll interfaces where users
 * typically don't jump to arbitrary pages.
 *
 * @template T - The type of items in the data array
 *
 * @example
 * ```typescript
 * // Return cursor-paginated result
 * async function getPosts(params: IPaginationCursor): Promise<ICursorPaginatedResult<Post>> {
 *   const decoded = params.cursor ? decodeCursor(params.cursor) : null;
 *
 *   const posts = await db.query.posts.findMany({
 *     where: decoded
 *       ? lt(posts.createdAt, decoded.createdAt)
 *       : undefined,
 *     orderBy: desc(posts.createdAt),
 *     limit: params.limit + 1, // Fetch one extra to check hasMore
 *   });
 *
 *   const hasMore = posts.length > params.limit;
 *   const data = hasMore ? posts.slice(0, -1) : posts;
 *   const lastPost = data[data.length - 1];
 *
 *   return {
 *     data,
 *     nextCursor: lastPost ? encodeCursor(lastPost) : null,
 *     hasMore,
 *   };
 * }
 *
 * // Use in frontend for infinite scroll
 * async function loadMore() {
 *   const result = await api.feed.get({ cursor: currentCursor, limit: 20 });
 *   setPosts(prev => [...prev, ...result.data]);
 *   setCurrentCursor(result.nextCursor);
 *   setCanLoadMore(result.hasMore);
 * }
 *
 * // React Query infinite query
 * useInfiniteQuery({
 *   queryKey: ['feed'],
 *   queryFn: ({ pageParam }) => api.feed.get({ cursor: pageParam, limit: 20 }),
 *   getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
 * });
 * ```
 *
 * @see {@link IPaginationCursor} for the cursor input type
 * @see {@link IPaginatedResult} for offset-based alternative
 */
export interface ICursorPaginatedResult<T> {
  /** The paginated data items */
  readonly data: readonly T[];
  /** Cursor for the next page, or null if no more pages */
  readonly nextCursor: string | null;
  /** Whether more items are available after this page */
  readonly hasMore: boolean;
}
