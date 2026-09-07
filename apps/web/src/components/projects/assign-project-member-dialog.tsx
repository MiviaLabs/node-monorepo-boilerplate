'use client';

import { AlertCircle, Loader2, Search, UserPlus } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectMember } from '~/types/project.types';

import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '~/components/ui/dialog';
import { enterpriseInputClass } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import { getAssignableTenantMembers } from '~/lib/projects/project-members';
import { MemberStatus, ROLE_DISPLAY, type TenantMember } from '~/types/tenant.types';
import { api } from '~/utils/api';

interface AssignProjectMemberDialogProps {
  projectId: string;
  projectMembers: ProjectMember[];
  canManageProject: boolean;
  trigger?: React.ReactNode;
  onAssignSuccess?: (member: ProjectMember) => void;
  onRefresh?: () => Promise<void> | void;
}

function getCandidateLabel(member: TenantMember): string {
  const normalized = member.displayName?.trim();
  return normalized && normalized.length > 0 ? normalized : member.email;
}

function getCandidateInitials(member: TenantMember): string {
  return getCandidateLabel(member)
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function AssignProjectMemberDialog({
  projectId,
  projectMembers,
  canManageProject,
  trigger,
  onAssignSuccess,
  onRefresh
}: AssignProjectMemberDialogProps) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const membersQuery = api.members.getMembers.useQuery(
    {
      page: 1,
      pageSize: 100,
      search: deferredSearch.trim() || undefined,
      status: MemberStatus.ACTIVE
    },
    {
      enabled: open,
      refetchOnWindowFocus: false
    }
  );

  const assignMemberMutation = api.projects.addMember.useMutation({
    onSuccess: async (member) => {
      toast.success('Project member added');
      await utils.projects.listMembers.invalidate({ projectId });
      onAssignSuccess?.(member);
      setOpen(false);
      setSearch('');
      await onRefresh?.();
    },
    onError: (error) => {
      toast.error('Unable to add project member', { description: error.message });
    }
  });

  const assignableMembers = useMemo(
    () => getAssignableTenantMembers(membersQuery.data?.data ?? [], projectMembers),
    [membersQuery.data?.data, projectMembers]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setSearch('');
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" size="sm" disabled={!canManageProject}>
            <UserPlus className="h-4 w-4" />
            Add member
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="border-border bg-card text-card-foreground sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Add Project Member</DialogTitle>
          <DialogDescription>
            Assign any active organization member to this project. Existing project members are
            hidden from the list.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email"
                className={`pl-9 ${enterpriseInputClass}`}
              />
            </div>
            <Badge variant="outline" className="border-border/40 bg-secondary/20 text-xs">
              {assignableMembers.length} available
            </Badge>
          </div>

          {membersQuery.error ? (
            <Alert variant="destructive" className="border-destructive/30">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Unable to load organization members</AlertTitle>
              <AlertDescription>{membersQuery.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {membersQuery.isLoading ? (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading organization members...
              </div>
            ) : null}

            {!membersQuery.isLoading && assignableMembers.length === 0 ? (
              <div className="rounded-lg border border-border/40 bg-secondary/10 px-4 py-8 text-center text-sm text-muted-foreground">
                {deferredSearch.trim().length > 0
                  ? 'No active organization members match that search.'
                  : 'All active organization members are already assigned to this project.'}
              </div>
            ) : null}

            {assignableMembers.map((member) => {
              const isAssigning =
                assignMemberMutation.isPending &&
                assignMemberMutation.variables?.userId === Number(member.userId);

              return (
                <div
                  key={member.userId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border/40 shadow-xs">
                      <AvatarFallback className="bg-linear-to-br from-secondary/50 to-secondary text-[11px] font-bold">
                        {getCandidateInitials(member)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {getCandidateLabel(member)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="hidden sm:inline-flex">
                      {ROLE_DISPLAY[member.role].label}
                    </Badge>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canManageProject || assignMemberMutation.isPending}
                      onClick={() =>
                        assignMemberMutation.mutate({
                          projectId,
                          userId: Number(member.userId)
                        })
                      }
                    >
                      {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Add
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
