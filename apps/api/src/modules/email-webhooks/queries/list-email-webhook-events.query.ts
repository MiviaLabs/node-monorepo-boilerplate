import type {
  EmailWebhookProcessingStatus,
  EmailWebhookVerificationStatus
} from '@package/db-core';
import type { IQuery } from '@package/types';

export class ListEmailWebhookEventsQuery implements IQuery {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly provider?: string;
  readonly organizationId?: number;
  readonly processingStatus?: EmailWebhookProcessingStatus;
  readonly verificationStatus?: EmailWebhookVerificationStatus;
  readonly normalizedEventType?: string;
  readonly providerEventType?: string;
  readonly providerMessageId?: string;
  readonly providerDeliveryId?: string;
  readonly providerEventId?: string;
  readonly emailMessageId?: number;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(
    props: {
      tenantId?: number;
      actorId?: string;
      page?: number;
      pageSize?: number;
      provider?: string;
      organizationId?: number;
      processingStatus?: EmailWebhookProcessingStatus;
      verificationStatus?: EmailWebhookVerificationStatus;
      normalizedEventType?: string;
      providerEventType?: string;
      providerMessageId?: string;
      providerDeliveryId?: string;
      providerEventId?: string;
      emailMessageId?: number;
      dateFrom?: string;
      dateTo?: string;
      requestId?: string;
      correlationId?: string;
      causationId?: string;
    } = {}
  ) {
    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.page = props.page ?? 1;
    this.pageSize = props.pageSize ?? 20;
    this.provider = props.provider?.trim() ?? undefined;
    this.organizationId = props.organizationId;
    this.processingStatus = props.processingStatus;
    this.verificationStatus = props.verificationStatus;
    this.normalizedEventType = props.normalizedEventType?.trim() ?? undefined;
    this.providerEventType = props.providerEventType?.trim() ?? undefined;
    this.providerMessageId = props.providerMessageId?.trim() ?? undefined;
    this.providerDeliveryId = props.providerDeliveryId?.trim() ?? undefined;
    this.providerEventId = props.providerEventId?.trim() ?? undefined;
    this.emailMessageId = props.emailMessageId;
    this.dateFrom = props.dateFrom;
    this.dateTo = props.dateTo;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}
