import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { proxy } from './proxy';

describe('admin middleware', () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3002';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it('uses the configured app origin instead of a request Host header for validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: { valid: true } }), { status: 200 }))
    );

    const request = new NextRequest('http://attacker.example/inbox', {
      headers: { host: 'attacker.example', cookie: 'bo_session=session-123' }
    });

    await proxy(request);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/auth/validate',
      expect.anything()
    );
  });

  it('redirects unauthenticated tenants inventory access to login', async () => {
    const request = new NextRequest('http://localhost:3002/tenants');

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/');
  });

  it('redirects unauthenticated access governance access to login', async () => {
    const request = new NextRequest('http://localhost:3002/access');

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/');
  });

  it('allows authenticated protected access when the opaque session validates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { valid: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    const request = new NextRequest('http://localhost:3002/inbox', {
      headers: {
        cookie: 'bo_session=session-123'
      }
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/api/auth/validate',
      expect.objectContaining({
        method: 'GET',
        headers: { cookie: 'bo_session=session-123' }
      })
    );
  });

  it('redirects to login and clears the opaque session on protected-route auth failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { valid: false } }), {
          status: 401,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'bo_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'
          }
        })
      )
    );

    const request = new NextRequest('http://localhost:3002/inbox', {
      headers: {
        cookie: 'bo_session=session-123'
      }
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/');
    expect(response.headers.get('set-cookie')).toContain('bo_session=');
  });

  it('clears the opaque session without redirecting on the public root route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { valid: false } }), {
          status: 401,
          headers: { 'content-type': 'application/json' }
        })
      )
    );

    const request = new NextRequest('http://localhost:3002/', {
      headers: {
        cookie: 'bo_session=session-123'
      }
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.get('bo_session')?.value).toBe('');
  });

  it('preserves navigation when the validate endpoint has a transient backend error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Temporary upstream failure')));

    const request = new NextRequest('http://localhost:3002/inbox', {
      headers: {
        cookie: 'bo_session=session-123'
      }
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.get('bo_session')).toBeUndefined();
  });

  it('redirects to the same protected route when validation reissues cookies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { valid: true } }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'bo_session=session-123; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax'
          }
        })
      )
    );

    const request = new NextRequest('http://localhost:3002/inbox', {
      headers: {
        cookie: 'bo_session=session-123'
      }
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/inbox');
    expect(response.headers.get('set-cookie')).toContain('bo_session=session-123');
  });

  it('migrates legacy token cookies into the opaque session contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { valid: true } }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie':
              'bo_session=session-123; Max-Age=3600; Path=/; HttpOnly; SameSite=Lax, admin_access_token=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'
          }
        })
      )
    );

    const request = new NextRequest('http://localhost:3002/inbox', {
      headers: {
        cookie:
          'admin_access_token=access-token; admin_refresh_token=refresh-token; admin_tenant_id=42'
      }
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3002/inbox');
    expect(response.headers.get('set-cookie')).toContain('bo_session=session-123');
  });
});
