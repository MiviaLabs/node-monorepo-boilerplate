import { beforeEach, describe, expect, it, vi } from 'vitest';

import { issuesApi } from './issues-api';

describe('issuesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('preserves list payload data and pagination metadata from wrapped responses', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          data: [
            {
              id: 12,
              organizationId: 5,
              projectId: null,
              project: null,
              parentIssueId: null,
              issueNumber: 101,
              title: 'Org issue',
              descriptionMarkdown: '',
              status: 'backlog',
              priority: 'medium',
              position: 0,
              estimate: null,
              dueAt: null,
              resolvedAt: null,
              createdBy: 9,
              updatedBy: 9,
              createdAt: '2026-03-23T00:00:00.000Z',
              updatedAt: '2026-03-23T00:00:00.000Z',
              assignees: [],
              labels: [],
              commentsCount: 0,
              attachmentsCount: 0,
              watchersCount: 0,
              subtaskCount: 0,
              completedSubtaskCount: 0
            }
          ],
          metadata: {
            pagination: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
              hasNext: false,
              hasPrevious: false
            }
          }
        }
      })
    });

    const result = await issuesApi.listIssues('tenant-123');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(12);
    expect(result.metadata.pagination.total).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/issues',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
  });

  it('omits invalid numeric fields when creating an issue', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: 77
        }
      })
    });

    await issuesApi.createIssue({
      title: 'Org subtask',
      descriptionMarkdown: '',
      projectId: Number.NaN,
      parentIssueId: 12
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/issues',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Org subtask',
          descriptionMarkdown: '',
          parentIssueId: 12
        })
      })
    );
  });

  it('creates issue attachment upload reservations through the issue-scoped upload route', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          file: { id: 101 },
          upload: {
            transport: 'api_proxy',
            url: '/v1/objects/uploads/101/content'
          }
        }
      })
    });

    const result = await issuesApi.createIssueAttachmentUpload(77, {
      originalFilename: 'design-spec.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      transport: 'api_proxy'
    });

    expect(result.file.id).toBe(101);
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/issues/77/attachments/uploads',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          originalFilename: 'design-spec.pdf',
          mimeType: 'application/pdf',
          byteSize: 1024,
          transport: 'api_proxy'
        })
      })
    );
  });

  it('deletes issue attachments through the nested attachment route', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({})
    });

    await issuesApi.deleteIssueAttachment(77, 51, 'tenant-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/issues/77/attachments/51',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
  });

  it('deletes issues through the item route', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({})
    });

    await issuesApi.deleteIssue(77, 'tenant-123');

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/issues/77',
      expect.objectContaining({
        method: 'DELETE',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
  });

  it('builds issue attachment download paths through the issue proxy route', () => {
    expect(issuesApi.getIssueAttachmentDownloadPath(77, 51)).toBe(
      '/api/issues/77/attachments/51/content'
    );
  });

  it('gets signed file download urls through the storage proxy route', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          url: 'https://signed.example.test/design-spec.pdf'
        }
      })
    });

    const result = await issuesApi.getFileDownloadUrl(101, 'tenant-123');

    expect(result).toBe('https://signed.example.test/design-spec.pdf');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/storage/files/101/download-url',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          'x-tenant-id': 'tenant-123'
        })
      })
    );
  });
});
