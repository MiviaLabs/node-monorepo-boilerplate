import { DEFAULT_FALLBACK_EMAIL } from '../constants';
import { EmailConfigurationError } from '../errors';
import { DEFAULT_EMAIL_CONFIG } from './defaults';
import { EmailProviderType } from './interfaces';

import type {
  EmailProviderConfig,
  IEmailModuleConfig,
  IEmailResolverOptions,
  IEmailEnvironmentVariableNames,
  IPartialProviderConfig,
  IResendProviderConfig,
  ITwilioProviderConfig,
  ISendGridProviderConfig,
  IMockProviderConfig
} from './interfaces';

/**
 * Valid email provider type values for validation.
 */
const VALID_PROVIDER_TYPES = Object.values(EmailProviderType);

/**
 * Default environment variable names for email configuration.
 *
 * @internal
 */
const DEFAULT_ENV_VAR_NAMES: Required<IEmailEnvironmentVariableNames> = {
  provider: 'EMAIL_PROVIDER',
  defaultFromEmail: 'DEFAULT_FROM_EMAIL',
  defaultFromName: 'DEFAULT_FROM_NAME',
  debug: 'EMAIL_DEBUG',
  resendApiKey: 'RESEND_API_KEY',
  twilioAccountSid: 'TWILIO_ACCOUNT_SID',
  twilioAuthToken: 'TWILIO_AUTH_TOKEN',
  twilioEmailServiceSid: 'TWILIO_EMAIL_SERVICE_SID',
  sendgridApiKey: 'SENDGRID_API_KEY',
  enableGracefulShutdown: 'EMAIL_GRACEFUL_SHUTDOWN',
  enableTracing: 'EMAIL_TRACING'
};

/**
 * Checks if a string value is effectively empty (undefined, null, empty, or whitespace-only).
 *
 * @param value - The value to check
 * @returns true if the value is effectively empty
 *
 * @internal
 */
function isEmptyValue(value: string | undefined | null): boolean {
  return value === undefined || value === null || value === '' || value.trim() === '';
}

/**
 * Resolves a configuration value using the three-tier priority system.
 *
 * @param userValue - User-provided value (highest priority)
 * @param envVarName - Environment variable name to check
 * @param defaultValue - Default value (lowest priority)
 * @returns The resolved value
 *
 * @internal
 */
function resolveValue<T>(userValue: T | undefined, envVarName: string, defaultValue: T): T {
  if (userValue !== undefined) return userValue;

  const envValue = process.env[envVarName];
  if (!isEmptyValue(envValue)) {
    return envValue as unknown as T;
  }

  return defaultValue;
}

/**
 * Resolves a boolean value from environment variable.
 *
 * @param userValue - User-provided value (highest priority)
 * @param envVarName - Environment variable name to check
 * @param defaultValue - Default value (lowest priority)
 * @returns The resolved boolean
 *
 * @internal
 */
function resolveBoolean(
  userValue: boolean | undefined,
  envVarName: string,
  defaultValue: boolean
): boolean {
  if (userValue !== undefined) return userValue;

  const envValue = process.env[envVarName];
  if (!isEmptyValue(envValue)) {
    return envValue === 'true' || envValue === '1';
  }

  return defaultValue;
}

/**
 * Gets the merged environment variable names.
 *
 * @param customNames - Custom environment variable names to merge with defaults
 * @returns Complete environment variable name mappings
 *
 * @internal
 */
function getEnvVarNames(
  customNames?: IEmailEnvironmentVariableNames
): Required<IEmailEnvironmentVariableNames> {
  return { ...DEFAULT_ENV_VAR_NAMES, ...customNames };
}

/**
 * Validates and sanitizes the provider type.
 *
 * @param rawEnvProvider - Raw provider value from environment
 * @returns Sanitized provider type string for error messages
 * @throws {EmailConfigurationError} If provider value is whitespace-only
 *
 * @internal
 */
function validateWhitespaceOnlyProvider(rawEnvProvider: string | undefined): void {
  if (rawEnvProvider !== undefined && rawEnvProvider !== '' && rawEnvProvider.trim() === '') {
    const sanitizedProviderType = rawEnvProvider.slice(0, 100).replace(/[\r\n\t]/g, ' ');
    throw new EmailConfigurationError(
      "Invalid EMAIL_PROVIDER value: '" +
        sanitizedProviderType +
        "'. Valid values are: " +
        VALID_PROVIDER_TYPES.join(', ')
    );
  }
}

/**
 * Validates that the provider type is a valid enum value.
 *
 * @param providerType - The provider type to validate
 * @throws {EmailConfigurationError} If provider type is invalid
 *
 * @internal
 */
function validateProviderType(providerType: string): void {
  if (!VALID_PROVIDER_TYPES.includes(providerType as EmailProviderType)) {
    const sanitizedProviderType =
      typeof providerType === 'string'
        ? providerType.slice(0, 100).replace(/[\r\n\t]/g, ' ')
        : String(providerType).slice(0, 100);

    throw new EmailConfigurationError(
      "Invalid EMAIL_PROVIDER value: '" +
        sanitizedProviderType +
        "'. Valid values are: " +
        VALID_PROVIDER_TYPES.join(', ')
    );
  }
}

/**
 * Common base configuration properties.
 *
 * @internal
 */
interface IBaseProviderSettings {
  defaultFromEmail: string;
  defaultFromName: string | undefined;
  debug: boolean;
}

/**
 * Resolves base provider settings common to all providers.
 *
 * @param userProvider - User-provided provider options
 * @param envNames - Environment variable names
 * @param providerType - The resolved provider type
 * @returns Base provider settings
 * @throws {EmailConfigurationError} If required settings are missing for non-mock providers
 *
 * @internal
 */
function resolveBaseProviderSettings(
  userProvider: IPartialProviderConfig,
  envNames: Required<IEmailEnvironmentVariableNames>,
  providerType: EmailProviderType
): IBaseProviderSettings {
  const envFromEmail = process.env[envNames.defaultFromEmail];
  const resolvedEnvFromEmail = !isEmptyValue(envFromEmail) ? envFromEmail : undefined;

  const defaultFromEmail =
    userProvider.defaultFromEmail ??
    resolvedEnvFromEmail ??
    DEFAULT_EMAIL_CONFIG.provider?.defaultFromEmail ??
    DEFAULT_FALLBACK_EMAIL;

  // For non-mock providers, require an explicit sender email
  if (
    providerType !== EmailProviderType.MOCK &&
    !userProvider.defaultFromEmail &&
    !resolvedEnvFromEmail
  ) {
    throw new EmailConfigurationError(
      'DEFAULT_FROM_EMAIL environment variable is required for non-mock email providers'
    );
  }

  const defaultFromName = resolveValue(
    userProvider.defaultFromName,
    envNames.defaultFromName,
    DEFAULT_EMAIL_CONFIG.provider?.defaultFromName
  );

  const debug = resolveBoolean(
    userProvider.debug,
    envNames.debug,
    DEFAULT_EMAIL_CONFIG.provider?.debug ?? false
  );

  return { defaultFromEmail, defaultFromName, debug };
}

/**
 * Creates Resend provider configuration.
 *
 * @internal
 */
function createResendConfig(
  userProvider: IPartialProviderConfig,
  envNames: Required<IEmailEnvironmentVariableNames>,
  baseSettings: IBaseProviderSettings
): IResendProviderConfig {
  const apiKey = resolveValue(
    userProvider.apiKey,
    envNames.resendApiKey,
    undefined as string | undefined
  );

  if (!apiKey) {
    throw new EmailConfigurationError(
      'RESEND_API_KEY environment variable is required when EMAIL_PROVIDER=resend'
    );
  }

  return {
    type: EmailProviderType.RESEND,
    apiKey,
    defaultFromEmail: baseSettings.defaultFromEmail,
    defaultFromName: baseSettings.defaultFromName,
    debug: baseSettings.debug
  };
}

/**
 * Creates Twilio provider configuration.
 *
 * @internal
 */
function createTwilioConfig(
  userProvider: IPartialProviderConfig,
  envNames: Required<IEmailEnvironmentVariableNames>,
  baseSettings: IBaseProviderSettings
): ITwilioProviderConfig {
  const accountSid = resolveValue(
    userProvider.accountSid,
    envNames.twilioAccountSid,
    undefined as string | undefined
  );
  const authToken = resolveValue(
    userProvider.authToken,
    envNames.twilioAuthToken,
    undefined as string | undefined
  );

  if (!accountSid || !authToken) {
    throw new EmailConfigurationError(
      'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are required when EMAIL_PROVIDER=twilio'
    );
  }

  const emailServiceSid = resolveValue(
    userProvider.emailServiceSid,
    envNames.twilioEmailServiceSid,
    undefined as string | undefined
  );

  const config: ITwilioProviderConfig = {
    type: EmailProviderType.TWILIO,
    accountSid,
    authToken,
    defaultFromEmail: baseSettings.defaultFromEmail,
    defaultFromName: baseSettings.defaultFromName,
    debug: baseSettings.debug
  };

  if (emailServiceSid) {
    config.emailServiceSid = emailServiceSid;
  }

  return config;
}

/**
 * Creates SendGrid provider configuration.
 *
 * @internal
 */
function createSendGridConfig(
  userProvider: IPartialProviderConfig,
  envNames: Required<IEmailEnvironmentVariableNames>,
  baseSettings: IBaseProviderSettings
): ISendGridProviderConfig {
  const apiKey = resolveValue(
    userProvider.apiKey,
    envNames.sendgridApiKey,
    undefined as string | undefined
  );

  if (!apiKey) {
    throw new EmailConfigurationError(
      'SENDGRID_API_KEY environment variable is required when EMAIL_PROVIDER=sendgrid'
    );
  }

  return {
    type: EmailProviderType.SENDGRID,
    apiKey,
    defaultFromEmail: baseSettings.defaultFromEmail,
    defaultFromName: baseSettings.defaultFromName,
    debug: baseSettings.debug
  };
}

/**
 * Creates Mock provider configuration.
 *
 * @internal
 */
function createMockConfig(baseSettings: IBaseProviderSettings): IMockProviderConfig {
  return {
    type: EmailProviderType.MOCK,
    defaultFromEmail: baseSettings.defaultFromEmail,
    defaultFromName: baseSettings.defaultFromName,
    debug: baseSettings.debug
  };
}

/**
 * Resolves email provider configuration from environment variables and user options.
 *
 * Implements a three-tier priority system:
 * 1. **User-provided configuration** (highest priority) - Values in options.provider
 * 2. **Environment variables** - Read from process.env using configurable names
 * 3. **Default values** (lowest priority) - Sensible defaults
 *
 * Environment variables (defaults):
 * - EMAIL_PROVIDER: Provider type (resend, twilio, sendgrid, mock)
 * - DEFAULT_FROM_EMAIL: Default sender email (required for non-mock providers)
 * - DEFAULT_FROM_NAME: Default sender name (optional)
 * - EMAIL_DEBUG: Enable debug logging, `true` to enable (optional)
 * - RESEND_API_KEY: Resend API key (if provider=resend)
 * - TWILIO_ACCOUNT_SID: Twilio Account SID (if provider=twilio)
 * - TWILIO_AUTH_TOKEN: Twilio Auth Token (if provider=twilio)
 * - TWILIO_EMAIL_SERVICE_SID: Twilio Email Service SID (optional)
 * - SENDGRID_API_KEY: SendGrid API key (if provider=sendgrid)
 *
 * @param options - Optional resolver options with user overrides and custom env var names
 * @returns Email provider configuration
 * @throws {EmailConfigurationError} When required environment variables are missing or invalid
 *
 * @example Basic usage (environment variables only)
 * ```typescript
 * const config = resolveEmailProviderConfig();
 * ```
 *
 * @example With user overrides
 * ```typescript
 * const config = resolveEmailProviderConfig({
 *   provider: {
 *     defaultFromEmail: 'noreply@myapp.com',
 *     debug: true
 *   }
 * });
 * ```
 *
 * @example With custom environment variable names
 * ```typescript
 * const config = resolveEmailProviderConfig({
 *   envVarNames: {
 *     provider: 'MY_EMAIL_PROVIDER',
 *     resendApiKey: 'MY_RESEND_KEY'
 *   }
 * });
 * ```
 */
export function resolveEmailProviderConfig(
  options: IEmailResolverOptions = {}
): EmailProviderConfig {
  const envNames = getEnvVarNames(options.envVarNames);
  const userProvider = options.provider ?? {};

  // Resolve provider type with three-tier priority
  const rawEnvProvider = process.env[envNames.provider];
  validateWhitespaceOnlyProvider(rawEnvProvider);

  const envProviderType = !isEmptyValue(rawEnvProvider) ? rawEnvProvider : undefined;
  const rawProviderType =
    userProvider.type ??
    envProviderType ??
    DEFAULT_EMAIL_CONFIG.provider?.type ??
    EmailProviderType.MOCK;

  validateProviderType(rawProviderType);
  const providerType = rawProviderType as EmailProviderType;

  // Resolve base settings common to all providers
  const baseSettings = resolveBaseProviderSettings(userProvider, envNames, providerType);

  // Create provider-specific configuration
  switch (providerType) {
    case EmailProviderType.RESEND:
      return createResendConfig(userProvider, envNames, baseSettings);

    case EmailProviderType.TWILIO:
      return createTwilioConfig(userProvider, envNames, baseSettings);

    case EmailProviderType.SENDGRID:
      return createSendGridConfig(userProvider, envNames, baseSettings);

    case EmailProviderType.MOCK:
      return createMockConfig(baseSettings);

    default: {
      // Exhaustive check - TypeScript will error if a new EmailProviderType is added
      const _exhaustiveCheck: never = providerType;
      throw new EmailConfigurationError('Unhandled provider type: ' + _exhaustiveCheck);
    }
  }
}

/**
 * Resolves full email module configuration from environment variables and user options.
 *
 * Implements a three-tier priority system:
 * 1. **User-provided configuration** (highest priority) - Values in options
 * 2. **Environment variables** - Read from process.env using configurable names
 * 3. **Default values** (lowest priority) - Sensible defaults
 *
 * @param options - Optional resolver options with user overrides and custom env var names
 * @returns Email module configuration
 *
 * @example Basic usage
 * ```typescript
 * const config = resolveEmailConfig();
 * ```
 *
 * @example With user overrides
 * ```typescript
 * const config = resolveEmailConfig({
 *   enableGracefulShutdown: false,
 *   enableTracing: true,
 *   provider: {
 *     defaultFromEmail: 'noreply@myapp.com'
 *   }
 * });
 * ```
 */
export function resolveEmailConfig(options: IEmailResolverOptions = {}): IEmailModuleConfig {
  const envNames = getEnvVarNames(options.envVarNames);

  return {
    provider: resolveEmailProviderConfig(options),
    enableGracefulShutdown: resolveBoolean(
      options.enableGracefulShutdown,
      envNames.enableGracefulShutdown,
      DEFAULT_EMAIL_CONFIG.enableGracefulShutdown ?? true
    ),
    enableTracing: resolveBoolean(
      options.enableTracing,
      envNames.enableTracing,
      DEFAULT_EMAIL_CONFIG.enableTracing ?? true
    )
  };
}
