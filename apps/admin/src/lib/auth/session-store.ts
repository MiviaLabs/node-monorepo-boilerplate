import { randomUUID } from 'node:crypto';

import Redis from 'ioredis';

import {
  DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS,
  DEFAULT_REFRESH_TOKEN_MAX_AGE_SECONDS
} from '../admin-auth-core';

import type { AdminOperatorUser } from './types';

const SESSION_KEY_PREFIX = 'admin:session';

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is required for admin session storage');
  }

  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });

  return redisClient;
}

export interface AdminStoredSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  user: AdminOperatorUser;
  expiresAt: string;
  refreshExpiresAt: string;
  updatedAt: string;
}

export function normalizeAccessSessionTtl(ttlSeconds?: number): number {
  return ttlSeconds && ttlSeconds > 0 ? ttlSeconds : DEFAULT_ACCESS_TOKEN_MAX_AGE_SECONDS;
}

export function normalizeRefreshSessionTtl(ttlSeconds?: number): number {
  return ttlSeconds && ttlSeconds > 0 ? ttlSeconds : DEFAULT_REFRESH_TOKEN_MAX_AGE_SECONDS;
}

function getSessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}:${sessionId}`;
}

async function ensureRedisConnection(): Promise<Redis> {
  const client = getRedisClient();
  if (client.status === 'wait') {
    await client.connect();
  }
  return client;
}

export function buildStoredSession(input: {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  user: AdminOperatorUser;
  expiresIn: number;
  refreshExpiresIn: number;
  sessionId?: string;
}): AdminStoredSession {
  const now = new Date();
  const expiresIn = normalizeAccessSessionTtl(input.expiresIn);
  const refreshExpiresIn = normalizeRefreshSessionTtl(input.refreshExpiresIn);

  return {
    sessionId: input.sessionId ?? randomUUID(),
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tenantId: input.tenantId,
    user: input.user,
    expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    refreshExpiresAt: new Date(now.getTime() + refreshExpiresIn * 1000).toISOString(),
    updatedAt: now.toISOString()
  };
}

export async function saveStoredSession(
  session: AdminStoredSession,
  ttlSeconds?: number
): Promise<void> {
  const ttl =
    ttlSeconds ??
    Math.max(1, Math.ceil((Date.parse(session.refreshExpiresAt) - Date.now()) / 1000));
  const client = await ensureRedisConnection();
  await client.set(getSessionKey(session.sessionId), JSON.stringify(session), 'EX', ttl);
}

export async function createStoredSession(input: {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  user: AdminOperatorUser;
  expiresIn: number;
  refreshExpiresIn: number;
}): Promise<AdminStoredSession> {
  const session = buildStoredSession(input);
  await saveStoredSession(session, normalizeRefreshSessionTtl(input.refreshExpiresIn));
  return session;
}

export async function getStoredSession(sessionId: string): Promise<AdminStoredSession | null> {
  const client = await ensureRedisConnection();
  const payload = await client.get(getSessionKey(sessionId));
  if (!payload) {
    return null;
  }

  return JSON.parse(payload) as AdminStoredSession;
}

export async function deleteStoredSession(sessionId: string): Promise<void> {
  const client = await ensureRedisConnection();
  await client.del(getSessionKey(sessionId));
}

export async function hasStoredSessionChanged(
  sessionId: string,
  updatedAt: string
): Promise<boolean> {
  const latest = await getStoredSession(sessionId);
  return latest !== null && latest.updatedAt !== updatedAt;
}
