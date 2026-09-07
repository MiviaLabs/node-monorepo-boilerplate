/**
 * CQRS Command types
 *
 * This module provides the core types for implementing the Command pattern
 * in a CQRS (Command Query Responsibility Segregation) architecture. Commands
 * represent intentions to change the state of the system.
 *
 * @module cqrs/command.types
 */

/**
 * Base command interface - marker for CQRS commands.
 *
 * Commands represent an intention to perform an action that modifies system state.
 * All commands should be immutable (readonly) and contain the data needed to
 * execute the action.
 *
 * @example
 * ```typescript
 * // Define a command with required data
 * interface CreateUserCommand extends ICommand {
 *   readonly email: string;
 *   readonly name: string;
 *   readonly organizationId: string;
 * }
 *
 * // Create a command instance (no need to set _brand at runtime)
 * const command: CreateUserCommand = {
 *   email: 'user@example.com',
 *   name: 'John Doe',
 *   organizationId: 'org-123',
 * };
 * ```
 *
 * @see {@link ICommandResult} for the result type returned after command execution
 * @see {@link commandSuccess} for creating successful command results
 * @see {@link commandFailure} for creating failed command results
 */
export interface ICommand {
  /**
   * TypeScript branding property to distinguish commands from other CQRS types.
   * This is a compile-time only marker and does not need to be set at runtime.
   * @internal
   */
  readonly _brand?: 'command';
  /**
   * @deprecated Use `_brand` instead. Legacy marker property for backward compatibility.
   * @internal
   */
  readonly readonly?: true;
}

/**
 * Command result interface representing the outcome of executing a command.
 *
 * This is the base interface for command results. Note that `success` is typed
 * as `boolean`, so type narrowing via `if (result.success)` does not work with
 * this interface directly. For proper discriminated union narrowing, use
 * `CommandSuccess<T> | CommandFailure` instead.
 *
 * @template T - The type of data returned on success. Defaults to `void` for
 *               commands that don't return data.
 *
 * @example
 * ```typescript
 * // For type narrowing, use the union type instead of ICommandResult
 * async function handleResult(result: CommandSuccess<User> | CommandFailure) {
 *   if (result.success) {
 *     // TypeScript knows result.data exists here
 *     console.log('User created:', result.data.id);
 *   } else {
 *     // TypeScript knows result.errors exists here
 *     console.error('Failed:', result.errors.join(', '));
 *   }
 * }
 *
 * // Use ICommandResult as the handler return type (allows either success/failure)
 * type CreateUserResult = ICommandResult<User>;
 *
 * // Command that returns void (no data on success)
 * type DeleteResult = ICommandResult<void>;
 * ```
 *
 * @see {@link ICommand} for the command interface
 * @see {@link CommandSuccess} for the successful result type (use for narrowing)
 * @see {@link CommandFailure} for the failed result type (use for narrowing)
 * @see {@link commandSuccess} for creating successful results
 * @see {@link commandFailure} for creating failed results
 */
export interface ICommandResult<T = void> {
  readonly success: boolean;
  readonly data?: T;
  readonly errors?: readonly string[];
}

/**
 * Successful command result type with guaranteed data.
 *
 * This type represents a command that executed successfully and returned data.
 * The `success` property is narrowed to `true` and `data` is guaranteed to exist.
 *
 * @template T - The type of data returned. Must match the expected return type
 *               of the command handler.
 *
 * @example
 * ```typescript
 * // Type-safe access to success data
 * const result: CommandSuccess<User> = commandSuccess(createdUser);
 * console.log(result.data.id); // TypeScript knows data exists
 * console.log(result.success); // Always true
 * ```
 *
 * @see {@link ICommandResult} for the base result interface
 * @see {@link CommandFailure} for the failed result type
 * @see {@link commandSuccess} for creating CommandSuccess instances
 */
export interface CommandSuccess<T> extends ICommandResult<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * Failed command result type with guaranteed error messages.
 *
 * This type represents a command that failed to execute. The `success` property
 * is narrowed to `false` and `errors` is guaranteed to contain at least one
 * error message via the non-empty tuple type.
 *
 * @example
 * ```typescript
 * // Type-safe access to failure errors
 * const result: CommandFailure = commandFailure('Email already exists');
 * console.log(result.errors); // TypeScript knows errors exists and has at least one
 * console.log(result.success); // Always false
 *
 * // Multiple error messages
 * const validationFailure = commandFailure(
 *   'Email is required',
 *   'Name must be at least 2 characters',
 * );
 * ```
 *
 * @see {@link ICommandResult} for the base result interface
 * @see {@link CommandSuccess} for the successful result type
 * @see {@link commandFailure} for creating CommandFailure instances
 */
export interface CommandFailure extends ICommandResult {
  readonly success: false;
  readonly errors: readonly [string, ...string[]];
}

/**
 * Factory function to create a successful command result.
 *
 * Use this function to return a type-safe successful result from command handlers.
 * The returned object is properly typed as `CommandSuccess<T>` with `success: true`.
 *
 * @template T - The type of the data being returned
 * @param data - The data to include in the successful result
 * @returns A CommandSuccess object with the provided data
 *
 * @example
 * ```typescript
 * // In a command handler returning created entity
 * async execute(command: CreateUserCommand): Promise<ICommandResult<User>> {
 *   const user = await this.userRepository.create(command);
 *   return commandSuccess(user);
 * }
 *
 * // Returning void for commands with no return value
 * async execute(command: DeleteUserCommand): Promise<ICommandResult<void>> {
 *   await this.userRepository.delete(command.userId);
 *   return commandSuccess(undefined);
 * }
 *
 * // With explicit type parameter
 * const result = commandSuccess<User>(createdUser);
 * ```
 *
 * @see {@link CommandSuccess} for the returned type
 * @see {@link ICommandResult} for the base result interface
 * @see {@link commandFailure} for creating failed results
 */
export function commandSuccess<T>(data: T): CommandSuccess<T> {
  return { success: true, data };
}

/**
 * Factory function to create a failed command result.
 *
 * Use this function to return a type-safe failed result from command handlers.
 * The returned object is properly typed as `CommandFailure` with `success: false`.
 * Requires at least one error message to enforce non-empty errors array.
 *
 * @param error - The first (required) error message
 * @param moreErrors - Additional error messages
 * @returns A CommandFailure object with the provided error messages
 *
 * @example
 * ```typescript
 * // In a command handler with validation failure
 * async execute(command: CreateUserCommand): Promise<ICommandResult<User>> {
 *   const existingUser = await this.userRepository.findByEmail(command.email);
 *   if (existingUser) {
 *     return commandFailure('A user with this email already exists');
 *   }
 *   // ... create user
 * }
 *
 * // Multiple validation errors
 * return commandFailure(
 *   'Email is required',
 *   'Name is required',
 *   'Password must be at least 8 characters',
 * );
 *
 * // Using error codes from constants
 * import { ErrorCode } from '@package/constants';
 * return commandFailure(ErrorCode.USER_NOT_FOUND);
 * ```
 *
 * @see {@link CommandFailure} for the returned type
 * @see {@link ICommandResult} for the base result interface
 * @see {@link commandSuccess} for creating successful results
 */
export function commandFailure(error: string, ...moreErrors: string[]): CommandFailure {
  return { success: false, errors: [error, ...moreErrors] };
}
