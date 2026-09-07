import { getApiUrl, getAppUrl, getVersionedApiBaseUrl } from './runtime-config';

describe('runtime-config', () => {
  const originalApiUrl = process.env.API_URL;
  const originalPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;
  const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.API_URL;
    } else {
      process.env.API_URL = originalApiUrl;
    }

    if (originalPublicApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalPublicApiUrl;
    }

    if (originalPublicAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
    }
  });

  it('throws when no server-side api url is configured', () => {
    delete process.env.API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(() => getApiUrl()).toThrow('API_URL environment variable is not set');
  });

  it('normalizes the versioned api base url', () => {
    process.env.API_URL = 'https://api.example.test';

    expect(getVersionedApiBaseUrl()).toBe('https://api.example.test/api/v1');
    expect(getVersionedApiBaseUrl('v1')).toBe('https://api.example.test/api/v1');
  });

  it('prefers NEXT_PUBLIC_APP_URL for app redirects', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://admin.example.test/';

    expect(getAppUrl('http://0.0.0.0:3000/logout')).toBe('https://admin.example.test');
  });

  it('falls back to the request origin when NEXT_PUBLIC_APP_URL is missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    expect(getAppUrl('http://localhost:3002/logout')).toBe('http://localhost:3002');
  });
});
