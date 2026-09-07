import type { ContentPage } from '~/components/content/content-types';
import type {
  ContentComment,
  ContentEntry,
  ContentSidebarEntry,
  GetContentEntryBySlugInput,
  ListContentEntriesInput
} from '~/types/content.types';

import { resolveServerRequestAuthContext } from '~/lib/auth/server-request-auth';
import {
  buildOrganizationContentPages,
  buildProjectContentPages
} from '~/lib/content/content-entry-adapter';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';
import { ContentScope } from '~/types/content.types';

export class ContentFetchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ContentFetchError';
  }
}

function buildQuery(input: ListContentEntriesInput = {}): string {
  const params = new URLSearchParams();

  if (input.projectId !== undefined) {
    params.set('projectId', String(input.projectId));
  }

  if (input.parentId !== undefined) {
    params.set('parentId', String(input.parentId));
  }

  if (input.scope !== undefined) {
    params.set('scope', input.scope);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

function unwrapResponse<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

async function fetchContentJson(
  pathname: string,
  input?: ListContentEntriesInput
): Promise<unknown> {
  const auth = await resolveServerRequestAuthContext({
    source: 'web.content.server_loader',
    route: pathname
  });
  const apiBaseUrl = getVersionedApiBaseUrl('v1');
  const response = await fetch(`${apiBaseUrl}${pathname}${buildQuery(input)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(auth ? { 'x-tenant-id': auth.tenantId } : {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new ContentFetchError(
      `Failed to fetch content resource: ${response.status} ${errorText}`,
      response.status
    );
  }

  return response.json();
}

function normalizeContentSidebarEntry(raw: unknown): ContentSidebarEntry {
  const entry = (raw ?? {}) as Record<string, unknown>;

  return {
    id: Number(entry['id'] ?? 0),
    organizationId: Number(entry['organizationId'] ?? 0),
    projectId: typeof entry['projectId'] === 'number' ? entry['projectId'] : null,
    parentId: typeof entry['parentId'] === 'number' ? entry['parentId'] : null,
    title: String(entry['title'] ?? ''),
    slug: String(entry['slug'] ?? ''),
    position: Number(entry['position'] ?? 0),
    updatedBy: Number(entry['updatedBy'] ?? 0),
    updatedByDisplayName:
      typeof entry['updatedByDisplayName'] === 'string' ? entry['updatedByDisplayName'] : null,
    updatedByPhotoUrl:
      typeof entry['updatedByPhotoUrl'] === 'string' ? entry['updatedByPhotoUrl'] : null,
    updatedAt: String(entry['updatedAt'] ?? '')
  };
}

function isOrganizationSidebarEntry(entry: ContentSidebarEntry): boolean {
  return entry.projectId === null;
}

export async function listContentEntries(
  input: ListContentEntriesInput = {}
): Promise<ContentEntry[]> {
  const json = await fetchContentJson('/pages', input);
  return unwrapResponse<ContentEntry[]>(json);
}

export async function listContentSidebarEntries(
  input: ListContentEntriesInput = {}
): Promise<ContentSidebarEntry[]> {
  const json = await fetchContentJson('/pages/nav', input);
  const payload = unwrapResponse<unknown[]>(json);

  return Array.isArray(payload) ? payload.map((entry) => normalizeContentSidebarEntry(entry)) : [];
}

export async function getContentEntryBySlug(
  input: GetContentEntryBySlugInput
): Promise<ContentEntry> {
  const json = await fetchContentJson(`/pages/by-slug/${encodeURIComponent(input.slug)}`, {
    projectId: input.projectId,
    scope: input.scope
  });

  return unwrapResponse<ContentEntry>(json);
}

export async function getFirstOrganizationContentSidebarEntry(): Promise<ContentSidebarEntry | null> {
  const entries = await listContentSidebarEntries({ scope: ContentScope.ORGANIZATION });
  return entries.find((entry) => isOrganizationSidebarEntry(entry)) ?? null;
}

export async function getFirstProjectContentSidebarEntry(
  projectId: number
): Promise<ContentSidebarEntry | null> {
  const [firstEntry] = await listContentSidebarEntries({ projectId });
  return firstEntry ?? null;
}

export async function getOrganizationContentPages(): Promise<ContentPage[]> {
  const entries = await listContentSidebarEntries({ scope: ContentScope.ORGANIZATION });
  return buildOrganizationContentPages(
    entries.filter((entry) => isOrganizationSidebarEntry(entry))
  );
}

export async function getProjectContentPages(projectId: number): Promise<ContentPage[]> {
  const entries = await listContentSidebarEntries({ projectId, scope: ContentScope.PROJECT });
  return buildProjectContentPages(entries);
}

export async function getOrganizationContentPageBySlug(slug: string): Promise<ContentPage[]> {
  const [entries, selectedEntry] = await Promise.all([
    listContentSidebarEntries({ scope: ContentScope.ORGANIZATION }),
    getContentEntryBySlug({ slug, scope: ContentScope.ORGANIZATION })
  ]);

  return buildOrganizationContentPages(
    entries.filter((entry) => isOrganizationSidebarEntry(entry)),
    selectedEntry
  );
}

export async function getProjectContentPageBySlug(
  projectId: number,
  slug: string
): Promise<ContentPage[]> {
  const [entries, selectedEntry] = await Promise.all([
    listContentSidebarEntries({ projectId, scope: ContentScope.PROJECT }),
    getContentEntryBySlug({ slug, projectId, scope: ContentScope.PROJECT })
  ]);

  return buildProjectContentPages(entries, selectedEntry);
}

export async function getContentComments(contentEntryId: number): Promise<ContentComment[]> {
  const auth = await resolveServerRequestAuthContext({
    source: 'web.content.server_loader',
    route: `/content/${contentEntryId}/comments`
  });
  const apiBaseUrl = getVersionedApiBaseUrl('v1');
  const response = await fetch(`${apiBaseUrl}/pages/${contentEntryId}/comments`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      ...(auth ? { 'x-tenant-id': auth.tenantId } : {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch content comments: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  return unwrapResponse<ContentComment[]>(json);
}
