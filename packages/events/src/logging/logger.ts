/**
 * Shared logger utility for events package
 *
 * Provides structured logging with configurable output.
 * In production, integrate with Winston, Pino, or your preferred logger.
 *
 * @example
 * ```typescript
 * import { logger } from './logging/logger';
 *
 * logger.info('Event published', { eventId: '123', topic: 'user-created' });
 * logger.warn('Retry attempt failed', { attempt: 3, maxRetries: 5 });
 * logger.error('Kafka connection failed', { error: err.message });
 * ```
 */

/**
 * Log level enum for type-safe logging
 */
export enum LogLevel {
  Info = 'info',
  Warn = 'warn',
  Error = 'error'
}

/**
 * Log entry structure for structured logging
 */
export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly [key: string]: unknown;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /**
   * Enable/disable console output
   * @default true
   */
  readonly consoleEnabled?: boolean;

  /**
   * Minimum log level to output
   * @default LogLevel.Info
   */
  readonly minLevel?: LogLevel;

  /**
   * Custom log handler
   * Use this to integrate with your preferred logging library
   */
  readonly handler?: (entry: LogEntry) => void;
}

/**
 * Logger class for structured logging
 */
export class Logger {
  private config: Required<LoggerConfig>;
  private customHandler?: (entry: LogEntry) => void;
  private readonly levelOrder: Record<LogLevel, number> = {
    [LogLevel.Info]: 0,
    [LogLevel.Warn]: 1,
    [LogLevel.Error]: 2
  };

  constructor(config: LoggerConfig = {}) {
    this.customHandler = config.handler;
    this.config = {
      consoleEnabled: config.consoleEnabled ?? true,
      minLevel: config.minLevel ?? LogLevel.Info,
      handler: config.handler ?? this.defaultHandler()
    };
  }

  private defaultHandler(): (entry: LogEntry) => void {
    return (entry: LogEntry): void => {
      // Explicitly check if console is disabled
      if (this.config.consoleEnabled === false) {
        return;
      }

      const logMethod =
        entry.level === LogLevel.Error
          ? console.error
          : entry.level === LogLevel.Warn
            ? console.warn
            : // eslint-disable-next-line no-console
              console.log;

      logMethod(JSON.stringify(entry));
    };
  }

  /**
   * Update the logger configuration
   *
   * Passing `handler: undefined` EXPLICITLY resets to the default console
   * handler; omitting the key keeps the current handler.
   *
   * @param config - New configuration values to merge with existing config
   */
  setConfig(config: Partial<LoggerConfig>): void {
    if ('handler' in config) {
      this.customHandler = config.handler;
    }
    this.config = {
      consoleEnabled: config.consoleEnabled ?? this.config.consoleEnabled,
      minLevel: config.minLevel ?? this.config.minLevel,
      handler: this.customHandler ?? this.defaultHandler()
    };
  }

  /**
   * Log an info message
   *
   * @param message - Log message
   * @param meta - Optional metadata to include in the log entry
   *
   * @warning Do NOT pass PII (Personally Identifiable Information) in the meta object.
   * This includes but is not limited to: email addresses, passwords, authentication tokens,
   * social security numbers (SSN), phone numbers, credit card numbers, and other sensitive data.
   * PII in logs can lead to compliance violations (GDPR, SOC 2, PCI DSS) and security risks.
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.Info, message, meta);
  }

  /**
   * Log a warning message
   *
   * @param message - Log message
   * @param meta - Optional metadata to include in the log entry
   *
   * @warning Do NOT pass PII (Personally Identifiable Information) in the meta object.
   * This includes but is not limited to: email addresses, passwords, authentication tokens,
   * social security numbers (SSN), phone numbers, credit card numbers, and other sensitive data.
   * PII in logs can lead to compliance violations (GDPR, SOC 2, PCI DSS) and security risks.
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.Warn, message, meta);
  }

  /**
   * Log an error message
   *
   * @param message - Log message
   * @param meta - Optional metadata to include in the log entry
   *
   * @warning Do NOT pass PII (Personally Identifiable Information) in the meta object.
   * This includes but is not limited to: email addresses, passwords, authentication tokens,
   * social security numbers (SSN), phone numbers, credit card numbers, and other sensitive data.
   * PII in logs can lead to compliance violations (GDPR, SOC 2, PCI DSS) and security risks.
   */
  error(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.Error, message, meta);
  }

  /**
   * Internal log method
   *
   * @param level - Log level
   * @param message - Log message
   * @param meta - Optional metadata to include in the log entry
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    // Check if this level should be logged
    if (this.levelOrder[level] < this.levelOrder[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...meta
    };

    // Call the configured handler
    this.config.handler(entry);
  }
}

/**
 * Default logger instance — constructed LAZILY on first use.
 *
 * The events package is imported widely; constructing the logger at module
 * import time created import-order hazards. The proxy defers construction
 * until the first property access.
 *
 * By default, outputs to console. Configure via setLoggerConfig() or
 * provide a custom handler to integrate with your logging library.
 */
let defaultLogger: Logger | undefined;

export const logger: Logger = new Proxy({} as Logger, {
  get(_target, prop) {
    defaultLogger ??= new Logger();
    const value = Reflect.get(defaultLogger, prop, defaultLogger);
    return typeof value === 'function' ? value.bind(defaultLogger) : value;
  }
});

/**
 * Configure the default logger
 *
 * @param config - Logger configuration options
 *
 * @example
 * ```typescript
 * import { logger, setLoggerConfig } from './logging/logger';
 *
 * // Disable console output
 * setLoggerConfig({ consoleEnabled: false });
 *
 * // Integrate with custom logger
 * setLoggerConfig({
 *   consoleEnabled: false,
 *   handler: (entry) => {
 *     myWinstonLogger[entry.level](entry.message, entry);
 *   },
 * });
 * ```
 */
export function setLoggerConfig(config: LoggerConfig): void {
  defaultLogger ??= new Logger();
  defaultLogger.setConfig(config);
}
