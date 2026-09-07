/**
 * NestJS Email Module Constants
 *
 * Dependency injection tokens and configuration constants for the @package/email
 * NestJS module integration. These tokens are used with NestJS's dependency
 * injection system to provide the email module configuration and provider.
 *
 * @packageDocumentation
 */

/**
 * Injection token for EmailModule configuration options.
 *
 * This token provides the module configuration (IEmailModuleOptions) to the
 * EmailModule.forRoot() and EmailModule.forRootAsync() methods. It contains
 * provider selection, timeouts, and other module-level settings.
 *
 * @example
 * ```typescript
 * const optionsProvider: Provider = {
 *   provide: EMAIL_MODULE_OPTIONS,
 *   useValue: {
 *     global: true,
 *     timeout: 30000,
 *   },
 * };
 * ```
 *
 * @see IEmailModuleOptions
 */
export const EMAIL_MODULE_OPTIONS = 'EMAIL_MODULE_OPTIONS';

/**
 * Injection token for the email provider instance.
 *
 * This token provides the concrete IEmailProvider implementation (e.g.,
 * ResendAdapter, TwilioAdapter) to the EmailService and other consumers.
 * The provider is instantiated based on the EMAIL_MODULE_OPTIONS configuration.
 *
 * @example
 * ```typescript
 * const providerProvider: Provider = {
 *   provide: EMAIL_PROVIDER,
 *   useFactory: (opts: IEmailModuleOptions) => {
 *     const config = resolveEmailProviderConfig(opts);
 *     return new ResendAdapter(config);
 *   },
 *   inject: [EMAIL_MODULE_OPTIONS],
 * };
 * ```
 *
 * @see IEmailProvider
 * @see IEmailModuleOptions
 */
export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

/**
 * Email queue name for async job processing.
 *
 * This constant defines the queue name used by both EmailService (job producer)
 * and EmailJobHandler (job consumer). Centralizing this value prevents drift
 * where jobs might be enqueued to one queue while the handler listens to another.
 *
 * @example
 * ```typescript
 * // Producer (EmailService)
 * await this.queue.add(EMAIL_QUEUE_NAME, emailJob);
 *
 * // Consumer (EmailJobHandler)
 * @Processor(EMAIL_QUEUE_NAME)
 * export class EmailJobHandler { }
 * ```
 */
export const EMAIL_QUEUE_NAME = 'emails';
