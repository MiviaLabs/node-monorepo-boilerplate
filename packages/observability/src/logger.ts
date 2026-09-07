/**
 * Structured logging module using Pino
 *
 * This module provides a type-safe, structured logging API built on Pino.
 * It supports:
 * - Five log levels: debug, info, warn, error, fatal
 * - Structured logging with context objects
 * - Child loggers with persistent context
 * - Error serialization for stack traces
 * - Pretty printing in development mode
 *
 * @module observability/logger
 *
 * @example Basic usage
 * ```typescript
 * import { logger } from '@package/observability';
 *
 * logger.info('Application started');
 * logger.debug('Processing request', { requestId: 'req-123' });
 * logger.error('Database connection failed', new Error('Connection timeout'));
 * ```
 *
 * @example Creating a child logger with persistent context
 * ```typescript
 * const requestLogger = logger.child({
 *   requestId: 'req-123',
 *   userId: 'user-456',
 *   organizationId: 'org-789'
 * });
 *
 * // All logs from this logger include the context
 * requestLogger.info('Processing payment');
 * requestLogger.debug('Payment validated', { amount: 100 });
 * ```
 */
import pino from 'pino';

import { LogLevel } from './config';

import type { ResolvedLoggerConfig } from './config';

/**
 * Context object for structured logging.
 *
 * ILogContext provides standard fields for request tracing, multi-tenancy,
 * and user identification. These fields enable correlation of logs across
 * distributed systems and support compliance with audit requirements.
 *
 * ## Standard Fields
 *
 * - **userId**: Identifies the authenticated user performing the action.
 *   Used for audit trails and debugging user-specific issues.
 *
 * - **organizationId**: The tenant/organization context for multi-tenant systems.
 *   Critical for ensuring logs are properly scoped and for tenant isolation
 *   in debugging scenarios.
 *
 * - **requestId**: A unique identifier for the request (typically a UUID).
 *   Enables correlation of all logs generated during a single request lifecycle
 *   across multiple services.
 *
 * ## Additional Fields
 *
 * The index signature `[key: string]: unknown` allows adding custom fields
 * for domain-specific context (e.g., `orderId`, `paymentId`, `jobId`).
 *
 * @example Standard context fields
 * ```typescript
 * const context: ILogContext = {
 *   userId: 'user-123',
 *   organizationId: 'org-456',
 *   requestId: 'req-789'
 * };
 * logger.info('Order created', context);
 * ```
 *
 * @example With custom fields
 * ```typescript
 * logger.info('Payment processed', {
 *   userId: 'user-123',
 *   organizationId: 'org-456',
 *   requestId: 'req-789',
 *   orderId: 'order-abc',
 *   amount: 99.99,
 *   currency: 'USD'
 * });
 * ```
 *
 * @see {@link Logger.child} for creating loggers with persistent context
 */
export interface ILogContext {
  /**
   * Unique identifier of the authenticated user.
   * Used for audit trails and debugging user-specific issues.
   */
  userId?: string;

  /**
   * Organization/tenant identifier for multi-tenant systems.
   * Critical for tenant isolation in logs and debugging.
   */
  organizationId?: string;

  /**
   * Unique request identifier (typically a UUID).
   * Enables correlation of logs across a request lifecycle.
   */
  requestId?: string;

  /**
   * Additional custom context fields.
   *
   * Use for domain-specific data like orderId, jobId, paymentId, etc.
   *
   * ## PII Warning
   *
   * **IMPORTANT**: This index signature allows arbitrary fields, which may include
   * Personally Identifiable Information (PII). Logging PII violates compliance
   * requirements (GDPR, HIPAA, PCI DSS) and creates security risks.
   *
   * **Sensitive fields that MUST NOT be logged directly:**
   * - Authentication: `password`, `token`, `apiKey`, `secret`, `sessionToken`
   * - Personal: `email`, `phone`, `ssn`, `dateOfBirth`, `firstName`, `lastName`
   * - Financial: `creditCard`, `cardNumber`, `bankAccount`, `cvv`
   * - Network: `ipAddress`, `clientIp`
   *
   * **Required sanitization:**
   * When logging user-supplied or request-derived data, always use
   * {@link createSafeLogContext} to redact sensitive fields before logging:
   *
   * ```typescript
   * import { createSafeLogContext, logger } from '@package/observability';
   *
   * // WRONG - may expose PII
   * logger.info('User action', { email: user.email, action: 'login' });
   *
   * // CORRECT - PII is automatically redacted
   * logger.info('User action', createSafeLogContext({ email: user.email, action: 'login' }));
   * // Output: { email: '***REDACTED***', action: 'login' }
   * ```
   *
   * @see {@link createSafeLogContext} for automatic PII redaction
   * @see {@link redactObject} for redacting arbitrary objects
   */
  [key: string]: unknown;
}

/**
 * Structured logger using Pino for high-performance JSON logging.
 *
 * The Logger class provides a type-safe API for structured logging with support
 * for five severity levels, context objects, child loggers, and automatic error
 * serialization. In development mode, logs are pretty-printed for readability.
 *
 * ## Log Levels
 *
 * Levels are ordered by severity (lowest to highest):
 * 1. **debug** - Detailed information for debugging (disabled in production)
 * 2. **info** - General informational messages about application flow
 * 3. **warn** - Warning conditions that should be addressed
 * 4. **error** - Error conditions that require attention
 * 5. **fatal** - Critical errors that may cause application shutdown
 *
 * ## Context Objects
 *
 * All log methods accept an optional {@link ILogContext} parameter for structured
 * data. Context is merged with the base context (environment, service name) and
 * serialized as JSON fields alongside the message.
 *
 * ## Child Loggers
 *
 * Use {@link Logger.child} to create loggers with persistent context. This is
 * ideal for request-scoped logging where userId, organizationId, and requestId
 * should be included in every log entry.
 *
 * @example Basic usage
 * ```typescript
 * import { Logger } from '@package/observability';
 *
 * const logger = new Logger({
 *   level: LogLevel.INFO,
 *   isDevelopment: true,
 *   environment: 'development',
 *   serviceName: 'my-app',
 *   prettyOptions: { colorize: true }
 * });
 *
 * logger.info('Application started');
 * logger.debug('Debug info', { details: 'verbose data' });
 * logger.error('Something went wrong', new Error('Connection failed'));
 * ```
 *
 * @example Request-scoped logging with child logger
 * ```typescript
 * // In middleware or request handler
 * const requestLogger = logger.child({
 *   requestId: req.id,
 *   userId: req.user?.id,
 *   organizationId: req.user?.organizationId
 * });
 *
 * requestLogger.info('Processing request');
 * // Output includes: requestId, userId, organizationId in every log
 * ```
 *
 * @see {@link ILogContext} for context field documentation
 * @see {@link logger} for the pre-configured global logger instance
 */
export class Logger {
  /** @internal */
  private internalLogger: pino.Logger;
  /** @internal */
  private config: ResolvedLoggerConfig;

  /**
   * Creates a new Logger instance.
   *
   * @param config - Logger configuration. If not provided, uses environment
   *                 variables and sensible defaults.
   *
   * @example With explicit configuration
   * ```typescript
   * const logger = new Logger({
   *   level: LogLevel.DEBUG,
   *   isDevelopment: true,
   *   environment: 'development',
   *   serviceName: 'api',
   *   prettyOptions: {
   *     colorize: true,
   *     translateTime: 'HH:MM:ss Z',
   *     ignore: 'pid,hostname'
   *   }
   * });
   * ```
   *
   * @example Using defaults from environment
   * ```typescript
   * // Uses LOG_LEVEL, NODE_ENV, SERVICE_NAME from environment
   * const logger = new Logger();
   * ```
   */
  constructor(config?: ResolvedLoggerConfig) {
    // Default configuration if not provided
    this.config = config ?? {
      level: LogLevel.INFO,
      isDevelopment: process.env['NODE_ENV'] === 'development',
      prettyOptions: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      },
      environment: process.env['NODE_ENV'] ?? 'development',
      serviceName: process.env['SERVICE_NAME'] ?? 'api'
    };

    this.internalLogger = pino({
      level: this.config.level,
      formatters: {
        level: (label: string) => ({ level: label })
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        error: pino.stdSerializers.err
      },
      ...(this.config.isDevelopment && {
        transport: {
          target: 'pino-pretty',
          options: this.config.prettyOptions
        }
      })
    });
  }

  /**
   * Builds the complete context object by merging provided context with base fields.
   *
   * @param context - Optional additional context to include
   * @returns Complete context object with environment and service name
   * @internal
   */
  private buildContext(context?: ILogContext): Record<string, unknown> {
    return {
      ...context,
      environment: this.config.environment,
      service: this.config.serviceName
    };
  }

  /**
   * Logs a message at DEBUG level.
   *
   * Use debug for detailed information useful during development and debugging.
   * Debug logs are typically disabled in production environments via the log level
   * configuration.
   *
   * **When to use:**
   * - Detailed diagnostic information for troubleshooting
   * - Variable values, state transitions, function entry/exit
   * - Information useful only during development
   * - Performance profiling data
   *
   * @param message - The log message describing what happened
   * @param context - Optional structured context data
   *
   * @example
   * ```typescript
   * logger.debug('Processing user request', {
   *   userId: 'user-123',
   *   requestId: 'req-abc',
   *   payload: { action: 'update', field: 'email' }
   * });
   * ```
   *
   * @example Detailed debugging information
   * ```typescript
   * logger.debug('Cache lookup', {
   *   key: 'user:123:profile',
   *   hit: false,
   *   ttl: 3600
   * });
   * ```
   */
  debug(message: string, context?: ILogContext): void {
    this.internalLogger.debug(this.buildContext(context), message);
  }

  /**
   * Logs a message at INFO level.
   *
   * Use info for general informational messages about normal application operation.
   * Info logs should provide a clear picture of application flow without being
   * too verbose.
   *
   * **When to use:**
   * - Application lifecycle events (startup, shutdown)
   * - Successful completion of significant operations
   * - Configuration loaded, connections established
   * - Business events (user registered, order placed)
   *
   * @param message - The log message describing what happened
   * @param context - Optional structured context data
   *
   * @example
   * ```typescript
   * logger.info('User registered successfully', {
   *   userId: 'user-123',
   *   organizationId: 'org-456',
   *   registrationSource: 'web-signup'
   * });
   * ```
   *
   * @example Application lifecycle events
   * ```typescript
   * logger.info('Database connection established', {
   *   host: 'localhost',
   *   database: 'myapp',
   *   poolSize: 10
   * });
   * ```
   */
  info(message: string, context?: ILogContext): void {
    this.internalLogger.info(this.buildContext(context), message);
  }

  /**
   * Logs a message at WARN level.
   *
   * Use warn for potentially harmful situations or unexpected conditions that
   * don't prevent the application from functioning but should be investigated.
   *
   * **When to use:**
   * - Deprecated feature usage
   * - Recoverable errors (e.g., retry succeeded after failure)
   * - Missing optional configuration
   * - Performance degradation detected
   * - Approaching resource limits (memory, connections)
   *
   * @param message - The log message describing the warning condition
   * @param context - Optional structured context data
   *
   * @example
   * ```typescript
   * logger.warn('Rate limit approaching', {
   *   userId: 'user-123',
   *   requestsRemaining: 10,
   *   resetTime: '2024-01-01T12:00:00Z'
   * });
   * ```
   *
   * @example Deprecated feature usage
   * ```typescript
   * logger.warn('Deprecated API endpoint called', {
   *   endpoint: '/api/v1/users',
   *   deprecatedSince: '2024-01-01',
   *   useInstead: '/api/v2/users',
   *   requestId: 'req-abc'
   * });
   * ```
   */
  warn(message: string, context?: ILogContext): void {
    this.internalLogger.warn(this.buildContext(context), message);
  }

  /**
   * Logs a message at ERROR level with optional error object.
   *
   * Use error for error conditions that affect the current operation but allow
   * the application to continue running. The error parameter is automatically
   * serialized to include the error name, message, and stack trace.
   *
   * **Error Serialization:**
   * When an Error object is provided, it is serialized using Pino's standard
   * error serializer, which extracts:
   * - `type`: The error constructor name (e.g., 'TypeError')
   * - `message`: The error message
   * - `stack`: The full stack trace
   *
   * Non-Error values are logged as-is in the `error` field.
   *
   * **When to use:**
   * - Failed operations (database query failed, API call failed)
   * - Caught exceptions that need logging
   * - Validation errors
   * - External service failures
   *
   * @param message - The log message describing the error
   * @param error - Optional error object or value to serialize
   * @param context - Optional structured context data
   *
   * @example With Error object
   * ```typescript
   * try {
   *   await database.query(sql);
   * } catch (err) {
   *   logger.error('Database query failed', err, {
   *     userId: 'user-123',
   *     query: 'SELECT * FROM users',
   *     requestId: 'req-abc'
   *   });
   * }
   * ```
   *
   * @example With context only (no error object)
   * ```typescript
   * logger.error('Payment processing failed', undefined, {
   *   orderId: 'order-123',
   *   paymentMethod: 'credit_card',
   *   errorCode: 'INSUFFICIENT_FUNDS'
   * });
   * ```
   */
  error(message: string, error?: Error | unknown, context?: ILogContext): void {
    this.internalLogger.error(
      {
        ...this.buildContext(context),
        error: error instanceof Error ? pino.stdSerializers.err(error) : error
      },
      message
    );
  }

  /**
   * Logs a message at FATAL level with optional error object.
   *
   * Use fatal for critical errors that require immediate attention and may cause
   * the application to terminate. Fatal logs indicate the application cannot
   * continue normal operation.
   *
   * **Error Serialization:**
   * When an Error object is provided, it is serialized using Pino's standard
   * error serializer, which extracts:
   * - `type`: The error constructor name (e.g., 'TypeError')
   * - `message`: The error message
   * - `stack`: The full stack trace
   *
   * Non-Error values are logged as-is in the `error` field.
   *
   * **When to use:**
   * - Application startup failures (cannot connect to database)
   * - Missing critical configuration
   * - Unrecoverable errors requiring restart
   * - Security breaches detected
   * - Data corruption detected
   *
   * @param message - The log message describing the fatal condition
   * @param error - Optional error object or value to serialize
   * @param context - Optional structured context data
   *
   * @example Critical startup failure
   * ```typescript
   * try {
   *   await connectToDatabase();
   * } catch (err) {
   *   logger.fatal('Failed to connect to database', err, {
   *     host: config.dbHost,
   *     database: config.dbName
   *   });
   *   process.exit(1);
   * }
   * ```
   *
   * @example Security breach detected
   * ```typescript
   * logger.fatal('Security breach detected', undefined, {
   *   type: 'unauthorized_access',
   *   affectedUsers: 1500,
   *   detectedAt: new Date().toISOString()
   * });
   * ```
   */
  fatal(message: string, error?: Error | unknown, context?: ILogContext): void {
    this.internalLogger.fatal(
      {
        ...this.buildContext(context),
        error: error instanceof Error ? pino.stdSerializers.err(error) : error
      },
      message
    );
  }

  /**
   * Creates a child logger with persistent context.
   *
   * Child loggers inherit the parent's configuration and include the provided
   * context in every log entry. This is ideal for request-scoped logging where
   * common fields (userId, organizationId, requestId) should be automatically
   * included in all logs within a request lifecycle.
   *
   * ## Use Cases
   *
   * - **Request-scoped logging**: Create a child logger at the start of a request
   *   with requestId, userId, and organizationId. All subsequent logs automatically
   *   include these fields.
   *
   * - **Module-scoped logging**: Create a child logger with module-specific context
   *   (e.g., `{ module: 'payment-service' }`) to identify log sources.
   *
   * - **Job-scoped logging**: For background jobs, create a child logger with
   *   jobId and jobType for correlation.
   *
   * ## Performance
   *
   * Child loggers are lightweight. The context is stored by reference and merged
   * at log time, so creating many child loggers has minimal overhead.
   *
   * @param context - Persistent context to include in all log entries from this logger
   * @returns A new Logger instance with the merged context
   *
   * @example Request-scoped logging
   * ```typescript
   * // In middleware
   * function loggingMiddleware(req, res, next) {
   *   req.logger = logger.child({
   *     requestId: req.id,
   *     userId: req.user?.id,
   *     organizationId: req.user?.organizationId,
   *     path: req.path,
   *     method: req.method
   *   });
   *   next();
   * }
   *
   * // In route handler
   * app.get('/users', (req, res) => {
   *   req.logger.info('Fetching users');
   *   // Log output: { requestId, userId, organizationId, path, method, ... }
   * });
   * ```
   *
   * @example Nested child loggers
   * ```typescript
   * const serviceLogger = logger.child({ service: 'payment' });
   * const requestLogger = serviceLogger.child({ requestId: 'req-123' });
   *
   * requestLogger.info('Processing payment');
   * // Output includes both: { service: 'payment', requestId: 'req-123', ... }
   * ```
   *
   * @example Background job logging
   * ```typescript
   * async function processJob(job: Job) {
   *   const jobLogger = logger.child({
   *     jobId: job.id,
   *     jobType: job.type,
   *     queueName: job.queue.name
   *   });
   *
   *   jobLogger.info('Job started');
   *   // ... process job
   *   jobLogger.info('Job completed', { duration: Date.now() - startTime });
   * }
   * ```
   */
  child(context: ILogContext): Logger {
    // Use Object.create to avoid running constructor and creating a wasteful Pino instance
    // that would be immediately discarded when we set internalLogger to the child
    const childLogger = Object.create(Logger.prototype) as Logger;
    childLogger.config = this.config;
    childLogger.internalLogger = this.internalLogger.child(context);
    return childLogger;
  }
}

/**
 * Global logger instance with default configuration.
 *
 * This is a lazily-initialized singleton logger that reads configuration from
 * environment variables. It's the recommended logger for most use cases.
 *
 * ## Environment Variables
 *
 * - **LOG_LEVEL**: Log level (`debug`, `info`, `warn`, `error`, `fatal`).
 *   Default: `info`
 * - **NODE_ENV**: Environment name, also controls pretty-printing.
 *   Default: `development` (enables pretty-printing)
 * - **SERVICE_NAME**: Service identifier included in all log entries.
 *   Default: `api`
 *
 * ## Lazy Initialization
 *
 * The logger is initialized on first use, allowing environment variables to
 * be set before the logger is accessed. This is implemented using a Proxy
 * to provide the same API as a Logger instance.
 *
 * @example Basic usage
 * ```typescript
 * import { logger } from '@package/observability';
 *
 * logger.info('Application started');
 * logger.debug('Debug message', { key: 'value' });
 * logger.error('Operation failed', new Error('Details'));
 * ```
 *
 * @example Creating child logger from global instance
 * ```typescript
 * import { logger } from '@package/observability';
 *
 * const requestLogger = logger.child({
 *   requestId: req.id,
 *   userId: req.user?.id
 * });
 *
 * requestLogger.info('Processing request');
 * ```
 *
 * @see {@link Logger} for the Logger class documentation
 * @see {@link ILogContext} for context field documentation
 */
let globalLoggerInstance: Logger | undefined;

/**
 * Retrieves or creates the global logger instance.
 *
 * @returns The global Logger instance
 * @internal
 */
function getGlobalLogger(): Logger {
  if (globalLoggerInstance === undefined) {
    globalLoggerInstance = new Logger();
  }
  return globalLoggerInstance;
}

/**
 * Pre-configured global logger instance.
 *
 * This is the primary entry point for logging in most applications. The logger
 * is lazily initialized on first use and configured via environment variables.
 *
 * @example
 * ```typescript
 * import { logger } from '@package/observability';
 *
 * logger.info('Server listening', { port: 3000 });
 * logger.error('Failed to process request', error, { requestId: 'abc' });
 * ```
 */
export const logger = new Proxy({} as Logger, {
  get(_target, property, receiver) {
    const instance = getGlobalLogger();
    const value = Reflect.get(instance as unknown as object, property, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  }
}) as Logger;
