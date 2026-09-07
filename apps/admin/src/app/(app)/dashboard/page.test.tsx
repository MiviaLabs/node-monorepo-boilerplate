import { afterEach, describe, expect, it, vi } from 'vitest';

import DashboardCompatibilityPage from './page';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn()
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

describe('DashboardCompatibilityPage', () => {
  afterEach(() => {
    redirectMock.mockReset();
  });

  it('redirects legacy dashboard traffic to inbox', async () => {
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });

    expect(() => DashboardCompatibilityPage()).toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/inbox');
  });
});
