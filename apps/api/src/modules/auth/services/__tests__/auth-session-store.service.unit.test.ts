import { createHash } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { CacheService, getRedisClient } from '@package/redis';

import { AuthSessionStoreService } from '../auth-session-store.service';

import type { TestingModule } from '@nestjs/testing';

const redisClient = {
  zadd: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  zremrangebyscore: jest.fn(),
  zrange: jest.fn(),
  zrem: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  scan: jest.fn(),
  get: jest.fn()
};

jest.mock('@package/redis', () => ({
  getRedisClient: jest.fn(() => redisClient),
  CacheService: class {}
}));

describe('AuthSessionStoreService', () => {
  let service: AuthSessionStoreService;
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    deleteMultiple: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    cache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      deleteMultiple: jest.fn().mockResolvedValue(undefined)
    };
    redisClient.zadd.mockResolvedValue(1);
    redisClient.expire.mockResolvedValue(1);
    redisClient.ttl.mockResolvedValue(-1);
    redisClient.zremrangebyscore.mockResolvedValue(0);
    redisClient.zrange.mockResolvedValue([]);
    redisClient.zrem.mockResolvedValue(0);
    redisClient.del.mockResolvedValue(1);
    redisClient.exists.mockResolvedValue(0);
    redisClient.scan.mockResolvedValue(['0', []]);
    redisClient.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSessionStoreService,
        {
          provide: CacheService,
          useValue: cache
        }
      ]
    }).compile();

    service = module.get(AuthSessionStoreService);
  });

  it('creates a session with refresh and access token fingerprints', async () => {
    const refreshTokenId = createHash('sha256').update('refresh-token-a').digest('hex');
    const accessTokenId = createHash('sha256').update('access-token-a').digest('hex');

    const result = await service.createSession({
      tenantId: 'tenant-a',
      userId: '123',
      sessionId: 'session-a',
      refreshToken: 'refresh-token-a',
      refreshExpiresIn: 3600,
      accessToken: 'access-token-a',
      accessTokenExpiresIn: 600
    });

    expect(result).toEqual({ sessionId: 'session-a' });
    expect(cache.set).toHaveBeenCalledWith(
      `auth:refresh:tenant-a:${refreshTokenId}`,
      expect.any(String),
      { ttl: 3600 }
    );
    expect(cache.set).toHaveBeenCalledWith(
      `auth:refresh:token-id:${refreshTokenId}`,
      expect.any(String),
      { ttl: 3600 }
    );
    expect(cache.set).toHaveBeenCalledWith(
      'auth:session:tenant-a:session-a',
      expect.objectContaining({
        sessionId: 'session-a',
        tokenId: refreshTokenId,
        accessTokenId,
        active: true
      }),
      { ttl: 3600 }
    );
    expect(getRedisClient).toHaveBeenCalled();
    expect(redisClient.zadd).toHaveBeenCalledWith(
      'auth:user-sessions:tenant-a:123',
      expect.any(Number),
      'session-a'
    );
    expect(redisClient.expire).toHaveBeenCalledWith('auth:user-sessions:tenant-a:123', 3600);
  });

  it('rotates an existing session and blacklists the previous access token fingerprint', async () => {
    const currentRefreshTokenId = createHash('sha256').update('refresh-token-a').digest('hex');
    const currentAccessTokenId = createHash('sha256').update('access-token-a').digest('hex');
    const nextRefreshTokenId = createHash('sha256').update('refresh-token-b').digest('hex');
    const nextAccessTokenId = createHash('sha256').update('access-token-b').digest('hex');

    cache.get.mockImplementation(async (key: string) => {
      if (key === `auth:refresh:tenant-a:${currentRefreshTokenId}`) {
        return {
          tokenId: currentRefreshTokenId,
          userId: '123',
          tenantId: 'tenant-a',
          sessionId: 'session-a',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          revoked: false
        };
      }

      if (key === 'auth:session:tenant-a:session-a') {
        return {
          sessionId: 'session-a',
          userId: '123',
          tenantId: 'tenant-a',
          tokenId: currentRefreshTokenId,
          createdAt: new Date('2026-03-17T00:00:00.000Z').toISOString(),
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          lastActivity: new Date('2026-03-17T00:00:00.000Z').toISOString(),
          accessTokenId: currentAccessTokenId,
          accessTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
          active: true
        };
      }

      return null;
    });

    const result = await service.rotateSession({
      tenantId: 'tenant-a',
      userId: '123',
      currentRefreshToken: 'refresh-token-a',
      nextRefreshToken: 'refresh-token-b',
      refreshExpiresIn: 7200,
      accessToken: 'access-token-b',
      accessTokenExpiresIn: 900
    });

    expect(result).toEqual({ sessionId: 'session-a' });
    expect(cache.set).toHaveBeenCalledWith(
      `auth:blacklist:access:tenant-a:${currentAccessTokenId}`,
      '1',
      expect.objectContaining({ ttl: expect.any(Number) })
    );
    expect(cache.set).toHaveBeenCalledWith(
      'auth:session:tenant-a:session-a',
      expect.objectContaining({
        sessionId: 'session-a',
        tokenId: nextRefreshTokenId,
        accessTokenId: nextAccessTokenId
      }),
      { ttl: 7200 }
    );
    expect(redisClient.zadd).toHaveBeenCalledWith(
      'auth:user-sessions:tenant-a:123',
      expect.any(Number),
      'session-a'
    );
    expect(redisClient.expire).toHaveBeenCalledWith('auth:user-sessions:tenant-a:123', 7200);
  });

  it('reports access tokens as revoked when their fingerprint is blacklisted', async () => {
    const accessTokenId = createHash('sha256')
      .update('header.eyJ0ZW5hbnRfaWQiOiJ0ZW5hbnQtYSJ9.signature')
      .digest('hex');
    cache.get.mockResolvedValue('1');

    const result = await service.isAccessTokenRevoked(
      'header.eyJ0ZW5hbnRfaWQiOiJ0ZW5hbnQtYSJ9.signature',
      'tenant-a'
    );

    expect(result).toBe(true);
    expect(cache.get).toHaveBeenCalledWith(`auth:blacklist:access:tenant-a:${accessTokenId}`);
  });

  it('reads refresh token info directly from the session cache', async () => {
    const refreshTokenId = createHash('sha256').update('refresh-token-a').digest('hex');
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    cache.get.mockImplementation(async (key: string) => {
      if (key === `auth:refresh:tenant-a:${refreshTokenId}`) {
        return {
          tokenId: refreshTokenId,
          userId: '123',
          tenantId: 'tenant-a',
          sessionId: 'session-a',
          expiresAt,
          revoked: false
        };
      }

      return null;
    });

    const result = await service.getRefreshTokenInfo('refresh-token-a', 'tenant-a');

    expect(result).toEqual({
      tokenId: refreshTokenId,
      userId: '123',
      tenantId: 'tenant-a',
      sessionId: 'session-a',
      expiresAt,
      revoked: false
    });
  });

  it('lists active sessions through the per-user index and prunes stale entries', async () => {
    redisClient.zrange.mockResolvedValueOnce(['session-a', 'session-missing', 'session-b']);
    cache.get.mockImplementation(async (key: string) => {
      if (key === 'auth:user-sessions:index-ready:tenant-a:123') {
        return '1';
      }

      if (key === 'auth:session:tenant-a:session-a') {
        return {
          sessionId: 'session-a',
          userId: '123',
          tenantId: 'tenant-a',
          tokenId: 'token-a',
          createdAt: '2026-03-17T00:00:00.000Z',
          expiresAt: '2026-03-18T00:00:00.000Z',
          lastActivity: '2026-03-17T01:00:00.000Z',
          active: true
        };
      }

      if (key === 'auth:session:tenant-a:session-b') {
        return {
          sessionId: 'session-b',
          userId: '123',
          tenantId: 'tenant-a',
          tokenId: 'token-b',
          createdAt: '2026-03-17T00:00:00.000Z',
          expiresAt: '2026-03-18T00:00:00.000Z',
          lastActivity: '2026-03-17T01:00:00.000Z',
          active: false
        };
      }

      return null;
    });

    const result = await service.listUserSessions('tenant-a', '123');

    expect(redisClient.zremrangebyscore).toHaveBeenCalledWith(
      'auth:user-sessions:tenant-a:123',
      '-inf',
      expect.any(Number)
    );
    expect(redisClient.zrange).toHaveBeenCalledWith('auth:user-sessions:tenant-a:123', 0, -1);
    expect(redisClient.zrem).toHaveBeenCalledWith(
      'auth:user-sessions:tenant-a:123',
      'session-missing',
      'session-b'
    );
    expect(result).toEqual([
      expect.objectContaining({
        sessionId: 'session-a',
        userId: '123',
        active: true
      })
    ]);
  });

  it('backfills the per-user session index from a scan when no index exists yet', async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600_000);
    redisClient.zrange.mockResolvedValueOnce([]);
    redisClient.exists.mockResolvedValueOnce(0);
    redisClient.scan.mockResolvedValueOnce([
      '0',
      ['auth:session:tenant-a:session-a', 'auth:session:tenant-a:session-b']
    ]);
    redisClient.get
      .mockResolvedValueOnce(
        JSON.stringify({
          sessionId: 'session-a',
          userId: '123',
          tenantId: 'tenant-a',
          tokenId: 'token-a',
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          lastActivity: now.toISOString(),
          active: true
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          sessionId: 'session-b',
          userId: '999',
          tenantId: 'tenant-a',
          tokenId: 'token-b',
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          lastActivity: now.toISOString(),
          active: true
        })
      );

    const result = await service.listUserSessions('tenant-a', '123');

    expect(redisClient.scan).toHaveBeenCalledWith(
      '0',
      'MATCH',
      'auth:session:tenant-a:*',
      'COUNT',
      100
    );
    expect(redisClient.zadd).toHaveBeenCalledWith(
      'auth:user-sessions:tenant-a:123',
      expect.any(Number),
      'session-a'
    );
    expect(redisClient.expire).toHaveBeenCalledWith(
      'auth:user-sessions:tenant-a:123',
      expect.any(Number)
    );
    expect(cache.set).toHaveBeenCalledWith('auth:user-sessions:index-ready:tenant-a:123', '1', {
      ttl: expect.any(Number)
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        sessionId: 'session-a',
        userId: '123'
      })
    );
  });

  it('rebuilds the user session index when a legacy set key triggers WRONGTYPE', async () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600_000);

    redisClient.zremrangebyscore.mockRejectedValueOnce(
      new Error('WRONGTYPE Operation against a key holding the wrong kind of value')
    );
    redisClient.zrange.mockResolvedValueOnce([]);
    redisClient.scan.mockResolvedValueOnce(['0', ['auth:session:tenant-a:session-a']]);
    redisClient.get.mockResolvedValueOnce(
      JSON.stringify({
        sessionId: 'session-a',
        userId: '123',
        tenantId: 'tenant-a',
        tokenId: 'token-a',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastActivity: now.toISOString(),
        active: true
      })
    );

    const result = await service.listUserSessions('tenant-a', '123');

    expect(redisClient.del).toHaveBeenCalledWith('auth:user-sessions:tenant-a:123');
    expect(redisClient.zadd).toHaveBeenCalledWith(
      'auth:user-sessions:tenant-a:123',
      expect.any(Number),
      'session-a'
    );
    expect(result).toHaveLength(1);
  });

  it('removes a revoked session from the per-user index', async () => {
    cache.get.mockResolvedValueOnce({
      sessionId: 'session-a',
      userId: '123',
      tenantId: 'tenant-a',
      tokenId: 'token-a',
      createdAt: '2026-03-17T00:00:00.000Z',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lastActivity: '2026-03-17T01:00:00.000Z',
      active: true
    });

    await service.revokeSession('session-a', 'tenant-a');

    expect(cache.set).toHaveBeenCalledWith(
      'auth:session:tenant-a:session-a',
      expect.objectContaining({
        sessionId: 'session-a',
        active: false
      }),
      expect.objectContaining({ ttl: expect.any(Number) })
    );
    expect(cache.deleteMultiple).toHaveBeenCalledWith([
      'auth:refresh:tenant-a:token-a',
      'auth:refresh:token-id:token-a'
    ]);
    expect(redisClient.zrem).toHaveBeenCalledWith('auth:user-sessions:tenant-a:123', 'session-a');
  });

  it('does not shorten the user-session index ttl when a shorter-lived session is added', async () => {
    redisClient.ttl.mockResolvedValueOnce(7200);

    await service.createSession({
      tenantId: 'tenant-a',
      userId: '123',
      sessionId: 'session-shorter',
      refreshToken: 'refresh-token-shorter',
      refreshExpiresIn: 3600,
      accessToken: 'access-token-shorter',
      accessTokenExpiresIn: 600
    });

    expect(redisClient.expire).not.toHaveBeenCalledWith('auth:user-sessions:tenant-a:123', 3600);
  });
});
