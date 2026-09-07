'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { userSettingsApi } from '~/lib/api/user-settings-api';
import { PROJECT_SORT_ORDER, type Project } from '~/types/project.types';
import { api } from '~/utils/api';

export interface ProjectContextValue {
  activeProjectId: string | null;
  activeProject: Project | null;
  projects: Project[];
  isProjectsLoading: boolean;
  isUpdating: boolean;
  setActiveProject: (projectId: string | null) => Promise<void>;
  clearActiveProject: () => Promise<void>;
}

interface ProjectContextProviderProps {
  children: React.ReactNode;
  currentOrganizationId: string | null;
  initialActiveProjectId: number | null;
  canViewProjects: boolean;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function getProjectContextRouteProjectId(
  pathname: string | null | undefined
): string | null {
  if (typeof pathname !== 'string' || pathname.trim().length === 0) {
    return null;
  }

  const normalizedPath = pathname.split('?')[0] ?? pathname;
  const match = normalizedPath.match(/^\/projects\/([^/]+)(?:\/[^/]+)?$/);

  return normalizeProjectContextProjectId(match?.[1] ?? null);
}

export function normalizeProjectContextProjectId(
  value: number | string | null | undefined
): string | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? String(value) : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : null;
  }

  return null;
}

export function resolveActiveProject(
  projects: Project[],
  activeProjectId: string | null
): Project | null {
  if (!activeProjectId) {
    return null;
  }

  return projects.find((project) => project.id === activeProjectId) ?? null;
}

export function shouldClearInvalidProjectContext(params: {
  activeProjectId: string | null;
  isProjectsLoading: boolean;
  projects: Project[];
}): boolean {
  const { activeProjectId, isProjectsLoading, projects } = params;

  if (!activeProjectId || isProjectsLoading) {
    return false;
  }

  return resolveActiveProject(projects, activeProjectId) === null;
}

function toPersistedProjectId(projectId: string | null): number | null {
  if (projectId === null) {
    return null;
  }

  const parsed = Number(projectId);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Project ID must be a positive integer');
  }

  return parsed;
}

export function ProjectContextProvider({
  children,
  currentOrganizationId,
  initialActiveProjectId,
  canViewProjects
}: ProjectContextProviderProps) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() =>
    normalizeProjectContextProjectId(initialActiveProjectId)
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const invalidCleanupKeyRef = useRef<string | null>(null);

  const projectsQuery = api.projects.list.useQuery(
    {
      page: 1,
      pageSize: 100,
      sortOrder: PROJECT_SORT_ORDER.ASC
    },
    {
      enabled: canViewProjects,
      refetchOnWindowFocus: false
    }
  );

  useEffect(() => {
    setActiveProjectIdState(normalizeProjectContextProjectId(initialActiveProjectId));
  }, [currentOrganizationId, initialActiveProjectId]);

  const projects = projectsQuery.data?.data ?? [];
  const activeProject = useMemo(
    () => resolveActiveProject(projects, activeProjectId),
    [projects, activeProjectId]
  );

  useEffect(() => {
    if (
      !shouldClearInvalidProjectContext({
        activeProjectId,
        isProjectsLoading: projectsQuery.isLoading,
        projects
      })
    ) {
      invalidCleanupKeyRef.current = null;
      return;
    }

    const cleanupKey = `${currentOrganizationId ?? 'none'}:${activeProjectId}`;
    if (invalidCleanupKeyRef.current === cleanupKey) {
      return;
    }

    invalidCleanupKeyRef.current = cleanupKey;

    let cancelled = false;
    setIsUpdating(true);
    setActiveProjectIdState(null);

    void userSettingsApi
      .updateWorkspaceActiveProjectId(null, currentOrganizationId ?? undefined)
      .finally(() => {
        if (!cancelled) {
          setIsUpdating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, currentOrganizationId, projects, projectsQuery.isLoading]);

  const setActiveProject = async (projectId: string | null) => {
    const normalizedProjectId = normalizeProjectContextProjectId(projectId);
    const previousProjectId = activeProjectId;

    setActiveProjectIdState(normalizedProjectId);
    setIsUpdating(true);

    try {
      const updatedSettings = await userSettingsApi.updateWorkspaceActiveProjectId(
        toPersistedProjectId(normalizedProjectId),
        currentOrganizationId ?? undefined
      );

      setActiveProjectIdState(
        normalizeProjectContextProjectId(updatedSettings.workspaceActiveProjectId)
      );
    } catch (error) {
      setActiveProjectIdState(previousProjectId);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  };

  const value = useMemo<ProjectContextValue>(
    () => ({
      activeProjectId,
      activeProject,
      projects,
      isProjectsLoading: projectsQuery.isLoading,
      isUpdating,
      setActiveProject,
      clearActiveProject: () => setActiveProject(null)
    }),
    [activeProject, activeProjectId, isUpdating, projects, projectsQuery.isLoading]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext() {
  const context = useContext(ProjectContext);

  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectContextProvider');
  }

  return context;
}
