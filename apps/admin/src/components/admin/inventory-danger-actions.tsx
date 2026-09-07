'use client';

import { Loader2, Trash2, UserRoundX } from 'lucide-react';
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
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';

const enum DangerActionVariant {
  Destructive = 'destructive',
  Ghost = 'ghost',
  Outline = 'outline',
  Secondary = 'secondary'
}

type InventoryActionConfig = {
  confirmLabel: string;
  description: string;
  disabled?: boolean;
  disabledLabel?: string;
  endpoint: string;
  successMessage: string;
  title: string;
  triggerLabel: string;
  triggerVariant?: DangerActionVariant;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

function InventoryDangerAction({
  confirmLabel,
  description,
  disabled = false,
  disabledLabel,
  endpoint,
  successMessage,
  title,
  triggerLabel,
  triggerVariant = DangerActionVariant.Outline,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  hideTrigger = false
}: InventoryActionConfig) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = controlledOnOpenChange ?? setUncontrolledOpen;

  if (disabled && !hideTrigger) {
    return (
      <Button type="button" variant={triggerVariant} size="table" disabled>
        {disabledLabel ?? triggerLabel}
      </Button>
    );
  }

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? `Request failed with status ${response.status}`);
        }

        toast.success(successMessage);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error('Action failed', {
          description: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {hideTrigger ? null : (
        <AlertDialogTrigger asChild>
          <Button type="button" variant={triggerVariant} size="table" disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {triggerLabel}
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type InventoryDangerMenuItemProps = Omit<
  InventoryActionConfig,
  'triggerVariant' | 'hideTrigger' | 'open' | 'onOpenChange'
> & {
  icon?: React.ComponentType<{ className?: string }>;
  label?: string;
};

function InventoryDangerMenuItem({
  disabled = false,
  disabledLabel,
  icon: Icon = Trash2,
  label,
  triggerLabel,
  ...props
}: InventoryDangerMenuItemProps) {
  const [open, setOpen] = React.useState(false);
  const itemLabel = label ?? triggerLabel;

  return (
    <>
      <DropdownMenuItem
        disabled={disabled}
        onSelect={(event) => {
          if (disabled) {
            return;
          }

          event.preventDefault();
          setOpen(true);
        }}
      >
        <Icon className="h-4 w-4" />
        {disabled ? (disabledLabel ?? itemLabel) : itemLabel}
      </DropdownMenuItem>
      <InventoryDangerAction
        {...props}
        disabled={disabled}
        disabledLabel={disabledLabel}
        triggerLabel={triggerLabel}
        hideTrigger
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function TenantDeleteAction({
  disabled = false,
  name,
  tenantId
}: {
  disabled?: boolean;
  name: string;
  tenantId: number;
}) {
  if (disabled) {
    return (
      <Button type="button" variant="ghost" size="sm" disabled>
        <Trash2 className="mr-2 h-4 w-4" />
        Deleted
      </Button>
    );
  }

  return (
    <InventoryDangerAction
      title={`Delete ${name}?`}
      description="This soft deletes the organization, marks the tenant as deleted, disables memberships, and hides it from active admin inventories."
      endpoint={`/api/admin/tenants/${tenantId}`}
      triggerLabel="Delete org"
      confirmLabel="Delete organization"
      successMessage="Organization deleted"
      triggerVariant={DangerActionVariant.Outline}
    />
  );
}

export function TenantDeleteMenuItem(props: {
  disabled?: boolean;
  name: string;
  tenantId: number;
}) {
  return (
    <InventoryDangerMenuItem
      title={`Delete ${props.name}?`}
      description="This soft deletes the organization, marks the tenant as deleted, disables memberships, and hides it from active admin inventories."
      endpoint={`/api/admin/tenants/${props.tenantId}`}
      triggerLabel="Delete org"
      label="Delete organization"
      confirmLabel="Delete organization"
      successMessage="Organization deleted"
      disabled={props.disabled}
    />
  );
}

export function MembershipRemoveAction({
  disabled = false,
  scopeLabel,
  tenantId,
  userId
}: {
  disabled?: boolean;
  scopeLabel: string;
  tenantId: number;
  userId: number;
}) {
  return (
    <InventoryDangerAction
      title={`Remove membership from ${scopeLabel}?`}
      description="This removes only the selected tenant membership. The user account remains active and any other memberships stay intact."
      disabled={disabled}
      disabledLabel="Membership locked"
      endpoint={`/api/admin/memberships/${userId}?tenantId=${tenantId}`}
      triggerLabel="Remove membership"
      confirmLabel="Remove membership"
      successMessage="Membership removed"
      triggerVariant={DangerActionVariant.Ghost}
    />
  );
}

export function MembershipRemoveMenuItem(props: {
  disabled?: boolean;
  scopeLabel: string;
  tenantId: number;
  userId: number;
}) {
  return (
    <InventoryDangerMenuItem
      title={`Remove membership from ${props.scopeLabel}?`}
      description="This removes only the selected tenant membership. The user account remains active and any other memberships stay intact."
      disabled={props.disabled}
      disabledLabel="Membership locked"
      endpoint={`/api/admin/memberships/${props.userId}?tenantId=${props.tenantId}`}
      triggerLabel="Remove membership"
      confirmLabel="Remove membership"
      successMessage="Membership removed"
      icon={UserRoundX}
    />
  );
}

export function UserDeleteAction({
  disabled = false,
  disabledLabel = 'Current user',
  displayName,
  organizationId,
  userId
}: {
  disabled?: boolean;
  disabledLabel?: string;
  displayName: string;
  organizationId: number;
  userId: number;
}) {
  return (
    <InventoryDangerAction
      title={`Delete ${displayName}?`}
      description="This soft deletes the user globally. The user is deactivated and removed from active inventories across the platform."
      disabled={disabled}
      disabledLabel={disabledLabel}
      endpoint={`/api/admin/users/${userId}?organizationId=${organizationId}`}
      triggerLabel="Delete user"
      confirmLabel="Delete user"
      successMessage="User deleted"
      triggerVariant={DangerActionVariant.Outline}
    />
  );
}

export function UserDeleteMenuItem(props: {
  disabled?: boolean;
  disabledLabel?: string;
  displayName: string;
  organizationId: number;
  userId: number;
}) {
  return (
    <InventoryDangerMenuItem
      title={`Delete ${props.displayName}?`}
      description="This soft deletes the user globally. The user is deactivated and removed from active inventories across the platform."
      disabled={props.disabled}
      disabledLabel={props.disabledLabel ?? 'Current user'}
      endpoint={`/api/admin/users/${props.userId}?organizationId=${props.organizationId}`}
      triggerLabel="Delete user"
      confirmLabel="Delete user"
      successMessage="User deleted"
    />
  );
}
