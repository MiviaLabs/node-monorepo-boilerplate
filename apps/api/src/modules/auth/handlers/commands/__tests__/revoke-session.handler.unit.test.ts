import { Test } from '@nestjs/testing';

import { MAIN_DB } from '../../../../../common/database/database.constants';
import { RevokeSessionCommand } from '../../../commands/revoke-session.command';
import { AuthSessionStoreService } from '../../../services/auth-session-store.service';
import { RevokeSessionHandler } from '../revoke-session.handler';

import type { TestingModule } from '@nestjs/testing';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

describe('RevokeSessionHandler', () => {
  let handler: RevokeSessionHandler;
  let auditOutbox: { insert: jest.Mock };
  let authSessionStore: {
    getSession: jest.Mock;
    revokeSessionAccessToken: jest.Mock;
    revokeSession: jest.Mock;
  };
  let db: jest.Mocked<NodePgDatabase>;

  beforeEach(async () => {
    jest.clearAllMocks();

    auditOutbox = {
      insert: jest.fn()
    };
    authSessionStore = {
      getSession: jest.fn(),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeSessionAccessToken: jest.fn().mockResolvedValue(undefined)
    };

    const mockDb = {
      transaction: jest
        .fn()
        .mockImplementation(async (callback: (_tx: unknown) => Promise<void>) => {
          await callback({});
        })
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RevokeSessionHandler,
        {
          provide: AuthSessionStoreService,
          useValue: authSessionStore
        },
        {
          provide: AuditOutboxPublisher,
          useValue: auditOutbox
        },
        {
          provide: MAIN_DB,
          useValue: mockDb
        }
      ]
    }).compile();

    handler = module.get<RevokeSessionHandler>(RevokeSessionHandler);
    db = module.get(MAIN_DB);
  });

  it('revokes a session that belongs to the current user', async () => {
    authSessionStore.getSession.mockResolvedValue({
      sessionId: 'session-a',
      userId: '123',
      tenantId: 'tenant-a',
      tokenId: 'refresh-token-a',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastActivity: new Date().toISOString(),
      active: true
    });

    const result = await handler.execute(
      new RevokeSessionCommand({
        tenantId: 'tenant-a',
        actorId: '123',
        userId: 123,
        sessionId: 'session-a'
      })
    );

    expect(authSessionStore.getSession).toHaveBeenCalledWith('session-a', 'tenant-a');
    expect(authSessionStore.revokeSessionAccessToken).toHaveBeenCalledWith('session-a', 'tenant-a');
    expect(authSessionStore.revokeSession).toHaveBeenCalledWith('session-a', 'tenant-a');
    expect(auditOutbox.insert).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('returns not found when the session does not exist', async () => {
    authSessionStore.getSession.mockResolvedValue(undefined);

    await expect(
      handler.execute(
        new RevokeSessionCommand({
          tenantId: 'tenant-a',
          actorId: '123',
          userId: 123,
          sessionId: 'missing-session'
        })
      )
    ).rejects.toThrow('Session not found');

    expect(auditOutbox.insert).not.toHaveBeenCalled();
  });

  it('returns not found when the session belongs to another user', async () => {
    authSessionStore.getSession.mockResolvedValue({
      sessionId: 'session-b',
      userId: '999',
      tenantId: 'tenant-a',
      tokenId: 'refresh-token-b',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastActivity: new Date().toISOString(),
      active: true
    });

    await expect(
      handler.execute(
        new RevokeSessionCommand({
          tenantId: 'tenant-a',
          actorId: '123',
          userId: 123,
          sessionId: 'session-b'
        })
      )
    ).rejects.toThrow('Session not found');

    expect(auditOutbox.insert).not.toHaveBeenCalled();
  });
});
