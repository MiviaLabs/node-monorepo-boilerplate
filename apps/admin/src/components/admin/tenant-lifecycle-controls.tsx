'use client';

import { Loader2, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';

const TENANT_NAME_MAX_LENGTH = 255;
const TENANT_SLUG_MAX_LENGTH = 50;
const TENANT_SLUG_REGEX = /^[a-z0-9-]+$/;

const MUTABLE_TENANT_STATUSES = ['active', 'suspended', 'deleted'] as const;

type MutableTenantStatus = (typeof MUTABLE_TENANT_STATUSES)[number];
type TenantStatus = 'draft' | 'trial' | MutableTenantStatus;

interface CreateTenantFormState {
  name: string;
  slug: string;
}

interface UpdateTenantFormState extends CreateTenantFormState {
  status: '' | MutableTenantStatus;
}

function normalizeName(value: string) {
  return value.trim();
}

function normalizeSlug(value: string) {
  return value.trim();
}

function validateName(name: string) {
  if (name.length < 2) {
    return 'Tenant name must be at least 2 characters';
  }

  if (name.length > TENANT_NAME_MAX_LENGTH) {
    return `Tenant name must be ${TENANT_NAME_MAX_LENGTH} characters or fewer`;
  }

  return null;
}

function validateSlug(slug: string) {
  if (slug.length === 0) {
    return 'Tenant slug is required';
  }

  if (slug.length > TENANT_SLUG_MAX_LENGTH) {
    return `Tenant slug must be ${TENANT_SLUG_MAX_LENGTH} characters or fewer`;
  }

  if (!TENANT_SLUG_REGEX.test(slug)) {
    return 'Tenant slug must contain only lowercase letters, numbers, and hyphens';
  }

  return null;
}

export function getCreateTenantValidationError(input: CreateTenantFormState) {
  const normalizedName = normalizeName(input.name);
  const normalizedSlug = normalizeSlug(input.slug);

  return validateName(normalizedName) ?? validateSlug(normalizedSlug);
}

export function getUpdateTenantValidationError(
  input: UpdateTenantFormState,
  initialValues: { name: string; slug: string; status: TenantStatus }
) {
  const normalizedName = normalizeName(input.name);
  const normalizedSlug = normalizeSlug(input.slug);
  const requestedStatus = input.status;

  const nameError = validateName(normalizedName);
  if (nameError) {
    return nameError;
  }

  const slugError = validateSlug(normalizedSlug);
  if (slugError) {
    return slugError;
  }

  const statusChanged =
    requestedStatus.length > 0 && requestedStatus !== (initialValues.status as MutableTenantStatus);
  const changed =
    normalizedName !== initialValues.name || normalizedSlug !== initialValues.slug || statusChanged;

  if (!changed) {
    return 'No lifecycle changes to save';
  }

  return null;
}

function unwrapTenantMutationResult(payload: unknown) {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: unknown }).data;
  }

  return payload;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    typeof payload.message === 'string'
  ) {
    return payload.message;
  }

  return fallback;
}

export function TenantCreateDialog({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<CreateTenantFormState>({
    name: '',
    slug: ''
  });

  if (!canCreate) {
    return null;
  }

  async function handleCreate() {
    const validationError = getCreateTenantValidationError(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsPending(true);

    try {
      const response = await fetch('/api/system/tenants', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          name: normalizeName(form.name),
          slug: normalizeSlug(form.slug)
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string }
        | { data?: { name?: string } }
        | null;

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, `Tenant creation failed (${response.status})`));
      }

      const result = unwrapTenantMutationResult(payload) as { name?: string } | null;
      toast.success('Tenant created', {
        description: result?.name
          ? `${result.name} was created and added to the inventory.`
          : 'The tenant was created and added to the inventory.'
      });
      setOpen(false);
      setForm({ name: '', slug: '' });
      router.refresh();
    } catch (error) {
      toast.error('Tenant creation failed', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Create tenant
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create tenant</DialogTitle>
          <DialogDescription>
            Create a tenant using the existing system API contract. New tenants are created active
            by the current backend flow.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-create-name">Tenant name</Label>
            <Input
              id="tenant-create-name"
              value={form.name}
              maxLength={TENANT_NAME_MAX_LENGTH}
              disabled={isPending}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-create-slug">Tenant slug</Label>
            <Input
              id="tenant-create-slug"
              value={form.slug}
              maxLength={TENANT_SLUG_MAX_LENGTH}
              disabled={isPending}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create tenant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TenantLifecycleEditor({
  tenantId,
  initialName,
  initialSlug,
  currentStatus,
  canUpdate
}: {
  tenantId: number;
  initialName: string;
  initialSlug: string;
  currentStatus: TenantStatus;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [form, setForm] = useState<UpdateTenantFormState>({
    name: initialName,
    slug: initialSlug,
    status: ''
  });

  const currentStatusLabel = useMemo(
    () => currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1),
    [currentStatus]
  );

  if (!canUpdate) {
    return (
      <p className="text-xs text-muted-foreground">
        Lifecycle edits require the `system:tenants:update` permission.
      </p>
    );
  }

  async function handleUpdate() {
    const validationError = getUpdateTenantValidationError(form, {
      name: initialName,
      slug: initialSlug,
      status: currentStatus
    });

    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload: Record<string, string> = {};
    const normalizedName = normalizeName(form.name);
    const normalizedSlug = normalizeSlug(form.slug);

    if (normalizedName !== initialName) {
      payload['name'] = normalizedName;
    }

    if (normalizedSlug !== initialSlug) {
      payload['slug'] = normalizedSlug;
    }

    if (form.status.length > 0 && form.status !== currentStatus) {
      payload['status'] = form.status;
    }

    setIsPending(true);

    try {
      const response = await fetch(`/api/system/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responsePayload = (await response.json().catch(() => null)) as
        | { message?: string }
        | { data?: { name?: string } }
        | null;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(responsePayload, `Tenant update failed (${response.status})`)
        );
      }

      const result = unwrapTenantMutationResult(responsePayload) as { name?: string } | null;
      toast.success('Tenant lifecycle updated', {
        description: result?.name
          ? `${result.name} was updated successfully.`
          : 'The tenant lifecycle changes were saved.'
      });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error('Tenant update failed', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          setOpen(nextOpen);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="mr-2 h-4 w-4" />
          Edit lifecycle
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit tenant lifecycle</DialogTitle>
          <DialogDescription>
            Update the fields already supported by the system tenant API. Settings, branding, and
            auth posture stay read-only in this phase.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-update-name">Tenant name</Label>
            <Input
              id="tenant-update-name"
              value={form.name}
              maxLength={TENANT_NAME_MAX_LENGTH}
              disabled={isPending}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-update-slug">Tenant slug</Label>
            <Input
              id="tenant-update-slug"
              value={form.slug}
              maxLength={TENANT_SLUG_MAX_LENGTH}
              disabled={isPending}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tenant-update-status">Lifecycle status</Label>
            <select
              id="tenant-update-status"
              value={form.status}
              disabled={isPending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as UpdateTenantFormState['status']
                }))
              }
            >
              <option value="">Keep current ({currentStatusLabel})</option>
              {MUTABLE_TENANT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Only `active`, `suspended`, and `deleted` are currently mutable through the backend.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleUpdate} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save lifecycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
