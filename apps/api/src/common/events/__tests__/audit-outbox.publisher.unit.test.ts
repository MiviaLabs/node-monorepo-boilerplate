import { Test } from '@nestjs/testing';
import { OutboxRepository } from '@package/events';

import { AuditOutboxPublisher } from '../audit-outbox.publisher';

describe('AuditOutboxPublisher', () => {
  it('builds metadata-only audit outbox events and preserves trace metadata', async () => {
    const outboxRepository = {
      insert: jest.fn(() => Promise.resolve())
    };

    const module = await Test.createTestingModule({
      providers: [
        AuditOutboxPublisher,
        {
          provide: OutboxRepository,
          useValue: outboxRepository
        }
      ]
    }).compile();

    const publisher = module.get(AuditOutboxPublisher);

    await publisher.insert({ kind: 'tx' } as never, {
      eventType: 'user.created.audit',
      tenantId: 1,
      action: 'CREATE_USER',
      actorId: '9',
      requestId: 'req-123',
      aggregateId: '42',
      correlationId: 'corr-123',
      causationId: 'cause-123',
      target: {
        entityType: 'user',
        entityId: '42',
        email: 'secret@example.com'
      },
      details: {
        emailAddress: 'secret@example.com',
        token: 'secret-token',
        changedFields: ['organizationId']
      }
    });

    expect(outboxRepository.insert).toHaveBeenCalledWith(
      { kind: 'tx' },
      expect.objectContaining({
        eventType: 'user.created.audit',
        correlationId: 'corr-123',
        causationId: 'cause-123',
        tenantId: '1',
        payload: expect.objectContaining({
          action: 'CREATE_USER',
          requestId: 'req-123',
          target: {
            entityType: 'user',
            entityId: '42'
          },
          details: {
            changedFields: ['organizationId']
          }
        })
      })
    );
  });
});
