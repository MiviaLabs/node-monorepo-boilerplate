import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleAdminLoginMock = vi.fn();

vi.mock('../../../../lib/auth/api', () => ({
  handleAdminLogin: handleAdminLoginMock
}));

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates login handling to the shared admin auth route helper', async () => {
    const expectedResponse = new Response(JSON.stringify({ message: 'ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    handleAdminLoginMock.mockResolvedValue(expectedResponse);

    const { POST } = await import('./route');

    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'Password123!'
      })
    });

    const response = await POST(request as unknown as Parameters<typeof POST>[0]);

    expect(handleAdminLoginMock).toHaveBeenCalledWith(request);
    expect(response).toBe(expectedResponse);
  });
});
