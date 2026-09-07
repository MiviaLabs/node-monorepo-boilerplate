'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Globe2,
  ListFilter,
  Lock,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Trash2
} from 'lucide-react';
import Link from 'next/link';

import type { ReactNode } from 'react';
import type {
  Project,
  ProjectFilters,
  ProjectSortBy,
  ProjectSortOrder,
  ProjectVisibility
} from '~/types/project.types';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import { enterpriseInputClass } from '~/components/ui/enterprise-styles';
import { Input } from '~/components/ui/input';
import { InventoryListPagination, InventoryListShell } from '~/components/ui/inventory-list';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { cn } from '~/lib/utils';
import {
  PROJECT_SORT_BY,
  PROJECT_SORT_ORDER,
  PROJECT_VISIBILITY,
  PROJECT_VISIBILITY_LABELS
} from '~/types/project.types';

function formatProjectDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(value));
}

function SortIcon({
  activeField,
  field,
  sortOrder
}: {
  activeField?: ProjectSortBy;
  field: ProjectSortBy;
  sortOrder?: ProjectSortOrder;
}) {
  if (activeField !== field) {
    return <ArrowUpDown className="ml-2 h-3.5 w-3.5 opacity-50" />;
  }

  return sortOrder === PROJECT_SORT_ORDER.ASC ? (
    <ArrowUp className="ml-2 h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="ml-2 h-3.5 w-3.5" />
  );
}

export function ProjectsTable({
  data,
  isLoading = false,
  summary,
  actions,
  filters,
  page,
  pageSize,
  total,
  sortBy,
  sortOrder,
  canUpdateProject,
  canDeleteProject,
  onSearchChange,
  onVisibilityChange,
  onPageSizeChange,
  onSortChange,
  onPageChange,
  onOpen,
  onDelete
}: {
  data: Project[];
  isLoading?: boolean;
  summary?: ReactNode;
  actions?: ReactNode;
  filters: ProjectFilters;
  page: number;
  pageSize: number;
  total: number;
  sortBy?: ProjectSortBy;
  sortOrder?: ProjectSortOrder;
  canUpdateProject: (project: Project) => boolean;
  canDeleteProject: (project: Project) => boolean;
  onSearchChange: (search: string) => void;
  onVisibilityChange: (visibility?: ProjectVisibility) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (field: ProjectSortBy) => void;
  onPageChange: (page: number) => void;
  onOpen: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = total === 0 ? 0 : Math.min((page - 1) * pageSize + data.length, total);
  const canGoPrevious = page > 1 && !isLoading;
  const canGoNext = page < totalPages && !isLoading;

  return (
    <InventoryListShell
      total={total}
      summary={summary}
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="group relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60 transition-colors group-focus-within:text-primary" />
              <Input
                key={filters.search ?? ''}
                placeholder="Search project name..."
                defaultValue={filters.search ?? ''}
                onChange={(event) => onSearchChange(event.target.value)}
                className={cn('h-9 pl-9 text-[13px]', enterpriseInputClass)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="hidden items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-secondary/10 px-2 py-1.5 text-muted-foreground md:flex">
              <SlidersHorizontal className="h-3 w-3" />
              <span className="text-[11px] font-medium uppercase tracking-wider">Filters</span>
            </div>

            <Select
              value={filters.visibility ?? 'all'}
              onValueChange={(value) =>
                onVisibilityChange(value === 'all' ? undefined : (value as ProjectVisibility))
              }
            >
              <SelectTrigger className={cn('h-9 w-[140px] text-[13px]', enterpriseInputClass)}>
                <SelectValue placeholder="All visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All visibility</SelectItem>
                <SelectItem value={PROJECT_VISIBILITY.PUBLIC}>Public</SelectItem>
                <SelectItem value={PROJECT_VISIBILITY.PRIVATE}>Private</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className={cn('h-9 w-[110px] text-[13px]', enterpriseInputClass)}>
                <SelectValue placeholder="Page size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 / page</SelectItem>
                <SelectItem value="20">20 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      }
      headerActions={
        <>
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/15 px-3 py-1.5 text-xs text-muted-foreground">
            <ListFilter className="h-3.5 w-3.5" />
            {showingFrom}-{showingTo} of {total}
          </div>
          {actions}
        </>
      }
      headerCells={[
        {
          key: 'project',
          content: (
            <SortableHeader
              label="Project"
              field={PROJECT_SORT_BY.NAME}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
          )
        },
        {
          key: 'visibility',
          content: (
            <SortableHeader
              label="Visibility"
              field={PROJECT_SORT_BY.VISIBILITY}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
          )
        },
        {
          key: 'owner',
          content: <span>Owner</span>
        },
        {
          key: 'created',
          content: (
            <SortableHeader
              label="Created"
              field={PROJECT_SORT_BY.CREATED_AT}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
          )
        },
        {
          key: 'updated',
          content: (
            <SortableHeader
              label="Updated"
              field={PROJECT_SORT_BY.UPDATED_AT}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={onSortChange}
            />
          )
        },
        {
          key: 'actions',
          content: <span>Actions</span>,
          className: 'text-right'
        }
      ]}
      desktopGridClassName="grid-cols-[minmax(0,1.8fr)_110px_120px_110px_110px_120px]"
      hasRows={data.length > 0}
      emptyState={
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          {isLoading
            ? 'Retrieving project records...'
            : 'No projects found matching the specified parameters.'}
        </div>
      }
      footer={
        <InventoryListPagination
          page={page}
          totalPages={totalPages}
          showingFrom={showingFrom}
          showingTo={showingTo}
          total={total}
          canGoPrevious={canGoPrevious}
          canGoNext={canGoNext}
          onPrevious={() => onPageChange(Math.max(1, page - 1))}
          onNext={() => onPageChange(Math.min(totalPages, page + 1))}
        />
      }
    >
      {data.map((project) => {
        const isPrivate = project.visibility === PROJECT_VISIBILITY.PRIVATE;

        return (
          <div
            key={project.id}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20 md:grid md:grid-cols-[minmax(0,1.8fr)_110px_120px_110px_110px_120px] md:items-center"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                {isPrivate ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <Globe2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                )}
                <Link
                  href={`/projects/${project.id}`}
                  className="truncate text-sm font-medium text-foreground transition-colors hover:text-primary"
                >
                  {project.name}
                </Link>
                <span className="rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {project.key}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                <span className="font-mono">{project.key}</span>
                <span>•</span>
                <span className="font-mono">ID {project.id}</span>
                <span>•</span>
                <span>{PROJECT_VISIBILITY_LABELS[project.visibility]}</span>
                <span>•</span>
                <span>{formatProjectDate(project.updatedAt)}</span>
              </div>
            </div>

            <div className="hidden min-w-0 md:block">
              <Badge variant={isPrivate ? 'secondary' : 'outline'} className="gap-1">
                {isPrivate ? <Lock className="h-3 w-3" /> : <Globe2 className="h-3 w-3" />}
                {PROJECT_VISIBILITY_LABELS[project.visibility]}
              </Badge>
            </div>

            <div className="hidden min-w-0 md:block text-[12px] font-mono text-muted-foreground">
              <span className="truncate">{project.createdBy}</span>
            </div>

            <div className="hidden min-w-0 md:block text-[12px] text-muted-foreground">
              {formatProjectDate(project.createdAt)}
            </div>

            <div className="hidden min-w-0 md:block text-[12px] text-muted-foreground">
              {formatProjectDate(project.updatedAt)}
            </div>

            <div className="min-w-0 md:text-right">
              <div className="flex justify-start md:justify-end">
                <ProjectActionsMenu
                  project={project}
                  canManageProject={canUpdateProject(project)}
                  canDeleteProject={canDeleteProject(project)}
                  onOpen={onOpen}
                  onDelete={onDelete}
                />
              </div>
            </div>
          </div>
        );
      })}
    </InventoryListShell>
  );
}

function ProjectActionsMenu({
  project,
  canManageProject,
  canDeleteProject,
  onOpen,
  onDelete
}: {
  project: Project;
  canManageProject: boolean;
  canDeleteProject: boolean;
  onOpen: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="sr-only">Open project actions</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onOpen(project)}>
          {canManageProject ? 'Manage project' : 'View project'}
        </DropdownMenuItem>
        {canDeleteProject ? (
          <DropdownMenuItem
            onClick={() => onDelete(project)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete project
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSortChange
}: {
  label: string;
  field: ProjectSortBy;
  sortBy?: ProjectSortBy;
  sortOrder?: ProjectSortOrder;
  onSortChange: (field: ProjectSortBy) => void;
}) {
  return (
    <Button
      variant="ghost"
      onClick={() => onSortChange(field)}
      className="h-7 px-0 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 hover:bg-transparent hover:text-foreground"
    >
      {label}
      <SortIcon activeField={sortBy} field={field} sortOrder={sortOrder} />
    </Button>
  );
}
