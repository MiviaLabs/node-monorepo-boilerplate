'use client';

import { Loader2, RefreshCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

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
import { Button } from '~/components/ui/button';

type DeadLetterRowActionsProps = {
  eventId: string;
  eventType: string;
};

type ReplayPayload = {
  data?: {
    success?: boolean;
    message?: string;
  };
  success?: boolean;
  message?: string;
};

export function getReplayResult(payload: ReplayPayload | null): {
  success: boolean;
  message: string;
} {
  const success = payload?.data?.success ?? payload?.success ?? false;
  const message =
    payload?.data?.message ??
    payload?.message ??
    (success ? 'Event queued for replay' : 'Failed to queue event for replay');

  return { success, message };
}

export function DeadLetterRowActions({ eventId, eventType }: DeadLetterRowActionsProps) {
  const router = useRouter();
  const [action, setAction] = React.useState<'replay' | 'delete' | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleReplay = () => {
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/system/dead-letter/${encodeURIComponent(eventId)}/replay`,
          {
            method: 'POST'
          }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Replay failed with status ${response.status}`);
        }

        const payload = (await response.json().catch(() => null)) as ReplayPayload | null;
        const result = getReplayResult(payload);

        if (!result.success) {
          throw new Error(result.message);
        }

        toast.success(result.message);
        setAction(null);
        router.refresh();
      } catch (error) {
        toast.error('Replay failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/system/dead-letter/${encodeURIComponent(eventId)}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Delete failed with status ${response.status}`);
        }

        toast.success('Dead-letter event deleted');
        setAction(null);
        router.refresh();
      } catch (error) {
        toast.error('Delete failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AlertDialog
        open={action === 'replay'}
        onOpenChange={(open) => setAction(open ? 'replay' : null)}
      >
        <AlertDialogTrigger asChild>
          <Button type="button" variant="secondary" size="table" disabled={isPending}>
            {isPending && action === 'replay' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Replay
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replay {eventType}?</AlertDialogTitle>
            <AlertDialogDescription>
              This requeues the dead-lettered event for delivery retry. Use it only after the
              underlying failure condition has been addressed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReplay} disabled={isPending}>
              Replay event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={action === 'delete'}
        onOpenChange={(open) => setAction(open ? 'delete' : null)}
      >
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" size="table" disabled={isPending}>
            {isPending && action === 'delete' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete dead-letter record?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the dead-letter record from the queue. Only use this when the
              event is no longer needed for replay or incident analysis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Delete record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
