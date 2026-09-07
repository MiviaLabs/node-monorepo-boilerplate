/**
 * CQRS Query types
 *
 * This module provides the core types for implementing the Query pattern
 * in a CQRS (Command Query Responsibility Segregation) architecture. Queries
 * represent requests for data that do not modify system state.
 *
 * @module cqrs/query.types
 */

/**
 * Base query interface - marker for CQRS queries.
 *
 * Queries represent requests for data without side effects. They should be
 * immutable (readonly) and contain only the parameters needed to fetch data.
 * Unlike commands, queries never modify state.
 *
 * @example
 * ```typescript
 * // Define a simple query
 * interface GetUserByIdQuery extends IQuery {
 *   readonly userId: string;
 * }
 *
 * // Define a paginated query
 * interface ListUsersQuery extends IQuery {
 *   readonly organizationId: string;
 *   readonly page: number;
 *   readonly pageSize: number;
 *   readonly search?: string;
 * }
 *
 * // Create a query instance (no need to set _brand at runtime)
 * const query: GetUserByIdQuery = {
 *   userId: 'user-123',
 * };
 * ```
 *
 * @see {@link IQueryResult} for the result type returned after query execution
 * @see {@link querySuccess} for creating successful query results
 * @see {@link queryFailure} for creating failed query results
 * @see IPaginationParams from infrastructure types for paginated queries
 */
export interface IQuery {
  /**
   * TypeScript branding property to distinguish queries from other CQRS types.
   * This is a compile-time only marker and does not need to be set at runtime.
   * @internal
   */
  readonly _brand?: 'query';
  /**
   * @deprecated Use `_brand` instead. Legacy marker property for backward compatibility.
   * @internal
   */
  readonly readonly?: true;
}

/**
 * Query result interface representing the outcome of executing a query.
 *
 * This interface provides a discriminated union pattern where `success` indicates
 * whether the query executed successfully. When successful, `data` contains
 * the result; when failed, `error` contains a single error message.
 *
 * @template T - The type of data returned on success. This is required since
 *               queries always return data when successful.
 *
 * @example
 * ```typescript
 * // Handle query result with type narrowing
 * async function handleResult(result: IQueryResult<User>) {
 *   if (result.success) {
 *     // TypeScript knows result.data exists here
 *     console.log('User found:', result.data.name);
 *   } else {
 *     // TypeScript knows result.error exists here
 *     console.error('Query failed:', result.error);
 *   }
 * }
 *
 * // Query returning a single entity
 * type UserQueryResult = IQueryResult<User>;
 *
 * // Query returning a paginated list
 * type UsersQueryResult = IQueryResult<IPaginatedResult<User>>;
 *
 * // Query returning nullable entity (not found is valid)
 * type OptionalUserResult = IQueryResult<User | null>;
 * ```
 *
 * @see {@link IQuery} for the query interface
 * @see {@link QuerySuccess} for the successful result type
 * @see {@link QueryFailure} for the failed result type
 * @see {@link querySuccess} for creating successful results
 * @see {@link queryFailure} for creating failed results
 */
export interface IQueryResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}

/**
 * Successful query result type with guaranteed data.
 *
 * This type represents a query that executed successfully and returned data.
 * The `success` property is narrowed to `true` and `data` is guaranteed to exist.
 *
 * @template T - The type of data returned. Must match the expected return type
 *               of the query handler.
 *
 * @example
 * ```typescript
 * // Type-safe access to success data
 * const result: QuerySuccess<User> = querySuccess(user);
 * console.log(result.data.id); // TypeScript knows data exists
 * console.log(result.success); // Always true
 *
 * // With paginated data
 * const listResult: QuerySuccess<IPaginatedResult<User>> = querySuccess({
 *   items: users,
 *   total: 100,
 *   page: 1,
 *   pageSize: 10,
 * });
 * ```
 *
 * @see {@link IQueryResult} for the base result interface
 * @see {@link QueryFailure} for the failed result type
 * @see {@link querySuccess} for creating QuerySuccess instances
 */
export interface QuerySuccess<T> extends IQueryResult<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * Failed query result type with guaranteed error message.
 *
 * This type represents a query that failed to execute. The `success` property
 * is narrowed to `false` and `error` is guaranteed to contain an error message.
 * Unlike command failures which support multiple errors, query failures use
 * a single error message for simplicity.
 *
 * @example
 * ```typescript
 * // Type-safe access to failure error
 * const result: QueryFailure = queryFailure('User not found');
 * console.log(result.error); // TypeScript knows error exists
 * console.log(result.success); // Always false
 *
 * // Common failure scenarios
 * const notFound = queryFailure('Resource not found');
 * const unauthorized = queryFailure('Access denied');
 * const timeout = queryFailure('Query timed out');
 * ```
 *
 * @see {@link IQueryResult} for the base result interface
 * @see {@link QuerySuccess} for the successful result type
 * @see {@link queryFailure} for creating QueryFailure instances
 */
export interface QueryFailure extends IQueryResult<never> {
  readonly success: false;
  readonly error: string;
}

/**
 * Factory function to create a successful query result.
 *
 * Use this function to return a type-safe successful result from query handlers.
 * The returned object is properly typed as `QuerySuccess<T>` with `success: true`.
 *
 * @template T - The type of the data being returned
 * @param data - The data to include in the successful result
 * @returns A QuerySuccess object with the provided data
 *
 * @example
 * ```typescript
 * // In a query handler returning a single entity
 * async execute(query: GetUserByIdQuery): Promise<IQueryResult<User>> {
 *   const user = await this.userRepository.findById(query.userId);
 *   if (!user) {
 *     return queryFailure('User not found');
 *   }
 *   return querySuccess(user);
 * }
 *
 * // Returning nullable for "not found is OK" scenarios
 * async execute(query: FindUserQuery): Promise<IQueryResult<User | null>> {
 *   const user = await this.userRepository.findByEmail(query.email);
 *   return querySuccess(user); // null is a valid success value
 * }
 *
 * // Returning paginated results
 * async execute(query: ListUsersQuery): Promise<IQueryResult<IPaginatedResult<User>>> {
 *   const result = await this.userRepository.findPaginated({
 *     page: query.page,
 *     pageSize: query.pageSize,
 *   });
 *   return querySuccess(result);
 * }
 * ```
 *
 * @see {@link QuerySuccess} for the returned type
 * @see {@link IQueryResult} for the base result interface
 * @see {@link queryFailure} for creating failed results
 */
export function querySuccess<T>(data: T): QuerySuccess<T> {
  return { success: true, data };
}

/**
 * Factory function to create a failed query result.
 *
 * Use this function to return a type-safe failed result from query handlers.
 * The returned object is properly typed as `QueryFailure` with `success: false`.
 *
 * @param error - Error message describing why the query failed.
 *                Should be user-friendly and actionable.
 * @returns A QueryFailure object with the provided error message
 *
 * @example
 * ```typescript
 * // In a query handler when entity not found
 * async execute(query: GetUserByIdQuery): Promise<IQueryResult<User>> {
 *   const user = await this.userRepository.findById(query.userId);
 *   if (!user) {
 *     return queryFailure('User not found');
 *   }
 *   return querySuccess(user);
 * }
 *
 * // Permission check failure
 * async execute(query: GetOrganizationQuery): Promise<IQueryResult<Organization>> {
 *   if (!this.canAccess(query.organizationId)) {
 *     return queryFailure('You do not have access to this organization');
 *   }
 *   // ... fetch organization
 * }
 *
 * // Using error codes from constants
 * import { ErrorCode } from '@package/constants';
 * return queryFailure(ErrorCode.RESOURCE_NOT_FOUND);
 * ```
 *
 * @see {@link QueryFailure} for the returned type
 * @see {@link IQueryResult} for the base result interface
 * @see {@link querySuccess} for creating successful results
 */
export function queryFailure(error: string): QueryFailure {
  return { success: false, error };
}
