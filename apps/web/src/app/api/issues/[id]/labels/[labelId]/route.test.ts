import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from './route';

import type { NextRequest } from 'next/server';

vi.mock('~/lib/runtime-config', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/runtime-config')>('~/lib/runtime-config');
  return {
    ...actual,
    getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
  };
});

function createMockRequest(): NextRequest {
  return {
    headers: { get: () => null },
    cookies: { get: () => undefined }
  } as unknown as NextRequest;
}

describe('issue labels detach proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards DELETE requests', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 77 } })
    });

    await DELETE(createMockRequest(), {
      params: Promise.resolve({ id: '77', labelId: '3' })
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/tickets/77/labels/3',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
