export interface RuntimeConfig {
  apiUrl: string;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') {
    return {
      apiUrl: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''
    };
  }

  return {
    apiUrl: document.documentElement.getAttribute('data-api-url') ?? ''
  };
}

export function getApiUrl(): string {
  const { apiUrl } = getRuntimeConfig();

  if (!apiUrl) {
    throw new Error('API_URL environment variable is not set for server-side backend calls.');
  }

  return apiUrl.replace(/\/+$/, '');
}

export function getVersionedApiBaseUrl(version: string = 'v1'): string {
  const apiUrl = getApiUrl();
  const normalizedBase = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
  return `${normalizedBase}/${version}`;
}

export function getAppUrl(requestUrl?: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    return appUrl.replace(/\/+$/, '');
  }

  if (!requestUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set and no request URL was provided.');
  }

  return new URL('/', requestUrl).toString().replace(/\/+$/, '');
}

/**
 * Returns the trusted origin for server-side calls back into this app.
 *
 * Request host headers are untrusted input and must not be used to construct
 * URLs that receive session cookies.
 */
export function getTrustedAppUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set for server-side app calls.');
  }

  return appUrl.replace(/\/+$/, '');
}
