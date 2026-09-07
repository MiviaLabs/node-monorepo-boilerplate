import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteStoredSessionMock = vi.fn();
const getStoredSessionMock = vi.fn();
const hasStoredSessionChangedMock = vi.fn();
const saveStoredSessionMock = vi.fn();

const hydrateAdminSessionMock = vi.fn();
const isSessionAuthFailureMock = vi.fn();
const refreshSessionMock = vi.fn();
const validateAccessTokenMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn()
}));

vi.mock('./session-store', () => ({
  deleteStoredSession: deleteStoredSessionMock,
  getStoredSession: getStoredSessionMock,
  hasStoredSessionChanged: hasStoredSessionChangedMock,
  saveStoredSession: saveStoredSessionMock
}));

vi.mock('../admin-auth-core', () => ({
  hydrateAdminSession: hydrateAdminSessionMock,
  isSessionAuthFailure: isSessionAuthFailureMock,
  refreshSession: refreshSessionMock,
  validateAccessToken: validateAccessTokenMock
}));

describe('server-session', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hasStoredSessionChangedMock.mockResolvedValue(false);
    isSessionAuthFailureMock.mockReturnValue(true);
  });

  it('hydrates validated sessions before saving them back to storage', async () => {
    getStoredSessionMock.mockResolvedValue({
      sessionId: 'session-123',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-123',
      expiresAt: '2026-03-17T00:00:00.000Z',
      refreshExpiresAt: '2099-03-18T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
      user: {
        userId: 'user-123',
        actorId: 'actor-123',
        email: 'owner@example.com',
        name: 'Bootstrap Owner',
        displayName: 'Bootstrap Owner',
        role: 'system_owner',
        roleLabel: 'System Owner',
        roles: ['system_owner'],
        permissions: ['system:tenants:create', 'system:tenants:update'],
        tenantId: 'tenant-123',
        tenantName: 'Bootstrap Ops',
        tenantDisplayName: 'Bootstrap Ops',
        avatarFallback: 'BO'
      }
    });

    validateAccessTokenMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-123',
      expiresIn: 3600,
      refreshExpiresIn: 604800,
      user: {
        id: 'user-123',
        actorId: 'actor-123',
        email: 'owner@example.com',
        name: 'Bootstrap Owner',
        displayName: 'Bootstrap Owner',
        role: 'System Owner',
        roles: ['system_owner'],
        permissions: [],
        avatarFallback: 'BO',
        tenantId: 'tenant-123'
      }
    });

    hydrateAdminSessionMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-123',
      expiresIn: 3600,
      refreshExpiresIn: 604800,
      user: {
        id: 'user-123',
        actorId: 'actor-123',
        email: 'owner@example.com',
        name: 'Bootstrap Owner',
        displayName: 'Bootstrap Owner',
        phoneNumber: '+14155550123',
        role: 'System Owner',
        roles: ['system_owner'],
        permissions: ['system:tenants:create', 'system:tenants:update'],
        avatarFallback: 'BO',
        tenantId: 'tenant-123',
        tenantName: 'Bootstrap Ops',
        tenantDisplayName: 'Bootstrap Ops'
      }
    });

    const { resolveAdminSessionById } = await import('./server-session');
    const result = await resolveAdminSessionById('session-123');

    expect(hydrateAdminSessionMock).toHaveBeenCalledTimes(1);
    expect(saveStoredSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          permissions: ['system:tenants:create', 'system:tenants:update'],
          tenantName: 'Bootstrap Ops',
          phoneNumber: '+14155550123'
        })
      })
    );
    expect(result.session?.user.permissions).toEqual([
      'system:tenants:create',
      'system:tenants:update'
    ]);
  });
});
