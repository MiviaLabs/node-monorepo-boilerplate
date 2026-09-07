import { apiFetch } from '../api-client';
import { getAdminSession } from '../admin-auth';

import type {
  AdminAccessOverview,
  AdminApiEnvelope,
  AdminEmailDetail,
  AdminEmailSummary,
  AdminEmailsOverview,
  AdminEmailWebhookEventList,
  AdminEmailWebhookSummary,
  AdminSession,
  AdminEventReplayStatus,
  AdminDeadLetterEvent,
  AdminDeletionQueueOverview,
  AdminHealthOverview,
  AdminInboxOverview,
  AdminMemberDetail,
  AdminOutboxOverview,
  AdminOutboxSummary,
  AdminStatisticsOverview,
  AdminTenantDetail,
  AdminTenantsOverview,
  AdminUserDetail,
  AdminUsersOverview
} from './types';

function unwrapAdminData<T>(payload: T | AdminApiEnvelope<T>): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return payload.data;
  }

  return payload;
}

async function buildAdminRequestHeaders(): Promise<HeadersInit | undefined> {
  const session = await getAdminSession();
  const accessToken = session?.accessToken;
  const tenantId = session?.tenantId;

  if (!accessToken && !tenantId) {
    return undefined;
  }

  const headers = new Headers();

  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  if (tenantId) {
    headers.set('x-tenant-id', tenantId);
  }

  return headers;
}

export async function getAdminRequestHeaders(): Promise<HeadersInit | undefined> {
  return buildAdminRequestHeaders();
}

function buildQueryString(params?: Record<string, string | number | undefined>) {
  if (!params) {
    return '';
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString.length > 0 ? `?${queryString}` : '';
}

async function fetchAdminOverview<T>(
  path: `/${string}`,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const headers = await buildAdminRequestHeaders();
  const payload = await apiFetch<T | AdminApiEnvelope<T>>({
    path: `${path}${buildQueryString(params)}` as `/${string}`,
    credentials: 'include',
    headers
  });

  return unwrapAdminData(payload);
}

export function getAdminHealthOverview(): Promise<AdminHealthOverview> {
  return fetchAdminOverview<AdminHealthOverview>('/console/health');
}

export function getAdminStatisticsOverview(): Promise<AdminStatisticsOverview> {
  return fetchAdminOverview<AdminStatisticsOverview>('/console/statistics');
}

export function getAdminOutboxSummary(): Promise<AdminOutboxSummary> {
  return fetchAdminOverview<AdminOutboxSummary>('/console/dispatch/summary');
}

export function getAdminOutboxOverview(
  params?: Record<string, string | number | undefined>
): Promise<AdminOutboxOverview> {
  return fetchAdminOverview<AdminOutboxOverview>('/console/dispatch', params);
}

export function getAdminEmailSummary(
  params?: Record<string, string | number | undefined>
): Promise<AdminEmailSummary> {
  return fetchAdminOverview<AdminEmailSummary>('/console/mail/summary', params);
}

export function getAdminEmailDetail(emailMessageId: number): Promise<AdminEmailDetail> {
  return fetchAdminOverview<AdminEmailDetail>(`/console/mail/${emailMessageId}`);
}

export function getAdminEmailsOverview(
  params?: Record<string, string | number | undefined>
): Promise<AdminEmailsOverview> {
  return fetchAdminOverview<AdminEmailsOverview>('/console/mail', params);
}

export function getAdminEmailWebhookSummary(): Promise<AdminEmailWebhookSummary> {
  return fetchAdminOverview<AdminEmailWebhookSummary>('/console/inbound-mail/summary');
}

export function getAdminEmailWebhookEvents(
  params?: Record<string, string | number | undefined>
): Promise<AdminEmailWebhookEventList> {
  return fetchAdminOverview<AdminEmailWebhookEventList>('/console/inbound-mail', params);
}

export function getAdminDeletionQueueOverview(
  params?: Record<string, string | number | undefined>
): Promise<AdminDeletionQueueOverview> {
  return fetchAdminOverview<AdminDeletionQueueOverview>('/console/purges', params);
}

export function getAdminTenantsOverview(
  params?: Record<string, string | number | undefined>
): Promise<AdminTenantsOverview> {
  return fetchAdminOverview<AdminTenantsOverview>('/console/workspaces', params);
}

export function getAdminTenantDetail(organizationId: number): Promise<AdminTenantDetail> {
  return fetchAdminOverview<AdminTenantDetail>(`/console/workspaces/${organizationId}`);
}

export function getAdminAccessOverview(
  params?: Record<string, string | number | undefined>
): Promise<AdminAccessOverview> {
  return fetchAdminOverview<AdminAccessOverview>('/console/access', params);
}

export function getAdminMemberDetail(
  userId: number,
  tenantId: number
): Promise<AdminMemberDetail> {
  return fetchAdminOverview<AdminMemberDetail>(`/console/memberships/${userId}`, {
    tenantId
  });
}

export function getAdminUsersOverview(
  params?: Record<string, string | number | undefined>
): Promise<AdminUsersOverview> {
  return fetchAdminOverview<AdminUsersOverview>('/console/users', params);
}

export function getAdminUserDetail(userId: number): Promise<AdminUserDetail> {
  return fetchAdminOverview<AdminUserDetail>(`/console/users/${userId}`);
}

export function getAdminInboxOverview(): Promise<AdminInboxOverview> {
  return fetchAdminOverview<AdminInboxOverview>('/console/inbox');
}

export function getAdminCurrentUserSessions(): Promise<AdminSession[]> {
  return fetchAdminOverview<AdminSession[]>('/iam/sessions');
}

export function getAdminDeadLetterEvents(): Promise<AdminDeadLetterEvent[]> {
  return fetchAdminOverview<AdminDeadLetterEvent[]>('/console/queues/dead-letters');
}

export function getAdminEventReplayStatus(
  replayId: string
): Promise<AdminEventReplayStatus> {
  return fetchAdminOverview<AdminEventReplayStatus>(
    `/platform/event-replay/${encodeURIComponent(replayId)}`
  );
}
