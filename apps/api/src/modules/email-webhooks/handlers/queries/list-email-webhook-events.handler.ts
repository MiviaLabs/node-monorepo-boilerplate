import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

import { EmailWebhookEventListDto } from '../../dto/email-webhook-operations.dto';
import { ListEmailWebhookEventsQuery } from '../../queries';
import {
  EmailWebhookEventRepository,
  type EmailWebhookOperationalOverviewRow
} from '../../repositories';

@QueryHandler(ListEmailWebhookEventsQuery)
export class ListEmailWebhookEventsHandler implements IQueryHandler<
  ListEmailWebhookEventsQuery,
  EmailWebhookEventListDto
> {
  constructor(private readonly emailWebhookEventRepository: EmailWebhookEventRepository) {}

  async execute(query: ListEmailWebhookEventsQuery): Promise<EmailWebhookEventListDto> {
    const result = await this.emailWebhookEventRepository.listOperationalOverview({
      page: query.page,
      pageSize: query.pageSize,
      provider: query.provider,
      organizationId: query.organizationId,
      processingStatus: query.processingStatus,
      verificationStatus: query.verificationStatus,
      normalizedEventType: query.normalizedEventType,
      providerEventType: query.providerEventType,
      providerMessageId: query.providerMessageId,
      providerDeliveryId: query.providerDeliveryId,
      providerEventId: query.providerEventId,
      emailMessageId: query.emailMessageId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo
    });

    return {
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      items: result.items.map((item) => this.mapItem(item))
    };
  }

  private mapItem(
    item: EmailWebhookOperationalOverviewRow
  ): EmailWebhookEventListDto['items'][number] {
    return {
      id: item.id,
      provider: item.provider,
      providerEventType: item.provider_event_type,
      normalizedEventType: item.normalized_event_type,
      processingStatus: item.processing_status,
      verificationStatus: item.verification_status,
      providerMessageId: item.provider_message_id ?? undefined,
      providerDeliveryId: item.provider_delivery_id ?? undefined,
      providerEventId: item.provider_event_id ?? undefined,
      organizationId: item.organization_id ?? undefined,
      organizationName: item.organization_name ?? undefined,
      emailMessageId: item.email_message_id ?? undefined,
      emailProviderMessageId: item.email_provider_message_id ?? undefined,
      messageStatus: item.message_status ?? undefined,
      latestProviderStatus: item.latest_provider_status ?? undefined,
      latestNormalizedProviderStatus: item.latest_normalized_provider_status ?? undefined,
      referenceType: item.reference_type ?? undefined,
      referenceId: item.reference_id ?? undefined,
      attemptCount: item.attempt_count,
      processingError: item.processing_error ?? undefined,
      occurredAt: this.toOptionalIsoString(item.occurred_at),
      receivedAt: this.toRequiredIsoString(item.received_at),
      processedAt: this.toOptionalIsoString(item.processed_at)
    };
  }

  private toRequiredIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private toOptionalIsoString(value: Date | string | null): string | undefined {
    if (value === null) {
      return undefined;
    }

    return this.toRequiredIsoString(value);
  }
}
