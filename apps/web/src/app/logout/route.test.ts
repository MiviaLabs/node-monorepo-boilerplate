import { describe, expect, it, vi, beforeEach } from 'vitest';

import { GET } from './route';

import type { NextRequest } from 'next/server';

vi.mock('~/lib/auth/server-auth', () => ({
  invalidateSessionCache: vi.fn(async () => undefined)
}));

function createRequest(url: string, cookies: Record<string, string | undefined> = {}): NextRequest {
  return {
    url,
    nextUrl: new URL(url),
    cookies: {
      get: (name: string) => {
        const value = cookies[name];
        return value ? { name, value } : undefined;
      }
    }
  } as unknown as NextRequest;
}

describe('GET /logout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves the protected redirect target when clearing cookies', async () => {
    const response = await GET(
      createRequest('http://localhost:3000/logout?redirect=%2Fdashboard', {
        accessToken: 'token'
      })
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?redirect=%2Fdashboard'
    );
    expect(response.headers.get('set-cookie')).toContain('web_session=');
  });
});
