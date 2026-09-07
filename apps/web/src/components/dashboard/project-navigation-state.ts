export function resolveProjectNavigationProjectId(params: {
  persistedProjectId: string | null;
  isSwitchingOrganization: boolean;
}): string | null {
  const { persistedProjectId, isSwitchingOrganization } = params;

  if (isSwitchingOrganization) {
    return null;
  }

  return persistedProjectId ?? null;
}

export function resolveCurrentContextLabel(params: {
  isSwitchingOrganization: boolean;
  activeProjectName: string | null;
}): string {
  const { isSwitchingOrganization, activeProjectName } = params;

  if (isSwitchingOrganization) {
    return 'Organization overview';
  }

  return activeProjectName ?? 'Organization overview';
}

export function resolveProjectSectionTitle(params: {
  isSwitchingOrganization: boolean;
  activeProjectName: string | null;
}): string {
  const { isSwitchingOrganization, activeProjectName } = params;

  if (isSwitchingOrganization) {
    return 'Project';
  }

  return activeProjectName ?? 'Project';
}

export function resolveEffectiveContentProjectId(params: {
  routeProjectId: string | null;
  isSwitchingOrganization: boolean;
}): string | null {
  const { routeProjectId, isSwitchingOrganization } = params;

  if (isSwitchingOrganization) {
    return null;
  }

  return routeProjectId ?? null;
}
