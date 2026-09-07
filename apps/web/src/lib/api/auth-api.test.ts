import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authApi } from './auth-api';

describe('authApi.getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('includes x-tenant-id when tenantId is provided', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          userId: '1',
          tenantId: '123',
          actorId: '1',
          roles: [],
          permissions: []
        }
      })
    });

    await authApi.getCurrentUser('access-token', '123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-tenant-id': '123'
        })
      })
    );
  });

  it('sends authorization without x-tenant-id when tenantId is not provided', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          userId: '1',
          tenantId: '123',
          actorId: '1',
          roles: [],
          permissions: []
        }
      })
    });

    await authApi.getCurrentUser('access-token');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token'
        })
      })
    );

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ];
    const headers = options.headers as Record<string, string>;
    expect(headers['x-tenant-id']).toBeUndefined();
  });

  it('supports server-session-backed calls without explicit bearer token', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          userId: '1',
          tenantId: '123',
          actorId: '1',
          roles: [],
          permissions: []
        }
      })
    });

    await authApi.getCurrentUser(undefined, '123');

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ];
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-tenant-id']).toBe('123');
  });
});

describe('authApi.refreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('includes x-tenant-id when tenantId is provided', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          idToken: 'new-id-token',
          expiresIn: 3600,
          refreshExpiresIn: 1209600,
          user: {
            userId: '1',
            email: 'user@example.com',
            emailVerified: true,
            roles: [],
            permissions: [],
            tenantId: '123'
          },
          isNewUser: false
        }
      })
    });

    await authApi.refreshToken('refresh-token', '123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-tenant-id': '123'
        })
      })
    );
  });

  it('uses the server-owned session contract when refreshToken is omitted', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          idToken: 'new-id-token',
          expiresIn: 3600,
          refreshExpiresIn: 1209600,
          user: {
            userId: '1',
            email: 'user@example.com',
            emailVerified: true,
            roles: [],
            permissions: [],
            tenantId: '123'
          },
          isNewUser: false
        }
      })
    });

    await authApi.refreshToken(undefined, '123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({})
      })
    );
  });
});

describe('authApi.invitationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('accepts invitation with bearer authorization', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: 'accepted',
          tenantId: '123',
          invitationId: '77',
          membershipCreated: true
        }
      })
    });

    await authApi.acceptInvitation({ token: 'token-123', tenantId: '123' }, 'access-token');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/invitations/accept',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({ token: 'token-123', tenantId: '123' })
      })
    );
  });

  it('accepts invitation without explicit bearer authorization when server session is present', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: 'accepted',
          tenantId: '123',
          invitationId: '77',
          membershipCreated: true
        }
      })
    });

    await authApi.acceptInvitation({ token: 'token-123', tenantId: '123' });

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ];
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-tenant-id']).toBe('123');
  });

  it('declines invitation with bearer authorization', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          status: 'declined',
          tenantId: '123',
          invitationId: '77',
          membershipCreated: false
        }
      })
    });

    await authApi.declineInvitation({ token: 'token-123', tenantId: '123' }, 'access-token');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/invitations/decline',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({ token: 'token-123', tenantId: '123' })
      })
    );
  });
});

describe('authApi.updateMyProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('sends PATCH payload and optional auth headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          userId: '1',
          tenantId: '123',
          actorId: '1',
          displayName: 'New Name',
          roles: [],
          permissions: []
        }
      })
    });

    await authApi.updateMyProfile(
      { displayName: 'New Name', phoneNumber: '+14155552671' },
      'access-token',
      '123'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({ displayName: 'New Name', phoneNumber: '+14155552671' })
      })
    );
  });
});

describe('authApi.changeMyPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('sends PATCH payload and optional auth headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({})
    });

    await authApi.changeMyPassword('OldPass123!', 'NewPass123!', 'access-token', '123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/me/password',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-tenant-id': '123'
        }),
        body: JSON.stringify({ currentPassword: 'OldPass123!', newPassword: 'NewPass123!' })
      })
    );
  });
});

describe('authApi.passwordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('requests password reset through proxy endpoint', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true, message: 'ok' } })
    });

    await authApi.requestPasswordReset({ email: 'user@example.com' });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/password-reset/request',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' })
      })
    );
  });

  it('resets password through proxy endpoint', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true, message: 'Password reset successfully' } })
    });

    await authApi.resetPassword({
      token: 'token-123',
      newPassword: 'NewPass123!',
      confirmPassword: 'NewPass123!'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/password-reset/reset',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: 'token-123',
          newPassword: 'NewPass123!',
          confirmPassword: 'NewPass123!'
        })
      })
    );
  });

  it('validates reset token and unwraps data response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { isValid: true, status: 'valid' } })
    });

    const result = await authApi.validatePasswordResetToken('abc+123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/password-reset/validate?token=abc%2B123',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual({ isValid: true, status: 'valid' });
  });

  it('throws normalized error when token validation fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Too many requests' })
    });

    await expect(authApi.validatePasswordResetToken('bad-token')).rejects.toThrow(
      'Too many requests'
    );
  });
});
