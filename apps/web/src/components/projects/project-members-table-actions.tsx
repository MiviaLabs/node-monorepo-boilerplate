'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import type { ProjectMember } from '~/types/project.types';

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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { getProjectMemberDisplayName } from '~/lib/projects/project-members';
import { api } from '~/utils/api';

interface ProjectMemberActionsProps {
  member: ProjectMember;
  projectId: string;
  disabled?: boolean;
  onMemberRemoved?: (memberId: string) => void;
  onRefresh?: () => Promise<void> | void;
}

export function ProjectMemberActions({
  member,
  projectId,
  disabled = false,
  onMemberRemoved,
  onRefresh
}: ProjectMemberActionsProps) {
  const utils = api.useUtils();
  const removeMemberMutation = api.projects.removeMember.useMutation({
    onSuccess: async () => {
      toast.success('Project member removed');
      await utils.projects.listMembers.invalidate({ projectId });
      onMemberRemoved?.(member.userId);
      await onRefresh?.();
    },
    onError: (error) => {
      toast.error('Unable to remove project member', { description: error.message });
    }
  });

  if (member.isCreator) {
    return null;
  }

  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            disabled={disabled || removeMemberMutation.isPending}
          >
            <span className="sr-only">Open member actions</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <AlertDialogTrigger asChild>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={(event) => event.preventDefault()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove from project
            </DropdownMenuItem>
          </AlertDialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialogContent className="border-border bg-card text-card-foreground">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {getProjectMemberDisplayName(member)} from this project?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This only removes project access. The person remains a member of the organization.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removeMemberMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={removeMemberMutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              removeMemberMutation.mutate({
                projectId,
                memberId: member.userId
              });
            }}
          >
            Remove member
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
