type DiagnosticAttributeValue = string | number | boolean | null | undefined;
type DiagnosticAttributes = Record<string, DiagnosticAttributeValue>;
type Phase0Trace = {
  requestId: string;
  correlationId: string;
  causationId: string;
};
const PHASE0_TRACE_HEADERS = {
  requestId: 'x-request-id',
  correlationId: 'x-correlation-id',
  causationId: 'x-causation-id'
} as const;

const enum Phase0Event {
  Finish = 'finish',
  Error = 'error',
  Note = 'note'
}

const PHASE0_DIAGNOSTICS_ENABLED = process.env['LATENCY_PHASE0_ENABLED'] === 'true';
const REGION_ENV_KEYS = [
  'APP_REGION',
  'RAILWAY_DEPLOYMENT_REGION',
  'RAILWAY_REGION',
  'FLY_REGION',
  'VERCEL_REGION',
  'AWS_REGION',
  'GCP_REGION',
  'REGION'
] as const;

const PHASE0_ROUTE_BUDGETS = {
  '/dashboard': {
    routeBudgetValidationCalls: 1,
    routeBudgetBootstrapCalls: 1,
    routeBudgetAuditWrites: 1,
    routeBudgetServerFetchCalls: 1
  },
  '/members': {
    routeBudgetValidationCalls: 1,
    routeBudgetBootstrapCalls: 1,
    routeBudgetAuditWrites: 1,
    routeBudgetServerFetchCalls: 1
  },
  '/issues': {
    routeBudgetValidationCalls: 1,
    routeBudgetBootstrapCalls: 1,
    routeBudgetAuditWrites: 1,
    routeBudgetServerFetchCalls: 3
  },
  '/issues/[issueId]': {
    routeBudgetValidationCalls: 1,
    routeBudgetBootstrapCalls: 1,
    routeBudgetAuditWrites: 1,
    routeBudgetServerFetchCalls: 6
  },
  '/my': {
    routeBudgetValidationCalls: 1,
    routeBudgetBootstrapCalls: 1,
    routeBudgetAuditWrites: 1,
    routeBudgetServerFetchCalls: 4
  }
} as const;

function createPhase0Id(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeHeaderValue(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function sanitizeAttributes(
  attributes: DiagnosticAttributes
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === 'string' ||
        typeof entry[1] === 'number' ||
        typeof entry[1] === 'boolean'
    )
  );
}

function getRuntime(): 'edge' | 'node' | 'browser' {
  if (typeof window !== 'undefined') {
    return 'browser';
  }

  return 'EdgeRuntime' in globalThis ? 'edge' : 'node';
}

function emitPhase0Event(
  event: Phase0Event,
  stage: string,
  attributes: DiagnosticAttributes
): void {
  if (!PHASE0_DIAGNOSTICS_ENABLED) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info(
    '[phase0][web]',
    JSON.stringify({
      event,
      stage,
      runtime: getRuntime(),
      region: getPhase0Region(),
      timestamp: new Date().toISOString(),
      ...sanitizeAttributes(attributes)
    })
  );
}

export function isPhase0DiagnosticsEnabled(): boolean {
  return PHASE0_DIAGNOSTICS_ENABLED;
}

export function getPhase0Region(): string {
  for (const key of REGION_ENV_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return 'unknown';
}

export function getPhase0ApiTargetAttributes(apiUrl: string): Record<string, string> {
  try {
    const parsed = new URL(apiUrl);
    return {
      apiTargetOrigin: parsed.origin,
      apiTargetHost: parsed.host
    };
  } catch {
    return {
      apiTargetOrigin: apiUrl,
      apiTargetHost: apiUrl
    };
  }
}

export function ensurePhase0Trace(headers?: Headers): Phase0Trace {
  const requestId =
    normalizeHeaderValue(headers?.get(PHASE0_TRACE_HEADERS.requestId)) ?? createPhase0Id('req');
  const correlationId =
    normalizeHeaderValue(headers?.get(PHASE0_TRACE_HEADERS.correlationId)) ?? requestId;
  const causationId =
    normalizeHeaderValue(headers?.get(PHASE0_TRACE_HEADERS.causationId)) ?? requestId;

  return {
    requestId,
    correlationId,
    causationId
  };
}

export function getPhase0TraceHeaders(headers?: Headers): Record<string, string> {
  const trace = ensurePhase0Trace(headers);

  return getPhase0TraceHeaderMap(trace);
}

export function getPhase0TraceHeaderMap(trace: Phase0Trace): Record<string, string> {
  return {
    [PHASE0_TRACE_HEADERS.requestId]: trace.requestId,
    [PHASE0_TRACE_HEADERS.correlationId]: trace.correlationId,
    [PHASE0_TRACE_HEADERS.causationId]: trace.causationId
  };
}

export function getPhase0TraceAttributes(trace: Phase0Trace): Record<string, string> {
  return {
    requestId: trace.requestId,
    correlationId: trace.correlationId,
    causationId: trace.causationId
  };
}

export function getPhase0RouteBudgetAttributes(
  pathname: string | null | undefined
): DiagnosticAttributes {
  if (!pathname) {
    return {};
  }

  const route =
    pathname.startsWith('/issues/') && pathname !== '/issues'
      ? '/issues/[issueId]'
      : pathname in PHASE0_ROUTE_BUDGETS
        ? (pathname as keyof typeof PHASE0_ROUTE_BUDGETS)
        : null;

  if (!route) {
    return {};
  }

  return {
    routeBudgetPath: route,
    ...PHASE0_ROUTE_BUDGETS[route]
  };
}

export function recordPhase0Note(stage: string, attributes: DiagnosticAttributes = {}): void {
  emitPhase0Event(Phase0Event.Note, stage, attributes);
}

export async function measurePhase0<T>(
  stage: string,
  attributes: DiagnosticAttributes,
  operation: () => Promise<T>
): Promise<T> {
  if (!PHASE0_DIAGNOSTICS_ENABLED) {
    return operation();
  }

  const startedAt = now();

  try {
    const result = await operation();
    emitPhase0Event(Phase0Event.Finish, stage, {
      ...attributes,
      durationMs: Math.round((now() - startedAt) * 100) / 100
    });
    return result;
  } catch (error) {
    emitPhase0Event(Phase0Event.Error, stage, {
      ...attributes,
      durationMs: Math.round((now() - startedAt) * 100) / 100,
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
    throw error;
  }
}
