/**
 * Domain-Driven Design: Result type
 *
 * This module provides the Result pattern for domain operations, following
 * functional programming principles for explicit error handling. Instead of
 * throwing exceptions, operations return Result types that must be explicitly
 * handled, making error cases visible in the type system.
 *
 * Key benefits:
 * - **Explicit errors**: Error cases are visible in function signatures
 * - **Type safety**: Compiler ensures errors are handled
 * - **Composability**: Results can be chained with map/flatMap
 * - **No exceptions**: Eliminates unexpected runtime errors
 *
 * This module re-exports all Result-related types and functions from
 * their specialized sub-modules for convenient single-import usage.
 *
 * @module domain/result.types
 */

// Core Result types and functions
export type { Result } from './result.core';
export { success, failure, isSuccess, isFailure, map, flatMap } from './result.core';

// Result utility functions
export { mapError, getOrElse, getOrThrow, combine, combineAll } from './result.utilities';

// Async Result utilities
export type { AsyncResult } from './result.async';
export { fromPromise, sequence, tryCatch } from './result.async';

// Validation Result utilities
export type { ValidationResult, IValidationError } from './result.validation';
export { validationError, combineValidation } from './result.validation';
