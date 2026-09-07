/**
 * NestJS Email Module Interfaces
 *
 * Configuration interfaces for the @package/email NestJS module integration.
 * These interfaces support both EmailModule.forRoot() (synchronous) and
 * EmailModule.forRootAsync() (asynchronous) registration patterns.
 *
 * @packageDocumentation
 */

import type { EmailProviderConfig, EmailProviderType } from '../config/interfaces';
import type {
  IEmailAttachment,
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse
} from '../providers/email-provider.interface';
import type { ModuleMetadata } from '@nestjs/common';

/**
 * Email module configuration options.
 *
 * Provides configuration for the EmailModule, including provider settings,
 * global registration option, and module-level behavior flags.
 *
 * @example Synchronous configuration with forRoot()
 * ```typescript
 * import { EmailModule } from '@package/email';
 *
 * @Module({
 *   imports: [
 *     EmailModule.forRoot({
 *       global: true,
 *       provider: {
 *         type: EmailProviderType.RESEND,
 *         apiKey: 're_123456789',
 *         defaultFromEmail: 'noreply@example.com'
 *       }
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
export interface IEmailModuleOptions {
  /**
   * Email provider configuration.
   *
   * Specifies which email provider to use (Resend, Twilio, SendGrid, Mock)
   * along with provider-specific credentials and settings.
   *
   * @see EmailProviderConfig
   */
  provider: EmailProviderConfig;

  /**
   * Make the module global-scoped.
   *
   * When true, EmailService is available throughout the application without
   * importing the EmailModule in child modules.
   *
   * @defaultValue false
   */
  global?: boolean;

  /**
   * Enable graceful shutdown on application termination.
   *
   * When true, the module will properly close provider connections and
   * release resources during the NestJS lifecycle shutdown sequence.
   *
   * @defaultValue true
   */
  enableGracefulShutdown?: boolean;

  /**
   * Enable OpenTelemetry tracing for email operations.
   *
   * When true, email sends are traced with OpenTelemetry spans including
   * provider name, operation type, and success/failure status.
   *
   * P0 Compliance: Tracing MUST NOT include PII (email addresses, message
   * content). Use identifiers and counts only.
   *
   * @defaultValue false
   */
  enableTracing?: boolean;
}

/**
 * Factory function for creating email module options asynchronously.
 *
 * Used with forRootAsync() to defer configuration resolution until dependency
 * injection is available. Useful for loading configuration from ConfigService
 * or other async sources.
 *
 * @example Using ConfigService
 * ```typescript
 * import { ConfigService } from '@nestjs/config';
 *
 * EmailModule.forRootAsync({
 *   imports: [ConfigModule],
 *   useFactory: async (config: ConfigService) => ({
 *     provider: {
 *       type: config.get<EmailProviderType>('EMAIL_PROVIDER'),
 *       apiKey: config.get<string>('RESEND_API_KEY'),
 *       defaultFromEmail: config.get<string>('DEFAULT_FROM_EMAIL')
 *     }
 *   }),
 *   inject: [ConfigService]
 * })
 * ```
 */
export interface EmailModuleAsyncFactory {
  /**
   * Factory function that receives injected dependencies and returns
   * the module configuration options.
   *
   * @param injectedDependencies - Map of injection tokens to dependency instances
   * @returns The email module configuration options
   * @throws Error if configuration is invalid or required values are missing
   */
  (...injectedDependencies: unknown[]): IEmailModuleOptions | Promise<IEmailModuleOptions>;
}

/**
 * Asynchronous email module registration options.
 *
 * Supports dependency injection-based configuration with multiple patterns:
 * - useFactory: Factory function with injected dependencies
 * - useClass: Configuration class to instantiate
 * - useExisting: Use existing configuration provider
 * - useValue: Direct configuration value
 *
 * @example useFactory pattern (most common)
 * ```typescript
 * EmailModule.forRootAsync({
 *   imports: [ConfigModule],
 *   useFactory: async (config: ConfigService) => ({
 *     global: true,
 *     provider: {
 *       type: config.get('EMAIL_PROVIDER'),
 *       apiKey: config.get('RESEND_API_KEY'),
 *       defaultFromEmail: config.get('DEFAULT_FROM_EMAIL')
 *     }
 *   }),
 *   inject: [ConfigService]
 * })
 * ```
 *
 * @example useClass pattern
 * ```typescript
 * @Injectable()
 * class EmailConfigService {
 *   createEmailConfig(): IEmailModuleOptions {
 *     return {
 *       global: true,
 *       provider: { ... }
 *     };
 *   }
 * }
 *
 * EmailModule.forRootAsync({
 *   useClass: EmailConfigService
 * })
 * ```
 *
 * @example useExisting pattern
 * ```typescript
 * EmailModule.forRootAsync({
 *   imports: [EmailConfigModule],
 *   useExisting: EmailConfigService
 * })
 * ```
 */
export interface IEmailModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Factory function for creating module options asynchronously.
   *
   * The factory receives injected dependencies and must return
   * IEmailModuleOptions (synchronously or via Promise).
   *
   * Mutually exclusive with useClass, useExisting, and useValue.
   */
  useFactory?: EmailModuleAsyncFactory;

  /**
   * Injection tokens for dependencies to pass to useFactory.
   *
   * Each token must correspond to a parameter in the useFactory function.
   * Tokens can be strings (DI tokens), classes (constructor references),
   * or existing providers.
   *
   * @example
   * ```typescript
   * useFactory: (config: ConfigService, custom: CustomService) => ({ ... }),
   * inject: [ConfigService, CustomService]
   * ```
   */
  inject?: unknown[];

  /**
   * Configuration class to instantiate for creating options.
   *
   * The class must have a method that returns IEmailModuleOptions or
   * implement a method that NestJS can call to get the configuration.
   *
   * Mutually exclusive with useFactory, useExisting, and useValue.
   */
  useClass?: new (...args: unknown[]) => IEmailModuleOptionsFactory;

  /**
   * Existing provider to use for configuration.
   *
   * Use a provider that is already available in the module imports
   * instead of creating a new instance.
   *
   * Mutually exclusive with useFactory, useClass, and useValue.
   */
  useExisting?: new (...args: unknown[]) => IEmailModuleOptionsFactory;

  /**
   * Direct configuration value (static, not recommended).
   *
   * Provides configuration directly without factory or class.
   * Note: Using useFactory with ConfigService is preferred for
   * environment-based configuration.
   *
   * Mutually exclusive with useFactory, useClass, and useExisting.
   */
  useValue?: IEmailModuleOptions;

  /**
   * Make the module global-scoped.
   *
   * When true, EmailService is available throughout the application without
   * importing the EmailModule in child modules.
   *
   * @defaultValue false
   */
  global?: boolean;
}

/**
 * Interface for email module options factory classes.
 *
 * Classes implementing this interface can be used with the useClass
 * pattern in forRootAsync() to provide configuration.
 *
 * @example
 * ```typescript
 * @Injectable()
 * class EmailConfigService implements IEmailModuleOptionsFactory {
 *   constructor(private readonly config: ConfigService) {}
 *
 *   createEmailModuleOptions(): IEmailModuleOptions {
 *     return {
 *       global: true,
 *       provider: {
 *         type: this.config.get<EmailProviderType>('EMAIL_PROVIDER'),
 *         apiKey: this.config.get<string>('RESEND_API_KEY'),
 *         defaultFromEmail: this.config.get<string>('DEFAULT_FROM_EMAIL')
 *       }
 *     };
 *   }
 * }
 * ```
 */
export interface IEmailModuleOptionsFactory {
  /**
   * Create email module configuration options.
   *
   * Called by NestJS during module initialization to get the
   * configuration for the EmailModule.
   *
   * @returns The email module configuration options
   * @throws Error if configuration is invalid or required values are missing
   */
  createEmailModuleOptions(): IEmailModuleOptions | Promise<IEmailModuleOptions>;
}

/**
 * Re-exports of core email types for convenience.
 *
 * These re-exports allow consumers to import types from a single location
 * when using the NestJS email module.
 *
 * @example
 * ```typescript
 * import {
 *   IEmailProvider,
 *   ISendEmailRequest,
 *   EmailProviderType
 * } from '@package/email';
 * ```
 */
export type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse,
  IEmailAttachment,
  EmailProviderConfig,
  EmailProviderType
};
