import { mergeUserProfile } from './user-profile-merge';
import { type User, normalizeUser } from '../../types/auth.types';
import { authApi } from '../api/auth-api';

function hasOwnField(value: unknown, key: string): boolean {
  return (
    typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, key)
  );
}

function mergeValidatedUser(fallbackUser: User, validatedUser: Record<string, unknown>): User {
  const normalizedValidatedUser = normalizeUser(validatedUser);

  return {
    ...fallbackUser,
    ...normalizedValidatedUser,
    tenantId: normalizedValidatedUser.tenantId || fallbackUser.tenantId,
    displayName: normalizedValidatedUser.displayName ?? fallbackUser.displayName,
    photoUrl: hasOwnField(validatedUser, 'photoUrl')
      ? normalizedValidatedUser.photoUrl
      : fallbackUser.photoUrl,
    avatarFileId: hasOwnField(validatedUser, 'avatarFileId')
      ? normalizedValidatedUser.avatarFileId
      : fallbackUser.avatarFileId
  };
}

export async function hydrateSessionUser(
  accessToken: string | undefined,
  fallbackUser: User
): Promise<User> {
  const currentUserData = await authApi
    .getCurrentUser(accessToken, fallbackUser.tenantId)
    .catch(() => null);
  if (currentUserData) {
    return mergeUserProfile(fallbackUser, currentUserData);
  }

  if (!accessToken) {
    return fallbackUser;
  }

  const validation = await authApi.validateToken(accessToken).catch(() => null);
  if (validation?.valid && validation.user && typeof validation.user === 'object') {
    return mergeValidatedUser(fallbackUser, validation.user as Record<string, unknown>);
  }

  return fallbackUser;
}

export { mergeValidatedUser };
