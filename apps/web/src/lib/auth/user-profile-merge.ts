import type { IUserProfileResponse, User } from '~/types/auth.types';

function readOptionalProfileField<T>(
  profile: IUserProfileResponse,
  key: keyof IUserProfileResponse
): T | undefined {
  return Object.prototype.hasOwnProperty.call(profile, key) ? (profile[key] as T) : undefined;
}

export function mergeUserProfile(user: User, profile: IUserProfileResponse | null): User {
  if (!profile) {
    return user;
  }

  const nextPhotoUrl = readOptionalProfileField<string | null>(profile, 'photoUrl');
  const nextAvatarFileId = readOptionalProfileField<number | null>(profile, 'avatarFileId');

  return {
    ...user,
    userId: profile.userId ?? user.userId,
    tenantId: profile.tenantId ?? user.tenantId,
    actorId: profile.actorId ?? user.actorId,
    email: profile.email ?? user.email,
    phoneNumber: profile.phoneNumber ?? user.phoneNumber,
    name: profile.name ?? user.name,
    displayName: profile.displayName ?? profile.name ?? user.displayName,
    photoUrl: nextPhotoUrl === undefined ? user.photoUrl : nextPhotoUrl,
    avatarFileId: nextAvatarFileId === undefined ? user.avatarFileId : nextAvatarFileId,
    emailVerified: profile.emailVerified ?? user.emailVerified,
    isActive: profile.isActive ?? user.isActive,
    isVerified: profile.isVerified ?? user.isVerified,
    roles: profile.roles ?? user.roles,
    permissions: profile.permissions ?? user.permissions
  };
}
