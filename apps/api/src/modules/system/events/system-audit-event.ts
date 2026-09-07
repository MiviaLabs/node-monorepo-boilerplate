import { buildAuditOutboxMessage } from '@package/events';

export const SYSTEM_AUDIT_EVENT_SCHEMA_VERSION = '2.0' as const;

interface BuildSystemAuditEventParams {
  eventType: string;
  tenantId: string | number;
  action: string;
  actorId?: string;
  requestId?: string;
  aggregateId?: string | number;
  correlationId?: string;
  causationId?: string;
  details?: Record<string, unknown>;
  occurredAt?: string;
  target?: Record<string, unknown>;
}

export function buildSystemAuditEvent(params: BuildSystemAuditEventParams): {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  causationId?: string;
  tenantId: string;
  schemaVersion: typeof SYSTEM_AUDIT_EVENT_SCHEMA_VERSION;
} {
  const auditEvent = buildAuditOutboxMessage({
    ...params,
    schemaVersion: SYSTEM_AUDIT_EVENT_SCHEMA_VERSION
  });

  return {
    ...auditEvent,
    payload: auditEvent.payload as unknown as Record<string, unknown>,
    schemaVersion: SYSTEM_AUDIT_EVENT_SCHEMA_VERSION
  };
}
