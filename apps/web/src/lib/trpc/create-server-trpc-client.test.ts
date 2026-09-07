import { beforeEach, describe, expect, it, vi } from 'vitest';

const headersMock = vi.fn();
const createTRPCContextMock = vi.fn();
const recordPhase0NoteMock = vi.fn();
const listQueryMock = vi.fn();
const createMutationMock = vi.fn();

vi.mock('next/headers', () => ({
  headers: headersMock
}));

vi.mock('~/lib/diagnostics/phase-zero-diagnostics', () => ({
  recordPhase0Note: recordPhase0NoteMock
}));

vi.mock('~/server/api/trpc', () => ({
  createTRPCContext: createTRPCContextMock
}));

vi.mock('~/server/api/root', () => ({
  rootRouter: {
    createCaller: vi.fn(() => ({
      projects: {
        list: listQueryMock,
        create: createMutationMock
      }
    }))
  }
}));

describe('createServerTrpcClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ authorization: 'Bearer token' }));
    createTRPCContextMock.mockResolvedValue({ headers: new Headers() });
    listQueryMock.mockResolvedValue({ data: [] });
    createMutationMock.mockResolvedValue({ id: '12' });
  });

  it('uses the in-process caller instead of HTTP transport', async () => {
    const { createServerTrpcClient } = await import('./create-server-trpc-client');

    const client = await createServerTrpcClient();
    const listResult = await client.projects.list.query({ page: 1, pageSize: 20 });
    const createResult = await client.projects.create.mutate({
      name: 'Atlas',
      visibility: 'public'
    });

    expect(createTRPCContextMock).toHaveBeenCalledWith({
      headers: expect.any(Headers)
    });
    expect(listQueryMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(createMutationMock).toHaveBeenCalledWith({
      name: 'Atlas',
      visibility: 'public'
    });
    expect(recordPhase0NoteMock).toHaveBeenCalledWith('web.trpc.server_client.target', {
      transport: 'in-process'
    });
    expect(listResult).toEqual({ data: [] });
    expect(createResult).toEqual({ id: '12' });
  });
});
