import { describe, expect, it } from '@jest/globals';

import { buildEncryptedStoreAuditEvent } from '../encrypted-store-audit-event';

describe('buildEncryptedStoreAuditEvent', () => {
  it('redacts sensitive payload fields and preserves trace metadata', () => {
    const event = buildEncryptedStoreAuditEvent({
      eventType: 'encrypted-store.entry.viewed.audit',
      tenantId: 123,
      actorId: '7',
      requestId: 'req-1',
      aggregateId: 88,
      action: 'VIEW_encryptedStore_ENTRY',
      target: {
        entityType: 'user',
        entityId: '42',
        email: 'secret@example.com'
      },
      details: {
        encryptedDataKey: 'ciphertext',
        classification: 'restricted',
        accessPath: 'entity_lookup'
      },
      correlationId: 'corr-1',
      causationId: 'cause-1'
    });

    expect(event.correlationId).toBe('corr-1');
    expect(event.causationId).toBe('cause-1');
    expect(event.payload).toEqual(
      expect.objectContaining({
        requestId: 'req-1',
        target: {
          entityType: 'user',
          entityId: '42'
        },
        details: {
          classification: 'restricted',
          accessPath: 'entity_lookup'
        }
      })
    );
  });
});
