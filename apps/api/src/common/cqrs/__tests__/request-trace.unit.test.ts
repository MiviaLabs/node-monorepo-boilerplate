import { API_HEADERS } from '@package/constants';
import { getRequestContext } from '@package/observability';

import { buildRequestTrace } from '../request-trace';

jest.mock('@package/observability', () => ({
  getRequestContext: jest.fn()
}));

describe('buildRequestTrace', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('preserves an inbound request id carried on request.id', () => {
    const trace = buildRequestTrace({
      id: 'upstream-req-123',
      headers: {}
    });

    expect(trace).toEqual({
      requestId: 'upstream-req-123',
      correlationId: 'upstream-req-123',
      causationId: 'upstream-req-123'
    });
  });

  it('uses inbound correlation and causation headers when provided', () => {
    const trace = buildRequestTrace({
      id: 'upstream-req-123',
      headers: {
        [API_HEADERS.X_CORRELATION_ID]: 'corr-123',
        [API_HEADERS.X_CAUSATION_ID]: 'cause-123'
      }
    });

    expect(trace).toEqual({
      requestId: 'upstream-req-123',
      correlationId: 'corr-123',
      causationId: 'cause-123'
    });
  });

  it('falls back to request context when no request object is available', () => {
    (getRequestContext as jest.Mock).mockReturnValue({
      requestId: 'ctx-req-123',
      correlationId: 'ctx-corr-123',
      causationId: 'ctx-cause-123'
    });

    const trace = buildRequestTrace();

    expect(trace).toEqual({
      requestId: 'ctx-req-123',
      correlationId: 'ctx-corr-123',
      causationId: 'ctx-cause-123'
    });
  });
});
