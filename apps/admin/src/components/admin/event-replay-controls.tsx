'use client';

import { Loader2, RefreshCcw, SquareTerminal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';

import type {
  AdminEventReplayStatus,
  AdminStartEventReplayInput
} from '~/lib/admin';

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
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

type StartReplayPayload = {
  data?: {
    replayId?: string;
    status?: string;
  };
  replayId?: string;
  status?: string;
};

type CancelReplayPayload = {
  data?: {
    success?: boolean;
    message?: string;
  };
  success?: boolean;
  message?: string;
};

type ReplayStartFormState = {
  aggregateId: string;
  tenantId: string;
  eventType: string;
  startDate: string;
  endDate: string;
  maxEvents: string;
};

function toIsoString(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function unwrapReplayStart(payload: StartReplayPayload | null) {
  return {
    replayId: payload?.data?.replayId ?? payload?.replayId,
    status: payload?.data?.status ?? payload?.status
  };
}

function unwrapReplayCancel(payload: CancelReplayPayload | null) {
  return {
    success: payload?.data?.success ?? payload?.success ?? false,
    message:
      payload?.data?.message ??
      payload?.message ??
      'Failed to cancel replay (session not found or already completed)'
  };
}

function toLocalDateTimeValue(value?: string) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function getReplayStartValidationError(form: ReplayStartFormState) {
  if (!form.tenantId.trim()) {
    return 'Tenant ID is required for replay';
  }

  if (form.startDate && form.endDate && new Date(form.startDate) > new Date(form.endDate)) {
    return 'Start date must be earlier than end date';
  }

  return null;
}

export function EventReplayControls({
  canViewReplay,
  canManageReplay,
  currentReplayId,
  status
}: {
  canViewReplay: boolean;
  canManageReplay: boolean;
  currentReplayId?: string;
  status?: AdminEventReplayStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [lookupReplayId, setLookupReplayId] = React.useState(currentReplayId ?? '');
  const [form, setForm] = React.useState<ReplayStartFormState>({
    aggregateId: '',
    tenantId: '',
    eventType: '',
    startDate: '',
    endDate: '',
    maxEvents: ''
  });

  const statusIsTerminal =
    status?.status === 'completed' || status?.status === 'failed' || status?.status === 'cancelled';

  const handleLookup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const replayId = lookupReplayId.trim();

    if (!replayId) {
      toast.error('Replay ID is required');
      return;
    }

    router.push(`/system/event-replay?replayId=${encodeURIComponent(replayId)}`);
  };

  const handleStart = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canManageReplay) {
      return;
    }

    const validationError = getReplayStartValidationError(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    startTransition(async () => {
      try {
        const payload: AdminStartEventReplayInput = {
          aggregateId: form.aggregateId.trim() || undefined,
          tenantId: form.tenantId.trim() || undefined,
          eventType: form.eventType.trim() || undefined,
          startDate: toIsoString(form.startDate),
          endDate: toIsoString(form.endDate),
          maxEvents: form.maxEvents ? Number(form.maxEvents) : undefined
        };
        const response = await fetch('/api/system/event-replay', {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(errorPayload?.message ?? `Replay failed with status ${response.status}`);
        }

        const replayPayload = (await response
          .json()
          .catch(() => null)) as StartReplayPayload | null;
        const result = unwrapReplayStart(replayPayload);
        if (!result.replayId) {
          throw new Error('Replay started but no replay ID was returned');
        }

        toast.success(`Replay started (${result.status ?? 'queued'})`, {
          description: canViewReplay
            ? undefined
            : `Replay ID: ${result.replayId}. Status lookup requires system:system:monitor.`
        });
        setLookupReplayId(result.replayId);
        if (canViewReplay) {
          router.push(`/system/event-replay?replayId=${encodeURIComponent(result.replayId)}`);
          router.refresh();
        }
      } catch (error) {
        toast.error('Replay start failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  };

  const handleCancel = () => {
    if (!currentReplayId) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/system/event-replay/${encodeURIComponent(currentReplayId)}/cancel`,
          {
            method: 'POST'
          }
        );

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(errorPayload?.message ?? `Cancel failed with status ${response.status}`);
        }

        const cancelPayload = (await response
          .json()
          .catch(() => null)) as CancelReplayPayload | null;
        const result = unwrapReplayCancel(cancelPayload);
        if (!result.success) {
          throw new Error(result.message);
        }

        toast.success(result.message);
        setCancelOpen(false);
        router.refresh();
      } catch (error) {
        toast.error('Replay cancel failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleLookup}
        className="space-y-3 rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] p-4"
      >
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Replay status lookup</p>
          <p className="text-xs text-muted-foreground">
            Open an existing replay session by ID when an operator shares the session handle.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={lookupReplayId}
            onChange={(event) => setLookupReplayId(event.target.value)}
            placeholder="Replay session ID"
            disabled={isPending || !canViewReplay}
          />
          <Button type="submit" variant="secondary" disabled={isPending || !canViewReplay}>
            <RefreshCcw className="h-4 w-4" />
            Open status
          </Button>
        </div>
        {!canViewReplay ? (
          <p className="text-xs text-muted-foreground">
            Requires <code>system:system:monitor</code> to inspect replay status by session ID.
          </p>
        ) : null}
      </form>

      <form
        onSubmit={handleStart}
        className="space-y-4 rounded-xl border border-border/70 bg-[hsl(var(--panel-subtle))] p-4"
      >
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Start replay</p>
          <p className="text-xs text-muted-foreground">
            Tenant scope is required. Add optional aggregate, type, or time filters before
            republishing historical events.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="replay-aggregate-id">Aggregate ID</Label>
            <Input
              id="replay-aggregate-id"
              value={form.aggregateId}
              onChange={(event) =>
                setForm((current) => ({ ...current, aggregateId: event.target.value }))
              }
              placeholder="user-123"
              disabled={isPending || !canManageReplay}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replay-tenant-id">Tenant ID</Label>
            <Input
              id="replay-tenant-id"
              value={form.tenantId}
              onChange={(event) =>
                setForm((current) => ({ ...current, tenantId: event.target.value }))
              }
              placeholder="tenant-abc"
              required
              disabled={isPending || !canManageReplay}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replay-event-type">Event type</Label>
            <Input
              id="replay-event-type"
              value={form.eventType}
              onChange={(event) =>
                setForm((current) => ({ ...current, eventType: event.target.value }))
              }
              placeholder="user.created"
              disabled={isPending || !canManageReplay}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replay-max-events">Max events</Label>
            <Input
              id="replay-max-events"
              type="number"
              min={1}
              value={form.maxEvents}
              onChange={(event) =>
                setForm((current) => ({ ...current, maxEvents: event.target.value }))
              }
              placeholder="100"
              disabled={isPending || !canManageReplay}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replay-start-date">Start date</Label>
            <Input
              id="replay-start-date"
              type="datetime-local"
              value={toLocalDateTimeValue(form.startDate)}
              onChange={(event) =>
                setForm((current) => ({ ...current, startDate: event.target.value }))
              }
              disabled={isPending || !canManageReplay}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="replay-end-date">End date</Label>
            <Input
              id="replay-end-date"
              type="datetime-local"
              value={toLocalDateTimeValue(form.endDate)}
              onChange={(event) =>
                setForm((current) => ({ ...current, endDate: event.target.value }))
              }
              disabled={isPending || !canManageReplay}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={isPending || !canManageReplay}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SquareTerminal className="h-4 w-4" />
            )}
            Start replay
          </Button>
          {!canManageReplay ? (
            <p className="text-xs text-muted-foreground">
              Requires <code>system:system:settings</code> to start or cancel replay sessions.
            </p>
          ) : null}
        </div>
      </form>

      {status && currentReplayId && canManageReplay && !statusIsTerminal ? (
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="destructive" size="sm" disabled={isPending}>
              Cancel replay
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel replay {currentReplayId}?</AlertDialogTitle>
              <AlertDialogDescription>
                This stops new events from being processed. Events already replayed remain
                published.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Keep running</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel} disabled={isPending}>
                Cancel replay
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
