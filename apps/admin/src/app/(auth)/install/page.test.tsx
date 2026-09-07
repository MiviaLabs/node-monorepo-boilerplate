import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import InstallPage from './page';

const { redirectMock, getBootstrapStatusMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getBootstrapStatusMock: vi.fn(async () => ({
    initialized: false,
    installAllowed: true,
    systemOwnerExists: false
  }))
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock
}));

vi.mock('~/lib/admin-auth', () => ({
  getBootstrapStatus: getBootstrapStatusMock
}));

describe('InstallPage', () => {
  afterEach(() => {
    redirectMock.mockReset();
    getBootstrapStatusMock.mockReset();
    getBootstrapStatusMock.mockResolvedValue({
      initialized: false,
      installAllowed: true,
      systemOwnerExists: false
    });
  });

  it('renders the install surface while bootstrap is allowed', async () => {
    const html = renderToStaticMarkup(await InstallPage());

    expect(html).toContain('Set up your platform instance.');
    expect(html).toContain('Complete installation');
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects back to login once bootstrap is complete', async () => {
    getBootstrapStatusMock.mockResolvedValue({
      initialized: true,
      installAllowed: false,
      systemOwnerExists: true
    });

    await InstallPage();

    expect(redirectMock).toHaveBeenCalledWith('/');
  });
});
