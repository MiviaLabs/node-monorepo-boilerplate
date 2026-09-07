export const enum ProjectContextNotice {
  UNAVAILABLE = 'unavailable',
  ORGANIZATION_SWITCHED = 'organization-switched'
}

export function parseProjectContextNotice(
  value: string | string[] | undefined
): ProjectContextNotice | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;

  if (normalized === ProjectContextNotice.UNAVAILABLE) {
    return ProjectContextNotice.UNAVAILABLE;
  }

  if (normalized === ProjectContextNotice.ORGANIZATION_SWITCHED) {
    return ProjectContextNotice.ORGANIZATION_SWITCHED;
  }

  return undefined;
}
