/**
 * Filtering types
 *
 * This module provides types for implementing dynamic query filtering in API
 * endpoints and data access layers. Supports various comparison operators,
 * logical grouping, and complex nested filter expressions.
 *
 * @module infrastructure/filtering.types
 */

/**
 * Filter operators for comparison and pattern matching.
 *
 * Defines the available comparison operations for building dynamic filters.
 * Different operators are appropriate for different data types and use cases.
 *
 * @example
 * ```typescript
 * // Equality check
 * const statusFilter: IFilterParam = {
 *   field: 'status',
 *   operator: FilterOperator.EQ,
 *   value: 'active',
 * };
 *
 * // Numeric comparison
 * const priceFilter: IFilterParam = {
 *   field: 'price',
 *   operator: FilterOperator.GTE,
 *   value: 100,
 * };
 *
 * // Array membership (IN)
 * const rolesFilter: IFilterParam = {
 *   field: 'role',
 *   operator: FilterOperator.IN,
 *   value: ['admin', 'editor'],
 * };
 *
 * // Text search (CONTAINS)
 * const searchFilter: IFilterParam = {
 *   field: 'name',
 *   operator: FilterOperator.CONTAINS,
 *   value: 'john',
 * };
 *
 * // Null checks
 * const deletedFilter: IFilterParam = {
 *   field: 'deletedAt',
 *   operator: FilterOperator.IS_NULL,
 * };
 * ```
 *
 * @see {@link IFilterParam} for constructing filters
 */
export const FilterOperator = {
  /** Equal to (exact match) */
  EQ: 'eq',
  /** Not equal to */
  NE: 'ne',
  /** Greater than */
  GT: 'gt',
  /** Greater than or equal to */
  GTE: 'gte',
  /** Less than */
  LT: 'lt',
  /** Less than or equal to */
  LTE: 'lte',
  /** Value is in array (for multi-value matching) */
  IN: 'in',
  /** Value is not in array */
  NOT_IN: 'notIn',
  /** String contains substring (case-insensitive) */
  CONTAINS: 'contains',
  /** String starts with prefix */
  STARTS_WITH: 'startsWith',
  /** String ends with suffix */
  ENDS_WITH: 'endsWith',
  /** Field value is null */
  IS_NULL: 'isNull',
  /** Field value is not null */
  IS_NOT_NULL: 'isNotNull'
} as const;

/** Filter operator type */
export type FilterOperator = (typeof FilterOperator)[keyof typeof FilterOperator];

/**
 * Single filter parameter with field, operator, and value.
 *
 * Represents a single filter condition. The value is optional for operators
 * like IS_NULL and IS_NOT_NULL that don't require a comparison value.
 *
 * @example
 * ```typescript
 * // Filter active users
 * const activeFilter: IFilterParam = {
 *   field: 'isActive',
 *   operator: FilterOperator.EQ,
 *   value: true,
 * };
 *
 * // Filter by date range
 * const dateFilter: IFilterParam = {
 *   field: 'createdAt',
 *   operator: FilterOperator.GTE,
 *   value: new Date('2024-01-01').toISOString(),
 * };
 *
 * // Parse from query string
 * // URL: ?filter[status]=eq:active&filter[role]=in:admin,editor
 * function parseFilter(key: string, value: string): IFilterParam {
 *   const [operator, ...valueParts] = value.split(':');
 *   const filterValue = operator === 'in'
 *     ? valueParts.join(':').split(',')
 *     : valueParts.join(':');
 *
 *   return {
 *     field: key,
 *     operator: operator as FilterOperator,
 *     value: filterValue,
 *   };
 * }
 *
 * // Convert to database condition (Drizzle example)
 * function toCondition(filter: IFilterParam, table: AnyTable) {
 *   const column = table[filter.field as keyof typeof table];
 *   switch (filter.operator) {
 *     case FilterOperator.EQ:
 *       return eq(column, filter.value);
 *     case FilterOperator.IN:
 *       return inArray(column, filter.value as unknown[]);
 *     case FilterOperator.CONTAINS:
 *       return ilike(column, `%${filter.value}%`);
 *     // ... other operators
 *   }
 * }
 * ```
 *
 * @see {@link FilterOperator} for available comparison operators
 * @see {@link IFilterGroup} for combining filters with logical operators
 */
export interface IFilterParam {
  /** The field name to filter on */
  readonly field: string;
  /** The comparison operator */
  readonly operator: FilterOperator;
  /** The value to compare against (optional for IS_NULL/IS_NOT_NULL) */
  readonly value?: unknown;
}

/**
 * Logical operator for combining multiple filters.
 *
 * Used in IFilterGroup to specify how multiple filter conditions should be
 * combined. AND requires all conditions to match, OR requires at least one.
 *
 * @example
 * ```typescript
 * // AND: All conditions must match
 * const andGroup: IFilterGroup = {
 *   operator: LogicalOperator.AND,
 *   filters: [
 *     { field: 'status', operator: FilterOperator.EQ, value: 'active' },
 *     { field: 'role', operator: FilterOperator.EQ, value: 'admin' },
 *   ],
 * };
 *
 * // OR: At least one condition must match
 * const orGroup: IFilterGroup = {
 *   operator: LogicalOperator.OR,
 *   filters: [
 *     { field: 'role', operator: FilterOperator.EQ, value: 'admin' },
 *     { field: 'role', operator: FilterOperator.EQ, value: 'editor' },
 *   ],
 * };
 * ```
 *
 * @see {@link IFilterGroup} for using in filter groups
 */
export const LogicalOperator = {
  /** All conditions must match */
  AND: 'and',
  /** At least one condition must match */
  OR: 'or'
} as const;

/** Logical operator type: 'and' | 'or' */
export type LogicalOperator = (typeof LogicalOperator)[keyof typeof LogicalOperator];

/**
 * Filter group for complex nested filter expressions.
 *
 * Allows combining multiple filters with logical operators (AND/OR) and
 * supports nesting for complex query expressions like
 * `(status = active AND role = admin) OR (status = pending)`.
 *
 * @example
 * ```typescript
 * // Simple AND group: active admins
 * const simpleGroup: IFilterGroup = {
 *   operator: LogicalOperator.AND,
 *   filters: [
 *     { field: 'isActive', operator: FilterOperator.EQ, value: true },
 *     { field: 'role', operator: FilterOperator.EQ, value: 'admin' },
 *   ],
 * };
 *
 * // Nested groups: (active AND admin) OR (pending AND editor)
 * const nestedGroup: IFilterGroup = {
 *   operator: LogicalOperator.OR,
 *   filters: [
 *     {
 *       operator: LogicalOperator.AND,
 *       filters: [
 *         { field: 'status', operator: FilterOperator.EQ, value: 'active' },
 *         { field: 'role', operator: FilterOperator.EQ, value: 'admin' },
 *       ],
 *     },
 *     {
 *       operator: LogicalOperator.AND,
 *       filters: [
 *         { field: 'status', operator: FilterOperator.EQ, value: 'pending' },
 *         { field: 'role', operator: FilterOperator.EQ, value: 'editor' },
 *       ],
 *     },
 *   ],
 * };
 *
 * // Build SQL condition recursively
 * function buildCondition(filter: IFilterParam | IFilterGroup): SQL {
 *   if ('operator' in filter && 'filters' in filter) {
 *     // It's an IFilterGroup
 *     const conditions = filter.filters.map(buildCondition);
 *     return filter.operator === LogicalOperator.AND
 *       ? and(...conditions)
 *       : or(...conditions);
 *   }
 *   // It's an IFilterParam
 *   return toCondition(filter);
 * }
 * ```
 *
 * @see {@link IFilterParam} for individual filter conditions
 * @see {@link LogicalOperator} for AND/OR operators
 */
export interface IFilterGroup {
  /** The logical operator to combine filters */
  readonly operator: LogicalOperator;
  /** Array of filters or nested filter groups */
  readonly filters: readonly (IFilterParam | IFilterGroup)[];
}

/**
 * Multiple filter parameters combined with implicit AND logic.
 *
 * A simple array of IFilterParam objects where all conditions must match
 * (equivalent to an IFilterGroup with AND operator). Use IFilterGroup for
 * OR logic or complex nested expressions.
 *
 * @example
 * ```typescript
 * // Simple filter list (all must match)
 * const filters: IFilterParams = [
 *   { field: 'isActive', operator: FilterOperator.EQ, value: true },
 *   { field: 'role', operator: FilterOperator.IN, value: ['admin', 'editor'] },
 *   { field: 'name', operator: FilterOperator.CONTAINS, value: 'john' },
 * ];
 *
 * // Use in repository
 * async findUsers(filters: IFilterParams): Promise<User[]> {
 *   const conditions = filters.map(filter => toCondition(filter, users));
 *   return this.db.query.users.findMany({
 *     where: and(...conditions),
 *   });
 * }
 *
 * // Combine with pagination and sorting
 * interface QueryParams {
 *   pagination: IPaginationParams;
 *   sort: ISortParams;
 *   filters: IFilterParams;
 * }
 * ```
 *
 * @see {@link IFilterParam} for individual filter conditions
 * @see {@link IFilterGroup} for complex filter expressions with OR logic
 * @see {@link IQuery} for using in CQRS queries
 * @see {@link IRepository} for using in repository methods
 */
export type IFilterParams = readonly IFilterParam[];
