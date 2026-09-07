'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { formatProjectDate } from './project-page-helpers';

import type { User } from '~/types/auth.types';
import type { Project, ProjectMember, ProjectVisibility } from '~/types/project.types';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { ProjectMembersTable } from '~/components/projects/project-members-table';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants, enterpriseInputClass } from '~/components/ui/enterprise-styles';
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
import { getProjectMembersSummary } from '~/lib/projects/project-members';
import { PROJECT_VISIBILITY } from '~/types/project.types';
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

interface ProjectSettingsPageContentProps {
  canViewProjectMembers: boolean;
  initialMembers: ProjectMember[];
  initialProject: Project;
  user: User;
}

export function ProjectSettingsPageContent({
  canViewProjectMembers,
  initialMembers,
  initialProject,
  user
}: ProjectSettingsPageContentProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [isPending, startTransition] = useTransition();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [project, setProject] = useState(initialProject);
  const [projectMembers, setProjectMembers] = useState(initialMembers);
  const memberSummary = useMemo(() => getProjectMembersSummary(projectMembers), [projectMembers]);
  const { orgRole, canUpdateProjects, canDeleteProjects } = getDashboardRouteAccess({
    roles: user.roles,
    permissions: user.permissions
  });
  const isOrganizationAdmin = orgRole === 'tenant_owner' || orgRole === 'tenant_admin';
  const canManageProject =
    canUpdateProjects && (isOrganizationAdmin || project.createdBy === user.userId);
  const canDeleteProject =
    canDeleteProjects && (isOrganizationAdmin || project.createdBy === user.userId);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project.name,
      visibility: project.visibility
    }
  });

  const refreshProject = useCallback(async () => {
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const updateProjectMutation = api.projects.update.useMutation({
    onSuccess: async (updatedProject) => {
      toast.success('Project updated');
      setProject(updatedProject);
      form.reset({
        name: updatedProject.name,
        visibility: updatedProject.visibility as ProjectVisibility
      });
      await utils.projects.get.invalidate({ projectId: updatedProject.id });
      await utils.projects.list.invalidate();
      await refreshProject();
    },
    onError: (error) => {
      toast.error('Unable to update project', { description: error.message });
    }
  });

  const deleteProjectMutation = api.projects.delete.useMutation({
    onSuccess: async () => {
      toast.success('Project deleted');
      await utils.projects.get.invalidate({ projectId: project.id });
      await utils.projects.list.invalidate();
      router.push('/projects');
    },
    onError: (error) => {
      toast.error('Unable to delete project', { description: error.message });
    }
  });

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild type="button" variant="outline">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
        </Button>
        <div className="rounded-full border border-border/40 bg-secondary/20 px-3 py-1 text-[11px] font-medium text-muted-foreground/80">
          {isPending ? 'Syncing project details' : 'Project details are up to date'}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>
              Update the project name, visibility, and membership rules from the main project
              details surface.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) => {
                  updateProjectMutation.mutate({
                    projectId: project.id,
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
                        <Input
                          {...field}
                          className={enterpriseInputClass}
                          placeholder="Atlas"
                          disabled={!canManageProject || updateProjectMutation.isPending}
                        />
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={!canManageProject || updateProjectMutation.isPending}
                      >
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

                <div className="space-y-2">
                  <FormLabel>Project key</FormLabel>
                  <Input value={project.key} readOnly className={enterpriseInputClass} />
                  <p className="text-xs text-muted-foreground">
                    Stable identifier used for issue keys. It does not change when the project is
                    renamed.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canManageProject || updateProjectMutation.isPending}
                    onClick={() =>
                      form.reset({
                        name: project.name,
                        visibility: project.visibility
                      })
                    }
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    disabled={!canManageProject || updateProjectMutation.isPending}
                  >
                    {updateProjectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Save changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className={enterpriseCardVariants()}>
            <CardHeader>
              <CardTitle>Project Metadata</CardTitle>
              <CardDescription>Operational details for this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Project key
                </p>
                <p className="font-mono text-foreground">{project.key}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Created
                </p>
                <p className="text-foreground">{formatProjectDate(project.createdAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Updated
                </p>
                <p className="text-foreground">{formatProjectDate(project.updatedAt)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  Member count
                </p>
                <p className="text-foreground">
                  {canViewProjectMembers ? memberSummary.total : 'Restricted'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={enterpriseCardVariants()}>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Removing the project will hide it from project listings for this organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                disabled={!canDeleteProject || deleteProjectMutation.isPending}
                onClick={() => setIsDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete project
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {canViewProjectMembers ? (
        <Card className={enterpriseCardVariants()}>
          <CardHeader>
            <CardTitle>Project Members</CardTitle>
            <CardDescription>
              Add organization members to this project or remove them without changing tenant
              membership. {memberSummary.total} assigned, {memberSummary.collaborators}{' '}
              collaborators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectMembersTable
              members={projectMembers}
              projectId={project.id}
              canManageProject={canManageProject}
              isLoading={isPending}
              onAssignSuccess={(member) => {
                setProjectMembers((currentMembers) => {
                  if (
                    currentMembers.some((currentMember) => currentMember.userId === member.userId)
                  ) {
                    return currentMembers;
                  }

                  return [...currentMembers, member];
                });
              }}
              onMemberRemoved={(memberId) => {
                setProjectMembers((currentMembers) =>
                  currentMembers.filter((member) => member.userId !== memberId)
                );
              }}
              onRefresh={refreshProject}
            />
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Project members are restricted</AlertTitle>
          <AlertDescription>
            This workspace policy allows you to open the project but not inspect its membership.
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="border-border bg-card text-card-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project from the organization list. The project record is
              soft-deleted in the API and will no longer appear in project listings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProjectMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteProjectMutation.mutate({ projectId: project.id });
              }}
            >
              {deleteProjectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
