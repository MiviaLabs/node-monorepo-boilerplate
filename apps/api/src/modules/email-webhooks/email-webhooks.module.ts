import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { EmailWebhookProviderRegistry, ResendWebhookProvider } from '@package/email/webhooks';

import { EmailTrackingModule } from '../email-tracking/email-tracking.module';
import { InboundMailController } from './controllers/email-webhooks.controller';
import {
  IngestEmailWebhookEventHandler,
  ReprocessEmailWebhookEventHandler
} from './handlers/commands';
import {
  GetEmailWebhookProcessingSummaryHandler,
  ListEmailWebhookEventsHandler
} from './handlers/queries';
import { EmailWebhookEventRepository } from './repositories';
import { EmailWebhookProcessingService } from './services';

@Module({
  imports: [CqrsModule, ConfigModule, EmailTrackingModule],
  controllers: [InboundMailController],
  providers: [
    {
      provide: EmailWebhookProviderRegistry,
      useFactory: (configService: ConfigService) => {
        const registry = new EmailWebhookProviderRegistry();
        registry.registerFactory('resend', () => {
          const resendWebhookSecret = configService.get<string>('RESEND_WEBHOOK_SECRET');
          if (!resendWebhookSecret?.trim()) {
            throw new Error('RESEND_WEBHOOK_SECRET is required for Resend webhook verification');
          }

          return new ResendWebhookProvider({ webhookSecret: resendWebhookSecret });
        });

        return registry;
      },
      inject: [ConfigService]
    },
    EmailWebhookEventRepository,
    EmailWebhookProcessingService,
    IngestEmailWebhookEventHandler,
    ReprocessEmailWebhookEventHandler,
    GetEmailWebhookProcessingSummaryHandler,
    ListEmailWebhookEventsHandler
  ],
  exports: [EmailWebhookEventRepository]
})
export class InboundMailModule {}
