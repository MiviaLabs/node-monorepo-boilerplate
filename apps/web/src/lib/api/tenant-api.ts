/**
 * Tenant API Client
 *
 * Direct HTTP client for tenant and member management endpoints
 */

import type {
  InviteMemberInput,
  InviteMemberResponse,
  MemberFilters,
  MembersResponse,
  TenantMember,
  UpdateMemberRoleInput,
  UpdateMemberStatusInput
} from '~/types/tenant.types';

import { getAuthStorage } from '~/lib/auth/auth-storage';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';
import { MemberStatus, TENANT_ROLES } from '~/types/tenant.types';

function extractApiErrorMessage(payload: unknown, fallbackStatus: number): string {
  if (!payload || typeof payload !== 'object') {
    return `HTTP ${fallbackStatus}`;
  }

  const obj = payload as {
    message?: unknown;
    detail?: unknown;
    error?: unknown;
    data?: unknown;
    metadata?: { error?: { errors?: unknown } };
  };

  if (typeof obj.message === 'string' && obj.message.trim()) {
    return obj.message;
  }

  if (typeof obj.detail === 'string' && obj.detail.trim()) {
    return obj.detail;
  }

  if (typeof obj.error === 'string' && obj.error.trim()) {
    return obj.error;
  }

  if (obj.data && typeof obj.data === 'object') {
    const dataObj = obj.data as { message?: unknown };
    if (typeof dataObj.message === 'string' && dataObj.message.trim()) {
      return dataObj.message;
    }
  }

  const metadataErrors = obj.metadata?.error?.errors;
  if (Array.isArray(metadataErrors)) {
    const text = metadataErrors.find((entry) => typeof entry === 'string' && entry.trim());
    if (typeof text === 'string') {
      return text;
    }
  }

  return `HTTP ${fallbackStatus}`;
}

function normalizeMembersResponse(
  raw: unknown,
  fallbackPage: number,
  fallbackPageSize: number
): MembersResponse {
  const defaultMeta: MembersResponse['meta'] = {
    page: fallbackPage,
    pageSize: fallbackPageSize,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  };

  const obj = raw as {
    data?: unknown;
    members?: unknown;
    items?: unknown;
    results?: unknown;
    meta?: MembersResponse['meta'];
    pagination?: MembersResponse['meta'];
    pageInfo?: MembersResponse['meta'];
    metadata?: { pagination?: MembersResponse['meta'] };
  };

  const nested = obj?.data as
    | {
        data?: unknown;
        members?: unknown;
        items?: unknown;
        meta?: MembersResponse['meta'];
        pagination?: MembersResponse['meta'];
        metadata?: { pagination?: MembersResponse['meta'] };
      }
    | undefined;

  const rawData =
    (Array.isArray(raw) ? raw : undefined) ??
    (Array.isArray(obj?.data) ? obj.data : undefined) ??
    (Array.isArray(obj?.members) ? obj.members : undefined) ??
    (Array.isArray(obj?.items) ? obj.items : undefined) ??
    (Array.isArray(obj?.results) ? obj.results : undefined) ??
    (Array.isArray(nested?.data) ? nested.data : undefined) ??
    (Array.isArray(nested?.members) ? nested.members : undefined) ??
    (Array.isArray(nested?.items) ? nested.items : undefined) ??
    [];

  const data = rawData.map((member) => normalizeMember(member)) as MembersResponse['data'];
  const meta =
    obj?.meta ??
    obj?.metadata?.pagination ??
    obj?.pagination ??
    obj?.pageInfo ??
    nested?.meta ??
    nested?.metadata?.pagination ??
    nested?.pagination ??
    defaultMeta;

  const derivedTotal = data.length;
  const normalizedTotal = meta.total ?? (derivedTotal > 0 ? derivedTotal : defaultMeta.total);
  const normalizedPageSize =
    meta.pageSize ??
    (derivedTotal > 0 ? Math.max(derivedTotal, fallbackPageSize) : defaultMeta.pageSize);
  const normalizedTotalPages =
    meta.totalPages ??
    (normalizedPageSize > 0 ? Math.max(1, Math.ceil(normalizedTotal / normalizedPageSize)) : 1);

  return {
    data,
    meta: {
      page: meta.page ?? defaultMeta.page,
      pageSize: normalizedPageSize,
      total: normalizedTotal,
      totalPages: normalizedTotalPages,
      hasNext: meta.hasNext ?? (meta.page ?? fallbackPage) < normalizedTotalPages,
      hasPrevious: meta.hasPrevious ?? (meta.page ?? fallbackPage) > 1
    }
  };
}

function normalizeRole(role: unknown): TenantMember['role'] {
  if (role === TENANT_ROLES.OWNER || role === 'owner') return TENANT_ROLES.OWNER;
  if (role === TENANT_ROLES.ADMIN || role === 'admin') return TENANT_ROLES.ADMIN;
  if (role === TENANT_ROLES.USER || role === 'user' || role === 'member') return TENANT_ROLES.USER;
  if (role === TENANT_ROLES.VIEWER || role === 'viewer') return TENANT_ROLES.VIEWER;
  return TENANT_ROLES.USER;
}

function normalizeStatus(status: unknown, isActive: unknown): TenantMember['status'] {
  if (status === MemberStatus.ACTIVE || status === 'ACTIVE') return MemberStatus.ACTIVE;
  if (status === MemberStatus.INACTIVE || status === 'INACTIVE') return MemberStatus.INACTIVE;
  if (status === MemberStatus.SUSPENDED || status === 'SUSPENDED') return MemberStatus.SUSPENDED;
  if (status === MemberStatus.PENDING || status === 'PENDING') return MemberStatus.PENDING;
  if (typeof isActive === 'boolean') {
    return isActive ? MemberStatus.ACTIVE : MemberStatus.INACTIVE;
  }
  return MemberStatus.ACTIVE;
}

function normalizeMember(rawMember: unknown): TenantMember {
  const member = (rawMember ?? {}) as Record<string, unknown>;
  const id = String(member['id'] ?? member['memberId'] ?? member['userId'] ?? '');
  const userId = String(member['userId'] ?? member['user_id'] ?? member['id'] ?? id);
  const tenantId = String(
    member['tenantId'] ??
      member['tenant_id'] ??
      member['organizationId'] ??
      member['organization_id'] ??
      ''
  );
  const invitationIdValue = member['invitationId'] ?? member['invitation_id'];
  const invitationId =
    invitationIdValue === null || invitationIdValue === undefined
      ? undefined
      : String(invitationIdValue);
  const normalizedStatus = normalizeStatus(member['status'], member['isActive']);
  const isActive =
    typeof member['isActive'] === 'boolean'
      ? member['isActive']
      : normalizedStatus === MemberStatus.ACTIVE;
  const joinedAt = String(
    member['joinedAt'] ?? member['createdAt'] ?? member['created_at'] ?? new Date().toISOString()
  );

  return {
    id,
    userId,
    invitationId,
    tenantId,
    email: String(member['email'] ?? ''),
    displayName:
      typeof member['displayName'] === 'string'
        ? member['displayName']
        : typeof member['name'] === 'string'
          ? member['name']
          : undefined,
    photoUrl:
      typeof member['photoUrl'] === 'string'
        ? member['photoUrl']
        : member['photoUrl'] === null
          ? null
          : typeof member['avatarUrl'] === 'string'
            ? member['avatarUrl']
            : null,
    role: normalizeRole(member['role']),
    status: normalizedStatus,
    isActive,
    isDefault: Boolean(member['isDefault'] ?? member['is_default'] ?? false),
    joinedAt,
    updatedAt: typeof member['updatedAt'] === 'string' ? member['updatedAt'] : undefined,
    permissions: Array.isArray(member['permissions'])
      ? (member['permissions'] as string[])
      : undefined
  };
}

/**
 * Make API request with authentication
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  authContext: { accessToken: string; tenantId: string }
): Promise<T> {
  const apiBaseUrl = getVersionedApiBaseUrl('v1');
  const url = `${apiBaseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authContext.accessToken}`,
      'x-tenant-id': authContext.tenantId,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(extractApiErrorMessage(error, response.status));
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  const json = await response.json();
  // Unwrap { data, meta } response format
  return (json as { data: T }).data;
}

/**
 * Get auth context from AuthStorage
 */
function getAuthContext(): { accessToken: string; tenantId: string } {
  const authStorage = getAuthStorage();
  const session = authStorage.getCurrentSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  return {
    accessToken: session.tokens.accessToken,
    tenantId: session.user.tenantId
  };
}

/**
 * Tenant API Client
 */
export const tenantApi = {
  /**
   * Get tenant members with pagination and filtering
   */
  async getMembers(page = 1, pageSize = 10, filters?: MemberFilters): Promise<MembersResponse> {
    const authContext = getAuthContext();

    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString()
    });

    if (filters?.search) params.append('search', filters.search);
    if (filters?.role) params.append('role', filters.role);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.sortBy) params.append('sortBy', filters.sortBy);
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

    const queryString = params.toString();
    const raw = await apiRequest<unknown>(
      `/workspaces/members${queryString ? `?${queryString}` : ''}`,
      { method: 'GET' },
      authContext
    );

    return normalizeMembersResponse(raw, page, pageSize);
  },

  /**
   * Get current tenant settings
   */
  async getCurrentTenant(): Promise<{
    id: string;
    name: string;
    displayName?: string | null;
    settings: Record<string, unknown>;
  }> {
    const response = await fetch('/api/tenants/current', {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(extractApiErrorMessage(error, response.status));
    }

    const json = (await response.json()) as { data?: unknown };
    return (json.data ?? json) as {
      id: string;
      name: string;
      displayName?: string | null;
      settings: Record<string, unknown>;
    };
  },

  /**
   * Invite member to tenant
   */
  async inviteMember(input: InviteMemberInput): Promise<InviteMemberResponse> {
    const authContext = getAuthContext();
    return apiRequest<InviteMemberResponse>(
      '/workspaces/members/invite',
      {
        method: 'POST',
        body: JSON.stringify(input)
      },
      authContext
    );
  },

  /**
   * Remove member from tenant
   */
  async removeMember(memberId: string): Promise<void> {
    const authContext = getAuthContext();
    return apiRequest<void>(`/workspaces/members/${memberId}`, { method: 'DELETE' }, authContext);
  },

  /**
   * Update member role
   */
  async updateMemberRole(input: UpdateMemberRoleInput): Promise<TenantMember> {
    const authContext = getAuthContext();
    return apiRequest<TenantMember>(
      `/workspaces/members/${input.memberId}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: input.role })
      },
      authContext
    );
  },

  /**
   * Update member status (activate/suspend)
   */
  async updateMemberStatus(input: UpdateMemberStatusInput): Promise<TenantMember> {
    const authContext = getAuthContext();
    return apiRequest<TenantMember>(
      `/workspaces/members/${input.memberId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: input.status })
      },
      authContext
    );
  },

  /**
   * Update tenant settings
   */
  async updateTenantSettings(
    payload: {
      displayName?: string;
      isActive?: boolean;
      settings?: Record<string, unknown>;
    },
    tenantId?: string
  ): Promise<void> {
    const response = await fetch('/api/tenants/current', {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(tenantId ? { 'x-tenant-id': tenantId } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(extractApiErrorMessage(error, response.status));
    }
  }
};
