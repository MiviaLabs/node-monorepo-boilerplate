/**
 * Domain-level query types for pagination, sorting, and filtering.
 *
 * This module provides domain-specific query types that are distinct from
 * infrastructure-level types. Domain types use semantic naming conventions
 * (e.g., `pageSize` instead of `limit`) for consistency with domain concepts.
 *
 * Key differences from infrastructure types:
 * - **Pagination**: Uses `pageSize` instead of `limit` for domain clarity
 * - **Sorting**: Uses `direction` instead of `order` for consistency
 * - **Filtering**: Uses domain-specific operators aligned with business rules
 *
 * @module domain/query.types
 */

/**
 * Domain pagination parameters for paginated queries.
 *
 * Uses `pageSize` instead of `limit` for domain clarity and consistency
 * with frontend pagination components.
 *
 * @example
 * ```typescript
 * const params: IDomainPaginationParams = {
 *   page: 1,       // 1-indexed page number
 *   pageSize: 20,  // Items per page
 * };
 *
 * const result = await repository.findPaginated({ pagination: params });
 * ```
 *
 * @see {@link IDomainPaginatedResult} for the paginated response type
 * @see {@link IDomainQueryParams} for combining with sort and filter
 * @see PaginationParams in infrastructure types for API-level pagination
 */
export interface IDomainPaginationParams {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Sorting direction values for query ordering.
 *
 * @example
 * ```typescript
 * const sortByDate: IDomainSortParam = {
 *   field: 'createdAt',
 *   direction: SortDirection.Desc,
 * };
 * ```
 */
export const SortDirection = {
  Asc: 'asc',
  Desc: 'desc'
} as const;

/** Sort direction type: 'asc' | 'desc' */
export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

/**
 * Domain sorting parameters for ordering query results.
 *
 * @example
 * ```typescript
 * const sortParams: IDomainSortParam[] = [
 *   { field: 'status', direction: SortDirection.Asc },
 *   { field: 'createdAt', direction: SortDirection.Desc },
 * ];
 *
 * const result = await repository.findPaginated({
 *   pagination: { page: 1, pageSize: 20 },
 *   sort: sortParams,
 * });
 * ```
 *
 * @see {@link SortDirection} for sort direction values
 * @see {@link IDomainQueryParams} for combining with pagination and filter
 * @see ISortParams in infrastructure types for API-level sorting
 */
export interface IDomainSortParam {
  readonly field: string;
  readonly direction: SortDirection;
}

/**
 * Filter operator values for query filtering.
 *
 * Defines comparison operators for building dynamic queries.
 *
 * @example
 * ```typescript
 * // Equality check
 * { field: 'status', operator: DomainFilterOperator.Eq, value: 'active' }
 *
 * // Range query
 * { field: 'price', operator: DomainFilterOperator.Gte, value: 100 }
 *
 * // Pattern matching
 * { field: 'name', operator: DomainFilterOperator.Like, value: '%john%' }
 * ```
 */
export const DomainFilterOperator = {
  /** Equal to */
  Eq: 'eq',
  /** Not equal to */
  Ne: 'ne',
  /** Greater than */
  Gt: 'gt',
  /** Greater than or equal to */
  Gte: 'gte',
  /** Less than */
  Lt: 'lt',
  /** Less than or equal to */
  Lte: 'lte',
  /** Value in array */
  In: 'in',
  /** Pattern match (SQL LIKE) */
  Like: 'like'
} as const;

/** Domain filter operator type */
export type DomainFilterOperator = (typeof DomainFilterOperator)[keyof typeof DomainFilterOperator];

/**
 * Domain filtering parameters for query filtering.
 *
 * @example
 * ```typescript
 * const filters: IDomainFilterParam[] = [
 *   { field: 'status', operator: DomainFilterOperator.Eq, value: 'active' },
 *   { field: 'role', operator: DomainFilterOperator.In, value: ['admin', 'editor'] },
 * ];
 *
 * const result = await repository.findPaginated({
 *   pagination: { page: 1, pageSize: 20 },
 *   filter: filters,
 * });
 * ```
 *
 * @see {@link DomainFilterOperator} for available operators
 * @see {@link IDomainQueryParams} for combining with pagination and sort
 * @see IFilterParams in infrastructure types for API-level filtering
 */
export interface IDomainFilterParam {
  readonly field: string;
  readonly operator: DomainFilterOperator;
  readonly value: unknown;
}

/**
 * Combined domain query parameters for pagination, sorting, and filtering.
 *
 * This interface combines all query parameters into a single object for
 * convenient use with repository methods.
 *
 * @example
 * ```typescript
 * const queryParams: IDomainQueryParams = {
 *   pagination: { page: 1, pageSize: 20 },
 *   sort: [{ field: 'createdAt', direction: SortDirection.Desc }],
 *   filter: [{ field: 'status', operator: DomainFilterOperator.Eq, value: 'active' }],
 * };
 *
 * const result = await userRepository.findPaginated(queryParams);
 * ```
 *
 * @see {@link IDomainPaginationParams} for pagination parameters
 * @see {@link IDomainSortParam} for sorting parameters
 * @see {@link IDomainFilterParam} for filter parameters
 */
export interface IDomainQueryParams {
  readonly pagination?: IDomainPaginationParams;
  readonly sort?: readonly IDomainSortParam[];
  readonly filter?: readonly IDomainFilterParam[];
}

/**
 * Domain paginated result wrapper for paginated queries.
 *
 * Contains the paginated data along with metadata for navigation
 * (total count, page info, has next/previous).
 *
 * @template T - The type of items in the paginated result
 *
 * @example
 * ```typescript
 * const result: IDomainPaginatedResult<User> = {
 *   data: users,
 *   total: 150,
 *   page: 2,
 *   pageSize: 20,
 *   totalPages: 8,
 *   hasNext: true,
 *   hasPrevious: true,
 * };
 *
 * // Display pagination info
 * console.log(`Page ${result.page} of ${result.totalPages}`);
 * console.log(`Showing ${result.data.length} of ${result.total} items`);
 * ```
 *
 * @see {@link IDomainPaginationParams} for input parameters
 * @see {@link IRepository.findPaginated} for usage in repositories
 * @see PaginatedResult in infrastructure types for API responses
 */
export interface IDomainPaginatedResult<T> {
  readonly data: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}
