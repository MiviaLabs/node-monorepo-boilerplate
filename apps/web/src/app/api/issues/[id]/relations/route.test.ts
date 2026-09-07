import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import type { NextRequest } from 'next/server';

vi.mock('~/lib/runtime-config', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/runtime-config')>('~/lib/runtime-config');
  return {
    ...actual,
    getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
  };
});

function createMockRequest({ body }: { body?: unknown } = {}): NextRequest {
  return {
    headers: { get: () => null },
    cookies: { get: () => undefined },
    json: vi.fn(async () => body)
  } as unknown as NextRequest;
}

describe('issue relations create proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards POST requests', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 77 } })
    });

    await POST(createMockRequest({ body: { relationType: 'blocks', targetIssueId: 3 } }), {
      params: Promise.resolve({ id: '77' })
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/77/links',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ relationType: 'blocks', targetIssueId: 3 })
      })
    );
  });
});
