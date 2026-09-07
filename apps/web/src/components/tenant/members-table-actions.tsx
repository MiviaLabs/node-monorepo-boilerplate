'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Mail, MoreHorizontal, Shield, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { TenantMember, TenantRole } from '~/types/tenant.types';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { iconSwapVariants, iconSwapTransition } from '~/lib/motion';
import { TENANT_ROLES, ROLE_DISPLAY, MemberStatus } from '~/types/tenant.types';
import { api } from '~/utils/api';

export interface MemberOptimisticSnapshot {
  index: number;
  member: TenantMember;
}

export interface MembersTableOptimisticActions {
  onDeleteOptimistic?: (memberId: string) => MemberOptimisticSnapshot | undefined;
  onRoleOptimisticUpdate?: (
    memberId: string,
    role: TenantRole
  ) => MemberOptimisticSnapshot | undefined;
  onRollback?: (snapshot: MemberOptimisticSnapshot | undefined) => void;
  onStatusOptimisticUpdate?: (
    memberId: string,
    status: MemberStatus
  ) => MemberOptimisticSnapshot | undefined;
}

function handleMutationError(
  error: { message?: string },
  operation: string,
  rollback?: (snapshot: MemberOptimisticSnapshot | undefined) => void,
  snapshot?: MemberOptimisticSnapshot
): void {
  rollback?.(snapshot);
  const errorMessage = error.message || `Failed to ${operation}`;
  toast.error(`Error: ${errorMessage}`, { duration: 3000 });
}

async function handleMutationSuccess(
  operation: string,
  onRefresh?: () => Promise<void> | void
): Promise<void> {
  toast.success(`Successfully ${operation}`, { duration: 3000 });
  await onRefresh?.();
}

interface MemberActionsCellProps {
  member: TenantMember;
  onRefresh?: () => Promise<void> | void;
  optimisticActions?: MembersTableOptimisticActions;
}

export function MemberActionsCell({
  member,
  onRefresh,
  optimisticActions
}: MemberActionsCellProps) {
  const isPendingInvitation =
    member.status === MemberStatus.PENDING || member.userId.startsWith('invitation-');
  const isOwner = member.role === TENANT_ROLES.OWNER;
  const isActive = member.status === MemberStatus.ACTIVE;

  if (isPendingInvitation) {
    return (
      <PendingInvitationActions
        member={member}
        onSuccess={onRefresh}
        optimisticActions={optimisticActions}
      />
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <ChangeRoleMenuItem
            member={member}
            onSuccess={onRefresh}
            optimisticActions={optimisticActions}
          />
          {isActive ? (
            <UpdateStatusMenuItem
              member={member}
              newStatus={MemberStatus.SUSPENDED}
              onSuccess={onRefresh}
              optimisticActions={optimisticActions}
            >
              <UserX className="mr-2 h-4 w-4" />
              Suspend Access
            </UpdateStatusMenuItem>
          ) : (
            <UpdateStatusMenuItem
              member={member}
              newStatus={MemberStatus.ACTIVE}
              onSuccess={onRefresh}
              optimisticActions={optimisticActions}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              Activate Access
            </UpdateStatusMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {!isOwner && (
          <DeleteMemberAction
            member={member}
            onSuccess={onRefresh}
            optimisticActions={optimisticActions}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChangeRoleMenuItem({
  member,
  onSuccess,
  optimisticActions
}: {
  member: TenantMember;
  onSuccess?: () => Promise<void> | void;
  optimisticActions?: MembersTableOptimisticActions;
}) {
  const utils = api.useUtils();

  const updateRoleMutation = api.members.updateMemberRole.useMutation({
    onMutate: async ({ role }) => optimisticActions?.onRoleOptimisticUpdate?.(member.id, role),
    onError: (error, _variables, snapshot) => {
      handleMutationError(error, 'update member role', optimisticActions?.onRollback, snapshot);
    },
    onSuccess: async () => {
      await utils.members.getMembers.invalidate();
      await handleMutationSuccess('updated member role', onSuccess);
    }
  });

  const handleChangeRole = async (newRole: TenantRole) => {
    if (newRole === member.role) return;
    updateRoleMutation.mutate({ memberId: member.id, role: newRole });
  };

  return (
    <>
      <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
        Change Role
      </DropdownMenuLabel>
      {Object.entries(TENANT_ROLES).map(([, value]) => (
        <DropdownMenuItem
          key={value}
          onClick={() => handleChangeRole(value as TenantRole)}
          disabled={updateRoleMutation.isPending || value === member.role}
        >
          <Shield className="mr-2 h-4 w-4" />
          {ROLE_DISPLAY[value].label}
          {value === member.role ? ' (current)' : ''}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function UpdateStatusMenuItem({
  member,
  newStatus,
  onSuccess,
  optimisticActions,
  children
}: {
  member: TenantMember;
  newStatus: MemberStatus;
  onSuccess?: () => Promise<void> | void;
  optimisticActions?: MembersTableOptimisticActions;
  children: React.ReactNode;
}) {
  const utils = api.useUtils();

  const updateStatusMutation = api.members.updateMemberStatus.useMutation({
    onMutate: async ({ status }) =>
      optimisticActions?.onStatusOptimisticUpdate?.(member.id, status as MemberStatus),
    onError: (error, _variables, snapshot) => {
      handleMutationError(error, 'update member status', optimisticActions?.onRollback, snapshot);
    },
    onSuccess: async () => {
      await utils.members.getMembers.invalidate();
      await handleMutationSuccess('updated member status', onSuccess);
    }
  });

  const handleUpdateStatus = async () => {
    if (newStatus === member.status) return;
    updateStatusMutation.mutate({ memberId: member.id, status: newStatus });
  };

  return (
    <DropdownMenuItem onClick={handleUpdateStatus} disabled={updateStatusMutation.isPending}>
      {children}
    </DropdownMenuItem>
  );
}

function PendingInvitationActions({
  member,
  onSuccess,
  optimisticActions
}: {
  member: TenantMember;
  onSuccess?: () => Promise<void> | void;
  optimisticActions?: MembersTableOptimisticActions;
}) {
  const utils = api.useUtils();
  const [copied, setCopied] = useState(false);

  const generateLinkMutation = api.members.generateInvitationLink.useMutation();
  const resendInvitationMutation = api.members.resendInvitation.useMutation();
  const revokeInvitationMutation = api.members.revokeInvitation.useMutation({
    onMutate: async () => optimisticActions?.onDeleteOptimistic?.(member.id),
    onError: (error, _variables, snapshot) => {
      handleMutationError(error, 'revoke invitation', optimisticActions?.onRollback, snapshot);
    },
    onSuccess: async () => {
      await utils.members.getMembers.invalidate();
      await handleMutationSuccess('revoked invitation', onSuccess);
    }
  });

  const handleCopyInvitationLink = async () => {
    if (!member.invitationId) return;
    const result = await generateLinkMutation.mutateAsync({ invitationId: member.invitationId });
    const link = `${window.location.origin}/invitations/accept?tenantId=${encodeURIComponent(member.tenantId)}&token=${encodeURIComponent(result.invitationToken)}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevokeInvitation = () => {
    if (!member.invitationId) return;
    revokeInvitationMutation.mutate({ invitationId: member.invitationId });
  };

  const handleResendInvitation = async () => {
    if (!member.invitationId) return;
    const loadingToastId = toast.loading('Sending invitation...');
    try {
      const result = await resendInvitationMutation.mutateAsync({
        invitationId: member.invitationId
      });
      if (result.emailDispatched) {
        toast.success('Invitation has been sent to the member.', { id: loadingToastId });
        return;
      }
      if (!result.invitationToken) {
        toast.success('Invitation request completed.', { id: loadingToastId });
        return;
      }
      const link = `${window.location.origin}/invitations/accept?tenantId=${encodeURIComponent(member.tenantId)}&token=${encodeURIComponent(result.invitationToken)}`;
      await navigator.clipboard.writeText(link);
      toast.success('Invitation sent. Link copied for manual sharing.', { id: loadingToastId });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_error) {
      toast.error('Failed to resend invitation.', { id: loadingToastId });
      // Error already shown to user via toast, no need to rethrow
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="sr-only">Open invitation actions</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Invitation</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleCopyInvitationLink}
          disabled={generateLinkMutation.isPending || !member.invitationId}
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.div
                key="check-icon"
                variants={iconSwapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={iconSwapTransition}
                className="mr-2 flex items-center"
              >
                <Check className="h-4 w-4" />
              </motion.div>
            ) : (
              <motion.div
                key="copy-icon"
                variants={iconSwapVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={iconSwapTransition}
                className="mr-2 flex items-center"
              >
                <Copy className="h-4 w-4" />
              </motion.div>
            )}
          </AnimatePresence>
          {copied ? 'Copied' : 'Copy Invite Link'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleResendInvitation}
          disabled={resendInvitationMutation.isPending || !member.invitationId}
        >
          <Mail className="mr-2 h-4 w-4" />
          {resendInvitationMutation.isPending ? 'Resending...' : 'Resend Invitation'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleRevokeInvitation}
          disabled={revokeInvitationMutation.isPending || !member.invitationId}
        >
          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
          <span className="text-destructive">
            {revokeInvitationMutation.isPending ? 'Revoking...' : 'Revoke Invitation'}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteMemberAction({
  member,
  onSuccess,
  optimisticActions
}: {
  member: TenantMember;
  onSuccess?: () => Promise<void> | void;
  optimisticActions?: MembersTableOptimisticActions;
}) {
  const utils = api.useUtils();

  const deleteMemberMutation = api.members.deleteMember.useMutation({
    onMutate: async () => optimisticActions?.onDeleteOptimistic?.(member.id),
    onError: (error, _variables, snapshot) => {
      handleMutationError(error, 'delete member', optimisticActions?.onRollback, snapshot);
    },
    onSuccess: async () => {
      await utils.members.getMembers.invalidate();
      await handleMutationSuccess('removed member', onSuccess);
    }
  });

  const handleDelete = async () => {
    deleteMemberMutation.mutate({ memberId: member.id });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-red-700 outline-hidden transition-colors hover:bg-red-50 hover:text-red-800 data-disabled:pointer-events-none data-disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/25 dark:hover:text-red-300">
          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
          <span className="text-destructive">Remove Member</span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-border bg-card text-card-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {member.displayName ?? member.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the member from your tenant. They will lose access to all tenant
            resources. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMemberMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteMemberMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMemberMutation.isPending ? 'Removing...' : 'Remove'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
