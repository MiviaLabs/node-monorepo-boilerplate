import { describe, expect, it } from 'vitest';

import { getReplayResult } from './dead-letter-row-actions';

describe('getReplayResult', () => {
  it('treats success false as a failed replay even on HTTP 200 payloads', () => {
    expect(
      getReplayResult({
        data: {
          success: false,
          message: 'Failed to queue event for replay'
        }
      })
    ).toEqual({
      success: false,
      message: 'Failed to queue event for replay'
    });
  });

  it('reads success true from wrapped payloads', () => {
    expect(
      getReplayResult({
        data: {
          success: true,
          message: 'Event queued for replay'
        }
      })
    ).toEqual({
      success: true,
      message: 'Event queued for replay'
    });
  });
});
