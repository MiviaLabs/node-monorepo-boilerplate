'use client';

import { useEffect, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { useAuth } from '~/hooks/use-auth';

function getInitials(displayName: string, email: string): string {
  const avatarSource = displayName || email || 'U';
  return avatarSource
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function CurrentUserAvatar({
  displayName,
  email,
  photoUrl,
  className,
  fallbackClassName
}: {
  displayName: string;
  email: string;
  photoUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const { refreshSession } = useAuth();
  const [hasRetried, setHasRetried] = useState(false);
  const initials = getInitials(displayName, email);
  const avatarIdentity = photoUrl ?? '__fallback__';

  useEffect(() => {
    setHasRetried(false);
  }, [avatarIdentity]);

  return (
    <Avatar key={avatarIdentity} className={className}>
      {photoUrl ? (
        <AvatarImage
          src={photoUrl}
          alt={displayName || email || 'User avatar'}
          onError={() => {
            if (hasRetried) {
              return;
            }

            setHasRetried(true);
            void refreshSession();
          }}
        />
      ) : null}
      <AvatarFallback className={fallbackClassName}>{initials || 'U'}</AvatarFallback>
    </Avatar>
  );
}
