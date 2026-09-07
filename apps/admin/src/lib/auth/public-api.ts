interface PasswordResetRequestInput {
  email: string;
}

interface InvitationPreviewResponse {
  status: 'valid';
  tenantName: string;
  inviterDisplayName: string;
  invitedEmailMasked: string;
  expiresAt: string | null;
}

export const enum InvitationPreviewFailureStatus {
  INVALID = 'invalid',
  EXPIRED = 'expired',
  CONSUMED = 'consumed'
}

function normalizeApiErrorMessage(error: unknown, status: number): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Record<string, unknown>;
    if (typeof candidate.message === 'string' && candidate.message.length > 0) {
      return candidate.message;
    }
  }

  return `HTTP ${status}`;
}

async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({ message: 'Request failed' }));
  if (!response.ok) {
    throw new Error(normalizeApiErrorMessage(payload, response.status));
  }

  return ((payload as { data?: T }).data ?? payload) as T;
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

export const adminPublicAuthApi = {
  requestPasswordReset(
    data: PasswordResetRequestInput
  ): Promise<{ success: boolean; message: string }> {
    return apiRequest('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getInvitationPreview(token: string, tenantId: string): Promise<InvitationPreviewResponse> {
    const response = await fetch(
      `/api/invitations/preview?token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}`,
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      }
    );

    const payload = (await response.json().catch(() => ({
      message: 'Invitation preview unavailable'
    }))) as Record<string, unknown>;

    if (!response.ok) {
      const statusFromPayload = payload.status;
      const status: InvitationPreviewFailureStatus =
        statusFromPayload === InvitationPreviewFailureStatus.EXPIRED ||
        statusFromPayload === InvitationPreviewFailureStatus.CONSUMED
          ? statusFromPayload
          : InvitationPreviewFailureStatus.INVALID;
      throw new InvitationPreviewError(
        normalizeApiErrorMessage(payload, response.status),
        status,
        response.status
      );
    }

    const data = (payload as { data?: unknown }).data ?? payload;
    return data as unknown as InvitationPreviewResponse;
  }
};
