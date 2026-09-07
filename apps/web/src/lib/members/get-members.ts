/**
 * Server-Side Members Data Fetching
 *
 * Utility for fetching members data in Server Components
 *
 * IMPORTANT: This runs in Next.js Server Components (not Edge runtime).
 * Can access cookies and make API calls.
 * Used for server-side rendering with members data.
 */

import { headers } from 'next/headers';

import type { MemberFilters, MembersResponse, TenantMember } from '~/types/tenant.types';

import { resolveServerRequestAuthContext } from '~/lib/auth/server-request-auth';
import {
  ensurePhase0Trace,
  getPhase0ApiTargetAttributes,
  getPhase0TraceAttributes,
  getPhase0TraceHeaderMap,
  measurePhase0,
  recordPhase0Note
} from '~/lib/diagnostics/phase-zero-diagnostics';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';
import { MemberStatus, TENANT_ROLES } from '~/types/tenant.types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** API base URL */
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

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
 * Build query string from pagination and filters
 *
 * @param page - Page number
 * @param pageSize - Number of items per page
 * @param filters - Optional filters (search, role, status, sort)
 * @returns Query string with parameters
 */
function buildQueryString(page: number, pageSize: number, filters?: MemberFilters): string {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString()
  });

  if (filters?.search) params.append('search', filters.search);
  if (filters?.role) params.append('role', filters.role);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.sortBy) params.append('sortBy', filters.sortBy);
  if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

  return params.toString();
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Get members list for server-side rendering
 *
 * This function is designed to be called from Server Components.
 * It fetches the initial members list with pagination and filters.
 *
 * Features:
 * - Reads access token from cookies
 * - Calls backend API with authentication
 * - Supports pagination and filtering
 * - Returns members data and pagination metadata
 *
 * @param page - Page number (default: 1)
 * @param pageSize - Number of items per page (default: 50)
 * @param filters - Optional filters
 * @returns Members response with data and metadata
 *
 * @example
 * ```typescript
 * // In a Server Component
 * export default async function MembersPage() {
 *   const { data: members, meta } = await getMembers(1, 50);
 *
 *   return <MembersTable initialData={members} initialMeta={meta} />;
 * }
 * ```
 */
export async function getMembers(
  page: number = DEFAULT_PAGE,
  pageSize: number = DEFAULT_PAGE_SIZE,
  filters?: MemberFilters
): Promise<MembersResponse> {
  const requestHeaders = await headers();
  const phase0Trace = ensurePhase0Trace(requestHeaders);
  const phase0TraceAttributes = getPhase0TraceAttributes(phase0Trace);
  const phase0TraceHeaders = getPhase0TraceHeaderMap(phase0Trace);

  return measurePhase0(
    'web.members.get_members',
    {
      page,
      pageSize,
      hasSearch: Boolean(filters?.search),
      hasRole: Boolean(filters?.role),
      hasStatus: Boolean(filters?.status),
      ...phase0TraceAttributes
    },
    async () => {
      const auth = await resolveServerRequestAuthContext({
        source: 'web.members.server_loader',
        route: '/workspaces/members'
      });

      // Build API URL with query parameters
      const apiBaseUrl = getVersionedApiBaseUrl('v1');
      const queryString = buildQueryString(page, pageSize, filters);
      const url = `${apiBaseUrl}/workspaces/members${queryString ? `?${queryString}` : ''}`;
      const apiTargetAttributes = getPhase0ApiTargetAttributes(apiBaseUrl);

      recordPhase0Note('web.members.get_members.target', {
        hasQuery: Boolean(queryString),
        ...apiTargetAttributes,
        ...phase0TraceAttributes
      });

      // Make API request with session authentication
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...phase0TraceHeaders,
          ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
          ...(auth ? { 'x-tenant-id': auth.tenantId } : {})
        },
        cache: 'no-store' // Always fetch fresh data
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch members: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      // Handle BaseResponseDto format ({ data: { ... } }) and direct payloads
      return result.data
        ? normalizeMembersResponse(result.data, page, pageSize)
        : normalizeMembersResponse(result, page, pageSize);
    }
  );
}

// ============================================================================
// EXPORTS (for unit testing)
// ============================================================================
export { DEFAULT_PAGE, DEFAULT_PAGE_SIZE };
