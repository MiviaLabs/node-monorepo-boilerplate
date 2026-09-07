'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
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

type EmailWebhookRowActionsProps = {
  eventId: number;
  providerEventType: string;
};

export function EmailWebhookRowActions({
  eventId,
  providerEventType
}: EmailWebhookRowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const handleReprocess = () => {
    startTransition(async () => {
      try {
        const response = await fetch(`/api/system/email-webhooks/${eventId}/reprocess`, {
          method: 'POST'
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Reprocess failed with status ${response.status}`);
        }

        toast.success('Webhook reprocess queued');
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error('Webhook reprocess failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" size="table" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Reprocess
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reprocess {providerEventType}?</AlertDialogTitle>
          <AlertDialogDescription>
            This re-runs correlation and message-status application for the selected webhook event.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleReprocess} disabled={isPending}>
            Reprocess event
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
