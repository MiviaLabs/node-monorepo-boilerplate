import type {
  ContentComment,
  ContentEntry,
  CreateContentCommentInput,
  CreateContentEntryInput,
  ListContentEntriesInput,
  UpdateContentEntryInput
} from '~/types/content.types';

import { emitContentRefresh } from '~/lib/content/content-events';

export class ContentApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ContentApiError';
  }
}

export function isContentConflictError(error: unknown): error is ContentApiError {
  return error instanceof ContentApiError && error.status === 409;
}

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

function buildTenantHeader(tenantId?: string): Record<string, string> {
  const normalizedTenantId = tenantId?.trim();
  return normalizedTenantId ? { 'x-tenant-id': normalizedTenantId } : {};
}

function unwrapResponse<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
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

function generateDraftSlug(): string {
  return `untitled-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

type ContentRequestOptions = {
  keepalive?: boolean;
  signal?: AbortSignal;
};

export const contentApi = {
  async getContentEntry(entryId: number, tenantId?: string): Promise<ContentEntry> {
    const response = await fetch(`/api/content/${entryId}`, {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    const json = await response.json();
    return unwrapResponse<ContentEntry>(json);
  },

  async listContentEntries(
    input: ListContentEntriesInput = {},
    tenantId?: string
  ): Promise<ContentEntry[]> {
    const response = await fetch(`/api/content${buildQuery(input)}`, {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    const json = await response.json();
    return unwrapResponse<ContentEntry[]>(json);
  },

  async createContentEntry(
    input: CreateContentEntryInput,
    tenantId?: string
  ): Promise<ContentEntry> {
    const response = await fetch('/api/content', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildTenantHeader(tenantId)
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    const json = await response.json();
    const created = unwrapResponse<ContentEntry>(json);
    emitContentRefresh();
    return created;
  },

  async createDraftContentEntry(
    input: Omit<CreateContentEntryInput, 'slug'>,
    tenantId?: string
  ): Promise<ContentEntry> {
    return this.createContentEntry(
      {
        ...input,
        slug: generateDraftSlug()
      },
      tenantId
    );
  },

  async updateContentEntry(
    entryId: number,
    input: UpdateContentEntryInput,
    tenantId?: string,
    requestOptions: ContentRequestOptions = {}
  ): Promise<ContentEntry> {
    const response = await fetch(`/api/content/${entryId}`, {
      method: 'PATCH',
      credentials: 'include',
      keepalive: requestOptions.keepalive,
      signal: requestOptions.signal,
      headers: {
        'Content-Type': 'application/json',
        ...buildTenantHeader(tenantId)
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    const json = await response.json();
    const updated = unwrapResponse<ContentEntry>(json);
    emitContentRefresh();
    return updated;
  },

  async deleteContentEntry(entryId: number, tenantId?: string): Promise<void> {
    const response = await fetch(`/api/content/${entryId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    emitContentRefresh();
  },

  async listContentComments(entryId: number, tenantId?: string): Promise<ContentComment[]> {
    const response = await fetch(`/api/content/${entryId}/comments`, {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<ContentComment[]>(await response.json());
  },

  async createContentComment(
    entryId: number,
    input: CreateContentCommentInput,
    tenantId?: string
  ): Promise<ContentComment> {
    const response = await fetch(`/api/content/${entryId}/comments`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildTenantHeader(tenantId)
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<ContentComment>(await response.json());
  },

  async deleteContentComment(entryId: number, commentId: number, tenantId?: string): Promise<void> {
    const response = await fetch(`/api/content/${entryId}/comments/${commentId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new ContentApiError(extractApiErrorMessage(error, response.status), response.status);
    }
  },

  async moveContentEntry(
    entryId: number,
    input: Pick<UpdateContentEntryInput, 'parentId' | 'position'>,
    tenantId?: string
  ): Promise<ContentEntry> {
    return this.updateContentEntry(entryId, input, tenantId);
  }
};
