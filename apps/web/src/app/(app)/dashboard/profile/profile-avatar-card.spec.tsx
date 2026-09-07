import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileAvatarCard } from './profile-avatar-card';

import type { ReactNode } from 'react';

let currentUser: {
  displayName?: string;
  name?: string;
  email?: string;
  photoUrl?: string | null;
  avatarFileId?: number | null;
} | null = null;

const applyUserProfile = vi.fn(async () => undefined);
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh })
}));

vi.mock('~/components/auth/current-user-avatar', () => ({
  CurrentUserAvatar: ({
    displayName,
    email,
    photoUrl
  }: {
    displayName: string;
    email: string;
    photoUrl?: string | null;
  }) => (
    <div
      data-testid="avatar"
      data-display-name={displayName}
      data-email={email}
      data-photo-url={photoUrl ?? ''}
    />
  )
}));

vi.mock('~/components/ui/button', () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children?: ReactNode }) =>
    asChild ? children : <button {...props}>{children}</button>
}));

vi.mock('~/components/ui/card', () => ({
  Card: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children?: ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>
}));

vi.mock('~/components/ui/enterprise-styles', () => ({
  enterpriseCardVariants: () => 'enterprise-card'
}));

vi.mock('~/lib/api/auth-api', () => ({
  normalizeApiErrorMessage: (payload: { message?: string }, fallbackStatus: number) =>
    payload.message ?? `Request failed (${fallbackStatus})`
}));

vi.mock('~/hooks/use-auth', () => ({
  useAuth: () => ({
    user: currentUser,
    applyUserProfile,
    refreshSession: vi.fn()
  })
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

describe('ProfileAvatarCard', () => {
  beforeEach(() => {
    currentUser = null;
    applyUserProfile.mockClear();
    refresh.mockClear();
  });

  it('renders a remove avatar action when the user has an attached avatar', () => {
    currentUser = {
      displayName: 'Jordan Lee',
      email: 'jordan@example.com',
      photoUrl: 'https://cdn.example.test/avatar.png',
      avatarFileId: 301
    };

    const markup = renderToStaticMarkup(
      <ProfileAvatarCard
        initialDisplayName="Jordan Lee"
        initialEmail="jordan@example.com"
        initialPhotoUrl="https://legacy.example.test/avatar.png"
      />
    );

    expect(markup).toContain('Remove avatar');
    expect(markup).toContain('Upload avatar');
  });

  it('does not render the remove avatar action when there is no attached avatar', () => {
    currentUser = {
      displayName: 'Jordan Lee',
      email: 'jordan@example.com',
      photoUrl: null,
      avatarFileId: null
    };

    const markup = renderToStaticMarkup(
      <ProfileAvatarCard
        initialDisplayName="Jordan Lee"
        initialEmail="jordan@example.com"
        initialPhotoUrl="https://legacy.example.test/avatar.png"
      />
    );

    expect(markup).not.toContain('Remove avatar');
    expect(markup).toContain('Upload avatar');
  });
});
