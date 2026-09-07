import type { ICommand } from '@package/types';

export interface ReprocessEmailWebhookEventCommandProps {
  webhookEventId: number;
  tenantId?: number;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

export class ReprocessEmailWebhookEventCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: number;
  readonly actorId?: string;
  readonly webhookEventId: number;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: ReprocessEmailWebhookEventCommandProps) {
    this.webhookEventId = props.webhookEventId;
    this.tenantId = props.tenantId ?? 0;
    this.actorId = props.actorId;
    this.requestId = props.requestId;
    this.correlationId = props.correlationId;
    this.causationId = props.causationId;
  }
}
