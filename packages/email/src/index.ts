/**
 * @package/email - Enterprise email adapter with multi-provider support
 *
 * This package provides core interfaces, configuration resolution, error
 * types, and NestJS integration for a unified email sending abstraction
 * supporting multiple providers (Resend, Twilio, SendGrid, Mock).
 *
 * @packageDocumentation
 */

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================
export type {
  IEmailProvider,
  ISendEmailRequest,
  ISendEmailResponse,
  IEmailAttachment,
  IEmailTrackingRequest,
  EmailTrackingMetadataValue
} from './providers/email-provider.interface';

export type { IStoredEmail } from './providers/mock-email-provider';

export { BaseEmailProvider } from './providers/base-email-provider';
export { ResendAdapter } from './providers/resend-provider';
export { MockEmailProvider } from './providers/mock-email-provider';

// ============================================================================
// CONFIGURATION
// ============================================================================
export {
  EmailProviderType,
  type IBaseEmailProviderConfig,
  type IResendProviderConfig,
  type ITwilioProviderConfig,
  type ISendGridProviderConfig,
  type IMockProviderConfig,
  type EmailProviderConfig,
  type IEmailModuleConfig,
  type IEmailEnvironmentVariableNames,
  type IPartialProviderConfig,
  type IEmailResolverOptions
} from './config/interfaces';

export { DEFAULT_EMAIL_CONFIG } from './config/defaults';

export { resolveEmailProviderConfig, resolveEmailConfig } from './config/config-resolver';

// ============================================================================
// ERRORS
// ============================================================================
export {
  EmailError,
  EmailSendError,
  EmailConfigurationError,
  EmailProviderHealthCheckError
} from './errors';

// ============================================================================
// CONSTANTS
// ============================================================================
export {
  DEFAULT_EMAIL_TIMEOUT_MS,
  MAX_BATCH_SIZE,
  MAX_SUBJECT_LENGTH,
  MAX_RECIPIENTS_PER_EMAIL,
  MAX_ATTACHMENT_SIZE_BYTES,
  DEFAULT_FALLBACK_EMAIL
} from './constants';

// ============================================================================
// NESTJS MODULE INTEGRATION
// ============================================================================
/**
 * NestJS Email Module
 *
 * Dynamic NestJS module for email sending functionality. Supports both
 * forRoot() (synchronous) and forRootAsync() (asynchronous) registration
 * patterns with dependency injection support.
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
export { EmailModule } from './email/email.module';

/**
 * NestJS Email Service
 *
 * Injectable service that wraps the IEmailProvider for easy dependency
 * injection in NestJS applications. Provides sendEmail(), sendAsync(),
 * sendBatch(), and healthCheck() methods.
 *
 * P0 Compliance: This service does NOT log PII (email addresses, message
 * content). All logging uses non-PII identifiers (message IDs, counts,
 * status codes).
 *
 * @example
 * ```typescript
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
 *
 * @example Async email via queue
 * ```typescript
 * @Injectable()
 * export class NotificationService {
 *   constructor(private readonly emailService: EmailService) {}
 *
 *   async sendBulkNewsletter(users: User[]) {
 *     const jobs = await Promise.all(
 *       users.map(user =>
 *         this.emailService.sendAsync(user.organizationId, {
 *           to: user.email,
 *           subject: 'Monthly Newsletter',
 *           html: newsletterHtml,
 *           from: 'news@example.com'
 *         })
 *       )
 *     );
 *     console.log(`Queued ${jobs.length} emails for background processing`);
 *   }
 * }
 * ```
 */
export { EmailService } from './email/email.service';

/**
 * Email Job Handler
 *
 * Processes email jobs from the BullMQ queue using the @JobHandler decorator.
 * Automatically discovered by QueuesModule to register workers for email jobs.
 *
 * P0 Compliance: Validates organizationId for multi-tenancy, logs without PII.
 *
 * @example
 * ```typescript
 * // QueuesModule automatically discovers EmailJobHandler and registers workers
 * @Module({
 *   imports: [
 *     EmailModule.forRoot({ ... }),
 *     QueuesModule.forRoot()
 *   ]
 * })
 * export class AppModule {}
 *
 * // Jobs can be added via addJob
 * await addJob({
 *   queueName: QUEUE_NAMES.EMAILS,
 *   jobName: 'send-email',
 *   data: {
 *     organizationId: 'tenant-123',
 *     emailRequest: { to: 'user@example.com', subject: 'Welcome', ... }
 *   }
 * });
 * ```
 */
export { EmailJobHandler } from './email/email-job-handler';

/**
 * Email Job Data Types
 *
 * Type definitions for email job data and response structures.
 *
 * @example Job data structure
 * ```typescript
 * const jobData: IEmailJobData = {
 *   organizationId: 'tenant-123',
 *   emailRequest: {
 *     to: 'user@example.com',
 *     subject: 'Welcome!',
 *     html: '<h1>Welcome</h1>',
 *     from: 'noreply@example.com'
 *   }
 * };
 * ```
 */
export type { IEmailJobData, IEmailJobResponse } from './email/email-job-handler';

/**
 * NestJS Email Module Types
 *
 * Type exports for the NestJS Email Module integration.
 * Note: EmailProviderConfig and EmailProviderType are exported above
 * from ./config/interfaces.
 */
export type {
  IEmailModuleOptions,
  IEmailModuleAsyncOptions,
  IEmailModuleOptionsFactory,
  EmailModuleAsyncFactory
} from './email/interfaces';

/**
 * NestJS Email Module Constants
 *
 * Dependency injection tokens for the Email Module.
 * - EMAIL_MODULE_OPTIONS: Injection token for module configuration options
 * - EMAIL_PROVIDER: Injection token for the email provider instance
 *
 * @example
 * ```typescript
 * const optionsProvider: Provider = {
 *   provide: EMAIL_MODULE_OPTIONS,
 *   useValue: { global: true, provider: {...} }
 * };
 *
 * const providerProvider: Provider = {
 *   provide: EMAIL_PROVIDER,
 *   useFactory: (opts: IEmailModuleOptions) => createProviderInstance(opts.provider),
 *   inject: [EMAIL_MODULE_OPTIONS]
 * };
 * ```
 */
export { EMAIL_MODULE_OPTIONS, EMAIL_PROVIDER } from './email/email.constants';
