import { describe, expect, it } from 'vitest';

import { mergeUserProfile } from './user-profile-merge';

import type { IUserProfileResponse, User } from '~/types/auth.types';

describe('mergeUserProfile', () => {
  const baseUser: User = {
    userId: '101',
    tenantId: '12',
    actorId: '101',
    email: 'user@example.com',
    name: 'User Name',
    displayName: 'User Name',
    photoUrl: undefined,
    avatarFileId: undefined,
    emailVerified: true,
    isActive: true,
    isVerified: true,
    roles: ['tenant_user'],
    permissions: ['tenant:users:read']
  };

  it('preserves avatar fields from profile payload', () => {
    const profile: IUserProfileResponse = {
      userId: '101',
      tenantId: '12',
      actorId: '101',
      email: 'user@example.com',
      roles: ['tenant_user'],
      permissions: ['tenant:users:read'],
      photoUrl: 'https://signed.example.test/avatar.png',
      avatarFileId: 301
    };

    expect(mergeUserProfile(baseUser, profile)).toMatchObject({
      photoUrl: 'https://signed.example.test/avatar.png',
      avatarFileId: 301
    });
  });

  it('keeps existing avatar fields when profile omits them', () => {
    const userWithAvatar: User = {
      ...baseUser,
      photoUrl: 'https://signed.example.test/avatar.png',
      avatarFileId: 301
    };
    const profile: IUserProfileResponse = {
      userId: '101',
      tenantId: '12',
      actorId: '101',
      roles: ['tenant_user'],
      permissions: ['tenant:users:read']
    };

    expect(mergeUserProfile(userWithAvatar, profile)).toMatchObject({
      photoUrl: 'https://signed.example.test/avatar.png',
      avatarFileId: 301
    });
  });

  it('clears avatar fields when the profile explicitly removes them', () => {
    const userWithAvatar: User = {
      ...baseUser,
      photoUrl: 'https://signed.example.test/avatar.png',
      avatarFileId: 301
    };
    const profile: IUserProfileResponse = {
      userId: '101',
      tenantId: '12',
      actorId: '101',
      roles: ['tenant_user'],
      permissions: ['tenant:users:read'],
      photoUrl: null,
      avatarFileId: null
    };

    expect(mergeUserProfile(userWithAvatar, profile)).toMatchObject({
      photoUrl: null,
      avatarFileId: null
    });
  });
});
