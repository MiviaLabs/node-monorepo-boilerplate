/**
 * RegisteredError Exception Class
 *
 * Framework-agnostic exception class that represents a registered error
 * from the error registry. Extends the native Error class for maximum
 * compatibility across platforms.
 *
 * @packageDocumentation
 */

import { LocaleContext } from '../i18n/locale-context';
import { TranslationService } from '../i18n/translation.service';
import { getErrorDefinition } from '../registry/definitions/index';
import { deepFreeze } from '../utils/deep-freeze';

import type { TranslationResult } from '../i18n/i18n.types';
import type {
  ErrorCode,
  ErrorDefinition,
  ErrorMetadata,
  ErrorParameters
} from '../registry/error-registry.types';

/**
 * RegisteredError - Framework-agnostic exception for registered errors
 *
 * This class extends the native Error class and adds error registry
 * integration with parameter interpolation and metadata support.
 *
 * Key features:
 * - Framework-agnostic (works with NestJS, Next.js, vanilla Node.js)
 * - Type-safe error codes from the registry
 * - Parameter interpolation for message formatting
 * - Separate metadata for debugging (not shown to users)
 * - HTTP status code property for API responses
 * - Deprecation warnings in development
 *
 * @example
 * ```ts
 * throw new RegisteredError('USER_001', { userId: '123' });
 * // Error: User with ID 123 not found
 * ```
 *
 * @example
 * ```ts
 * throw new RegisteredError('AUTH_001', {}, { requestId: 'abc-123' });
 * // Error: Invalid email or password
 * // Metadata: { requestId: 'abc-123' }
 * ```
 */
export class RegisteredError extends Error {
  /**
   * Unique error code from the registry (e.g., USER_001, AUTH_002)
   */
  public readonly code: ErrorCode;

  /**
   * Error definition from the registry (immutable reference)
   */
  public readonly definition: ErrorDefinition;

  /**
   * Parameters for message interpolation (user-facing values)
   * These are inserted into the error message template
   */
  public readonly parameters: ErrorParameters;

  /**
   * Additional metadata for debugging and logging
   * This is NOT shown to end users, only used internally
   */
  public readonly metadata: ErrorMetadata;

  /**
   * HTTP status code for API responses
   * This property allows frameworks to map errors to HTTP status codes
   */
  public readonly httpStatus: number;

  /**
   * Timestamp when the error was created
   */
  public readonly timestamp: string;

  /**
   * Get the translated error message
   *
   * This getter automatically translates the error message using the locale
   * from LocaleContext (set by LocaleContextMiddleware). It provides automatic
   * translation without requiring manual locale passing.
   *
   * The message property contains the interpolated English message (for backward compatibility),
   * while this getter returns the locale-specific translation.
   *
   * @returns Translation result with message, locale, and metadata
   *
   * @example
   * ```ts
   * // In middleware (LocaleContextMiddleware sets locale)
   * app.use((req, res, next) => {
   *   const locale = extractLocaleFromRequest(req);
   *   LocaleContext.run(locale, next);
   * });
   *
   * // In error handler
   * const error = new RegisteredError('USER_001', { userId: '123' });
   * console.log(error.message); // "User with ID 123 not found" (interpolated English)
   * console.log(error.translated.message); // "المستخدم بالمعرف 123 غير موجود" (translated to ar-SA)
   * console.log(error.translated.locale); // "ar-SA" (current request locale)
   * ```
   */
  public get translated(): TranslationResult {
    // Get locale from LocaleContext (set by middleware)
    const locale = LocaleContext.getLocale();

    // Translate using TranslationService
    return TranslationService.translate(this.code, this.parameters, { locale });
  }

  /**
   * Creates a new RegisteredError instance
   *
   * @param code - Error code from the registry (e.g., 'USER_001')
   * @param parameters - Parameters for message interpolation (optional)
   * @param metadata - Additional debugging context (optional)
   *
   * @throws {Error} If error code is not found in registry
   *
   * @example
   * ```ts
   * throw new RegisteredError('USER_001', { userId: '123' });
   * ```
   *
   * @example
   * ```ts
   * throw new RegisteredError(
   *   'AUTH_004',
   *   { requiredPermission: 'admin' },
   *   { requestId: 'abc-123', userId: '456' }
   * );
   * ```
   */
  constructor(
    code: ErrorCode,
    parameters: ErrorParameters = {},
    metadata: ErrorMetadata = {},
    skipValidation = false
  ) {
    // Get error definition from registry
    const definition = getErrorDefinition(code);

    if (!definition) {
      throw new Error(`Error code "${code}" not found in registry`);
    }

    // Validate parameters against definition (unless skipped for fromError conversion)
    if (!skipValidation && definition.parameters && definition.parameters.length > 0) {
      RegisteredError.validateParameters(code, parameters, definition.parameters);
    }

    // Call parent Error constructor with interpolated message
    // This maintains backward compatibility - error.message contains the interpolated English message
    // The translated getter provides locale-specific translations
    super(RegisteredError.interpolateMessage(definition.message, parameters));

    // Set error name to the code for easy identification
    this.name = code;

    // Set properties (deep freeze for immutability)
    this.code = code;
    this.definition = definition as ErrorDefinition; // Type assertion since we validated above
    this.parameters = deepFreeze({ ...parameters });
    this.metadata = deepFreeze({ ...metadata });
    this.httpStatus = definition.httpStatus;
    this.timestamp = new Date().toISOString();

    // Make primitive properties truly read-only at runtime
    // (readonly modifier only provides compile-time checks)
    Object.defineProperty(this, 'code', { value: this.code, writable: false, configurable: false });
    Object.defineProperty(this, 'definition', {
      value: this.definition,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'parameters', {
      value: this.parameters,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'metadata', {
      value: this.metadata,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'httpStatus', {
      value: this.httpStatus,
      writable: false,
      configurable: false
    });
    Object.defineProperty(this, 'timestamp', {
      value: this.timestamp,
      writable: false,
      configurable: false
    });

    // Emit deprecation warning in development if applicable
    if (definition.deprecationMessage && process['env']['NODE_ENV'] !== 'production') {
      console.warn(`[DEPRECATION] ${code}: ${definition.deprecationMessage}`);
    }

    // Maintain proper stack trace (V8-only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RegisteredError);
    }
  }

  /**
   * Interpolates parameters into the error message template
   *
   * @param template - Message template with {parameter} placeholders
   * @param parameters - Parameter values to insert
   * @returns Interpolated message string
   *
   * @example
   * ```ts
   * const message = interpolateMessage(
   *   'User {name} has {count} items',
   *   { name: 'John', count: 5 }
   * );
   * // Returns: "User John has 5 items"
   * ```
   */
  private static interpolateMessage(template: string, parameters: ErrorParameters): string {
    let message = template;

    for (const [key, value] of Object.entries(parameters)) {
      // Skip undefined values - leave the placeholder in place rather than
      // substituting the literal string "undefined".
      if (value === undefined) {
        continue;
      }
      const placeholder = `{${key}}`;
      // Escape `$` in the replacement value so the `replace` second-argument
      // special patterns (`$&`, `$'`, `` $` ``, `$$`, `$1`-`$9`) are not
      // expanded against the matched text.
      message = message.replace(new RegExp(placeholder, 'g'), String(value).replace(/\$/g, '$$$$'));
    }

    return message;
  }

  /**
   * Validates a single parameter value against its type definition
   *
   * @param value - The value to validate
   * @param type - The expected type
   * @returns True if the value is valid for the given type
   */
  private static validateParameterValue(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        // Check if value is a Date instance or a valid date string
        if (value instanceof Date) {
          // For Date instances, check if it's valid (not InvalidDate)
          return !isNaN(value.getTime());
        }
        if (typeof value === 'string') {
          // For strings, parse and validate the date
          const parsedDate = new Date(value);
          return !isNaN(parsedDate.getTime()) && parsedDate.toISOString() !== 'Invalid Date';
        }
        return false;
      case 'object':
        return typeof value === 'object' && value !== null;
      default:
        return false;
    }
  }

  /**
   * Validates parameters against the error definition
   *
   * @param code - Error code
   * @param parameters - Provided parameters
   * @param paramDefinitions - Parameter definitions from registry
   * @throws {Error} If required parameters are missing or invalid
   */
  private static validateParameters(
    code: string,
    parameters: ErrorParameters,
    paramDefinitions: readonly { name: string; required: boolean; type: string }[]
  ): void {
    const missing: string[] = [];
    const invalid: string[] = [];

    for (const paramDef of paramDefinitions) {
      const value = parameters[paramDef.name];

      // Check required parameters (undefined is allowed for optional params)
      if (paramDef.required && (value === undefined || !(paramDef.name in parameters))) {
        missing.push(paramDef.name);
        continue;
      }

      // Validate parameter types if present and not undefined
      // Optional parameters can be explicitly set to undefined
      if (paramDef.name in parameters && value !== undefined) {
        if (!this.validateParameterValue(value, paramDef.type)) {
          invalid.push(`${paramDef.name} (expected ${paramDef.type})`);
        }
      }
    }

    // Throw if validation failed
    if (missing.length > 0 || invalid.length > 0) {
      const errors: string[] = [];
      if (missing.length > 0) {
        errors.push(`Missing required parameters: ${missing.join(', ')}`);
      }
      if (invalid.length > 0) {
        errors.push(`Invalid parameters: ${invalid.join(', ')}`);
      }
      throw new Error(`Invalid parameters for error code ${code}: ${errors.join('. ')}`);
    }
  }

  /**
   * Converts the error to a plain object for serialization
   *
   * This is useful for logging, API responses, and debugging.
   *
   * @returns Plain object representation of the error
   *
   * @example
   * ```ts
   * const error = new RegisteredError('USER_001', { userId: '123' });
   * console.log(error.toJSON());
   * // {
   * //   code: 'USER_001',
   * //   message: 'User with ID 123 not found',
   * //   parameters: { userId: '123' },
   * //   metadata: {},
   * //   httpStatus: 404,
   * //   timestamp: '2024-01-01T00:00:00.000Z'
   * // }
   * ```
   */
  public toJSON(): {
    code: string;
    message: string;
    parameters: ErrorParameters;
    metadata: ErrorMetadata;
    httpStatus: number;
    timestamp: string;
    stack?: string;
  } {
    const result: {
      code: string;
      message: string;
      parameters: ErrorParameters;
      metadata: ErrorMetadata;
      httpStatus: number;
      timestamp: string;
      stack?: string;
    } = {
      code: this.code,
      message: this.message,
      parameters: this.parameters,
      metadata: this.metadata,
      httpStatus: this.httpStatus,
      timestamp: this.timestamp
    };
    if (this.stack !== undefined) {
      result.stack = this.stack;
    }
    return result;
  }

  /**
   * Checks if an error is a RegisteredError instance
   *
   * @param error - Error to check
   * @returns True if error is a RegisteredError
   *
   * @example
   * ```ts
   * try {
   *   // some operation
   * } catch (error) {
   *   if (RegisteredError.isRegisteredError(error)) {
   *     console.log(error.code);
   *   }
   * }
   * ```
   */
  public static isRegisteredError(error: unknown): error is RegisteredError {
    return error instanceof RegisteredError;
  }

  /**
   * Converts a standard Error to RegisteredError if possible
   *
   * If the error message contains a known error code, it will be
   * converted to a RegisteredError with that code.
   *
   * @param error - Error to convert
   * @returns RegisteredError or original error
   *
   * @example
   * ```ts
   * try {
   *   // some operation
   * } catch (error) {
   *   const registered = RegisteredError.fromError(error);
   *   throw registered;
   * }
   * ```
   */
  public static fromError(error: unknown): RegisteredError | Error {
    if (RegisteredError.isRegisteredError(error)) {
      return error;
    }

    if (error instanceof Error) {
      // Try to extract error code from message anywhere in the string
      // Pattern matches: CODE_XXX, CODE_XXX: message, or message ends with CODE_XXX
      const codeMatch = error.message.match(/([A-Z]+_\d+)/);
      if (codeMatch) {
        const code = codeMatch[1] as ErrorCode;
        if (getErrorDefinition(code)) {
          // Skip validation since we're converting from existing error
          return new RegisteredError(code, {}, { originalError: error.message }, true);
        }
      }
    }

    // Return as-is if not convertible
    return error as Error;
  }
}
