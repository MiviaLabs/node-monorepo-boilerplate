/**
 * Dashboard Page
 *
 * Server-side rendered dashboard page for authenticated users
 * Workspace shell renders first and stats stream in behind Suspense.
 */

import { ArrowRight, FolderKanban, Settings, User, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { getDashboardRouteAccess } from '~/components/dashboard/route-access';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { enterpriseCardVariants } from '~/components/ui/enterprise-styles';
import { WorkspaceStat } from '~/components/ui/workspace-stat';
import { getUserSession } from '~/lib/auth/get-user-session';
import {
  getPhase0RouteBudgetAttributes,
  measurePhase0
} from '~/lib/diagnostics/phase-zero-diagnostics';
import {
  DEFAULT_MEMBERS_PAGE,
  DEFAULT_MEMBERS_PAGE_SIZE
} from '~/lib/members/members-query-params';
import {
  AuthenticatedPageKey,
  getAuthenticatedPageMetadata
} from '~/lib/metadata/app-page-metadata';
import {
  DEFAULT_PROJECTS_PAGE,
  DEFAULT_PROJECTS_PAGE_SIZE
} from '~/lib/projects/projects-query-params';
import { createServerTrpcClient } from '~/lib/trpc/create-server-trpc-client';

export const metadata = getAuthenticatedPageMetadata(AuthenticatedPageKey.DASHBOARD);

/**
 * Dashboard Page Component
 *
 * Server Component that renders the shell immediately and streams workspace stats behind Suspense.
 */
function inferOverviewCount(total: number | undefined, itemsLength: number | undefined): number {
  if (typeof total === 'number' && total > 0) {
    return total;
  }

  return typeof itemsLength === 'number' ? itemsLength : 0;
}

function DashboardStatsFallback({
  canViewMembers,
  canViewProjects
}: {
  canViewMembers: boolean;
  canViewProjects: boolean;
}) {
  return (
    <Card className={enterpriseCardVariants()}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-foreground">Workspace metrics</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 pt-0">
        {canViewMembers ? (
          <WorkspaceStat
            label="Members"
            value="-"
            icon={Users}
            href="/members"
            actionLabel="See all"
            trailing={
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            }
            iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
          />
        ) : null}

        {canViewProjects ? (
          <WorkspaceStat
            label="Projects"
            value="-"
            icon={FolderKanban}
            href="/projects"
            actionLabel="See all"
            trailing={
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            }
            iconClassName="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 group-hover:bg-emerald-500/15 dark:text-emerald-400"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

async function DashboardStatsSection({
  canViewMembers,
  canViewProjects
}: {
  canViewMembers: boolean;
  canViewProjects: boolean;
}) {
  return measurePhase0(
    'web.page.dashboard.stats',
    {
      page: '/dashboard',
      canViewMembers,
      canViewProjects,
      ...getPhase0RouteBudgetAttributes('/dashboard')
    },
    async () => {
      const trpcClient = await createServerTrpcClient();
      const [membersOverview, projectsOverview] = await Promise.allSettled([
        canViewMembers
          ? trpcClient.members.getMembers.query({
              page: DEFAULT_MEMBERS_PAGE,
              pageSize: DEFAULT_MEMBERS_PAGE_SIZE
            })
          : Promise.resolve(null),
        canViewProjects
          ? trpcClient.projects.list.query({
              page: DEFAULT_PROJECTS_PAGE,
              pageSize: DEFAULT_PROJECTS_PAGE_SIZE
            })
          : Promise.resolve(null)
      ]);

      const memberCount =
        canViewMembers && membersOverview.status === 'fulfilled' && membersOverview.value
          ? inferOverviewCount(membersOverview.value.meta.total, membersOverview.value.data.length)
          : '-';
      const projectCount =
        canViewProjects && projectsOverview.status === 'fulfilled' && projectsOverview.value
          ? inferOverviewCount(
              projectsOverview.value.meta.total,
              projectsOverview.value.data.length
            )
          : '-';

      return (
        <Card className={enterpriseCardVariants()}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-foreground">Workspace metrics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-0">
            {canViewMembers ? (
              <WorkspaceStat
                label="Members"
                value={memberCount}
                icon={Users}
                href="/members"
                actionLabel="See all"
                trailing={
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                }
                iconClassName="bg-blue-500/10 text-blue-600 ring-blue-500/20 group-hover:bg-blue-500/15 dark:text-blue-400"
              />
            ) : null}

            {canViewProjects ? (
              <WorkspaceStat
                label="Projects"
                value={projectCount}
                icon={FolderKanban}
                href="/projects"
                actionLabel="See all"
                trailing={
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                }
                iconClassName="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 group-hover:bg-emerald-500/15 dark:text-emerald-400"
              />
            ) : null}
          </CardContent>
        </Card>
      );
    }
  );
}

export default async function DashboardPage() {
  // Fetch user session server-side (redirects to /login if unauthenticated)
  const { user, tenantName, tenantDisplayName, currentUserSettings } = await getUserSession();
  const trimmedDisplayName = tenantDisplayName?.trim();
  const normalizedDisplayName =
    trimmedDisplayName && trimmedDisplayName.length > 0 ? trimmedDisplayName : undefined;
  const trimmedTenantName = tenantName?.trim();
  const normalizedTenantName =
    trimmedTenantName && trimmedTenantName.length > 0 ? trimmedTenantName : undefined;
  const effectiveOrgName = normalizedDisplayName ?? normalizedTenantName ?? 'Organization';
  const trimmedUserDisplayName = user.displayName?.trim();
  const userHeadline =
    trimmedUserDisplayName && trimmedUserDisplayName.length > 0
      ? trimmedUserDisplayName
      : user.email;
  const { canManageOrganization, canViewMembers, canViewProjects, canCreateProjects } =
    getDashboardRouteAccess({
      roles: user.roles,
      permissions: user.permissions
    });
  const preferredDashboardRoute =
    currentUserSettings.dashboardDefaultView === 'projects' && canViewProjects
      ? '/projects'
      : currentUserSettings.dashboardDefaultView === 'members' && canViewMembers
        ? '/members'
        : currentUserSettings.dashboardDefaultView === 'profile'
          ? '/profile'
          : currentUserSettings.dashboardDefaultView === 'accountSettings'
            ? '/account/settings'
            : currentUserSettings.dashboardDefaultView === 'organizationSettings' &&
                canManageOrganization
              ? '/settings'
              : '/dashboard';

  if (preferredDashboardRoute !== '/dashboard') {
    redirect(preferredDashboardRoute);
  }

  const quickLinks = [
    {
      label: 'Profile',
      href: '/profile',
      description: 'Configure personal display name, email, and credentials',
      icon: User
    },
    ...(canViewMembers
      ? [
          {
            label: 'Members',
            href: '/members',
            description: 'Inspect workspace collaborators and role assignments',
            icon: Users
          }
        ]
      : []),
    ...(canViewProjects
      ? [
          {
            label: 'Projects',
            href: '/projects',
            description: canCreateProjects
              ? 'Organize and oversee team projects and repositories'
              : 'Browse active organization projects',
            icon: FolderKanban
          }
        ]
      : []),
    ...(canManageOrganization
      ? [
          {
            label: 'Organization Settings',
            href: '/settings',
            description: 'Adjust organization configuration and tenant policies',
            icon: Settings
          }
        ]
      : [])
  ];

  return (
    <div className="w-full space-y-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(320px,0.28fr)]">
        <Card className={`${enterpriseCardVariants()} min-h-136`}>
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-base text-foreground">Workspace Overview</CardTitle>
          </CardHeader>
          <CardContent className="flex h-118 flex-col gap-4 p-6">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                Workspace
              </p>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                {effectiveOrgName}
              </h2>
              <p className="text-sm text-muted-foreground">{userHeadline}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                  Primary route
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">Dashboard canvas</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                  Access
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {canManageOrganization
                    ? 'Workspace administrator'
                    : canViewProjects
                      ? 'Project workspace access'
                      : canViewMembers
                        ? 'Directory workspace access'
                        : 'Standard workspace access'}
                </p>
              </div>
            </div>

            <div className="flex-1 rounded-2xl border border-dashed border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))] p-5">
              <div className="flex h-full flex-col justify-between rounded-xl border border-border/50 bg-background/80 p-5">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/75">
                    Main content box
                  </p>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    This area is reserved for the primary dashboard content surface. It now owns the
                    page width instead of competing with the old hero, overview, action, and tenant
                    summary blocks.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    Content module A
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    Content module B
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    Content module C
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 self-start">
          <Suspense
            fallback={
              <DashboardStatsFallback
                canViewMembers={canViewMembers}
                canViewProjects={canViewProjects}
              />
            }
          >
            <DashboardStatsSection
              canViewMembers={canViewMembers}
              canViewProjects={canViewProjects}
            />
          </Suspense>

          <Card className={enterpriseCardVariants()}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-foreground">Quick links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 transition-[transform,border-color,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border/90 hover:bg-accent/45 hover:shadow-xs"
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{link.label}</p>
                        <p className="text-xs text-muted-foreground">{link.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-[color,transform] duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
