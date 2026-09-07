import { API_HEADERS } from '@package/constants';
import { getRequestContext } from '@package/observability';

export interface RequestTrace {
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface RequestWithTrace {
  headers: Record<string, unknown>;
  id?: string;
}

function getHeaderValue(
  request: { headers: Record<string, unknown> } | undefined,
  headerName: string
): string | undefined {
  if (!request) {
    return undefined;
  }

  const header: unknown = request.headers[headerName];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim();
  }

  if (Array.isArray(header)) {
    const value = header.find(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
    );
    return value?.trim();
  }

  return undefined;
}

export function buildRequestTrace(request?: RequestWithTrace): RequestTrace {
  const requestContext = getRequestContext();
  const requestId =
    request?.id ?? getHeaderValue(request, API_HEADERS.X_REQUEST_ID) ?? requestContext?.requestId;
  const correlationId =
    getHeaderValue(request, API_HEADERS.X_CORRELATION_ID) ??
    (typeof requestContext?.['correlationId'] === 'string'
      ? requestContext['correlationId']
      : requestId);
  const causationId =
    getHeaderValue(request, API_HEADERS.X_CAUSATION_ID) ??
    (typeof requestContext?.['causationId'] === 'string'
      ? requestContext['causationId']
      : requestId);

  return {
    requestId,
    correlationId,
    causationId
  };
}

export function toCqrsTrace(trace: RequestTrace): {
  requestId?: string;
  correlationId?: string;
  causationId?: string;
} {
  return {
    requestId: trace.requestId,
    correlationId: trace.correlationId,
    causationId: trace.causationId
  };
}
