/**
 * Auth API Client
 *
 * Direct HTTP client for authentication endpoints
 */

import type {
  AuthResponse,
  InvitationActionResponse,
  InvitationPreviewResponse,
  LoginInput,
  RegisterInput,
  IUserProfileResponse,
  RequestPasswordResetInput,
  ResetPasswordInput,
  PasswordResetTokenValidation
} from '~/types/auth.types';
import type { UserDataExport } from '~/types/gdpr.types';

import { InvitationPreviewFailureStatus } from '~/types/auth.types';

interface ValidationIssueLike {
  message?: unknown;
}

export class InvitationPreviewError extends Error {
  status: InvitationPreviewFailureStatus;
  httpStatus: number;

  constructor(message: string, status: InvitationPreviewFailureStatus, httpStatus: number) {
    super(message);
    this.name = 'InvitationPreviewError';
    this.status = status;
    this.httpStatus = httpStatus;
  }
}

export function normalizeApiErrorMessage(error: unknown, status: number): string {
  if (Array.isArray(error)) {
    const firstIssue = error[0] as ValidationIssueLike | undefined;
    if (typeof firstIssue?.message === 'string' && firstIssue.message.length > 0) {
      return firstIssue.message;
    }
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;

    if (Array.isArray(candidate.message)) {
      const firstItem = candidate.message[0] as ValidationIssueLike | string | undefined;
      if (typeof firstItem === 'string') return firstItem;
      if (
        typeof firstItem === 'object' &&
        firstItem !== null &&
        typeof (firstItem as ValidationIssueLike).message === 'string'
      ) {
        return (firstItem as ValidationIssueLike).message as string;
      }
    }

    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message;
    }

    if (typeof candidate.detail === 'string' && candidate.detail.length > 0) {
      return candidate.detail;
    }
  }

  return 'HTTP ' + status;
}

/**
 * Make API request to Next.js API route (which proxies to backend)
 *
 * This ensures all backend calls go through Next.js API routes,
 * not directly to the backend API.
 */
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  // Call Next.js API route instead of backend directly
  // Next.js route will proxy to backend: /api/auth/login -> backend /api/v1/iam/sessions
  const url = '/api' + endpoint;

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Include cookies for CSRF protection
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An unknown error occurred'
    }));

    throw new Error(normalizeApiErrorMessage(error, response.status));
  }

  // Handle 204 No Content responses (e.g., DELETE operations)
  if (response.status === 204) {
    return undefined as T;
  }

  const json = await response.json();
  // Unwrap { data, meta } response format from VersionInterceptor
  return (json as { data: T }).data;
}

/**
 * Auth API Client
 */
export const authApi = {
  async getInvitationPreview(token: string, tenantId: string): Promise<InvitationPreviewResponse> {
    const url =
      '/api/invitations/preview?token=' +
      encodeURIComponent(token) +
      '&tenantId=' +
      encodeURIComponent(tenantId);
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => ({ message: 'Invitation preview unavailable' }))) as Record<string, unknown>;

      const message =
        typeof payload.message === 'string' ? payload.message : 'HTTP ' + response.status;
      const statusFromPayload = payload.status;
      const mappedStatus: InvitationPreviewFailureStatus =
        statusFromPayload === InvitationPreviewFailureStatus.EXPIRED ||
        statusFromPayload === InvitationPreviewFailureStatus.CONSUMED
          ? statusFromPayload
          : response.status === 410
            ? InvitationPreviewFailureStatus.EXPIRED
            : InvitationPreviewFailureStatus.INVALID;

      throw new InvitationPreviewError(message, mappedStatus, response.status);
    }

    const json = await response.json();
    return ((json as { data?: InvitationPreviewResponse }).data ??
      (json as InvitationPreviewResponse)) as InvitationPreviewResponse;
  },

  /**
   * Register new user
   */
  async register(data: RegisterInput): Promise<AuthResponse> {
    const { tenantId, ...payload } = data;
    return apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      headers: {
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      },
      body: JSON.stringify(payload)
    });
  },

  /**
   * Login user
   */
  async login(data: LoginInput): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async acceptInvitation(
    params: { token: string; tenantId: string },
    accessToken?: string
  ): Promise<InvitationActionResponse> {
    return apiRequest<InvitationActionResponse>('/auth/invitations/accept', {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
        'x-tenant-id': params.tenantId
      },
      body: JSON.stringify(params)
    });
  },

  async declineInvitation(
    params: { token: string; tenantId: string },
    accessToken?: string
  ): Promise<InvitationActionResponse> {
    return apiRequest<InvitationActionResponse>('/auth/invitations/decline', {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
        'x-tenant-id': params.tenantId
      },
      body: JSON.stringify(params)
    });
  },

  /**
   * Refresh token
   */
  async refreshToken(refreshToken?: string, tenantId?: string): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/auth/refresh', {
      method: 'POST',
      headers: {
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      },
      body: JSON.stringify(refreshToken ? { refreshToken } : {})
    });
  },

  /**
   * Logout user
   */
  async logout(refreshToken?: string, accessToken?: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/auth/logout', {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {})
      },
      body: JSON.stringify(refreshToken ? { refreshToken } : {})
    });
  },

  /**
   * Get user sessions
   */
  async getSessions(accessToken?: string): Promise<unknown[]> {
    return apiRequest<unknown[]>('/auth/sessions', {
      method: 'GET',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {})
      }
    });
  },

  /**
   * Validate token
   */
  async validateToken(token: string): Promise<{ valid: boolean; user?: unknown }> {
    return apiRequest<{ valid: boolean; user?: unknown }>('/auth/validate', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  },

  /**
   * Get current user profile from /auth/me endpoint
   * Returns IUserProfileResponse matching backend UserProfileResponseDto
   */
  async getCurrentUser(accessToken?: string, tenantId?: string): Promise<IUserProfileResponse> {
    return apiRequest<IUserProfileResponse>('/auth/me', {
      method: 'GET',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      }
    });
  },

  /**
   * Update current user profile via /auth/me endpoint.
   */
  async updateMyProfile(
    profile: {
      displayName?: string;
      phoneNumber?: string;
    },
    accessToken?: string,
    tenantId?: string
  ): Promise<IUserProfileResponse> {
    return apiRequest<IUserProfileResponse>('/auth/me', {
      method: 'PATCH',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      },
      body: JSON.stringify(profile)
    });
  },

  /**
   * Request password reset email.
   */
  async requestPasswordReset(
    data: RequestPasswordResetInput
  ): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Complete password reset with a valid token.
   */
  async resetPassword(data: ResetPasswordInput): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/auth/password-reset/reset', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  /**
   * Validate password reset token status.
   */
  async validatePasswordResetToken(token: string): Promise<PasswordResetTokenValidation> {
    const response = await fetch(
      '/api/auth/password-reset/validate?token=' + encodeURIComponent(token),
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      }
    );

    const payload = await response.json().catch(() => ({ message: 'Validation failed' }));

    if (!response.ok) {
      throw new Error(normalizeApiErrorMessage(payload, response.status));
    }

    return ((payload as { data?: PasswordResetTokenValidation }).data ??
      (payload as PasswordResetTokenValidation)) as PasswordResetTokenValidation;
  },

  /**
   * Change current user password via /auth/me/password endpoint.
   */
  async changeMyPassword(
    currentPassword: string,
    newPassword: string,
    accessToken?: string,
    tenantId?: string
  ): Promise<void> {
    await apiRequest<void>('/auth/me/password', {
      method: 'PATCH',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
  },

  /**
   * Get user roles and permissions
   * @deprecated Use getCurrentUser() instead - /auth/roles is deprecated
   */
  async getUserRoles(accessToken: string): Promise<{ roles: string[]; permissions: string[] }> {
    return apiRequest<{ roles: string[]; permissions: string[] }>('/auth/roles', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken
      }
    });
  },

  /**
   * Delete user account
   */
  async deleteAccount(
    userId: string,
    accessToken?: string,
    tenantId?: string,
    reason?: string
  ): Promise<void> {
    const queryParams = reason ? '?reason=' + encodeURIComponent(reason) : '';
    const endpoint = '/auth/account/' + userId + queryParams;

    await apiRequest<void>(endpoint, {
      method: 'DELETE',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      }
    });
  },

  /**
   * Export user data for GDPR compliance (Article 15 - Right of Access)
   *
   * Returns complete export of all user data including profile,
   * identities, and organization information.
   *
   * @param userId - User ID to export data for
   * @param accessToken - JWT access token
   * @param tenantId - Tenant/organization ID
   * @returns UserDataExport containing all user data
   */
  async exportUserData(
    userId: string,
    accessToken?: string,
    tenantId?: string
  ): Promise<UserDataExport> {
    const endpoint = '/auth/account/' + userId + '/export';

    return apiRequest<UserDataExport>(endpoint, {
      method: 'GET',
      headers: {
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      }
    });
  }
};
