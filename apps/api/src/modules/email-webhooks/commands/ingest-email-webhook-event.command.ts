import type { IEmailWebhookHeaders } from '@package/db-core';
import type { ICommand } from '@package/types';

export interface IngestEmailWebhookEventCommandProps {
  provider: string;
  rawBody: Buffer;
  body?: unknown;
  headers: IEmailWebhookHeaders;
  contentType?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

export class IngestEmailWebhookEventCommand implements ICommand {
  readonly readonly = true;
  readonly provider: string;
  readonly rawBody: Buffer;
  readonly body?: unknown;
  readonly headers: IEmailWebhookHeaders;
  readonly contentType?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly createdAt: Date;

  constructor(props: IngestEmailWebhookEventCommandProps) {
    this.provider = props.provider;
    this.rawBody = props.rawBody;
    this.body = props.body;
    this.headers = props.headers;
    this.contentType = normalizeOptionalString(props.contentType);
    this.requestId = normalizeOptionalString(props.requestId);
    this.correlationId = normalizeOptionalString(props.correlationId);
    this.causationId = normalizeOptionalString(props.causationId);
    this.createdAt = new Date();
  }
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue ?? undefined;
}
