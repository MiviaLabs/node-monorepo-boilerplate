import { buildAuditOutboxMessage } from '@package/events';

export const USER_AUDIT_EVENT_SCHEMA_VERSION = '2.0' as const;

interface BuildUserAuditEventParams {
  eventType: string;
  tenantId: string | number;
  action: string;
  actorId?: string;
  requestId?: string;
  aggregateId?: string | number;
  correlationId?: string;
  causationId?: string;
  details?: Record<string, unknown>;
  target?: Record<string, unknown>;
  occurredAt?: string;
}

export function buildUserAuditEvent(params: BuildUserAuditEventParams): {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  tenantId: string;
  schemaVersion: typeof USER_AUDIT_EVENT_SCHEMA_VERSION;
} {
  const auditEvent = buildAuditOutboxMessage({
    ...params,
    schemaVersion: USER_AUDIT_EVENT_SCHEMA_VERSION
  });

  return {
    ...auditEvent,
    payload: auditEvent.payload as unknown as Record<string, unknown>,
    schemaVersion: USER_AUDIT_EVENT_SCHEMA_VERSION
  };
}
