'use client';

import { Loader2, ShieldX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import type { AdminSession } from '~/lib/admin';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '~/components/ui/alert-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

function formatSessionTimestamp(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatTokenId(tokenId: string) {
  if (tokenId.length <= 16) {
    return tokenId;
  }

  return `${tokenId.slice(0, 8)}...${tokenId.slice(-6)}`;
}

export function ProfileSessionPanel({ sessions }: { sessions: AdminSession[] }) {
  const router = useRouter();
  const [targetSessionId, setTargetSessionId] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const sortedSessions = React.useMemo(
    () =>
      [...sessions].sort(
        (left, right) =>
          new Date(right.lastActivity).getTime() - new Date(left.lastActivity).getTime()
      ),
    [sessions]
  );

  const handleRevoke = () => {
    if (!targetSessionId) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(`/api/auth/sessions/${encodeURIComponent(targetSessionId)}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Session revoke failed (${response.status})`);
        }

        toast.success('Session revoked', {
          description: 'The selected stored session and refresh token were invalidated.'
        });
        setTargetSessionId(null);
        router.refresh();
      } catch (error) {
        toast.error('Session revoke failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Operator sessions</p>
          <p className="text-xs text-muted-foreground">
            Current authenticated sessions for this operator in the active tenant.
          </p>
        </div>
        <Badge variant="outline" size="sm">
          {sortedSessions.length} active
        </Badge>
      </div>

      {sortedSessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3 text-sm text-muted-foreground">
          No active sessions were returned for this operator.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedSessions.map((session) => (
            <div
              key={session.id}
              className="rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={session.active ? 'secondary' : 'outline'} size="sm">
                      {session.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Session {formatTokenId(session.id)}
                    </span>
                  </div>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em]">Created</p>
                      <p className="mt-1 text-foreground">
                        {formatSessionTimestamp(session.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em]">Last activity</p>
                      <p className="mt-1 text-foreground">
                        {formatSessionTimestamp(session.lastActivity)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em]">Expires</p>
                      <p className="mt-1 text-foreground">
                        {formatSessionTimestamp(session.expiresAt)}
                      </p>
                    </div>
                  </div>
                </div>

                <AlertDialog
                  open={targetSessionId === session.id}
                  onOpenChange={(open) => setTargetSessionId(open ? session.id : null)}
                >
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={isPending}>
                      {isPending && targetSessionId === session.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldX className="mr-2 h-4 w-4" />
                      )}
                      Revoke
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes the stored session and refresh token for the selected operator
                        session. It does not grant cross-user administration.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRevoke} disabled={isPending}>
                        Revoke session
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
