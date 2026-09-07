import { Test } from '@nestjs/testing';

import { GetUserSessionQuery } from '../../../queries/get-user-session.query';
import { AuthSessionStoreService } from '../../../services/auth-session-store.service';
import { GetUserSessionHandler } from '../get-user-session.handler';

import type { TestingModule } from '@nestjs/testing';

describe('GetUserSessionHandler', () => {
  let handler: GetUserSessionHandler;
  let authSessionStore: { listUserSessions: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    authSessionStore = {
      listUserSessions: jest.fn().mockResolvedValue([])
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetUserSessionHandler,
        {
          provide: AuthSessionStoreService,
          useValue: authSessionStore
        }
      ]
    }).compile();

    handler = module.get<GetUserSessionHandler>(GetUserSessionHandler);
  });

  describe('execute', () => {
    it('returns active sessions for the current user within the tenant', async () => {
      authSessionStore.listUserSessions.mockResolvedValueOnce([
        {
          sessionId: 'session-a',
          userId: '456',
          tenantId: 'tenant-a',
          tokenId: 'token-a',
          createdAt: new Date('2026-03-17T00:00:00.000Z'),
          expiresAt: new Date('2026-03-18T00:00:00.000Z'),
          lastActivity: new Date('2026-03-17T01:00:00.000Z'),
          active: true
        }
      ]);

      const query = new GetUserSessionQuery({
        tenantId: 'tenant-a',
        userId: 456
      });

      const result = await handler.execute(query);

      expect(authSessionStore.listUserSessions).toHaveBeenCalledWith('tenant-a', '456');
      expect(result).toEqual([
        expect.objectContaining({
          id: 'session-a',
          userId: 456,
          tenantId: 'tenant-a',
          tokenId: 'token-a',
          active: true
        })
      ]);
    });

    it('returns an empty array when no active sessions exist for the user', async () => {
      const query = new GetUserSessionQuery({
        tenantId: 'tenant-a',
        userId: 456
      });

      const result = await handler.execute(query);

      expect(result).toEqual([]);
    });
  });
});
