import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { withRequestContext } from '@package/observability';

import { AUDIT_EVENT_SCHEMA_VERSION, buildAuditOutboxMessage } from '../../outbox';

describe('buildAuditOutboxMessage', () => {
  it('builds a metadata-only audit payload and reuses explicit trace identifiers', () => {
    const message = buildAuditOutboxMessage({
      eventType: 'tenant.members.listed.audit',
      tenantId: 12,
      action: 'tenant.members.listed',
      actorId: '99',
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1',
      target: {
        tenantId: '12',
        email: 'hidden@example.com'
      },
      details: {
        resultCount: 3,
        invitationToken: 'secret-token'
      }
    });

    assert.strictEqual(message.eventType, 'tenant.members.listed.audit');
    assert.strictEqual(message.tenantId, '12');
    assert.strictEqual(message.correlationId, 'corr-1');
    assert.strictEqual(message.causationId, 'cause-1');
    assert.strictEqual(message.schemaVersion, AUDIT_EVENT_SCHEMA_VERSION);
    assert.deepStrictEqual(message.payload, {
      action: 'tenant.members.listed',
      tenantId: '12',
      occurredAt: message.payload.occurredAt,
      actorId: '99',
      requestId: 'req-1',
      target: {
        tenantId: '12'
      },
      details: {
        resultCount: 3
      }
    });
  });

  it('falls back to request context for trace propagation', () => {
    const message = withRequestContext(
      {
        requestId: 'req-ctx',
        correlationId: 'corr-ctx',
        causationId: 'cause-ctx'
      },
      () =>
        buildAuditOutboxMessage({
          eventType: 'account.deleted.audit',
          tenantId: '7',
          action: 'account.deleted'
        })
    );

    assert.strictEqual(message.payload.requestId, 'req-ctx');
    assert.strictEqual(message.correlationId, 'corr-ctx');
    assert.strictEqual(message.causationId, 'cause-ctx');
  });

  it('defaults correlationId and causationId to requestId when no chain exists', () => {
    const message = buildAuditOutboxMessage({
      eventType: 'tenant.settings.viewed.audit',
      tenantId: '5',
      action: 'tenant.settings.viewed',
      requestId: 'req-root'
    });

    assert.strictEqual(message.payload.requestId, 'req-root');
    assert.strictEqual(message.correlationId, 'req-root');
    assert.strictEqual(message.causationId, 'req-root');
  });
});
