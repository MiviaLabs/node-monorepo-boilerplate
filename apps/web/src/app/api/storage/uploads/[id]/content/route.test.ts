import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PUT } from './route';

import type { NextRequest } from 'next/server';

vi.mock('~/lib/runtime-config', async () => {
  const actual =
    await vi.importActual<typeof import('~/lib/runtime-config')>('~/lib/runtime-config');
  return {
    ...actual,
    getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
  };
});

function createMockRequest(headers: Record<string, string | undefined> = {}): NextRequest {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(Buffer.from('payload')));
      controller.close();
    }
  });

  return {
    body,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null
    },
    cookies: {
      get: () => undefined
    },
    arrayBuffer: vi.fn(async () => Buffer.from('payload'))
  } as unknown as NextRequest;
}

describe('PUT /api/storage/uploads/[id]/content route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('forwards raw body and upload headers', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 301, status: 'ready' } })
    });

    const req = createMockRequest({
      authorization: 'Bearer header-token',
      'x-tenant-id': '123',
      'content-type': 'image/png',
      'content-length': '7'
    });

    await PUT(req, {
      params: Promise.resolve({ id: '301' })
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/objects/uploads/301/content',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          authorization: 'Bearer header-token',
          'x-tenant-id': '123',
          'content-type': 'image/png',
          'content-length': '7'
        }),
        body: req.body,
        duplex: 'half'
      })
    );

    expect(req.arrayBuffer).not.toHaveBeenCalled();
  });
});
