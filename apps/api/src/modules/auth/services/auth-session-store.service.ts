import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { TokenService } from '@package/auth';
import { CacheService, getRedisClient } from '@package/redis';

import { measurePhase0 } from '../../../common/services/phase-zero-diagnostics.service';

import type { RefreshTokenInfo, SessionInfo } from '@package/auth';

interface StoredSession extends SessionInfo {
  accessTokenId?: string;
  accessTokenExpiresAt?: string;
}

interface CreateSessionParams {
  tenantId: string;
  userId: string;
  sessionId?: string;
  refreshToken: string;
  refreshExpiresIn: number;
  accessToken: string;
  accessTokenExpiresIn: number;
}

interface RotateSessionParams {
  tenantId: string;
  userId: string;
  currentRefreshToken: string;
  nextRefreshToken: string;
  refreshExpiresIn: number;
  accessToken: string;
  accessTokenExpiresIn: number;
}

@Injectable()
export class AuthSessionStoreService {
  private readonly tokenService: TokenService;
  private readonly redis = getRedisClient();

  constructor(private readonly cache: CacheService) {
    this.tokenService = new TokenService(cache);
  }

  async createSession(params: CreateSessionParams): Promise<{ sessionId: string }> {
    const sessionId = params.sessionId ?? randomUUID();
    const refreshTokenId = this.fingerprintToken(params.refreshToken);
    const accessTokenId = this.fingerprintToken(params.accessToken);
    const now = new Date();

    await this.tokenService.storeRefreshToken(
      refreshTokenId,
      params.userId,
      params.tenantId,
      sessionId,
      params.refreshExpiresIn
    );

    await this.writeSession(
      {
        sessionId,
        userId: params.userId,
        tenantId: params.tenantId,
        tokenId: refreshTokenId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + params.refreshExpiresIn * 1000),
        lastActivity: now,
        active: true,
        accessTokenId,
        accessTokenExpiresAt: new Date(
          now.getTime() + params.accessTokenExpiresIn * 1000
        ).toISOString()
      },
      params.refreshExpiresIn
    );

    return { sessionId };
  }

  async rotateSession(params: RotateSessionParams): Promise<{ sessionId: string }> {
    const currentRefreshTokenId = this.fingerprintToken(params.currentRefreshToken);
    const existingRefreshToken = await this.getStoredRefreshToken(
      currentRefreshTokenId,
      params.tenantId
    );
    const sessionId = existingRefreshToken?.sessionId ?? randomUUID();
    const existingSession = await this.getStoredSession(sessionId, params.tenantId);

    if (existingSession?.accessTokenId && existingSession.accessTokenExpiresAt) {
      await this.blacklistFingerprint(
        existingSession.accessTokenId,
        params.tenantId,
        new Date(existingSession.accessTokenExpiresAt)
      );
    }

    await this.tokenService.deleteRefreshToken(currentRefreshTokenId, params.tenantId);

    const nextRefreshTokenId = this.fingerprintToken(params.nextRefreshToken);
    const accessTokenId = this.fingerprintToken(params.accessToken);
    const now = new Date();

    await this.tokenService.storeRefreshToken(
      nextRefreshTokenId,
      params.userId,
      params.tenantId,
      sessionId,
      params.refreshExpiresIn
    );

    await this.writeSession(
      {
        sessionId,
        userId: params.userId,
        tenantId: params.tenantId,
        tokenId: nextRefreshTokenId,
        createdAt: existingSession?.createdAt ?? now,
        expiresAt: new Date(now.getTime() + params.refreshExpiresIn * 1000),
        lastActivity: now,
        active: true,
        accessTokenId,
        accessTokenExpiresAt: new Date(
          now.getTime() + params.accessTokenExpiresIn * 1000
        ).toISOString()
      },
      params.refreshExpiresIn
    );

    return { sessionId };
  }

  async listUserSessions(tenantId: string, userId: string): Promise<SessionInfo[]> {
    const indexKey = this.getUserSessionIndexKey(tenantId, userId);
    const indexReadyKey = this.getUserSessionIndexReadyKey(tenantId, userId);

    await this.prepareUserSessionIndex(indexKey);

    const sessionIds = await this.redis.zrange(indexKey, 0, -1);
    const indexedSessions =
      sessionIds.length > 0
        ? await this.readIndexedSessions(tenantId, userId, indexKey, sessionIds)
        : [];

    const indexReady = await this.cache.get<string | number | boolean>(indexReadyKey);
    if (indexReady === '1' || indexReady === 1 || indexReady === true) {
      return indexedSessions;
    }

    const backfilledSessions = await this.backfillUserSessionIndex(tenantId, userId, indexKey);
    const sessionsById = new Map<string, SessionInfo>();

    for (const session of indexedSessions) {
      sessionsById.set(session.sessionId, session);
    }

    for (const session of backfilledSessions) {
      sessionsById.set(session.sessionId, session);
    }

    const mergedSessions = Array.from(sessionsById.values());
    const markerTtl = Math.max(
      300,
      ...mergedSessions.map((session) =>
        Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
      )
    );

    await this.cache.set(indexReadyKey, '1', { ttl: markerTtl });

    return mergedSessions;
  }

  private async readIndexedSessions(
    tenantId: string,
    userId: string,
    indexKey: string,
    sessionIds: string[]
  ): Promise<SessionInfo[]> {
    const sessions = await Promise.all(
      sessionIds.map(async (sessionId) => ({
        sessionId,
        session: await this.getStoredSession(sessionId, tenantId)
      }))
    );
    const staleSessionIds: string[] = [];
    const activeSessions: SessionInfo[] = [];

    for (const { sessionId, session } of sessions) {
      if (!session?.active || session.userId !== userId) {
        staleSessionIds.push(sessionId);
        continue;
      }

      activeSessions.push(this.toSessionInfo(session));
    }

    if (staleSessionIds.length > 0) {
      await this.redis.zrem(indexKey, ...staleSessionIds);
    }

    return activeSessions;
  }

  async getSession(sessionId: string, tenantId: string): Promise<SessionInfo | undefined> {
    const session = await this.getStoredSession(sessionId, tenantId);
    return session ? this.toSessionInfo(session) : undefined;
  }

  async revokeSession(sessionId: string, tenantId: string): Promise<void> {
    const session = await this.getStoredSession(sessionId, tenantId);

    if (!session) {
      return;
    }

    const remainingTtl = Math.max(
      0,
      Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
    );

    if (remainingTtl > 0) {
      await this.cache.set(
        this.getSessionKey(session.sessionId, session.tenantId),
        {
          ...session,
          active: false
        },
        { ttl: remainingTtl }
      );
    } else {
      await this.cache.delete(this.getSessionKey(session.sessionId, session.tenantId));
    }

    if (session.tokenId) {
      await this.cache.deleteMultiple([
        this.getRefreshTokenKey(session.tokenId, session.tenantId),
        this.getRefreshTokenLookupKey(session.tokenId)
      ]);
    }

    await this.removeSessionFromUserIndex(session.tenantId, session.userId, session.sessionId);
  }

  async revokeSessionAccessToken(sessionId: string, tenantId: string): Promise<void> {
    const session = await this.getStoredSession(sessionId, tenantId);

    if (!session?.accessTokenId || !session.accessTokenExpiresAt) {
      return;
    }

    await this.blacklistFingerprint(
      session.accessTokenId,
      tenantId,
      new Date(session.accessTokenExpiresAt)
    );
  }

  async isAccessTokenRevoked(token: string, tenantId?: string): Promise<boolean> {
    return measurePhase0(
      'api.auth_session_store.is_access_token_revoked',
      {
        tenantIdPresent: Boolean(tenantId)
      },
      async () => {
        const resolvedTenantId = tenantId ?? this.extractTenantId(token);
        if (!resolvedTenantId) {
          return false;
        }

        return this.tokenService.isAccessTokenBlacklisted(
          this.fingerprintToken(token),
          resolvedTenantId
        );
      }
    );
  }

  async getRefreshTokenInfo(
    refreshToken: string,
    tenantId?: string
  ): Promise<RefreshTokenInfo | undefined> {
    const tokenId = this.fingerprintToken(refreshToken);

    if (tenantId) {
      return await this.getStoredRefreshToken(tokenId, tenantId);
    }

    return (
      (await this.cache.get<RefreshTokenInfo>(this.getRefreshTokenLookupKey(tokenId))) ?? undefined
    );
  }

  async revokeRefreshToken(
    refreshToken: string,
    tenantId: string,
    accessToken?: string
  ): Promise<void> {
    const storedToken = await this.getRefreshTokenInfo(refreshToken, tenantId);

    if (storedToken?.sessionId) {
      await this.revokeSession(storedToken.sessionId, storedToken.tenantId);
    } else {
      await this.tokenService.deleteRefreshToken(this.fingerprintToken(refreshToken), tenantId);
    }

    const expiresAt = this.extractAccessTokenExpiration(accessToken);
    if (accessToken && expiresAt) {
      await this.blacklistFingerprint(this.fingerprintToken(accessToken), tenantId, expiresAt);
    }
  }

  private async getStoredSession(
    sessionId: string,
    tenantId: string
  ): Promise<StoredSession | undefined> {
    return (
      (await this.cache.get<StoredSession>(this.getSessionKey(sessionId, tenantId))) ?? undefined
    );
  }

  private async getStoredRefreshToken(
    tokenId: string,
    tenantId: string
  ): Promise<RefreshTokenInfo | undefined> {
    return (
      (await this.cache.get<RefreshTokenInfo>(this.getRefreshTokenKey(tokenId, tenantId))) ??
      undefined
    );
  }

  private async writeSession(session: StoredSession, ttlSeconds: number): Promise<void> {
    await this.cache.set(this.getSessionKey(session.sessionId, session.tenantId), session, {
      ttl: ttlSeconds
    });
    await this.indexSession(session, ttlSeconds);
  }

  private async indexSession(session: StoredSession, ttlSeconds: number): Promise<void> {
    const indexKey = this.getUserSessionIndexKey(session.tenantId, session.userId);

    try {
      await this.redis.zadd(indexKey, new Date(session.expiresAt).getTime(), session.sessionId);
    } catch (error) {
      if (!this.isWrongTypeRedisError(error)) {
        throw error;
      }

      await this.redis.del(indexKey);
      await this.redis.zadd(indexKey, new Date(session.expiresAt).getTime(), session.sessionId);
    }

    await this.extendUserSessionIndexTtl(indexKey, ttlSeconds);
  }

  private async backfillUserSessionIndex(
    tenantId: string,
    userId: string,
    indexKey: string
  ): Promise<SessionInfo[]> {
    const activeSessions: SessionInfo[] = [];
    const sessionKeys = await this.listLegacySessionKeys(tenantId);
    const payloads = await Promise.all(sessionKeys.map((key) => this.redis.get(key)));

    for (const payload of payloads) {
      if (!payload) {
        continue;
      }

      const parsed = JSON.parse(payload) as SessionInfo;
      if (parsed.userId !== userId || !parsed.active) {
        continue;
      }

      activeSessions.push({
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        expiresAt: new Date(parsed.expiresAt),
        lastActivity: new Date(parsed.lastActivity)
      });
    }

    if (activeSessions.length === 0) {
      return [];
    }

    const ttlSeconds = Math.max(
      1,
      ...activeSessions.map((session) =>
        Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
      )
    );

    await Promise.all(
      activeSessions.map((session) =>
        this.redis.zadd(indexKey, session.expiresAt.getTime(), session.sessionId)
      )
    );
    await this.extendUserSessionIndexTtl(indexKey, ttlSeconds);

    return activeSessions;
  }

  private async removeSessionFromUserIndex(
    tenantId: string,
    userId: string,
    sessionId: string
  ): Promise<void> {
    const indexKey = this.getUserSessionIndexKey(tenantId, userId);

    try {
      await this.redis.zrem(indexKey, sessionId);
    } catch (error) {
      if (!this.isWrongTypeRedisError(error)) {
        throw error;
      }

      await this.redis.del(indexKey);
    }
  }

  private async blacklistFingerprint(
    fingerprint: string,
    tenantId: string,
    expiresAt: Date
  ): Promise<void> {
    const ttl = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    if (ttl <= 0) {
      return;
    }

    await this.tokenService.blacklistAccessToken(fingerprint, tenantId, ttl);
  }

  private getSessionKey(sessionId: string, tenantId: string): string {
    return `auth:session:${tenantId}:${sessionId}`;
  }

  private getRefreshTokenKey(tokenId: string, tenantId: string): string {
    return `auth:refresh:${tenantId}:${tokenId}`;
  }

  private getRefreshTokenLookupKey(tokenId: string): string {
    return `auth:refresh:token-id:${tokenId}`;
  }

  private getUserSessionIndexKey(tenantId: string, userId: string): string {
    return `auth:user-sessions:${tenantId}:${userId}`;
  }

  private getUserSessionIndexReadyKey(tenantId: string, userId: string): string {
    return `auth:user-sessions:index-ready:${tenantId}:${userId}`;
  }

  private fingerprintToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private extractAccessTokenExpiration(token?: string): Date | undefined {
    if (!token) {
      return undefined;
    }

    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) {
        return undefined;
      }

      const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8')) as Record<
        string,
        unknown
      >;
      const exp = decoded['exp'];
      if (typeof exp !== 'number' || !Number.isFinite(exp)) {
        return undefined;
      }

      return new Date(exp * 1000);
    } catch {
      return undefined;
    }
  }

  private extractTenantId(token: string): string | undefined {
    try {
      const payloadBase64 = token.split('.')[1];
      if (!payloadBase64) {
        return undefined;
      }

      const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8')) as Record<
        string,
        unknown
      >;
      const tenantId = decoded['tenant_id'] ?? decoded['tenantId'];
      return typeof tenantId === 'string' ? tenantId : undefined;
    } catch {
      return undefined;
    }
  }

  private toSessionInfo(session: StoredSession): SessionInfo {
    return {
      ...session,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      lastActivity: new Date(session.lastActivity)
    };
  }

  private async extendUserSessionIndexTtl(indexKey: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }

    const currentTtl = await this.redis.ttl(indexKey);
    if (currentTtl < ttlSeconds) {
      await this.redis.expire(indexKey, ttlSeconds);
    }
  }

  private async prepareUserSessionIndex(indexKey: string): Promise<void> {
    try {
      await this.redis.zremrangebyscore(indexKey, '-inf', Date.now());
    } catch (error) {
      if (!this.isWrongTypeRedisError(error)) {
        throw error;
      }

      await this.redis.del(indexKey);
    }
  }

  private isWrongTypeRedisError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('WRONGTYPE');
  }

  private async listLegacySessionKeys(tenantId: string): Promise<string[]> {
    const pattern = `auth:session:${tenantId}:*`;

    if (typeof this.redis.scan === 'function') {
      const matchedKeys: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, batch] = (await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        )) as unknown as [string, string[]];

        cursor = nextCursor;
        matchedKeys.push(...batch);
      } while (cursor !== '0');

      return matchedKeys;
    }

    if (typeof this.redis.keys === 'function') {
      return this.redis.keys(pattern);
    }

    return [];
  }
}
