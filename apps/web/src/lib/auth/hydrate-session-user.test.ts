import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hydrateSessionUser, mergeValidatedUser } from './hydrate-session-user';

import type { IUserProfileResponse, User } from '~/types/auth.types';

const { getCurrentUser, validateToken } = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  validateToken: vi.fn()
}));

vi.mock('../api/auth-api', () => ({
  authApi: {
    getCurrentUser,
    validateToken
  }
}));

const fallbackUser: User = {
  userId: '101',
  email: 'user@example.com',
  name: 'Example User',
  displayName: 'Example User',
  photoUrl: 'https://signed.example.test/avatar.png',
  avatarFileId: 301,
  emailVerified: true,
  roles: ['member'],
  permissions: ['users.read'],
  tenantId: '1'
};

describe('mergeValidatedUser', () => {
  it('clears avatar fields when validation returns explicit nulls', () => {
    const result = mergeValidatedUser(fallbackUser, {
      userId: '101',
      email: 'user@example.com',
      displayName: 'Example User',
      emailVerified: true,
      roles: ['member'],
      permissions: ['users.read'],
      tenantId: '1',
      photoUrl: null,
      avatarFileId: null
    });

    expect(result.photoUrl).toBeNull();
    expect(result.avatarFileId).toBeNull();
  });
});

describe('hydrateSessionUser', () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
    validateToken.mockReset();
  });

  it('prefers /auth/me when available', async () => {
    const profile: IUserProfileResponse = {
      userId: '101',
      tenantId: '1',
      actorId: '101',
      displayName: 'Example User',
      roles: ['member'],
      permissions: ['users.read'],
      photoUrl: null,
      avatarFileId: null
    };
    getCurrentUser.mockResolvedValue(profile);

    const result = await hydrateSessionUser('token', fallbackUser);

    expect(result.photoUrl).toBeNull();
    expect(result.avatarFileId).toBeNull();
    expect(validateToken).not.toHaveBeenCalled();
  });

  it('falls back to validation data when /auth/me fails', async () => {
    getCurrentUser.mockRejectedValue(new Error('profile fetch failed'));
    validateToken.mockResolvedValue({
      valid: true,
      user: {
        userId: '101',
        email: 'user@example.com',
        displayName: 'Example User',
        emailVerified: true,
        roles: ['member'],
        permissions: ['users.read'],
        tenantId: '1',
        photoUrl: null,
        avatarFileId: null
      }
    });

    const result = await hydrateSessionUser('token', fallbackUser);

    expect(result.photoUrl).toBeNull();
    expect(result.avatarFileId).toBeNull();
  });

  it('returns the fallback user when both profile hydration paths fail', async () => {
    getCurrentUser.mockRejectedValue(new Error('profile fetch failed'));
    validateToken.mockResolvedValue({ valid: false });

    const result = await hydrateSessionUser('token', fallbackUser);

    expect(result).toEqual(fallbackUser);
  });
});
