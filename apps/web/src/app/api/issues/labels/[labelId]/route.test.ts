import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PATCH } from './route';

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

describe('issue label detail proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards PATCH requests', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 3 } })
    });

    await PATCH(createMockRequest({ body: { name: 'Platform' } }), {
      params: Promise.resolve({ labelId: '3' })
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/labels/3',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Platform' })
      })
    );
  });

  it('forwards DELETE requests', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 204,
      ok: true
    });

    const response = await DELETE(createMockRequest(), {
      params: Promise.resolve({ labelId: '3' })
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/labels/3',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(response.status).toBe(204);
  });
});
