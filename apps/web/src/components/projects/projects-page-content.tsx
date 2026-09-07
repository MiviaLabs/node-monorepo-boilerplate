'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { FolderKanban, Globe, Loader2, Lock, Plus, RefreshCw } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { User } from '~/types/auth.types';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { ProjectsTable } from '~/components/projects/projects-table';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '~/components/ui/dialog';
import { enterpriseInputClass } from '~/components/ui/enterprise-styles';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { WorkspaceStat, WorkspaceStatSize } from '~/components/ui/workspace-stat';
import { alertVariants, standardTransition } from '~/lib/motion';
import { ProjectContextNotice } from '~/lib/projects/project-context-notice';
import {
  DEFAULT_PROJECTS_PAGE,
  DEFAULT_PROJECTS_PAGE_SIZE,
  toProjectsQuerySearchParams
} from '~/lib/projects/projects-query-params';
import {
  PROJECT_SORT_BY,
  PROJECT_SORT_ORDER,
  PROJECT_VISIBILITY,
  type CreateProjectInput,
  type Project,
  type ProjectsQueryInput,
  type ProjectsResponse
} from '~/types/project.types';
import { api } from '~/utils/api';

const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Project name is required')
    .max(255, 'Use 255 characters or fewer'),
  visibility: z.enum([PROJECT_VISIBILITY.PUBLIC, PROJECT_VISIBILITY.PRIVATE])
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface ProjectsPageContentProps {
  initialData: Project[];
  initialMeta: ProjectsResponse['meta'];
  initialQueryInput: ProjectsQueryInput;
  projectContextNotice?: ProjectContextNotice;
  user: User;
}

export function ProjectsPageContent({
  initialData,
  initialMeta,
  initialQueryInput,
  projectContextNotice,
  user
}: ProjectsPageContentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const utils = api.useUtils();
  const [isPending, startTransition] = useTransition();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryInput = initialQueryInput;

  const replaceQueryInput = useCallback(
    (nextQuery: ProjectsQueryInput) => {
      const nextParams = toProjectsQuerySearchParams(nextQuery, {
        page: DEFAULT_PROJECTS_PAGE,
        pageSize: DEFAULT_PROJECTS_PAGE_SIZE
      });
      const next = nextParams.toString();
      const current = toProjectsQuerySearchParams(queryInput, {
        page: DEFAULT_PROJECTS_PAGE,
        pageSize: DEFAULT_PROJECTS_PAGE_SIZE
      }).toString();

      if (next !== current) {
        const href = next ? `${pathname}?${next}` : pathname;
        startTransition(() => {
          router.replace(href, { scroll: false });
        });
      }
    },
    [pathname, queryInput, router, startTransition]
  );

  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, []);
  const projects = initialData;
  const meta = initialMeta;
  const { orgRole, canCreateProjects, canUpdateProjects, canDeleteProjects } =
    getDashboardRouteAccess({
      roles: user.roles,
      permissions: user.permissions
    });
  const isOrganizationAdmin = orgRole === 'tenant_owner' || orgRole === 'tenant_admin';
  const totalProjects = meta.total;
  const publicProjects = projects.filter(
    (project) => project.visibility === PROJECT_VISIBILITY.PUBLIC
  ).length;
  const privateProjects = projects.filter(
    (project) => project.visibility === PROJECT_VISIBILITY.PRIVATE
  ).length;
  const currentPage = meta.page;

  const refreshProjects = useCallback(async () => {
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const createProjectMutation = api.projects.create.useMutation({
    onSuccess: async () => {
      toast.success('Project created');
      await utils.projects.list.invalidate();
      setIsCreateOpen(false);
      await refreshProjects();
    },
    onError: (error) => {
      toast.error('Unable to create project', { description: error.message });
    }
  });

  const deleteProjectMutation = api.projects.delete.useMutation({
    onError: (error) => {
      toast.error('Unable to delete project', { description: error.message });
    },
    onSuccess: async () => {
      toast.success('Project deleted');
      await utils.projects.list.invalidate();
      setDeletingProject(null);
      await refreshProjects();
    }
  });

  const canUpdateProject = useCallback(
    (project: Project) =>
      canUpdateProjects && (isOrganizationAdmin || project.createdBy === user.userId),
    [canUpdateProjects, isOrganizationAdmin, user.userId]
  );

  const canDeleteProject = useCallback(
    (project: Project) =>
      canDeleteProjects && (isOrganizationAdmin || project.createdBy === user.userId),
    [canDeleteProjects, isOrganizationAdmin, user.userId]
  );

  useEffect(() => {
    if (totalProjects > 0 && projects.length === 0 && currentPage > 1) {
      replaceQueryInput({
        ...queryInput,
        page: DEFAULT_PROJECTS_PAGE
      });
    }
  }, [currentPage, projects.length, queryInput, replaceQueryInput, totalProjects]);

  return (
    <div className="w-full space-y-5">
      <AnimatePresence>
        {projectContextNotice === ProjectContextNotice.UNAVAILABLE ? (
          <motion.div
            key="project-unavailable"
            variants={alertVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={standardTransition}
          >
            <Alert>
              <AlertTitle>Project context reset</AlertTitle>
              <AlertDescription>
                That project is no longer available in the current organization, or you no longer
                have access to it. You have been returned to the project directory.
              </AlertDescription>
            </Alert>
          </motion.div>
        ) : null}
        {projectContextNotice === ProjectContextNotice.ORGANIZATION_SWITCHED ? (
          <motion.div
            key="project-switched"
            variants={alertVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={standardTransition}
          >
            <Alert>
              <AlertTitle>Workspace changed</AlertTitle>
              <AlertDescription>
                Organization switching exits project mode automatically so project context does not
                leak across tenants. Pick a project from this organization to continue.
              </AlertDescription>
            </Alert>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ProjectsTable
        data={projects}
        isLoading={isPending}
        summary={
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            <WorkspaceStat
              label="Total"
              value={totalProjects}
              icon={FolderKanban}
              iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
              size={WorkspaceStatSize.COMPACT}
            />
            <WorkspaceStat
              label="Public"
              value={publicProjects}
              icon={Globe}
              iconClassName="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 group-hover:bg-emerald-500/15 dark:text-emerald-400"
              size={WorkspaceStatSize.COMPACT}
            />
            <WorkspaceStat
              label="Private"
              value={privateProjects}
              icon={Lock}
              iconClassName="bg-amber-500/10 text-amber-600 ring-amber-500/20 group-hover:bg-amber-500/15 dark:text-amber-400"
              size={WorkspaceStatSize.COMPACT}
            />
          </div>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void refreshProjects()} disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            {canCreateProjects ? (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add project
              </Button>
            ) : null}
          </>
        }
        filters={{
          search: queryInput.search,
          visibility: queryInput.visibility
        }}
        page={meta.page}
        pageSize={meta.pageSize}
        total={meta.total}
        sortBy={queryInput.sortBy}
        sortOrder={queryInput.sortOrder}
        canUpdateProject={canUpdateProject}
        canDeleteProject={canDeleteProject}
        onSearchChange={(search) => {
          if (searchDebounceTimerRef.current) {
            clearTimeout(searchDebounceTimerRef.current);
          }
          searchDebounceTimerRef.current = setTimeout(() => {
            replaceQueryInput({
              ...queryInput,
              page: DEFAULT_PROJECTS_PAGE,
              search: search.trim() || undefined
            });
          }, 300);
        }}
        onVisibilityChange={(visibility) =>
          replaceQueryInput({
            ...queryInput,
            page: DEFAULT_PROJECTS_PAGE,
            visibility
          })
        }
        onPageSizeChange={(pageSize) =>
          replaceQueryInput({
            ...queryInput,
            page: DEFAULT_PROJECTS_PAGE,
            pageSize
          })
        }
        onSortChange={(field) =>
          replaceQueryInput({
            ...queryInput,
            page: DEFAULT_PROJECTS_PAGE,
            sortBy: field,
            sortOrder:
              queryInput.sortBy === field
                ? queryInput.sortOrder === PROJECT_SORT_ORDER.ASC
                  ? PROJECT_SORT_ORDER.DESC
                  : PROJECT_SORT_ORDER.ASC
                : field === PROJECT_SORT_BY.NAME || field === PROJECT_SORT_BY.VISIBILITY
                  ? PROJECT_SORT_ORDER.ASC
                  : PROJECT_SORT_ORDER.DESC
          })
        }
        onPageChange={(page) =>
          replaceQueryInput({
            ...queryInput,
            page
          })
        }
        onOpen={(project) => {
          router.push(`/projects/${project.id}`);
        }}
        onDelete={setDeletingProject}
      />

      <ProjectDialog
        open={canCreateProjects && isCreateOpen}
        title="Create new project"
        description="Initialize a project workspace within this organization. Permissions dictate member visibility."
        submitLabel="Create project"
        isPending={createProjectMutation.isPending}
        onOpenChange={setIsCreateOpen}
        onSubmit={(values) => createProjectMutation.mutate(values)}
      />

      <AlertDialog
        open={deletingProject !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingProject(null);
          }
        }}
      >
        <AlertDialogContent className="border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingProject?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project from the organization list. The project record is
              soft-deleted in the API and will no longer appear in project listings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProjectMutation.isPending || !deletingProject}
              onClick={(event) => {
                event.preventDefault();
                if (!deletingProject) {
                  return;
                }
                deleteProjectMutation.mutate({ projectId: deletingProject.id });
              }}
            >
              {deleteProjectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectDialog({
  open,
  title,
  description,
  submitLabel,
  initialValues,
  isPending,
  onOpenChange,
  onSubmit
}: {
  open: boolean;
  title: string;
  description: string;
  submitLabel: string;
  initialValues?: CreateProjectInput;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateProjectInput) => void;
}) {
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: initialValues?.name ?? '',
      visibility: initialValues?.visibility ?? PROJECT_VISIBILITY.PUBLIC
    }
  });

  useEffect(() => {
    form.reset({
      name: initialValues?.name ?? '',
      visibility: initialValues?.visibility ?? PROJECT_VISIBILITY.PUBLIC
    });
  }, [form, initialValues, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          form.reset({
            name: initialValues?.name ?? '',
            visibility: initialValues?.visibility ?? PROJECT_VISIBILITY.PUBLIC
          });
        }
      }}
    >
      <DialogContent className="border-border bg-card text-card-foreground sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              onSubmit({
                name: values.name.trim(),
                visibility: values.visibility
              });
            })}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project name</FormLabel>
                  <FormControl>
                    <Input {...field} className={enterpriseInputClass} placeholder="Atlas" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Visibility</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project visibility" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={PROJECT_VISIBILITY.PUBLIC}>Public</SelectItem>
                      <SelectItem value={PROJECT_VISIBILITY.PRIVATE}>Private</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
