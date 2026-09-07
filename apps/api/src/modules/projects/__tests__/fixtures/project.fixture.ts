import { PROJECT_VISIBILITY } from '../../types/project.types';

import type { Project } from '../../types/project.types';

export function createMockProject(overrides: Partial<Project> = {}, id: number = 1): Project {
  const now = new Date('2024-01-01T00:00:00.000Z').toISOString();

  return {
    id,
    organizationId: 12,
    createdBy: 34,
    key: `PRJ${id}`,
    name: 'Test Project',
    visibility: PROJECT_VISIBILITY.PUBLIC,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

export function createMockProjectList(count: number, overrides: Partial<Project> = {}): Project[] {
  return Array.from({ length: count }, (_, index) =>
    createMockProject(
      {
        ...overrides,
        name: overrides.name ?? `Project ${index + 1}`
      },
      index + 1
    )
  );
}

export function createMockPaginatedProjects(options: {
  page?: number;
  pageSize?: number;
  total?: number;
}): {
  data: Project[];
  metadata: {
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  };
} {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const total = options.total ?? pageSize;
  const totalPages = Math.ceil(total / pageSize);

  return {
    data: createMockProjectList(Math.min(pageSize, total)),
    metadata: {
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    }
  };
}
