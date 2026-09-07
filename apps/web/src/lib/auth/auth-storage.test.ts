import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '~/types/auth.types';

interface CookieHarness {
  cookieWrites: string[];
}

function installBrowserGlobals(): CookieHarness {
  const cookieWrites: string[] = [];
  const cookieValues = new Map<string, string>();
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        protocol: 'http:'
      },
      crypto: {
        getRandomValues(array: Uint8Array) {
          for (let index = 0; index < array.length; index += 1) {
            array[index] = (index + 1) % 255;
          }
          return array;
        }
      }
    }
  });

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get cookie() {
        return Array.from(cookieValues.entries())
          .map(([name, value]) => `${name}=${value}`)
          .join('; ');
      },
      set cookie(value: string) {
        cookieWrites.push(value);
        const [cookiePart = '', ...attributeParts] = value.split(';');
        const [name = '', rawValue = ''] = cookiePart.split('=');
        const attributes = attributeParts.map((part) => part.trim().toLowerCase());
        const maxAge = attributes.find((part) => part.startsWith('max-age='));

        if (maxAge === 'max-age=0') {
          cookieValues.delete(name);
          return;
        }

        cookieValues.set(name, rawValue);
      }
    }
  });

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  });

  return { cookieWrites };
}

const baseUser: User = {
  userId: '7',
  email: 'user@example.com',
  displayName: 'User Example',
  emailVerified: true,
  roles: ['tenant_user'],
  permissions: ['tenant:projects:read'],
  tenantId: 'tenant-1'
};

describe('auth-storage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not rewrite legacy auth cookies when mirroring refreshed session state', async () => {
    const { cookieWrites } = installBrowserGlobals();
    const { getAuthStorage } = await import('./auth-storage');

    const storage = getAuthStorage();
    const sessionId = await storage.setSession(
      {
        accessToken: 'access-token-1',
        refreshToken: 'refresh-token-1',
        idToken: 'id-token-1',
        expiresIn: 300,
        refreshExpiresIn: 3600
      },
      baseUser
    );

    cookieWrites.length = 0;

    await storage.refreshSession(
      {
        accessToken: 'access-token-2',
        refreshToken: 'refresh-token-2',
        idToken: 'id-token-2',
        expiresIn: 900,
        refreshExpiresIn: 3600
      },
      sessionId
    );

    expect(sessionId).toBe('client-mirror:7');
    expect(cookieWrites).toEqual([]);
  });

  it('clears legacy auth cookies when local mirrored session is cleared', async () => {
    const { cookieWrites } = installBrowserGlobals();
    const { getAuthStorage } = await import('./auth-storage');

    const storage = getAuthStorage();
    await storage.setSession(
      {
        accessToken: 'access-token-1',
        refreshToken: 'refresh-token-1',
        idToken: 'id-token-1',
        expiresIn: 300,
        refreshExpiresIn: 3600
      },
      baseUser
    );

    cookieWrites.length = 0;

    await storage.clearSession();

    expect(cookieWrites).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^accessToken=; path=\/; max-age=0/i),
        expect.stringMatching(/^sessionId=; path=\/; max-age=0/i),
        expect.stringMatching(/^tenantId=; path=\/; max-age=0/i)
      ])
    );
  });
});
