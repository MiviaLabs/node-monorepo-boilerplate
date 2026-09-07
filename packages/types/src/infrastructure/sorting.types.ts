/**
 * Sorting types
 *
 * This module provides types for implementing sorting in API endpoints and
 * data access layers. Supports single-field and multi-field sorting with
 * ascending and descending order options.
 *
 * @module infrastructure/sorting.types
 */

/**
 * Sort order direction enum.
 *
 * Defines the direction for ordering query results. ASC sorts from smallest
 * to largest (A-Z, 0-9, oldest to newest), DESC sorts from largest to smallest.
 *
 * @example
 * ```typescript
 * // Ascending order (A-Z, 0-9, oldest to newest)
 * const ascSort: ISortParam = {
 *   field: 'name',
 *   order: SortOrder.ASC,
 * };
 *
 * // Descending order (Z-A, 9-0, newest to oldest)
 * const descSort: ISortParam = {
 *   field: 'createdAt',
 *   order: SortOrder.DESC,
 * };
 *
 * // Parse from query string
 * const order = query.order === 'desc' ? SortOrder.DESC : SortOrder.ASC;
 *
 * // Use in database query
 * const orderBy = sort.order === SortOrder.ASC
 *   ? asc(users[sort.field])
 *   : desc(users[sort.field]);
 * ```
 *
 * @see {@link ISortParam} for using with field specification
 */
export const SortOrder = {
  /** Ascending order (A-Z, 0-9, oldest to newest) */
  ASC: 'asc',
  /** Descending order (Z-A, 9-0, newest to oldest) */
  DESC: 'desc'
} as const;

/** Sort order type: 'asc' | 'desc' */
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

/**
 * Single sort parameter specifying field and direction.
 *
 * Defines how to sort results by a single field. Multiple ISortParam objects
 * can be combined for multi-field sorting where secondary sorts apply when
 * primary sort values are equal.
 *
 * @example
 * ```typescript
 * // Sort by a single field
 * const sortByName: ISortParam = {
 *   field: 'name',
 *   order: SortOrder.ASC,
 * };
 *
 * // Sort by creation date (newest first)
 * const sortByDate: ISortParam = {
 *   field: 'createdAt',
 *   order: SortOrder.DESC,
 * };
 *
 * // Parse from URL query parameter
 * // URL: ?sort=name:asc or ?sort=createdAt:desc
 * function parseSortParam(sortStr: string): ISortParam {
 *   const [field, order] = sortStr.split(':');
 *   return {
 *     field,
 *     order: order === 'desc' ? SortOrder.DESC : SortOrder.ASC,
 *   };
 * }
 *
 * // Use in DTO validation
 * class QueryDto {
 *   @IsOptional()
 *   @Matches(/^(name|email|createdAt):(asc|desc)$/)
 *   sort?: string;
 * }
 * ```
 *
 * @see {@link ISortParams} for multi-field sorting
 * @see {@link SortOrder} for sort direction values
 */
export interface ISortParam {
  /** The field name to sort by */
  readonly field: string;
  /** The sort direction (ascending or descending) */
  readonly order: SortOrder;
}

/**
 * Multiple sort parameters for multi-field sorting.
 *
 * An array of ISortParam objects applied in order. The first sort is the
 * primary sort, subsequent sorts only apply when previous sort values are
 * equal. Useful for deterministic ordering and tie-breaking.
 *
 * @example
 * ```typescript
 * // Multi-field sorting: by status, then by name, then by ID
 * const sortParams: ISortParams = [
 *   { field: 'status', order: SortOrder.ASC },     // Primary: group by status
 *   { field: 'name', order: SortOrder.ASC },       // Secondary: alphabetical
 *   { field: 'id', order: SortOrder.ASC },         // Tertiary: deterministic tiebreaker
 * ];
 *
 * // Parse from URL with multiple sort fields
 * // URL: ?sort=status:asc,name:asc,createdAt:desc
 * function parseSortParams(sortStr: string): ISortParams {
 *   return sortStr.split(',').map(part => {
 *     const [field, order] = part.split(':');
 *     return {
 *       field,
 *       order: order === 'desc' ? SortOrder.DESC : SortOrder.ASC,
 *     };
 *   });
 * }
 *
 * // Apply to Drizzle ORM query
 * function buildOrderBy(params: ISortParams, table: typeof users) {
 *   return params.map(param => {
 *     const column = table[param.field as keyof typeof table];
 *     return param.order === SortOrder.ASC ? asc(column) : desc(column);
 *   });
 * }
 *
 * // Use in repository
 * async findAll(sortParams: ISortParams): Promise<User[]> {
 *   return this.db.query.users.findMany({
 *     orderBy: buildOrderBy(sortParams, users),
 *   });
 * }
 * ```
 *
 * @see {@link ISortParam} for individual sort parameters
 * @see {@link IQuery} for using in CQRS queries
 * @see {@link IPaginationParams} for combining with pagination
 */
export type ISortParams = readonly ISortParam[];
