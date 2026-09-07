import { afterEach, describe, expect, it, vi } from 'vitest';

import PreferencesCompatibilityPage from './page';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn()
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

describe('PreferencesCompatibilityPage', () => {
  afterEach(() => {
    redirectMock.mockReset();
  });

  it('redirects legacy preferences traffic to settings', async () => {
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });

    expect(() => PreferencesCompatibilityPage()).toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/settings');
  });
});
