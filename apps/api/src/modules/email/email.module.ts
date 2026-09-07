/**
 * Email Module (Example Integration)
 *
 * This module demonstrates how to integrate @package/email with a NestJS
 * application using EmailModule.forRootAsync() with ConfigService.
 *
 * @packageDocumentation
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule as StarterEmailModule, EmailProviderType } from '@package/email';

import { MessagingController } from './email.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Email Module - Example NestJS integration
 *
 * Demonstrates proper EmailModule integration with:
 * - forRootAsync() for configuration from environment variables
 * - ConfigModule for environment variable loading
 * - Global registration for app-wide availability
 * - Example controller with email sending endpoints
 *
 * @example Environment variables for configuration
 * ```bash
 * # Provider selection
 * EMAIL_PROVIDER=resend  # resend | twilio | sendgrid | mock
 *
 * # Default sender (all providers)
 * DEFAULT_FROM_EMAIL=noreply@yourdomain.com
 * DEFAULT_FROM_NAME=Your App Name
 *
 * # Resend (if EMAIL_PROVIDER=resend)
 * RESEND_API_KEY=your-resend-api-key
 * ```
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    /**
     * EmailModule configuration with forRootAsync()
     *
     * Loads configuration from environment variables via ConfigService.
     * This is the recommended pattern for production applications.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    StarterEmailModule.forRootAsync({
      imports: [ConfigModule],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useFactory: (): any => {
        const rawProviderType = process.env['EMAIL_PROVIDER'];
        const normalizedProviderType = rawProviderType?.trim().toLowerCase() ?? '';
        const providerType =
          normalizedProviderType === ''
            ? EmailProviderType.MOCK
            : (normalizedProviderType as EmailProviderType);
        const defaultFromEmail = process.env['DEFAULT_FROM_EMAIL'] ?? 'noreply@example.com';

        let providerConfig: { type: EmailProviderType; defaultFromEmail: string; apiKey?: string };
        switch (providerType) {
          case EmailProviderType.RESEND:
            providerConfig = {
              type: EmailProviderType.RESEND,
              apiKey: process.env['RESEND_API_KEY'] ?? '',
              defaultFromEmail
            };
            break;
          case EmailProviderType.MOCK:
            providerConfig = {
              type: EmailProviderType.MOCK,
              defaultFromEmail
            };
            break;
          default:
            throw new Error(`Invalid EMAIL_PROVIDER value: ${rawProviderType ?? '(unset)'}`);
        }

        return {
          global: true,
          provider: providerConfig,
          enableGracefulShutdown: true,
          enableTracing: true
        };
      }
    }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
  ],
  controllers: [MessagingController],
  providers: [],
  exports: [StarterEmailModule]
})
export class EmailModule {}
