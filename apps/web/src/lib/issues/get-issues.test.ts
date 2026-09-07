import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesMock = vi.fn();
const headersMock = vi.fn();
const recordPhase0NoteMock = vi.fn();
const getPhase0ApiTargetAttributesMock = vi.fn(() => ({
  apiTargetOrigin: 'http://localhost:3000',
  apiTargetHost: 'localhost:3000'
}));
const ensurePhase0TraceMock = vi.fn(() => ({
  requestId: 'req-phase0',
  correlationId: 'corr-phase0',
  causationId: 'cause-phase0'
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
  headers: headersMock
}));

vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3000/api/v1')
}));

vi.mock('~/lib/diagnostics/phase-zero-diagnostics', () => ({
  ensurePhase0Trace: ensurePhase0TraceMock,
  measurePhase0: vi.fn(async (_name: string, _meta: unknown, callback: () => Promise<unknown>) =>
    callback()
  ),
  recordPhase0Note: recordPhase0NoteMock,
  getPhase0ApiTargetAttributes: getPhase0ApiTargetAttributesMock,
  getPhase0TraceAttributes: vi.fn(() => ({
    requestId: 'req-phase0',
    correlationId: 'corr-phase0',
    causationId: 'cause-phase0'
  })),
  getPhase0TraceHeaderMap: vi.fn(() => ({
    'x-request-id': 'req-phase0',
    'x-correlation-id': 'corr-phase0',
    'x-causation-id': 'cause-phase0'
  }))
}));

describe('issue fetch helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === 'accessToken') {
          return { value: 'token' };
        }

        if (name === 'tenantId') {
          return { value: 'tenant-1' };
        }

        return undefined;
      })
    });
    global.fetch = vi.fn();
  });

  it('returns the bounded first page and records truncation instead of falling back to a full list scan', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 1 }],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 1,
            total: 2,
            totalPages: 2,
            hasNext: true,
            hasPrevious: false
          }
        }
      })
    });

    const { listBoundedIssues } = await import('./get-issues');
    const result = await listBoundedIssues({}, 1, true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([{ id: 1 }]);
    expect(recordPhase0NoteMock).toHaveBeenCalledWith('web.issues.list_bounded.truncated', {
      pageSize: 1,
      returned: 1,
      total: 2
    });
  });

  it('records the issue fetch target origin for server-side diagnostics', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 25,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false
          }
        }
      })
    });

    const { listBoundedIssues } = await import('./get-issues');
    await listBoundedIssues({ assigneeUserId: 7 }, 25, false);

    expect(getPhase0ApiTargetAttributesMock).toHaveBeenCalledWith('http://localhost:3000/api/v1');
    expect(recordPhase0NoteMock).toHaveBeenCalledWith('web.issues.fetch.target', {
      pathname: '/tickets',
      hasQuery: true,
      apiTargetOrigin: 'http://localhost:3000',
      apiTargetHost: 'localhost:3000',
      requestId: 'req-phase0',
      correlationId: 'corr-phase0',
      causationId: 'cause-phase0'
    });
  });

  it('applies the same target-origin diagnostics to issue detail fetches', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { id: 42, title: 'Issue 42' }
      })
    });

    const { getIssueById } = await import('./get-issues');
    await getIssueById('42');

    expect(getPhase0ApiTargetAttributesMock).toHaveBeenCalledWith('http://localhost:3000/api/v1');
    expect(recordPhase0NoteMock).toHaveBeenCalledWith('web.issues.fetch.target', {
      pathname: '/tickets/42',
      hasQuery: false,
      apiTargetOrigin: 'http://localhost:3000',
      apiTargetHost: 'localhost:3000',
      requestId: 'req-phase0',
      correlationId: 'corr-phase0',
      causationId: 'cause-phase0'
    });
  });

  it('fetches the workspace issues page from the dedicated endpoint', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            data: [{ id: 1 }],
            metadata: {
              pagination: {
                page: 1,
                pageSize: 500,
                total: 1,
                totalPages: 1,
                hasNext: false,
                hasPrevious: false
              }
            }
          },
          labels: [{ id: 3, name: 'Frontend' }],
          projects: [
            {
              id: 12,
              organizationId: 5,
              createdBy: 9,
              key: 'ATLAS',
              name: 'Atlas',
              visibility: 'private',
              isMember: true
            }
          ],
          privateProjectMembersByProjectId: {
            '12': [
              {
                userId: 9,
                displayName: 'Jordan Lee',
                photoUrl: null,
                isCreator: true,
                assignedAt: '2026-03-21T00:00:00.000Z'
              }
            ]
          }
        }
      })
    });

    const { getWorkspaceIssuesPageData } = await import('./get-issues');
    const result = await getWorkspaceIssuesPageData();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/tickets/board',
      expect.anything()
    );
    expect(result.projects[0]).toEqual(
      expect.objectContaining({
        id: '12',
        organizationId: '5',
        createdBy: '9',
        key: 'ATLAS'
      })
    );
    expect(result.privateProjectMembersByProjectId['12']?.[0]?.userId).toBe('9');
  });

  it('fetches the my-work page from the dedicated endpoint', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          assignedIssues: [{ id: 1 }],
          assignedIssueCount: 4,
          watchingIssues: [{ id: 2 }],
          recentIssues: [{ id: 3 }],
          accessibleProjectCount: 5,
          ownedProjectCount: 2,
          collaborationProjectCount: 3
        }
      })
    });

    const { getMyWorkPageData } = await import('./get-issues');
    const result = await getMyWorkPageData();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/tickets/mine',
      expect.anything()
    );
    expect(result.assignedIssueCount).toBe(4);
    expect(result.accessibleProjectCount).toBe(5);
  });

  it('loads relation candidates from the dedicated endpoint', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 11, projectId: 7 },
          { id: 12, projectId: 9 }
        ]
      })
    });

    const { listRelationCandidateIssues } = await import('./get-issues');
    const result = await listRelationCandidateIssues(7, '42');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/tickets/42/link-suggestions',
      expect.anything()
    );
    expect(result).toEqual([{ id: 11, projectId: 7 }]);
  });

  it('loads issue detail page data from the dedicated endpoint', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          issue: { id: 42, comments: [], watchers: [], relations: [], subtasks: [], activity: [] },
          attachments: [{ id: 51 }],
          labels: [{ id: 3, name: 'Frontend' }],
          members: [
            {
              userId: 9,
              displayName: 'Jordan Lee',
              photoUrl: null,
              isCreator: true,
              assignedAt: '2026-03-21T00:00:00.000Z'
            }
          ],
          relationCandidates: [{ id: 11 }]
        }
      })
    });

    const { getIssuePageData } = await import('./get-issues');
    const result = await getIssuePageData('42');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/tickets/42/page',
      expect.anything()
    );
    expect(result.issue.id).toBe(42);
    expect(result.attachments[0]).toEqual({ id: 51 });
    expect(result.members[0]?.userId).toBe('9');
    expect(result.relationCandidates).toEqual([{ id: 11 }]);
  });

  it('forwards the shared phase 0 trace headers to API issue requests', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [],
        metadata: {
          pagination: {
            page: 1,
            pageSize: 25,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrevious: false
          }
        }
      })
    });

    const { listBoundedIssues } = await import('./get-issues');
    await listBoundedIssues({}, 25, false);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/tickets?page=1&pageSize=25',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-request-id': 'req-phase0',
          'x-correlation-id': 'corr-phase0',
          'x-causation-id': 'cause-phase0'
        })
      })
    );
  });
});
