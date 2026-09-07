'use client';

import {
  Check,
  ChevronDown,
  FolderKanban,
  GripVertical,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  type LucideIcon,
  UserCircle2
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  resolveEffectiveContentProjectId,
  resolveCurrentContextLabel,
  resolveProjectSectionTitle
} from './project-navigation-state';
import { getDashboardRouteAccess } from './route-access';
import { DashboardRoute, DashboardShellScope, getDashboardShellContext } from './shell-routes';

import type { UserOrganization } from '~/types/auth.types';
import type { ContentEntry } from '~/types/content.types';

import { CurrentUserAvatar } from '~/components/auth/current-user-avatar';
import { ContentSidebarSection } from '~/components/content/content-sidebar-section';
import {
  type FlexySidebarItem,
  getMainSidebarItems,
  getOrganizationSidebarItems
} from '~/components/layout/flexy/menu-items';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '~/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '~/components/ui/select';
import { ProjectContextProvider, useProjectContext } from '~/contexts/project-context';
import { useAuth } from '~/hooks/use-auth';
import { contentApi } from '~/lib/api/content-api';
import { userSettingsApi } from '~/lib/api/user-settings-api';
import { subscribeToContentRefresh } from '~/lib/content/content-events';
import { ProjectContextNotice } from '~/lib/projects/project-context-notice';
import {
  normalizeSidebarSectionOrder,
  type SidebarSectionKey
} from '~/lib/user-settings/sidebar-section-order';
import { ContentScope } from '~/types/content.types';
import { type Project } from '~/types/project.types';
import { api } from '~/utils/api';

const SIDEBAR_COLLAPSED_KEY = 'dashboard.sidebar.collapsed';

function moveSection(
  currentOrder: SidebarSectionKey[],
  fromKey: SidebarSectionKey,
  toKey: SidebarSectionKey
): SidebarSectionKey[] {
  const fromIndex = currentOrder.indexOf(fromKey);
  const toIndex = currentOrder.indexOf(toKey);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return currentOrder;
  }

  const nextOrder = [...currentOrder];
  const [moved] = nextOrder.splice(fromIndex, 1);

  if (!moved) {
    return currentOrder;
  }

  nextOrder.splice(toIndex, 0, moved);
  return nextOrder;
}

const getFirstNonEmpty = (...values: Array<string | null | undefined>): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

const getSidebarLinkClass = (isActive: boolean, isCollapsed: boolean): string =>
  [
    'group relative flex items-center text-sm transition-[background-color,color,transform] duration-150',
    isCollapsed
      ? 'h-8 w-8 justify-center rounded-lg md:h-8 md:w-8'
      : 'h-8 gap-2.5 rounded-lg px-3 text-sm',
    isActive
      ? 'bg-sidebar-accent font-medium text-sidebar-foreground'
      : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground'
  ].join(' ');

interface DashboardAppShellClientProps {
  children: React.ReactNode;
  userDisplayName: string;
  userEmail: string;
  userRoles?: string[];
  userPermissions?: string[];
  organizations: UserOrganization[];
  currentOrganizationId: string | null;
  initialSectionOrder: SidebarSectionKey[];
  initialWorkspaceActiveProjectId: number | null;
  initialPathname?: string;
}

interface SidebarSectionProps {
  items: FlexySidebarItem[];
  sectionTitle: string;
  isSidebarCollapsed: boolean;
  isSectionOpen: boolean;
  pathname: string;
  onToggle: () => void;
  emptyStateLabel?: string;
  headerAction?: {
    disabled?: boolean;
    icon: LucideIcon;
    label: string;
    onClick: () => void;
  };
  showWhenEmpty?: boolean;
}

interface OrganizationSwitcherProps {
  activeOrganizationId?: string;
  isSwitchingOrganization: boolean;
  organizations: UserOrganization[];
  onOrganizationSwitch: (organizationId: string) => void;
}

interface UserFooterProps {
  compact?: boolean;
  mobile?: boolean;
  displayName: string;
  email: string;
  photoUrl?: string | null;
  activeOrganizationId?: string;
  organizations: UserOrganization[];
  isSwitchingOrganization: boolean;
  onOrganizationSwitch: (organizationId: string) => void;
  onLogout: () => void;
}

interface SidebarSectionHeaderAction {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

interface ContextSwitcherProps {
  activeOrganizationName: string;
  currentLabel: string;
  activeProjectId?: string | null;
  currentRouteProjectId?: string | null;
  canViewProjects: boolean;
  projects: Project[];
  isProjectsLoading: boolean;
  onSelectProject: (projectId: string) => Promise<void>;
  onClearProjectContext: () => Promise<void>;
  onNavigate?: () => void;
  compact?: boolean;
}

function mapProjectContextHref(
  pathname: string,
  currentProjectId: string,
  nextProjectId: string
): string {
  const normalizedPath = pathname.split('?')[0] ?? pathname;
  const projectPrefix = `/projects/${currentProjectId}`;

  if (normalizedPath === projectPrefix || normalizedPath.startsWith(`${projectPrefix}/`)) {
    return normalizedPath.replace(projectPrefix, `/projects/${nextProjectId}`);
  }

  return `/projects/${nextProjectId}`;
}

function mapProjectContextSelectionHref(pathname: string, nextProjectId: string): string | null {
  const normalizedPath = pathname.split('?')[0] ?? pathname;

  if (
    normalizedPath === DashboardRoute.Content ||
    normalizedPath.startsWith(`${DashboardRoute.Content}/`)
  ) {
    return `/projects/${nextProjectId}/content`;
  }

  if (
    normalizedPath === DashboardRoute.Members ||
    normalizedPath.startsWith(`${DashboardRoute.Members}/`)
  ) {
    return `/projects/${nextProjectId}/members`;
  }

  if (
    normalizedPath === DashboardRoute.OrganizationSettings ||
    normalizedPath.startsWith(`${DashboardRoute.OrganizationSettings}/`)
  ) {
    return `/projects/${nextProjectId}/settings`;
  }

  if (
    normalizedPath === DashboardRoute.Projects ||
    normalizedPath.startsWith(`${DashboardRoute.Projects}/`)
  ) {
    return `/projects/${nextProjectId}`;
  }

  return null;
}

function isSidebarItemActive(pathname: string, item: FlexySidebarItem): boolean {
  if (item.matchMode === 'exact') {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function ContextSwitcher({
  activeOrganizationName,
  currentLabel,
  activeProjectId,
  currentRouteProjectId,
  canViewProjects,
  projects,
  isProjectsLoading,
  onSelectProject,
  onClearProjectContext,
  onNavigate,
  compact = false
}: ContextSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navigateTo = (href: string) => {
    if (href === pathname) {
      onNavigate?.();
      return;
    }

    router.push(href);
    onNavigate?.();
  };

  const handleProjectSelect = async (projectId: string) => {
    await onSelectProject(projectId);

    if (currentRouteProjectId) {
      navigateTo(mapProjectContextHref(pathname, currentRouteProjectId, projectId));
      return;
    }

    const nextHref = mapProjectContextSelectionHref(pathname, projectId);

    if (nextHref) {
      navigateTo(nextHref);
      return;
    }

    onNavigate?.();
  };

  const handleOrganizationOverviewSelect = async () => {
    await onClearProjectContext();
    navigateTo(DashboardRoute.Dashboard);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={
            compact
              ? 'flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-sidebar-border/70 bg-sidebar-accent/35 px-2.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60'
              : 'flex min-w-0 items-center gap-3 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] px-3 py-2 text-left transition-colors hover:bg-[hsl(var(--panel-subtle))]'
          }
          aria-label="Open context switcher"
        >
          <div className="min-w-0">
            <div
              className={
                compact
                  ? 'truncate text-xs font-medium text-sidebar-foreground'
                  : 'text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground'
              }
            >
              {compact ? currentLabel : 'Context'}
            </div>
            <div
              className={
                compact
                  ? 'truncate text-[10px] text-sidebar-foreground/60'
                  : 'truncate text-sm font-medium text-foreground'
              }
            >
              {activeOrganizationName} / {currentLabel}
            </div>
          </div>
          <ChevronDown
            className={`shrink-0 ${compact ? 'h-3.5 w-3.5 text-sidebar-foreground/60' : 'h-4 w-4 text-muted-foreground'}`}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Context
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex items-center justify-between gap-3"
          onSelect={() => {
            void handleOrganizationOverviewSelect();
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <span className="truncate text-sm">Organization overview</span>
          </div>
          {activeProjectId === null ? <Check className="h-4 w-4 text-primary" /> : null}
        </DropdownMenuItem>

        {canViewProjects ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              Projects
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center justify-between gap-3"
              onSelect={() => navigateTo(DashboardRoute.Projects)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
                <span className="truncate text-sm">View all projects</span>
              </div>
              {pathname === DashboardRoute.Projects ? (
                <Check className="h-4 w-4 text-primary" />
              ) : null}
            </DropdownMenuItem>

            {projects.map((project) => {
              const isActive = activeProjectId === project.id;

              return (
                <DropdownMenuItem
                  key={project.id}
                  className="flex items-center justify-between gap-3"
                  onSelect={() => {
                    if (isActive) {
                      onNavigate?.();
                      return;
                    }

                    void handleProjectSelect(project.id);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{project.name}</span>
                  </div>
                  {isActive ? <Check className="h-4 w-4 text-primary" /> : null}
                </DropdownMenuItem>
              );
            })}

            {isProjectsLoading ? (
              <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                Loading projects...
              </DropdownMenuItem>
            ) : null}

            {!isProjectsLoading && projects.length === 0 ? (
              <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                No projects available
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarContentProps {
  pathname: string;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  sections: Record<SidebarSectionKey, FlexySidebarItem[]>;
  sectionTitles: Record<SidebarSectionKey, string>;
  visibleSectionOrder: SidebarSectionKey[];
  openSections: Record<string, boolean>;
  onToggleSection: (sectionKey: string) => void;
  isSavingSectionOrder: boolean;
  draggingSectionKey: SidebarSectionKey | null;
  onStartSectionDrag: (sectionKey: SidebarSectionKey) => void;
  onDropSection: (sectionKey: SidebarSectionKey) => void;
  onClearDraggingSection: () => void;
  displayName: string;
  email: string;
  photoUrl?: string | null;
  activeOrganizationName: string;
  activeOrganizationId?: string;
  currentContextLabel: string;
  activeProjectId?: string | null;
  currentRouteProjectId?: string | null;
  canViewProjects: boolean;
  contextProjects: Project[];
  isContextProjectsLoading: boolean;
  onSelectProjectContext: (projectId: string) => Promise<void>;
  onClearProjectContext: () => Promise<void>;
  isSwitchingOrganization: boolean;
  organizations: UserOrganization[];
  onOrganizationSwitch: (organizationId: string) => void;
  onLogout: () => void;
  contentEntries: ContentEntry[];
  contentHrefPrefix: string;
  canCreateContent: boolean;
  canMoveContent: boolean;
  isCreatingContent: boolean;
  isMovingContent: boolean;
  onCreateChildContent: (parentEntry: ContentEntry) => void;
  onMoveContentEntry: (entryId: number, parentId: number | null, position: number) => Promise<void>;
  onCreateRootContent: () => void;
  sectionEmptyStateLabels: Partial<Record<SidebarSectionKey, string>>;
  sectionHeaderActions: Partial<Record<SidebarSectionKey, SidebarSectionHeaderAction>>;
}

interface SectionDragHandleProps {
  canDragSection: boolean;
  onClearDraggingSection: () => void;
  onDropSection: (sectionKey: SidebarSectionKey) => void;
  onStartSectionDrag: (sectionKey: SidebarSectionKey) => void;
  sectionKey: SidebarSectionKey;
}

interface MobileDrawerProps {
  mobileOpen: boolean;
  activeOrganizationId?: string;
  isSwitchingOrganization: boolean;
  organizations: UserOrganization[];
  onOrganizationSwitch: (organizationId: string) => void;
  sections: Record<SidebarSectionKey, FlexySidebarItem[]>;
  sectionTitles: Record<SidebarSectionKey, string>;
  visibleSectionOrder: SidebarSectionKey[];
  openSections: Record<string, boolean>;
  pathname: string;
  displayName: string;
  email: string;
  photoUrl?: string | null;
  activeOrganizationName: string;
  currentContextLabel: string;
  activeProjectId?: string | null;
  currentRouteProjectId?: string | null;
  canViewProjects: boolean;
  contextProjects: Project[];
  isContextProjectsLoading: boolean;
  onSelectProjectContext: (projectId: string) => Promise<void>;
  onClearProjectContext: () => Promise<void>;
  onToggleSection: (sectionKey: string) => void;
  onLogout: () => void;
  onNavigate: () => void;
  contentEntries: ContentEntry[];
  contentHrefPrefix: string;
  canCreateContent: boolean;
  canMoveContent: boolean;
  isCreatingContent: boolean;
  isMovingContent: boolean;
  onCreateChildContent: (parentEntry: ContentEntry) => void;
  onMoveContentEntry: (entryId: number, parentId: number | null, position: number) => Promise<void>;
  onCreateRootContent: () => void;
  sectionEmptyStateLabels: Partial<Record<SidebarSectionKey, string>>;
  sectionHeaderActions: Partial<Record<SidebarSectionKey, SidebarSectionHeaderAction>>;
}

function SidebarSection({
  items,
  sectionTitle,
  isSidebarCollapsed,
  isSectionOpen,
  pathname,
  onToggle,
  emptyStateLabel,
  headerAction,
  showWhenEmpty = false,
  sectionDragHandle
}: SidebarSectionProps & { sectionDragHandle?: SectionDragHandleProps }) {
  if (!items.length && !showWhenEmpty) {
    return null;
  }

  const HeaderActionIcon = headerAction?.icon;

  return (
    <div className="space-y-1">
      {!isSidebarCollapsed ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggle}
            data-sidebar-section-header={sectionTitle}
            className="flex min-w-0 flex-1 items-center justify-between rounded-md px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/42 transition-colors hover:bg-sidebar-accent/35 hover:text-sidebar-foreground"
          >
            <span className="inline-flex items-center gap-1.5">
              {sectionDragHandle ? (
                <span
                  role="button"
                  tabIndex={-1}
                  draggable={sectionDragHandle.canDragSection}
                  data-sidebar-section-drag-handle={sectionDragHandle.sectionKey}
                  aria-label={`Reorder ${sectionTitle} section`}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    sectionDragHandle.onStartSectionDrag(sectionDragHandle.sectionKey);
                  }}
                  onDragEnd={(event) => {
                    event.stopPropagation();
                    sectionDragHandle.onClearDraggingSection();
                  }}
                  onDragOver={(event) => {
                    if (!sectionDragHandle.canDragSection) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    sectionDragHandle.onDropSection(sectionDragHandle.sectionKey);
                  }}
                  className="inline-flex h-4 w-4 shrink-0 cursor-grab items-center justify-center rounded-sm text-sidebar-foreground/36 transition-colors hover:bg-sidebar-accent/35 hover:text-sidebar-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              ) : null}
              {sectionTitle}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                isSectionOpen ? 'rotate-0' : '-rotate-90'
              }`}
            />
          </button>
          {headerAction && HeaderActionIcon ? (
            <Button
              type="button"
              variant="ghost"
              size="tableIcon"
              className="h-7 w-7 rounded-md text-sidebar-foreground/56 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground"
              onClick={headerAction.onClick}
              disabled={headerAction.disabled}
              aria-label={headerAction.label}
              title={headerAction.label}
            >
              <HeaderActionIcon className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {(isSectionOpen || isSidebarCollapsed) && (
        <div className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = isSidebarItemActive(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={getSidebarLinkClass(isActive, isSidebarCollapsed)}
                title={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!isSidebarCollapsed ? (
                  <span>{item.label}</span>
                ) : (
                  <span className="sr-only">{item.label}</span>
                )}
              </Link>
            );
          })}
          {!items.length && !isSidebarCollapsed && emptyStateLabel ? (
            <p className="px-3 py-2 text-xs text-sidebar-foreground/48">{emptyStateLabel}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function OrganizationMenuItems({
  activeOrganizationId,
  isSwitchingOrganization,
  organizations,
  onOrganizationSwitch
}: OrganizationSwitcherProps) {
  if (!organizations.length) {
    return null;
  }

  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
        Organizations
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {organizations.map((organization) => {
        const optionName = organization.displayName ?? organization.name;
        const optionInitialCandidate = optionName.charAt(0).toUpperCase();
        const optionInitial = optionInitialCandidate.length > 0 ? optionInitialCandidate : 'W';
        const isActive = organization.organizationId === activeOrganizationId;

        return (
          <DropdownMenuItem
            key={organization.organizationId}
            onSelect={(event) => {
              if (isActive || isSwitchingOrganization) {
                event.preventDefault();
                return;
              }
              onOrganizationSwitch(organization.organizationId);
            }}
            className="flex items-center justify-between gap-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                {optionInitial}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm">{optionName}</div>
                {isActive ? (
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Current
                  </div>
                ) : null}
              </div>
            </div>
            {isActive ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

function UserFooter({
  compact = false,
  mobile = false,
  displayName,
  email,
  photoUrl,
  activeOrganizationId,
  organizations,
  isSwitchingOrganization,
  onOrganizationSwitch,
  onLogout
}: UserFooterProps) {
  return (
    <div
      className={
        compact
          ? 'space-y-1.5 border-t border-sidebar-border/70 pt-1.5'
          : mobile
            ? 'space-y-3 border-t border-border/70 pt-4'
            : 'space-y-2 border-t border-sidebar-border/70 pt-2.5'
      }
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={
              compact
                ? 'flex h-8 w-8 items-center justify-center rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 p-0 text-left transition-colors hover:bg-sidebar-accent/60'
                : mobile
                  ? 'flex w-full items-start gap-2.5 rounded-lg border border-border/70 bg-[hsl(var(--panel-subtle))] p-3 text-left transition-colors hover:bg-[hsl(var(--panel-subtle))]'
                  : 'flex w-full items-start gap-2.5 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/60'
            }
            aria-label="Open user menu"
          >
            <CurrentUserAvatar
              displayName={displayName}
              email={email}
              photoUrl={photoUrl}
              className={`rounded-md border border-sidebar-border/80 ${
                compact ? 'h-6 w-6' : 'h-8 w-8'
              }`}
              fallbackClassName="rounded-md bg-sidebar-primary/12 text-[11px] font-semibold text-sidebar-primary"
            />
            {!compact ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {displayName || 'Workspace user'}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{email}</div>
                </div>
                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[220px]">
          <OrganizationMenuItems
            activeOrganizationId={activeOrganizationId}
            isSwitchingOrganization={isSwitchingOrganization}
            organizations={organizations}
            onOrganizationSwitch={onOrganizationSwitch}
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile" prefetch={false} aria-label="Profile">
              <UserCircle2 className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/account/settings" prefetch={false} aria-label="Account settings">
              <Settings className="h-4 w-4" />
              Account Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DesktopSidebar({
  pathname,
  isSidebarCollapsed,
  onToggleSidebar,
  sections,
  sectionTitles,
  visibleSectionOrder,
  openSections,
  onToggleSection,
  isSavingSectionOrder,
  draggingSectionKey,
  onStartSectionDrag,
  onDropSection,
  onClearDraggingSection,
  displayName,
  email,
  photoUrl,
  activeOrganizationName,
  activeOrganizationId,
  currentContextLabel,
  activeProjectId,
  currentRouteProjectId,
  canViewProjects,
  contextProjects,
  isContextProjectsLoading,
  onSelectProjectContext,
  onClearProjectContext,
  isSwitchingOrganization,
  organizations,
  onOrganizationSwitch,
  onLogout,
  contentEntries,
  contentHrefPrefix,
  canCreateContent,
  canMoveContent,
  isCreatingContent,
  isMovingContent,
  onCreateChildContent,
  onMoveContentEntry,
  onCreateRootContent,
  sectionEmptyStateLabels,
  sectionHeaderActions
}: SidebarContentProps) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border/70 bg-sidebar-background md:flex md:flex-col ${
        isSidebarCollapsed ? 'w-[72px] py-2.5' : 'w-[256px] px-2.5 py-2.5'
      }`}
    >
      <div className={`flex h-svh flex-col ${isSidebarCollapsed ? 'px-0' : ''}`}>
        <div
          className={
            isSidebarCollapsed ? 'flex justify-center px-2' : 'flex items-center gap-2 px-0.5'
          }
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            className={`hidden rounded-md border border-sidebar-border/70 bg-sidebar-accent/40 text-sidebar-foreground hover:bg-sidebar-accent/75 md:inline-flex ${
              isSidebarCollapsed ? 'h-8 w-8' : 'h-7 w-7'
            }`}
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </Button>
          {!isSidebarCollapsed ? (
            <div className="min-w-0 flex-1">
              <ContextSwitcher
                compact
                activeOrganizationName={activeOrganizationName}
                currentLabel={currentContextLabel}
                activeProjectId={activeProjectId}
                currentRouteProjectId={currentRouteProjectId}
                canViewProjects={canViewProjects}
                projects={contextProjects}
                isProjectsLoading={isContextProjectsLoading}
                onSelectProject={onSelectProjectContext}
                onClearProjectContext={onClearProjectContext}
              />
            </div>
          ) : null}
        </div>

        <div
          className={`mt-3 flex-1 space-y-2.5 ${isSidebarCollapsed ? 'flex flex-col items-center px-2' : ''}`}
        >
          {visibleSectionOrder.map((sectionKey) => {
            const items = sections[sectionKey];
            const isSectionOpen = openSections[sectionKey] ?? true;

            return (
              <div
                key={sectionKey}
                data-sidebar-section={sectionKey}
                onDragOver={(event) => {
                  if (!isSidebarCollapsed && !isSavingSectionOrder) {
                    event.preventDefault();
                  }
                }}
                onDrop={() => onDropSection(sectionKey)}
                className={draggingSectionKey === sectionKey ? 'opacity-60' : ''}
              >
                {sectionKey === 'content' ? (
                  <ContentSidebarSection
                    canCreateContent={canCreateContent}
                    canMoveContent={canMoveContent}
                    contentHrefPrefix={contentHrefPrefix}
                    emptyStateLabel={sectionEmptyStateLabels[sectionKey]}
                    entries={contentEntries}
                    isCreatingContent={isCreatingContent}
                    isMovingContent={isMovingContent}
                    isSectionOpen={isSectionOpen}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onCreateChild={onCreateChildContent}
                    onMoveEntry={onMoveContentEntry}
                    onCreateRoot={onCreateRootContent}
                    onToggle={() => onToggleSection(sectionKey)}
                    pathname={pathname}
                    sectionDragHandle={
                      isSidebarCollapsed
                        ? undefined
                        : {
                            canDragSection: !isSavingSectionOrder,
                            onClearDraggingSection,
                            onDropSection,
                            onStartSectionDrag,
                            sectionKey
                          }
                    }
                    sectionTitle={sectionTitles[sectionKey]}
                  />
                ) : (
                  <SidebarSection
                    items={items}
                    sectionTitle={sectionTitles[sectionKey]}
                    isSidebarCollapsed={isSidebarCollapsed}
                    isSectionOpen={isSectionOpen}
                    pathname={pathname}
                    onToggle={() => onToggleSection(sectionKey)}
                    emptyStateLabel={sectionEmptyStateLabels[sectionKey]}
                    headerAction={sectionHeaderActions[sectionKey]}
                    showWhenEmpty={false}
                    sectionDragHandle={
                      isSidebarCollapsed
                        ? undefined
                        : {
                            canDragSection: !isSavingSectionOrder,
                            onClearDraggingSection,
                            onDropSection,
                            onStartSectionDrag,
                            sectionKey
                          }
                    }
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className={`mt-auto ${isSidebarCollapsed ? 'flex justify-center px-2' : ''}`}>
          <UserFooter
            compact={isSidebarCollapsed}
            displayName={displayName}
            email={email}
            photoUrl={photoUrl}
            activeOrganizationId={activeOrganizationId}
            organizations={organizations}
            isSwitchingOrganization={isSwitchingOrganization}
            onOrganizationSwitch={onOrganizationSwitch}
            onLogout={onLogout}
          />
        </div>
      </div>
    </aside>
  );
}

function MobileDrawer({
  mobileOpen,
  activeOrganizationId,
  isSwitchingOrganization,
  organizations,
  onOrganizationSwitch,
  sections,
  sectionTitles,
  visibleSectionOrder,
  openSections,
  pathname,
  displayName,
  email,
  photoUrl,
  activeOrganizationName,
  currentContextLabel,
  activeProjectId,
  currentRouteProjectId,
  canViewProjects,
  contextProjects,
  isContextProjectsLoading,
  onSelectProjectContext,
  onClearProjectContext,
  onToggleSection,
  onLogout,
  onNavigate,
  contentEntries,
  contentHrefPrefix,
  canCreateContent,
  canMoveContent,
  isCreatingContent,
  isMovingContent,
  onCreateChildContent,
  onMoveContentEntry,
  onCreateRootContent,
  sectionEmptyStateLabels,
  sectionHeaderActions
}: MobileDrawerProps) {
  if (!mobileOpen) {
    return null;
  }

  return (
    <div className="border-b border-border/70 bg-[hsl(var(--panel))] px-4 py-4 md:hidden">
      <div className="space-y-4">
        {organizations.length > 0 ? (
          <Select
            value={activeOrganizationId}
            onValueChange={(value) => onOrganizationSwitch(value)}
            disabled={isSwitchingOrganization}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((organization) => (
                <SelectItem key={organization.organizationId} value={organization.organizationId}>
                  {organization.displayName ?? organization.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <ContextSwitcher
          compact
          activeOrganizationName={activeOrganizationName}
          currentLabel={currentContextLabel}
          activeProjectId={activeProjectId}
          currentRouteProjectId={currentRouteProjectId}
          canViewProjects={canViewProjects}
          projects={contextProjects}
          isProjectsLoading={isContextProjectsLoading}
          onSelectProject={onSelectProjectContext}
          onClearProjectContext={onClearProjectContext}
          onNavigate={onNavigate}
        />

        <div className="space-y-3">
          {visibleSectionOrder.map((sectionKey) => {
            const items = sections[sectionKey];
            const isSectionOpen = openSections[sectionKey] ?? true;

            return sectionKey === 'content' ? (
              <ContentSidebarSection
                key={sectionKey}
                canCreateContent={canCreateContent}
                canMoveContent={canMoveContent}
                contentHrefPrefix={contentHrefPrefix}
                emptyStateLabel={sectionEmptyStateLabels[sectionKey]}
                entries={contentEntries}
                isCreatingContent={isCreatingContent}
                isMovingContent={isMovingContent}
                isSectionOpen={isSectionOpen}
                isSidebarCollapsed={false}
                onCreateChild={onCreateChildContent}
                onMoveEntry={onMoveContentEntry}
                onCreateRoot={onCreateRootContent}
                onToggle={() => onToggleSection(sectionKey)}
                pathname={pathname}
                sectionTitle={sectionTitles[sectionKey]}
              />
            ) : (
              <SidebarSection
                key={sectionKey}
                items={items}
                sectionTitle={sectionTitles[sectionKey]}
                isSidebarCollapsed={false}
                isSectionOpen={isSectionOpen}
                pathname={pathname}
                onToggle={() => onToggleSection(sectionKey)}
                emptyStateLabel={sectionEmptyStateLabels[sectionKey]}
                headerAction={sectionHeaderActions[sectionKey]}
                showWhenEmpty={false}
              />
            );
          })}
        </div>

        <UserFooter
          mobile
          displayName={displayName}
          email={email}
          photoUrl={photoUrl}
          activeOrganizationId={activeOrganizationId}
          organizations={organizations}
          isSwitchingOrganization={isSwitchingOrganization}
          onOrganizationSwitch={onOrganizationSwitch}
          onLogout={onLogout}
        />
      </div>
    </div>
  );
}

export function DashboardAppShellClient({
  children,
  userDisplayName,
  userEmail,
  userRoles,
  userPermissions,
  organizations,
  currentOrganizationId,
  initialSectionOrder,
  initialWorkspaceActiveProjectId,
  initialPathname
}: DashboardAppShellClientProps) {
  const { user } = useAuth();
  const { canViewProjects } = getDashboardRouteAccess({
    roles: userRoles,
    permissions: user?.permissions ?? userPermissions
  });

  return (
    <ProjectContextProvider
      currentOrganizationId={currentOrganizationId}
      initialActiveProjectId={initialWorkspaceActiveProjectId}
      canViewProjects={canViewProjects}
    >
      <DashboardAppShellClientInner
        userDisplayName={userDisplayName}
        userEmail={userEmail}
        userRoles={userRoles}
        userPermissions={userPermissions}
        organizations={organizations}
        currentOrganizationId={currentOrganizationId}
        initialSectionOrder={initialSectionOrder}
        initialPathname={initialPathname}
      >
        {children}
      </DashboardAppShellClientInner>
    </ProjectContextProvider>
  );
}

function DashboardAppShellClientInner({
  children,
  userDisplayName,
  userEmail,
  userRoles,
  userPermissions,
  organizations,
  currentOrganizationId,
  initialSectionOrder,
  initialPathname
}: Omit<DashboardAppShellClientProps, 'initialWorkspaceActiveProjectId'>) {
  const router = useRouter();
  const { user, switchTenant, logout } = useAuth();
  const {
    activeProject,
    activeProjectId: persistedActiveProjectId,
    setActiveProject,
    clearActiveProject,
    projects: contextProjects,
    isProjectsLoading: isContextProjectsLoading
  } = useProjectContext();
  const pathname = usePathname() ?? initialPathname ?? DashboardRoute.Dashboard;
  const { breadcrumbs, pageTitle, projectId, projectSection, scopeKind } =
    getDashboardShellContext(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSwitchingOrganization, setIsSwitchingOrganization] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sectionOrder, setSectionOrder] = useState<SidebarSectionKey[]>(() =>
    normalizeSidebarSectionOrder(initialSectionOrder)
  );
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    project: true,
    yourWork: true,
    content: true,
    organization: true
  });
  const [isSavingSectionOrder, setIsSavingSectionOrder] = useState(false);
  const [draggingSectionKey, setDraggingSectionKey] = useState<SidebarSectionKey | null>(null);
  const [contentEntries, setContentEntries] = useState<ContentEntry[]>([]);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [isCreatingContent, setIsCreatingContent] = useState(false);
  const [isMovingContent, setIsMovingContent] = useState(false);
  const hasResolvedInitialSectionOrder = useRef(false);

  const displayName = userDisplayName.trim();
  const email = userEmail.trim();
  const photoUrl = user?.photoUrl ?? null;

  const {
    canManageOrganization,
    canViewMembers,
    canViewProjects,
    canViewContent,
    canCreateContent,
    canUpdateContent
  } = getDashboardRouteAccess({
    roles: userRoles,
    permissions: user?.permissions ?? userPermissions
  });
  const projectShellQuery = api.projects.get.useQuery(
    { projectId: projectId ?? '' },
    {
      enabled: scopeKind === DashboardShellScope.PROJECT && Boolean(projectId),
      refetchOnWindowFocus: false
    }
  );

  const activeOrganizationId = getFirstNonEmpty(
    user?.tenantId,
    currentOrganizationId,
    organizations.find((organization) => organization.isDefault)?.organizationId,
    organizations[0]?.organizationId
  );
  const activeOrganization = organizations.find(
    (organization) => organization.organizationId === activeOrganizationId
  );
  const activeOrganizationName =
    activeOrganization?.displayName ?? activeOrganization?.name ?? 'Workspace';
  const projectDisplayName =
    scopeKind === DashboardShellScope.PROJECT
      ? (projectShellQuery.data?.name ?? (projectId ? `Project ${projectId}` : 'Project'))
      : null;
  const projectSectionLabel =
    projectSection === 'issues'
      ? 'Issues'
      : projectSection === 'content'
        ? 'Content'
        : projectSection === 'integrations'
          ? 'Integrations'
          : projectSection === 'members'
            ? 'Members'
            : projectSection === 'settings'
              ? 'Details'
              : null;
  const contextSwitcherProjectId = isSwitchingOrganization ? null : persistedActiveProjectId;
  const currentContextLabel = resolveCurrentContextLabel({
    isSwitchingOrganization,
    activeProjectName: activeProject?.name ?? null
  });
  const routeScopedProjectId =
    scopeKind === DashboardShellScope.PROJECT && projectId ? projectId : null;
  const effectiveContentProjectId = resolveEffectiveContentProjectId({
    routeProjectId: routeScopedProjectId,
    isSwitchingOrganization
  });
  const scopedProjectId =
    effectiveContentProjectId !== null ? Number.parseInt(effectiveContentProjectId, 10) : undefined;
  const isProjectContentScope = scopedProjectId !== undefined && !Number.isNaN(scopedProjectId);
  const contentHrefPrefix =
    effectiveContentProjectId !== null
      ? `/projects/${effectiveContentProjectId}/content`
      : '/content';
  const sectionTitles = useMemo<Record<SidebarSectionKey, string>>(
    () => ({
      project: resolveProjectSectionTitle({
        isSwitchingOrganization,
        activeProjectName: activeProject?.name ?? null
      }),
      yourWork: 'General',
      content: 'Content',
      organization: 'Organization'
    }),
    [activeProject?.name, isSwitchingOrganization]
  );

  const sections = useMemo<Record<SidebarSectionKey, FlexySidebarItem[]>>(
    () => ({
      content: [],
      // Project sidebar section is intentionally disabled during the issues/navigation restructure.
      project: [],
      yourWork: getMainSidebarItems(),
      organization: getOrganizationSidebarItems({
        canViewMembers,
        canManageOrganization,
        canViewProjects
      })
    }),
    [canManageOrganization, canViewMembers, canViewProjects]
  );
  const visibleSectionOrder = useMemo<SidebarSectionKey[]>(
    () =>
      sectionOrder.filter(
        (sectionKey) =>
          sections[sectionKey].length > 0 || (sectionKey === 'content' && canViewContent)
      ),
    [canViewContent, sectionOrder, sections]
  );
  const sectionEmptyStateLabels = useMemo<Partial<Record<SidebarSectionKey, string>>>(
    () => ({
      content: isContentLoading ? 'Loading pages...' : 'No pages yet.'
    }),
    [isContentLoading]
  );
  const sectionHeaderActions = useMemo<
    Partial<Record<SidebarSectionKey, SidebarSectionHeaderAction>>
  >(() => ({}), []);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    setIsSidebarCollapsed(stored === '1');
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!canViewContent) {
      setContentEntries([]);
      return;
    }

    let cancelled = false;

    const loadContentItems = async () => {
      setIsContentLoading(true);

      try {
        const entries = await contentApi.listContentEntries(
          isProjectContentScope && scopedProjectId !== undefined
            ? { projectId: scopedProjectId, scope: ContentScope.PROJECT }
            : { scope: ContentScope.ORGANIZATION }
        );

        if (cancelled) {
          return;
        }

        setContentEntries(
          isProjectContentScope ? entries : entries.filter((entry) => entry.projectId === null)
        );
      } catch (error) {
        if (!cancelled) {
          setContentEntries([]);
          toast.error('Failed to load content pages', {
            description: error instanceof Error ? error.message : 'Please try again.'
          });
        }
      } finally {
        if (!cancelled) {
          setIsContentLoading(false);
        }
      }
    };

    void loadContentItems();

    // Keep the sidebar document list synchronized with the active scope and content mutations.
    const unsubscribe = subscribeToContentRefresh(() => {
      void loadContentItems();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeOrganizationId, canViewContent, isProjectContentScope, scopedProjectId, pathname]);

  const createContentEntry = async (parentId?: number) => {
    if (isCreatingContent || !canCreateContent) {
      return;
    }

    setIsCreatingContent(true);

    try {
      const created = await contentApi.createDraftContentEntry({
        title: 'Untitled',
        contentMarkdown: '# Untitled',
        ...(isProjectContentScope && scopedProjectId !== undefined
          ? { projectId: scopedProjectId }
          : {}),
        ...(parentId !== undefined ? { parentId } : {})
      });
      router.push(`${contentHrefPrefix}/${created.slug}`);
    } catch (error) {
      toast.error('Failed to create page', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsCreatingContent(false);
    }
  };

  const moveContentEntry = async (entryId: number, parentId: number | null, position: number) => {
    if (isMovingContent || !canUpdateContent) {
      return;
    }

    setIsMovingContent(true);

    try {
      await contentApi.moveContentEntry(entryId, { parentId, position });
    } catch (error) {
      toast.error('Failed to move page', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    } finally {
      setIsMovingContent(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const defaultSectionOrder = normalizeSidebarSectionOrder(undefined);

    if (!hasResolvedInitialSectionOrder.current) {
      hasResolvedInitialSectionOrder.current = true;
      return () => {
        cancelled = true;
      };
    }

    setDraggingSectionKey(null);
    setSectionOrder(defaultSectionOrder);

    const loadCurrentUserSettings = async () => {
      try {
        const settings = await userSettingsApi.getCurrentUserSettings(activeOrganizationId);
        if (!cancelled) {
          setSectionOrder(settings.sidebarSectionOrder);
        }
      } catch (error) {
        if (!cancelled) {
          setSectionOrder(defaultSectionOrder);
          console.error('Failed to load current user settings', error);
        }
      }
    };

    void loadCurrentUserSettings();

    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId]);

  const toggleSidebarCollapse = () => {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
  };

  const handleOrganizationSwitch = async (organizationId: string) => {
    if (isSwitchingOrganization || !organizationId || organizationId === activeOrganizationId) {
      return;
    }

    setIsSwitchingOrganization(true);
    try {
      await switchTenant(organizationId);
      if (scopeKind === DashboardShellScope.PROJECT) {
        router.replace(`/projects?projectContext=${ProjectContextNotice.ORGANIZATION_SWITCHED}`);
      }
    } finally {
      setIsSwitchingOrganization(false);
    }
  };

  const handleProjectContextSelection = async (nextProjectId: string) => {
    try {
      await setActiveProject(nextProjectId);
    } catch (error) {
      toast.error('Failed to switch project context', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  const handleClearProjectContext = async () => {
    try {
      await clearActiveProject();
    } catch (error) {
      toast.error('Failed to clear project context', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
      throw error;
    }
  };

  function toggleSection(sectionKey: string) {
    setOpenSections((current) => ({
      ...current,
      [sectionKey]: !(current[sectionKey] ?? true)
    }));
  }

  const handleDropSection = async (targetSectionKey: SidebarSectionKey) => {
    if (!draggingSectionKey || draggingSectionKey === targetSectionKey) {
      setDraggingSectionKey(null);
      return;
    }

    const previousOrder = sectionOrder;
    const nextOrder = moveSection(sectionOrder, draggingSectionKey, targetSectionKey);
    setDraggingSectionKey(null);
    setSectionOrder(nextOrder);
    setIsSavingSectionOrder(true);

    try {
      const updated = await userSettingsApi.updateSidebarSectionOrder(
        nextOrder,
        activeOrganizationId
      );
      setSectionOrder(updated.sidebarSectionOrder);
    } catch (error) {
      setSectionOrder(previousOrder);
      toast.error('Failed to save sidebar order', {
        description: error instanceof Error ? error.message : 'Please try again.'
      });
    } finally {
      setIsSavingSectionOrder(false);
    }
  };

  return (
    <div className="min-h-svh bg-background text-foreground">
      <DesktopSidebar
        pathname={pathname}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebarCollapse}
        sections={sections}
        sectionTitles={sectionTitles}
        visibleSectionOrder={visibleSectionOrder}
        openSections={openSections}
        onToggleSection={toggleSection}
        isSavingSectionOrder={isSavingSectionOrder}
        draggingSectionKey={draggingSectionKey}
        onStartSectionDrag={(sectionKey) => {
          if (!isSidebarCollapsed && !isSavingSectionOrder) {
            setDraggingSectionKey(sectionKey);
          }
        }}
        onDropSection={(sectionKey) => {
          void handleDropSection(sectionKey);
        }}
        onClearDraggingSection={() => {
          setDraggingSectionKey(null);
        }}
        activeOrganizationId={activeOrganizationId}
        activeOrganizationName={activeOrganizationName}
        currentContextLabel={currentContextLabel}
        activeProjectId={contextSwitcherProjectId}
        currentRouteProjectId={
          scopeKind === DashboardShellScope.PROJECT ? (projectId ?? null) : null
        }
        canViewProjects={canViewProjects}
        contextProjects={contextProjects}
        isContextProjectsLoading={isContextProjectsLoading}
        onSelectProjectContext={handleProjectContextSelection}
        onClearProjectContext={handleClearProjectContext}
        isSwitchingOrganization={isSwitchingOrganization}
        organizations={organizations}
        onOrganizationSwitch={(organizationId) => {
          void handleOrganizationSwitch(organizationId);
        }}
        displayName={displayName}
        email={email}
        photoUrl={photoUrl}
        onLogout={() => void logout()}
        contentEntries={contentEntries}
        contentHrefPrefix={contentHrefPrefix}
        canCreateContent={canCreateContent}
        canMoveContent={canUpdateContent}
        isCreatingContent={isCreatingContent}
        isMovingContent={isMovingContent}
        onCreateChildContent={(parentEntry) => {
          void createContentEntry(parentEntry.id);
        }}
        onMoveContentEntry={moveContentEntry}
        onCreateRootContent={() => {
          void createContentEntry();
        }}
        sectionEmptyStateLabels={sectionEmptyStateLabels}
        sectionHeaderActions={sectionHeaderActions}
      />

      <div
        className={`min-w-0 ${
          pathname === DashboardRoute.MyWork ||
          pathname.startsWith(`${DashboardRoute.MyWork}/`) ||
          pathname === DashboardRoute.Issues ||
          pathname.startsWith(`${DashboardRoute.Issues}/`)
            ? 'h-svh overflow-hidden'
            : 'min-h-svh'
        } ${isSidebarCollapsed ? 'md:pl-[72px]' : 'md:pl-[256px]'}`}
      >
        <div
          className={`flex min-w-0 flex-col ${
            pathname === DashboardRoute.MyWork ||
            pathname.startsWith(`${DashboardRoute.MyWork}/`) ||
            pathname === DashboardRoute.Issues ||
            pathname.startsWith(`${DashboardRoute.Issues}/`)
              ? 'h-svh overflow-hidden'
              : 'min-h-svh'
          }`}
        >
          <header className="border-b border-border/70 bg-background/82 px-4 py-3 backdrop-blur-xs sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileOpen((current) => !current)}
                aria-label="Toggle navigation"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  {scopeKind === DashboardShellScope.PROJECT ? (
                    <>
                      <span>{activeOrganizationName}</span>
                      <span className="text-muted-foreground/60">/</span>
                      <span>{projectDisplayName}</span>
                      {projectSectionLabel ? (
                        <>
                          <span className="text-muted-foreground/60">/</span>
                          <span className="text-foreground">{projectSectionLabel}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span>{activeOrganizationName}</span>
                      <span className="text-muted-foreground/60">/</span>
                      {breadcrumbs.map((crumb, index) => (
                        <span key={`${crumb}-${index}`} className="inline-flex items-center gap-1">
                          {index > 0 ? <span className="text-muted-foreground/60">/</span> : null}
                          <span
                            className={index === breadcrumbs.length - 1 ? 'text-foreground' : ''}
                          >
                            {crumb}
                          </span>
                        </span>
                      ))}
                    </>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-medium text-foreground">{pageTitle}</div>
                </div>
              </div>
            </div>
          </header>

          <MobileDrawer
            mobileOpen={mobileOpen}
            activeOrganizationId={activeOrganizationId}
            isSwitchingOrganization={isSwitchingOrganization}
            organizations={organizations}
            onOrganizationSwitch={(organizationId) => {
              void handleOrganizationSwitch(organizationId);
            }}
            sections={sections}
            sectionTitles={sectionTitles}
            visibleSectionOrder={visibleSectionOrder}
            openSections={openSections}
            pathname={pathname}
            displayName={displayName}
            email={email}
            photoUrl={photoUrl}
            activeOrganizationName={activeOrganizationName}
            currentContextLabel={currentContextLabel}
            activeProjectId={contextSwitcherProjectId}
            currentRouteProjectId={
              scopeKind === DashboardShellScope.PROJECT ? (projectId ?? null) : null
            }
            canViewProjects={canViewProjects}
            contextProjects={contextProjects}
            isContextProjectsLoading={isContextProjectsLoading}
            onSelectProjectContext={handleProjectContextSelection}
            onClearProjectContext={handleClearProjectContext}
            onToggleSection={toggleSection}
            onLogout={() => void logout()}
            onNavigate={() => setMobileOpen(false)}
            contentEntries={contentEntries}
            contentHrefPrefix={contentHrefPrefix}
            canCreateContent={canCreateContent}
            canMoveContent={canUpdateContent}
            isCreatingContent={isCreatingContent}
            isMovingContent={isMovingContent}
            onCreateChildContent={(parentEntry) => {
              void createContentEntry(parentEntry.id);
            }}
            onMoveContentEntry={moveContentEntry}
            onCreateRootContent={() => {
              void createContentEntry();
            }}
            sectionEmptyStateLabels={sectionEmptyStateLabels}
            sectionHeaderActions={sectionHeaderActions}
          />

          <main
            className={
              pathname === DashboardRoute.MyWork ||
              pathname.startsWith(`${DashboardRoute.MyWork}/`) ||
              pathname === DashboardRoute.Issues ||
              pathname.startsWith(`${DashboardRoute.Issues}/`)
                ? 'flex min-h-0 min-w-0 flex-1 overflow-hidden'
                : 'min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-6'
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
