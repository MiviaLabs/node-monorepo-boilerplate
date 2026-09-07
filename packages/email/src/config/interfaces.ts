/**
 * Email provider type enumeration.
 */
export enum EmailProviderType {
  /**
   * Resend email provider.
   */
  RESEND = 'resend',

  /**
   * Twilio SendGrid email provider.
   */
  TWILIO = 'twilio',

  /**
   * SendGrid email provider.
   */
  SENDGRID = 'sendgrid',

  /**
   * Mock provider for testing.
   */
  MOCK = 'mock'
}

/**
 * Base email provider configuration.
 */
export interface IBaseEmailProviderConfig {
  /**
   * Provider type identifier.
   */
  type: EmailProviderType;

  /**
   * Default sender email address.
   */
  defaultFromEmail: string;

  /**
   * Default sender name.
   */
  defaultFromName?: string;

  /**
   * Enable debug logging for troubleshooting.
   *
   * WARNING: Debug mode MUST NOT log PII (email addresses, recipient lists, message bodies).
   * Implementations should use non-PII identifiers (IDs, hashes) and redaction/sampling
   * for troubleshooting while maintaining Class-C data protection.
   */
  debug?: boolean;
}

/**
 * Resend provider configuration.
 */
export interface IResendProviderConfig extends IBaseEmailProviderConfig {
  type: EmailProviderType.RESEND;

  /**
   * Resend API key.
   */
  apiKey: string;
}

/**
 * Twilio provider configuration.
 */
export interface ITwilioProviderConfig extends IBaseEmailProviderConfig {
  type: EmailProviderType.TWILIO;

  /**
   * Twilio Account SID.
   */
  accountSid: string;

  /**
   * Twilio Auth Token.
   */
  authToken: string;

  /**
   * Twilio Email Service SID (optional).
   */
  emailServiceSid?: string;
}

/**
 * SendGrid provider configuration.
 */
export interface ISendGridProviderConfig extends IBaseEmailProviderConfig {
  type: EmailProviderType.SENDGRID;

  /**
   * SendGrid API key.
   */
  apiKey: string;
}

/**
 * Mock provider configuration for testing.
 */
export interface IMockProviderConfig extends IBaseEmailProviderConfig {
  type: EmailProviderType.MOCK;

  /**
   * Failure rate (0-1) for simulating send failures.
   * 0 = never fail, 0.5 = 50% failure rate, 1 = always fail.
   * @defaultValue 0
   */
  failureRate?: number;

  /**
   * Simulated latency in milliseconds before response.
   * Useful for testing timeout behavior and async operations.
   * @defaultValue 0
   */
  simulatedLatencyMs?: number;

  /**
   * Array of batch indices to fail (0-indexed).
   * Used to test partial batch failure scenarios.
   * Empty array means no specific failures.
   * @defaultValue []
   */
  batchFailureIndices?: number[];
}

/**
 * Union type for all email provider configurations.
 */
export type EmailProviderConfig =
  | IResendProviderConfig
  | ITwilioProviderConfig
  | ISendGridProviderConfig
  | IMockProviderConfig;

/**
 * Email module configuration options.
 */
export interface IEmailModuleConfig {
  /**
   * Email provider configuration.
   */
  provider: EmailProviderConfig;

  /**
   * Enable graceful shutdown on SIGTERM/SIGINT.
   */
  enableGracefulShutdown?: boolean;

  /**
   * Enable OpenTelemetry tracing.
   */
  enableTracing?: boolean;
}

/**
 * Environment variable name mappings for email configuration.
 *
 * Allows customization of environment variable names for different
 * deployment scenarios where standard variable names conflict with
 * existing variables.
 *
 * @example Using custom environment variable names
 * ```typescript
 * import { resolveEmailProviderConfig } from '@package/email';
 *
 * const config = resolveEmailProviderConfig({
 *   envVarNames: {
 *     provider: 'MY_EMAIL_PROVIDER',
 *     resendApiKey: 'MY_RESEND_KEY'
 *   }
 * });
 * ```
 */
export interface IEmailEnvironmentVariableNames {
  /**
   * Environment variable for provider type.
   * @defaultValue 'EMAIL_PROVIDER'
   */
  provider?: string;

  /**
   * Environment variable for default sender email.
   * @defaultValue 'DEFAULT_FROM_EMAIL'
   */
  defaultFromEmail?: string;

  /**
   * Environment variable for default sender name.
   * @defaultValue 'DEFAULT_FROM_NAME'
   */
  defaultFromName?: string;

  /**
   * Environment variable for debug flag.
   * @defaultValue 'EMAIL_DEBUG'
   */
  debug?: string;

  /**
   * Environment variable for Resend API key.
   * @defaultValue 'RESEND_API_KEY'
   */
  resendApiKey?: string;

  /**
   * Environment variable for Twilio Account SID.
   * @defaultValue 'TWILIO_ACCOUNT_SID'
   */
  twilioAccountSid?: string;

  /**
   * Environment variable for Twilio Auth Token.
   * @defaultValue 'TWILIO_AUTH_TOKEN'
   */
  twilioAuthToken?: string;

  /**
   * Environment variable for Twilio Email Service SID.
   * @defaultValue 'TWILIO_EMAIL_SERVICE_SID'
   */
  twilioEmailServiceSid?: string;

  /**
   * Environment variable for SendGrid API key.
   * @defaultValue 'SENDGRID_API_KEY'
   */
  sendgridApiKey?: string;

  /**
   * Environment variable for graceful shutdown toggle.
   * @defaultValue 'EMAIL_GRACEFUL_SHUTDOWN'
   */
  enableGracefulShutdown?: string;

  /**
   * Environment variable for tracing toggle.
   * @defaultValue 'EMAIL_TRACING'
   */
  enableTracing?: string;
}

/**
 * Partial provider configuration for user overrides.
 *
 * Used in IEmailResolverOptions to allow users to override
 * specific provider settings without providing a complete configuration.
 */
export interface IPartialProviderConfig {
  /**
   * Provider type override.
   */
  type?: EmailProviderType;

  /**
   * Default sender email override.
   */
  defaultFromEmail?: string;

  /**
   * Default sender name override.
   */
  defaultFromName?: string;

  /**
   * Debug flag override.
   */
  debug?: boolean;

  /**
   * Resend API key override (only used when type is RESEND).
   */
  apiKey?: string;

  /**
   * Twilio Account SID override (only used when type is TWILIO).
   */
  accountSid?: string;

  /**
   * Twilio Auth Token override (only used when type is TWILIO).
   */
  authToken?: string;

  /**
   * Twilio Email Service SID override (only used when type is TWILIO).
   */
  emailServiceSid?: string;
}

/**
 * Options for email configuration resolution.
 *
 * Implements a three-tier priority system:
 * 1. **User-provided configuration** (highest priority) - Values in this options object
 * 2. **Environment variables** - Read from `process.env` using configurable names
 * 3. **Default values** (lowest priority) - Sensible defaults from defaults.ts
 *
 * @example Basic usage with user overrides
 * ```typescript
 * import { resolveEmailProviderConfig } from '@package/email';
 *
 * const config = resolveEmailProviderConfig({
 *   provider: {
 *     defaultFromEmail: 'noreply@myapp.com',
 *     debug: true
 *   }
 * });
 * ```
 *
 * @example Custom environment variable names
 * ```typescript
 * import { resolveEmailProviderConfig } from '@package/email';
 *
 * const config = resolveEmailProviderConfig({
 *   envVarNames: {
 *     provider: 'MY_EMAIL_PROVIDER',
 *     resendApiKey: 'MY_RESEND_API_KEY'
 *   }
 * });
 * ```
 */
export interface IEmailResolverOptions {
  /**
   * Provider configuration overrides (highest priority).
   */
  provider?: IPartialProviderConfig;

  /**
   * Enable graceful shutdown override.
   */
  enableGracefulShutdown?: boolean;

  /**
   * Enable tracing override.
   */
  enableTracing?: boolean;

  /**
   * Custom environment variable name mappings.
   */
  envVarNames?: IEmailEnvironmentVariableNames;
}
