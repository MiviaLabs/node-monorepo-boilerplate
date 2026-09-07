/**
 * Members tRPC Router
 *
 * Type-safe procedures for member management with tenant isolation.
 * All procedures enforce P0 multi-tenancy requirements.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '../trpc';

import type { InviteMemberResponse, MembersResponse, TenantMember } from '~/types/tenant.types';

import { resolveServerRequestAuthContextFromHeaders } from '~/lib/auth/server-request-auth';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';
import { MemberStatus, TENANT_ROLES } from '~/types/tenant.types';

/**
 * Zod schema for member filters
 */
const memberFiltersSchema = z.object({
  search: z.string().optional(),
  role: z
    .enum([TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN, TENANT_ROLES.USER, TENANT_ROLES.VIEWER])
    .optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
  sortBy: z.enum(['email', 'displayName', 'role', 'joinedAt', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

/**
 * Zod schema for pagination
 */
const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10)
});

/**
 * Zod schema for invite member input
 */
const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  roles: z
    .array(z.enum([TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN, TENANT_ROLES.USER, TENANT_ROLES.VIEWER]))
    .optional(),
  message: z.string().optional()
});

/**
 * Zod schema for update member role input
 */
const updateMemberRoleSchema = z.object({
  memberId: z.string().regex(/^\d+$/, 'Invalid member ID'),
  role: z.enum([TENANT_ROLES.OWNER, TENANT_ROLES.ADMIN, TENANT_ROLES.USER, TENANT_ROLES.VIEWER])
});

/**
 * Zod schema for update member status input
 */
const updateMemberStatusSchema = z.object({
  memberId: z.string().regex(/^\d+$/, 'Invalid member ID'),
  status: z.enum(['active', 'inactive', 'suspended', 'pending'])
});

/**
 * Zod schema for delete member input
 */
const deleteMemberSchema = z.object({
  memberId: z.string().regex(/^\d+$/, 'Invalid member ID')
});

const invitationActionSchema = z.object({
  invitationId: z.string().regex(/^\d+$/, 'Invalid invitation ID')
});

/**
 * Combined schema for getMembers input
 */
const getMembersInputSchema = paginationSchema.merge(memberFiltersSchema);

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

/**
 * Make authenticated API request
 *
 * P0: Enforces tenant scoping via x-tenant-id header
 * P0: No PII in logs (user IDs only, not emails)
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  ctx: { headers: Headers }
): Promise<T> {
  const apiBaseUrl = getVersionedApiBaseUrl('v1');
  const url = `${apiBaseUrl}${endpoint}`;
  const resolvedAuth = await resolveServerRequestAuthContextFromHeaders(ctx.headers, {
    source: 'web.trpc.members_router',
    route: endpoint
  });

  const authHeader =
    ctx.headers.get('authorization') ??
    (resolvedAuth?.accessToken ? `Bearer ${resolvedAuth.accessToken}` : null);
  const tenantId = ctx.headers.get('x-tenant-id') ?? resolvedAuth?.tenantId;

  if (!authHeader || !tenantId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    // Prevent stale list data when mutations are followed by refetch/invalidate.
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      'x-tenant-id': tenantId,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An unknown error occurred'
    }));

    // P0: Sanitize error messages - never forward backend errors directly to client
    // Backend error messages may contain PII (emails, internal details)
    // Log the detailed error server-side for debugging
    console.error('[Members API Error]', {
      endpoint,
      status: response.status,
      serverError: error
    });

    // Map to safe, generic client error messages
    const code =
      response.status === 404
        ? 'NOT_FOUND'
        : response.status === 403
          ? 'FORBIDDEN'
          : response.status === 401
            ? 'UNAUTHORIZED'
            : 'BAD_REQUEST';

    // Use generic, safe error messages
    const safeMessages: Record<typeof code, string> = {
      NOT_FOUND: 'The requested resource was not found',
      FORBIDDEN: 'You do not have permission to perform this action',
      UNAUTHORIZED: 'Authentication required',
      BAD_REQUEST: 'Invalid request parameters'
    };

    throw new TRPCError({
      code,
      message: safeMessages[code]
    });
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
 * Members router
 */
export const membersRouter = createTRPCRouter({
  /**
   * Get paginated members list with optional filtering
   *
   * P0: Tenant scoping enforced via x-tenant-id header
   * P0: No PII logged (member IDs only)
   */
  getMembers: publicProcedure
    .input(getMembersInputSchema)
    .query(async ({ input, ctx }): Promise<MembersResponse> => {
      const { page, pageSize, ...filters } = input;

      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      // Add optional filters
      if (filters.search) params.append('search', filters.search);
      if (filters.role) params.append('role', filters.role);
      if (filters.status) params.append('status', filters.status);
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

      const queryString = params.toString();
      const raw = await apiRequest<unknown>(
        `/workspaces/members${queryString ? `?${queryString}` : ''}`,
        { method: 'GET' },
        ctx
      );
      return normalizeMembersResponse(raw, page, pageSize);
    }),

  /**
   * Invite a new member to the tenant
   *
   * P0: Tenant scoping enforced
   * P0: Email is Class-C data - not logged
   */
  inviteMember: publicProcedure
    .input(inviteMemberSchema)
    .mutation(async ({ input, ctx }): Promise<InviteMemberResponse> => {
      return apiRequest<InviteMemberResponse>(
        '/workspaces/members/invite',
        {
          method: 'POST',
          body: JSON.stringify(input)
        },
        ctx
      );
    }),

  /**
   * Update member role
   *
   * P0: Tenant scoping enforced
   * P0: Only member ID logged, no PII
   */
  updateMemberRole: publicProcedure
    .input(updateMemberRoleSchema)
    .mutation(async ({ input, ctx }): Promise<TenantMember> => {
      const { memberId, role } = input;

      return apiRequest<TenantMember>(
        `/workspaces/members/${memberId}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role })
        },
        ctx
      );
    }),

  /**
   * Update member status (activate/suspend)
   *
   * P0: Tenant scoping enforced
   * P0: Only member ID logged, no PII
   */
  updateMemberStatus: publicProcedure
    .input(updateMemberStatusSchema)
    .mutation(async ({ input, ctx }): Promise<TenantMember> => {
      const { memberId, status } = input;

      return apiRequest<TenantMember>(
        `/workspaces/members/${memberId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status })
        },
        ctx
      );
    }),

  /**
   * Delete/remove member from tenant
   *
   * P0: Tenant scoping enforced
   * P0: Only member ID logged, no PII
   */
  deleteMember: publicProcedure
    .input(deleteMemberSchema)
    .mutation(async ({ input, ctx }): Promise<void> => {
      const { memberId } = input;

      return apiRequest<void>(`/workspaces/members/${memberId}`, { method: 'DELETE' }, ctx);
    }),

  generateInvitationLink: publicProcedure
    .input(invitationActionSchema)
    .mutation(
      async ({ input, ctx }): Promise<{ invitationId: string; invitationToken: string }> => {
        return apiRequest<{ invitationId: string; invitationToken: string }>(
          `/workspaces/members/invitations/${input.invitationId}/link`,
          { method: 'POST' },
          ctx
        );
      }
    ),

  resendInvitation: publicProcedure
    .input(invitationActionSchema)
    .mutation(
      async ({
        input,
        ctx
      }): Promise<{ invitationId: string; invitationToken?: string; emailDispatched: boolean }> => {
        return apiRequest<{
          invitationId: string;
          invitationToken?: string;
          emailDispatched: boolean;
        }>(`/workspaces/members/invitations/${input.invitationId}/resend`, { method: 'POST' }, ctx);
      }
    ),

  revokeInvitation: publicProcedure
    .input(invitationActionSchema)
    .mutation(async ({ input, ctx }): Promise<{ invitationId: string; status: 'cancelled' }> => {
      return apiRequest<{ invitationId: string; status: 'cancelled' }>(
        `/workspaces/members/invitations/${input.invitationId}`,
        { method: 'DELETE' },
        ctx
      );
    })
});

// Export input types for frontend usage
export type GetMembersInput = z.infer<typeof getMembersInputSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
export type DeleteMemberInput = z.infer<typeof deleteMemberSchema>;
export type InvitationActionInput = z.infer<typeof invitationActionSchema>;
