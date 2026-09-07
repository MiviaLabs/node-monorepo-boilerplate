import { Injectable } from '@nestjs/common';
import { OutboxRepository, buildAuditOutboxMessage } from '@package/events';

type OutboxInsertTarget = Parameters<OutboxRepository['insert']>[0];
type AuditInsertParams = Parameters<typeof buildAuditOutboxMessage>[0];
type BuiltAuditMessage = {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  tenantId: string;
  schemaVersion: string;
};

@Injectable()
export class AuditOutboxPublisher {
  constructor(private readonly outboxRepository: OutboxRepository) {}

  async insert(
    target: OutboxInsertTarget,
    params: AuditInsertParams | BuiltAuditMessage
  ): Promise<void> {
    const message = 'action' in params ? buildAuditOutboxMessage(params) : params;
    await this.outboxRepository.insert(target, message);
  }
}
