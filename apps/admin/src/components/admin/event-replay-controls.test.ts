import { describe, expect, it } from 'vitest';

import { getReplayStartValidationError } from './event-replay-controls';

describe('getReplayStartValidationError', () => {
  it('requires tenant ID before starting replay', () => {
    expect(
      getReplayStartValidationError({
        aggregateId: 'user-123',
        tenantId: '',
        eventType: 'user.created',
        startDate: '',
        endDate: '',
        maxEvents: '10'
      })
    ).toBe('Tenant ID is required for replay');
  });

  it('rejects inverted date ranges', () => {
    expect(
      getReplayStartValidationError({
        aggregateId: '',
        tenantId: 'tenant-1',
        eventType: '',
        startDate: '2026-03-16T10:00',
        endDate: '2026-03-15T10:00',
        maxEvents: ''
      })
    ).toBe('Start date must be earlier than end date');
  });
});
