'use client';

import { format } from 'date-fns';
import { Crown, Loader2, Search, Users } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';

import type { ProjectMember } from '~/types/project.types';

import { AssignProjectMemberDialog } from '~/components/projects/assign-project-member-dialog';
import { ProjectMemberActions } from '~/components/projects/project-members-table-actions';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { enterpriseInputClass } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '~/components/ui/table';
import { filterProjectMembers, getProjectMemberDisplayName } from '~/lib/projects/project-members';

interface ProjectMembersTableProps {
  members: ProjectMember[];
  projectId: string;
  canManageProject: boolean;
  isLoading?: boolean;
  onAssignSuccess?: (member: ProjectMember) => void;
  onMemberRemoved?: (memberId: string) => void;
  onRefresh?: () => Promise<void> | void;
}

function getInitials(member: ProjectMember): string {
  const displayName = getProjectMemberDisplayName(member);

  return displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ProjectMembersTable({
  members,
  projectId,
  canManageProject,
  isLoading = false,
  onAssignSuccess,
  onMemberRemoved,
  onRefresh
}: ProjectMembersTableProps) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const filteredMembers = useMemo(
    () => filterProjectMembers(members, deferredSearch),
    [deferredSearch, members]
  );
  const showingCount = filteredMembers.length;
  const hasSearch = deferredSearch.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground/90">
            Project Members
          </h2>
          <Badge
            variant="outline"
            className="border-border/40 bg-secondary/20 px-1.5 py-0 text-[10px] font-bold text-muted-foreground"
          >
            {members.length}
          </Badge>
        </div>

        <AssignProjectMemberDialog
          projectId={projectId}
          projectMembers={members}
          canManageProject={canManageProject}
          onAssignSuccess={onAssignSuccess}
          onRefresh={onRefresh}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or user ID"
            className={`h-9 pl-9 text-[13px] ${enterpriseInputClass}`}
          />
        </div>
        <div className="rounded-full border border-border/40 bg-secondary/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground/80">
          Showing {showingCount} of {members.length}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/40 bg-card/30 shadow-xs backdrop-blur-[2px]">
        <Table className="text-[13px]">
          <TableHeader className="bg-muted/30">
            <TableRow className="border-b border-border/40 hover:bg-transparent">
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Member
              </TableHead>
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Access
              </TableHead>
              <TableHead className="h-10 px-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Assigned
              </TableHead>
              <TableHead className="h-10 px-4 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member) => {
                const displayName = getProjectMemberDisplayName(member);

                return (
                  <TableRow key={member.userId} className="border-b border-border/30 last:border-0">
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/40 shadow-xs">
                          <AvatarImage src={member.photoUrl ?? undefined} alt={displayName} />
                          <AvatarFallback className="bg-linear-to-br from-secondary/50 to-secondary text-[11px] font-bold">
                            {getInitials(member)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[13px] font-semibold text-foreground">
                            {displayName}
                          </span>
                          <span className="truncate text-[11px] font-medium text-muted-foreground/70">
                            User ID {member.userId}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          member.isCreator
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : 'border-border/40 bg-card/50 text-muted-foreground'
                        }
                      >
                        {member.isCreator ? (
                          <Crown className="mr-1 h-3 w-3" />
                        ) : (
                          <Users className="mr-1 h-3 w-3" />
                        )}
                        {member.isCreator ? 'Creator' : 'Member'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-[12px] font-medium text-muted-foreground/80">
                      {format(new Date(member.assignedAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end">
                        <ProjectMemberActions
                          member={member}
                          projectId={projectId}
                          disabled={!canManageProject}
                          onMemberRemoved={onMemberRemoved}
                          onRefresh={onRefresh}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-28 px-4 text-center text-sm text-muted-foreground"
                >
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Refreshing project members...</span>
                    </div>
                  ) : hasSearch ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground/80">
                        No project members match that search
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Try a different name or user ID.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground/80">
                        No project members assigned yet
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {canManageProject
                          ? 'Add organization members from the header action.'
                          : 'Project access will appear here once a manager assigns members.'}
                      </p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
