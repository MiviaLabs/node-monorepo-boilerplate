import { getVersionedApiBaseUrl } from './runtime-config';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | null;
  path: `/${string}`;
  version?: string;
}

function buildRequestBody(body: ApiRequestOptions['body']): BodyInit | null | undefined {
  if (
    body == null ||
    typeof body === 'string' ||
    body instanceof FormData ||
    body instanceof Blob
  ) {
    return body;
  }

  return JSON.stringify(body);
}

export async function apiFetch<T>({
  body,
  headers,
  path,
  version,
  ...init
}: ApiRequestOptions): Promise<T> {
  const url = `${getVersionedApiBaseUrl(version)}${path}`;
  const requestHeaders = new Headers(headers);

  if (body && !(body instanceof FormData) && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    body: buildRequestBody(body),
    headers: requestHeaders,
    cache: init.cache ?? 'no-store'
  });

  if (!response.ok) {
    throw new ApiClientError(
      `Backend request failed with status ${response.status}`,
      response.status
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
