import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';

vi.mock('~/lib/auth/public-api', () => ({
  InvitationPreviewFailureStatus: {
    INVALID: 'invalid',
    EXPIRED: 'expired',
    CONSUMED: 'consumed'
  },
  adminPublicAuthApi: {
    getInvitationPreview: vi.fn().mockResolvedValue({
      status: 'valid',
      tenantName: 'Global Control',
      inviterDisplayName: 'Control Room',
      invitedEmailMasked: 'o***@example.com',
      expiresAt: null
    })
  }
}));

import AcceptInvitationPage from './page';

describe('AcceptInvitationPage', () => {
  it('renders a valid invitation preview', async () => {
    const page = await AcceptInvitationPage({
      searchParams: Promise.resolve({
        token: 'invite-good-token',
        tenantId: '123'
      })
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Review your invitation.');
    expect(html).toContain('Global Control');
    expect(html).toContain('Control Room');
    expect(html).toContain('Go to sign in');
  });

  it('renders invalid invitation state when token is missing', async () => {
    const page = await AcceptInvitationPage({
      searchParams: Promise.resolve({})
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain('Invitation link is incomplete.');
    expect(html).toContain('missing required details');
  });
});
