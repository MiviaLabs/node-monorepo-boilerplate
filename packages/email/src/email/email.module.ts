/**
 * NestJS Email Module
 *
 * Dynamic NestJS module for email sending functionality. Supports both
 * forRoot() (synchronous) and forRootAsync() (asynchronous) registration
 * patterns with dependency injection support.
 *
 * ## Queue Integration
 *
 * This module integrates with @package/queues for async email sending:
 * - EmailJobHandler processes email jobs from the 'emails' queue
 * - Requires QueuesModule to be imported in the application
 * - @JobHandler decorator automatically registers workers
 *
 * @packageDocumentation
 */

import { DynamicModule, Module, OnModuleDestroy, Provider } from '@nestjs/common';

import { EMAIL_MODULE_OPTIONS, EMAIL_PROVIDER } from './email.constants';
import { EmailService } from './email.service';
import { EmailJobHandler } from './email-job-handler';
import { EmailProviderType } from '../config/interfaces';
import { EmailConfigurationError } from '../errors';
import { MockEmailProvider } from '../providers/mock-email-provider';
import { ResendAdapter } from '../providers/resend-provider';

import type {
  IEmailModuleAsyncOptions,
  IEmailModuleOptionsFactory,
  IEmailModuleOptions
} from './interfaces';
import type { EmailProviderConfig } from '../config/interfaces';

/**
 * Creates an email provider instance from configuration.
 *
 * @param config - The provider configuration
 * @returns The instantiated email provider
 *
 * @internal
 */
function createProviderInstance(config: EmailProviderConfig): unknown {
  switch (config.type) {
    case EmailProviderType.RESEND:
      return new ResendAdapter(config);
    case EmailProviderType.TWILIO:
    case EmailProviderType.SENDGRID:
      throw new EmailConfigurationError(`Provider "${config.type}" is not implemented`);
    case EmailProviderType.MOCK:
      return new MockEmailProvider(config);
    default:
      throw new EmailConfigurationError(
        `Unsupported provider type "${(config as EmailProviderConfig).type}"`
      );
  }
}

/**
 * EmailModule - Dynamic NestJS module for email sending.
 *
 * Provides dependency injection support for email functionality with
 * configurable providers (Resend, Mock). Supports
 * both synchronous (forRoot) and asynchronous (forRootAsync) configuration.
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
 *
 * @example Asynchronous configuration with forRootAsync()
 * ```typescript
 * import { EmailModule } from '@package/email';
 *
 * @Module({
 *   imports: [
 *     EmailModule.forRootAsync({
 *       imports: [ConfigModule],
 *       useFactory: async (config: ConfigService) => ({
 *         global: true,
 *         provider: {
 *           type: config.get<EmailProviderType>('EMAIL_PROVIDER'),
 *           apiKey: config.get<string>('RESEND_API_KEY'),
 *           defaultFromEmail: config.get<string>('DEFAULT_FROM_EMAIL')
 *         }
 *       }),
 *       inject: [ConfigService]
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 *
 * @example Using EmailService in a component
 * ```typescript
 * import { EmailService } from '@package/email';
 *
 * @Injectable()
 * export class UserService {
 *   constructor(private readonly emailService: EmailService) {}
 *
 *   async sendWelcomeEmail(email: string, name: string) {
 *     await this.emailService.sendEmail({
 *       to: email,
 *       subject: 'Welcome!',
 *       html: `<h1>Welcome ${name}</h1>`,
 *       from: 'noreply@example.com'
 *     });
 *   }
 * }
 * ```
 */
@Module({})
export class EmailModule implements OnModuleDestroy {
  /**
   * Synchronous module registration.
   *
   * Registers the EmailModule with static configuration. Use this method
   * when you have configuration values available at module import time.
   *
   * @param options - The module configuration options
   * @returns Dynamic module definition
   *
   * @example
   * ```typescript
   * EmailModule.forRoot({
   *   global: true,
   *   provider: {
   *     type: EmailProviderType.RESEND,
   *     apiKey: 're_123456789',
   *     defaultFromEmail: 'noreply@example.com'
   *   }
   * })
   * ```
   */
  static forRoot(options: IEmailModuleOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: EMAIL_MODULE_OPTIONS,
      useValue: options
    };

    const providerProvider: Provider = {
      provide: EMAIL_PROVIDER,
      useFactory: (opts: IEmailModuleOptions) => {
        return createProviderInstance(opts.provider);
      },
      inject: [EMAIL_MODULE_OPTIONS]
    };

    return {
      module: EmailModule,
      providers: [optionsProvider, providerProvider, EmailService, EmailJobHandler],
      exports: [EMAIL_PROVIDER, EmailService, EmailJobHandler],
      global: options.global ?? false
    };
  }

  /**
   * Asynchronous module registration.
   *
   * Registers the EmailModule with asynchronous configuration. Use this method
   * when you need to load configuration from ConfigService or other async sources.
   *
   * Supports useFactory, useClass, useExisting, and useValue patterns.
   *
   * @param options - The async module configuration options
   * @returns Dynamic module definition
   *
   * @example Using useFactory with ConfigService
   * ```typescript
   * EmailModule.forRootAsync({
   *   imports: [ConfigModule],
   *   useFactory: async (config: ConfigService) => ({
   *     global: true,
   *     provider: {
   *       type: config.get<EmailProviderType>('EMAIL_PROVIDER'),
   *       apiKey: config.get<string>('RESEND_API_KEY'),
   *       defaultFromEmail: config.get<string>('DEFAULT_FROM_EMAIL')
   *     }
   *   }),
   *   inject: [ConfigService]
   * })
   * ```
   *
   * @example Using useClass
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
   *
   * EmailModule.forRootAsync({
   *   imports: [ConfigModule],
   *   useClass: EmailConfigService
   * })
   * ```
   *
   * @example Using useExisting
   * ```typescript
   * EmailModule.forRootAsync({
   *   imports: [EmailConfigModule],
   *   useExisting: EmailConfigService
   * })
   * ```
   */
  static forRootAsync(options: IEmailModuleAsyncOptions): DynamicModule {
    const asyncProviders: Provider[] = this.createAsyncProviders(options);

    return {
      module: EmailModule,
      imports: options.imports ?? [],
      providers: [...asyncProviders, EmailService, EmailJobHandler],
      exports: [EMAIL_PROVIDER, EmailService, EmailJobHandler],
      global: options.global ?? false
    };
  }

  /**
   * Creates async providers for the module.
   *
   * @param asyncOptions - The async module configuration options
   * @returns Array of providers for async configuration
   *
   * @internal
   */
  private static createAsyncProviders(asyncOptions: IEmailModuleAsyncOptions): Provider[] {
    if (asyncOptions.useExisting || asyncOptions.useFactory) {
      return [this.createAsyncOptionsProvider(asyncOptions), this.createProviderFactory()];
    }

    if (asyncOptions.useClass) {
      return [
        this.createAsyncOptionsProvider(asyncOptions),
        {
          provide: asyncOptions.useClass,
          useClass: asyncOptions.useClass
        },
        this.createProviderFactory()
      ];
    }

    // useValue case
    return [
      {
        provide: EMAIL_MODULE_OPTIONS,
        useValue: asyncOptions.useValue
      },
      this.createProviderFactory()
    ];
  }

  /**
   * Creates the async options provider.
   *
   * @param asyncOptions - The async module configuration options
   * @returns Provider for async options
   *
   * @internal
   */
  private static createAsyncOptionsProvider(asyncOptions: IEmailModuleAsyncOptions): Provider {
    if (asyncOptions.useFactory) {
      return {
        provide: EMAIL_MODULE_OPTIONS,
        useFactory: asyncOptions.useFactory,
        inject: (asyncOptions.inject ?? []) as any[]
      };
    }

    if (asyncOptions.useClass || asyncOptions.useExisting) {
      const useClass: new (...args: unknown[]) => IEmailModuleOptionsFactory =
        asyncOptions.useClass ??
        (asyncOptions.useExisting as new (...args: unknown[]) => IEmailModuleOptionsFactory);
      return {
        provide: EMAIL_MODULE_OPTIONS,
        useFactory: async (optionsFactory: IEmailModuleOptionsFactory) =>
          optionsFactory.createEmailModuleOptions(),
        inject: [useClass]
      };
    }

    // useValue case - provider created separately
    return {
      provide: EMAIL_MODULE_OPTIONS,
      useValue: asyncOptions.useValue
    };
  }

  /**
   * Creates the provider factory.
   *
   * @returns Provider factory for EMAIL_PROVIDER
   *
   * @internal
   */
  private static createProviderFactory(): Provider {
    return {
      provide: EMAIL_PROVIDER,
      useFactory: (opts: IEmailModuleOptions) => {
        return createProviderInstance(opts.provider);
      },
      inject: [EMAIL_MODULE_OPTIONS]
    };
  }

  /**
   * NestJS lifecycle hook called when the module is destroyed.
   *
   * Performs graceful shutdown by cleaning up the provider connection
   * if enableGracefulShutdown is enabled.
   *
   * @example
   * ```typescript
   * // Called automatically by NestJS during shutdown
   * onModuleDestroy() {
   *   // Provider cleanup logic here
   * }
   * ```
   */
  onModuleDestroy(): void {
    // Note: Provider-specific cleanup can be added here when needed
    // For now, this is a placeholder for graceful shutdown hook
  }
}
