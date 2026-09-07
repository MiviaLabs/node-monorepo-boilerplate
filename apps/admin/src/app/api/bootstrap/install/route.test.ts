import { beforeEach, describe, expect, it, vi } from 'vitest';

const installBootstrapMock = vi.fn();

vi.mock('~/lib/admin-auth', () => ({
  getErrorMessage: vi.fn((error: Error) => error.message),
  getErrorStatus: vi.fn((error: { status?: number }, fallback: number) => error.status ?? fallback),
  installBootstrap: installBootstrapMock
}));

describe('POST /api/bootstrap/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves backend conflict status for closed bootstrap flows', async () => {
    installBootstrapMock.mockRejectedValue(
      Object.assign(new Error('Bootstrap installation is no longer available.'), { status: 409 })
    );
    const { POST } = await import('./route');

    const response = await POST(
      new Request('http://localhost/api/bootstrap/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationName: 'Bootstrap Ops',
          organizationSlug: 'bootstrap-ops',
          displayName: 'Bootstrap Owner',
          email: 'owner@example.com',
          password: 'Password123!',
          confirmPassword: 'Password123!'
        })
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'Bootstrap installation is no longer available.'
    });
  });
});
