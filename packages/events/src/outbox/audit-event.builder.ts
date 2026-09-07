import { randomUUID } from 'node:crypto';

import { getRequestContext, redactAuditFields } from '@package/observability';

export const AUDIT_EVENT_SCHEMA_VERSION = '2.0' as const;

export interface BuildAuditOutboxMessageParams {
  eventType: string;
  tenantId: string | number;
  action: string;
  actorId?: string;
  requestId?: string;
  aggregateId?: string | number;
  aggregateVersion?: string | number;
  correlationId?: string;
  causationId?: string;
  details?: Record<string, unknown>;
  occurredAt?: string;
  target?: Record<string, unknown>;
  schemaVersion?: string;
}

export interface AuditOutboxPayload {
  action: string;
  tenantId: string;
  occurredAt: string;
  actorId?: string;
  requestId?: string;
  target?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export function buildAuditOutboxMessage(params: BuildAuditOutboxMessageParams): {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: string;
  payload: AuditOutboxPayload;
  correlationId: string | undefined;
  causationId: string | undefined;
  tenantId: string;
  schemaVersion: string;
} {
  const requestContext = getRequestContext();
  const tenantId = String(params.tenantId);
  const occurredAt = params.occurredAt ?? new Date().toISOString();
  const contextRequestId =
    typeof requestContext?.requestId === 'string' ? requestContext.requestId : undefined;
  const contextCorrelationId =
    typeof requestContext?.['correlationId'] === 'string'
      ? requestContext['correlationId']
      : undefined;
  const contextCausationId =
    typeof requestContext?.['causationId'] === 'string' ? requestContext['causationId'] : undefined;
  const requestId = params.requestId ?? contextRequestId;
  const correlationId = params.correlationId ?? contextCorrelationId ?? requestId;
  const causationId = params.causationId ?? contextCausationId ?? requestId;
  const target = redactAuditFields(params.target);
  const details = redactAuditFields(params.details);

  return {
    eventId: randomUUID(),
    eventType: params.eventType,
    aggregateId: String(params.aggregateId ?? tenantId),
    aggregateVersion: String(params.aggregateVersion ?? '1'),
    payload: {
      action: params.action,
      tenantId,
      occurredAt,
      ...(params.actorId !== undefined && { actorId: params.actorId }),
      ...(requestId !== undefined && { requestId }),
      ...(Object.keys(target).length > 0 && { target }),
      ...(Object.keys(details).length > 0 && { details })
    },
    correlationId,
    causationId,
    tenantId,
    schemaVersion: params.schemaVersion ?? AUDIT_EVENT_SCHEMA_VERSION
  };
}
