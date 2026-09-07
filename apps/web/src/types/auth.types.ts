/**
 * Auth Types
 *
 * Type definitions for authentication
 */

/**
 * User information - MUST match backend UserInfo from auth.types.ts
 */
export interface User {
  userId: string;
  email: string;
  phoneNumber?: string;
  username?: string;
  name?: string; // Matches backend `name` field
  displayName?: string; // Derived from name for display
  photoUrl?: string | null;
  avatarFileId?: number | null;
  emailVerified: boolean;
  isActive?: boolean;
  isVerified?: boolean;
  roles: string[];
  permissions: string[];
  tenantId: string;
  actorId?: string; // Actor ID from JWT token
}

/**
 * Helper to normalize user data from API
 *
 * Maps backend response to frontend User interface.
 *
 * @param userInfo - Raw user information from API response
 * @returns Normalized User object with all required fields
 */
export function normalizeUser(userInfo: Record<string, unknown>): User {
  return {
    userId: String(userInfo.userId),
    email: String(userInfo.email),
    phoneNumber: userInfo.phoneNumber as string | undefined,
    username: userInfo.username as string | undefined,
    name: userInfo.name as string | undefined,
    displayName:
      (userInfo.displayName as string | undefined) ??
      (userInfo.name as string | undefined) ??
      String(userInfo.email).split('@')[0],
    photoUrl: userInfo.photoUrl === null ? null : (userInfo.photoUrl as string | undefined),
    avatarFileId:
      typeof userInfo.avatarFileId === 'number'
        ? userInfo.avatarFileId
        : userInfo.avatarFileId === null
          ? null
          : typeof userInfo.avatarFileId === 'string'
            ? Number.parseInt(userInfo.avatarFileId, 10)
            : undefined,
    emailVerified: Boolean(userInfo.emailVerified ?? false),
    roles: (userInfo.roles as string[]) ?? [],
    permissions: (userInfo.permissions as string[]) ?? [],
    tenantId: String(userInfo.tenantId ?? '')
  };
}

/**
 * User profile response from /auth/me endpoint
 * Matches backend UserProfileResponseDto in user-profile-response.dto.ts
 */
export interface IUserProfileResponse {
  userId: string;
  tenantId: string;
  actorId: string;
  email?: string;
  phoneNumber?: string;
  name?: string;
  displayName?: string;
  photoUrl?: string | null;
  avatarFileId?: number | null;
  emailVerified?: boolean;
  isActive?: boolean;
  isVerified?: boolean;
  roles: string[];
  permissions: string[];
}

export interface UserOrganization {
  organizationId: string;
  tenantId: string;
  name: string;
  displayName?: string;
  slug: string;
  role: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface IAuthBootstrapResponse {
  user: IUserProfileResponse;
  organizations: UserOrganization[];
  currentOrganizationId: string | null;
  currentUserSettings: {
    sidebarSectionOrder?: unknown;
    dashboardDefaultView?: unknown;
    workspaceActiveProjectId?: unknown;
  };
  tenantName: string | null;
  tenantDisplayName: string | null;
  tenantSlug: string | null;
}

export const enum InvitationAcceptanceMode {
  REGISTER = 'register',
  EXISTING_ACCOUNT = 'existing_account'
}

export interface InvitationPreviewResponse {
  status: 'valid';
  acceptanceMode: InvitationAcceptanceMode;
  tenantName: string;
  inviterDisplayName: string;
  invitedEmailMasked: string;
  expiresAt: string | null;
}

export const enum InvitationActionStatus {
  ACCEPTED = 'accepted',
  DECLINED = 'declined'
}

export interface InvitationActionResponse {
  status: InvitationActionStatus;
  tenantId: string;
  invitationId: string;
  membershipCreated: boolean;
}

export const enum InvitationPreviewFailureStatus {
  INVALID = 'invalid',
  EXPIRED = 'expired',
  CONSUMED = 'consumed'
}

/**
 * Authentication tokens
 */

export interface RequestPasswordResetInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export const enum PasswordResetTokenStatus {
  VALID = 'valid',
  EXPIRED = 'expired',
  USED = 'used',
  NOT_FOUND = 'not-found'
}

export interface PasswordResetTokenValidation {
  isValid: boolean;
  status: PasswordResetTokenStatus;
  expiresAt?: string | Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

/**
 * Session data stored in Redis/cookie
 */
export interface SessionData {
  user: User;
  tokens: AuthTokens;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Login input
 */
export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Register input
 */
export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
  organizationName?: string;
  organizationSlug?: string;
  tenantId?: string;
  invitationToken?: string;
}

/**
 * Auth response from API
 */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: User | Record<string, unknown>;
  isNewUser: boolean;
}

/**
 * Session information
 */
export interface Session {
  id: string;
  userId: number;
  tenantId: string;
  tokenId: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
  active: boolean;
}
