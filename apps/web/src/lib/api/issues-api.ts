import type {
  CreateIssueAttachmentInput,
  CreateIssueAttachmentUploadInput,
  CreateIssueRelationInput,
  CreateIssueLabelInput,
  CreateIssueCommentInput,
  CreateIssueInput,
  IssueAttachment,
  IssueAttachmentUploadReservation,
  IssueDetail,
  IssueLabel,
  IssuesListResponse,
  MutateIssueLabelInput,
  MutateIssueParticipantInput,
  UpdateIssueLabelInput,
  UpdateIssueInput
} from '~/types/issue.types';

export class IssuesApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'IssuesApiError';
  }
}

function extractApiErrorMessage(payload: unknown, fallbackStatus: number): string {
  if (!payload || typeof payload !== 'object') {
    return `HTTP ${fallbackStatus}`;
  }

  const obj = payload as { message?: unknown; detail?: unknown; error?: unknown; data?: unknown };
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
    const nested = obj.data as { message?: unknown };
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message;
    }
  }

  return `HTTP ${fallbackStatus}`;
}

type SignedDownloadUrl = {
  url: string;
};

function unwrapResponse<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function unwrapIssuesListResponse(payload: unknown): IssuesListResponse {
  const raw = (payload ?? {}) as {
    data?: unknown;
    metadata?: IssuesListResponse['metadata'];
  };

  if (Array.isArray(raw.data)) {
    return {
      data: raw.data as IssuesListResponse['data'],
      metadata: raw.metadata ?? {
        pagination: {
          page: 1,
          pageSize: raw.data.length,
          total: raw.data.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false
        }
      }
    };
  }

  const nested = raw.data as IssuesListResponse | undefined;
  if (nested && typeof nested === 'object' && Array.isArray(nested.data)) {
    return nested;
  }

  return {
    data: [],
    metadata: {
      pagination: {
        page: 1,
        pageSize: 0,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      }
    }
  };
}

function buildTenantHeader(tenantId?: string): Record<string, string> {
  const normalized = tenantId?.trim();
  return normalized ? { 'x-tenant-id': normalized } : {};
}

function sanitizeCreateIssueInput(input: CreateIssueInput): CreateIssueInput {
  const sanitized: CreateIssueInput = {
    title: input.title
  };

  if (input.descriptionMarkdown !== undefined) {
    sanitized.descriptionMarkdown = input.descriptionMarkdown;
  }
  if (input.status !== undefined) {
    sanitized.status = input.status;
  }
  if (input.priority !== undefined) {
    sanitized.priority = input.priority;
  }
  if (input.projectId !== undefined && Number.isFinite(input.projectId)) {
    sanitized.projectId = input.projectId;
  }
  if (input.parentIssueId !== undefined && Number.isFinite(input.parentIssueId)) {
    sanitized.parentIssueId = input.parentIssueId;
  }
  if (input.position !== undefined && Number.isFinite(input.position)) {
    sanitized.position = input.position;
  }
  if (input.estimate !== undefined && Number.isFinite(input.estimate)) {
    sanitized.estimate = input.estimate;
  }
  if (input.dueAt !== undefined) {
    sanitized.dueAt = input.dueAt;
  }

  return sanitized;
}

export const issuesApi = {
  getIssueAttachmentDownloadPath(issueId: number, attachmentId: number): string {
    return `/api/issues/${issueId}/attachments/${attachmentId}/content`;
  },

  async listIssues(tenantId?: string): Promise<IssuesListResponse> {
    const response = await fetch('/api/issues', {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapIssuesListResponse(await response.json());
  },

  async createIssue(input: CreateIssueInput, tenantId?: string): Promise<IssueDetail> {
    const sanitizedInput = sanitizeCreateIssueInput(input);
    const response = await fetch('/api/issues', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildTenantHeader(tenantId)
      },
      body: JSON.stringify(sanitizedInput)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async getIssue(issueId: number, tenantId?: string): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}`, {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async updateIssue(
    issueId: number,
    input: UpdateIssueInput,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildTenantHeader(tenantId)
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async deleteIssue(issueId: number, tenantId?: string): Promise<void> {
    const response = await fetch(`/api/issues/${issueId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }
  },

  async createIssueComment(
    issueId: number,
    input: CreateIssueCommentInput,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/comments`, {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async listIssueAttachments(issueId: number, tenantId?: string): Promise<IssueAttachment[]> {
    const response = await fetch(`/api/issues/${issueId}/attachments`, {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueAttachment[]>(await response.json());
  },

  async createIssueAttachmentUpload(
    issueId: number,
    input: CreateIssueAttachmentUploadInput,
    tenantId?: string
  ): Promise<IssueAttachmentUploadReservation> {
    const response = await fetch(`/api/issues/${issueId}/attachments/uploads`, {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueAttachmentUploadReservation>(await response.json());
  },

  async createIssueAttachment(
    issueId: number,
    input: CreateIssueAttachmentInput,
    tenantId?: string
  ): Promise<IssueAttachment> {
    const response = await fetch(`/api/issues/${issueId}/attachments`, {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueAttachment>(await response.json());
  },

  async deleteIssueAttachment(
    issueId: number,
    attachmentId: number,
    tenantId?: string
  ): Promise<void> {
    const response = await fetch(`/api/issues/${issueId}/attachments/${attachmentId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }
  },

  async getFileDownloadUrl(fileId: number, tenantId?: string): Promise<string> {
    const response = await fetch(`/api/storage/files/${fileId}/download-url`, {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<SignedDownloadUrl>(await response.json()).url;
  },

  async addIssueAssignee(
    issueId: number,
    input: MutateIssueParticipantInput,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/assignees`, {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async removeIssueAssignee(
    issueId: number,
    userId: number,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/assignees/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async addIssueWatcher(
    issueId: number,
    input: MutateIssueParticipantInput,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/watchers`, {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async removeIssueWatcher(
    issueId: number,
    userId: number,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/watchers/${userId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async listIssueLabels(tenantId?: string): Promise<IssueLabel[]> {
    const response = await fetch('/api/issues/labels', {
      method: 'GET',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueLabel[]>(await response.json());
  },

  async createIssueLabel(input: CreateIssueLabelInput, tenantId?: string): Promise<IssueLabel> {
    const response = await fetch('/api/issues/labels', {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueLabel>(await response.json());
  },

  async updateIssueLabel(
    labelId: number,
    input: UpdateIssueLabelInput,
    tenantId?: string
  ): Promise<IssueLabel> {
    const response = await fetch(`/api/issues/labels/${labelId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...buildTenantHeader(tenantId)
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueLabel>(await response.json());
  },

  async deleteIssueLabel(labelId: number, tenantId?: string): Promise<void> {
    const response = await fetch(`/api/issues/labels/${labelId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }
  },

  async addIssueLabel(
    issueId: number,
    input: MutateIssueLabelInput,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/labels`, {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async removeIssueLabel(
    issueId: number,
    labelId: number,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/labels/${labelId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async createIssueRelation(
    issueId: number,
    input: CreateIssueRelationInput,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/relations`, {
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
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  },

  async deleteIssueRelation(
    issueId: number,
    relationId: number,
    tenantId?: string
  ): Promise<IssueDetail> {
    const response = await fetch(`/api/issues/${issueId}/relations/${relationId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildTenantHeader(tenantId)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new IssuesApiError(extractApiErrorMessage(error, response.status), response.status);
    }

    return unwrapResponse<IssueDetail>(await response.json());
  }
};
