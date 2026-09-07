import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import { EmailWebhookProcessingSummaryDto } from '../../dto/email-webhook-operations.dto';
import { GetEmailWebhookProcessingSummaryQuery } from '../../queries';
import { EmailWebhookEventRepository } from '../../repositories';

@QueryHandler(GetEmailWebhookProcessingSummaryQuery)
export class GetEmailWebhookProcessingSummaryHandler implements IQueryHandler<
  GetEmailWebhookProcessingSummaryQuery,
  EmailWebhookProcessingSummaryDto
> {
  constructor(private readonly emailWebhookEventRepository: EmailWebhookEventRepository) {}

  async execute(): Promise<EmailWebhookProcessingSummaryDto> {
    const summary = await this.emailWebhookEventRepository.getProcessingSummary();

    return {
      generatedAt: new Date().toISOString(),
      totalEvents: summary.totalEvents,
      appliedEvents: summary.appliedEvents,
      unmatchedEvents: summary.unmatchedEvents,
      failedEvents: summary.failedEvents,
      pendingEvents: summary.pendingEvents,
      retryableEvents: summary.retryableEvents,
      latestReceivedAt: toOptionalIsoString(summary.latestReceivedAt)
    };
  }
}

function toOptionalIsoString(value: Date | string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
