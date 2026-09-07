import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  PROJECT_SORT_BY,
  PROJECT_SORT_ORDER,
  PROJECT_VISIBILITY,
  type AddProjectMemberInput,
  type CreateProjectInput,
  type Project,
  type ProjectMember,
  type ProjectsResponse,
  type ProjectVisibility
} from '../../../types/project.types';
import { createTRPCRouter, publicProcedure } from '../trpc';

import { resolveServerRequestAuthContextFromHeaders } from '~/lib/auth/server-request-auth';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const projectVisibilitySchema = z.enum([PROJECT_VISIBILITY.PUBLIC, PROJECT_VISIBILITY.PRIVATE]);

const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().trim().max(255).optional(),
  visibility: projectVisibilitySchema.optional(),
  sortBy: z
    .enum([
      PROJECT_SORT_BY.NAME,
      PROJECT_SORT_BY.CREATED_AT,
      PROJECT_SORT_BY.UPDATED_AT,
      PROJECT_SORT_BY.VISIBILITY
    ])
    .default(PROJECT_SORT_BY.UPDATED_AT),
  sortOrder: z
    .enum([PROJECT_SORT_ORDER.ASC, PROJECT_SORT_ORDER.DESC])
    .default(PROJECT_SORT_ORDER.DESC)
});

const projectMutationSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(255),
  visibility: projectVisibilitySchema
});

const updateProjectSchema = projectMutationSchema.extend({
  projectId: z.string().regex(/^\d+$/, 'Invalid project ID')
});

const deleteProjectSchema = z.object({
  projectId: z.string().regex(/^\d+$/, 'Invalid project ID')
});

const getProjectSchema = z.object({
  projectId: z.string().regex(/^\d+$/, 'Invalid project ID')
});

const bulkProjectMembersSchema = z.object({
  projectIds: z.array(z.string().regex(/^\d+$/, 'Invalid project ID')).max(100)
});

const addProjectMemberSchema = z.object({
  projectId: z.string().regex(/^\d+$/, 'Invalid project ID'),
  userId: z.number().int().positive()
});

const removeProjectMemberSchema = z.object({
  projectId: z.string().regex(/^\d+$/, 'Invalid project ID'),
  memberId: z.string().regex(/^\d+$/, 'Invalid member ID')
});

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  ctx: { headers: Headers }
): Promise<T> {
  const apiBaseUrl = getVersionedApiBaseUrl('v1');
  const url = `${apiBaseUrl}${endpoint}`;
  const resolvedAuth = await resolveServerRequestAuthContextFromHeaders(ctx.headers, {
    source: 'web.trpc.projects_router',
    route: endpoint
  });
  const authHeader =
    ctx.headers.get('authorization') ??
    (resolvedAuth?.accessToken ? `Bearer ${resolvedAuth.accessToken}` : null);
  const tenantId = ctx.headers.get('x-tenant-id') ?? resolvedAuth?.tenantId;

  if (!authHeader || !tenantId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      'x-tenant-id': tenantId,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'An unknown error occurred'
    }));

    console.error('[Projects API Error]', {
      endpoint,
      status: response.status,
      serverError: error
    });

    const code =
      response.status === 404
        ? 'NOT_FOUND'
        : response.status === 403
          ? 'FORBIDDEN'
          : response.status === 401
            ? 'UNAUTHORIZED'
            : 'BAD_REQUEST';

    const safeMessages: Record<typeof code, string> = {
      NOT_FOUND: 'The requested project was not found',
      FORBIDDEN: 'You do not have permission to perform this action',
      UNAUTHORIZED: 'Authentication required',
      BAD_REQUEST: 'Invalid request parameters'
    };

    throw new TRPCError({
      code,
      message: safeMessages[code]
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const json = await response.json();
  return (json as { data: T }).data;
}

function normalizeVisibility(visibility: unknown): ProjectVisibility {
  return visibility === PROJECT_VISIBILITY.PRIVATE
    ? PROJECT_VISIBILITY.PRIVATE
    : PROJECT_VISIBILITY.PUBLIC;
}

function normalizeProject(rawProject: unknown): Project {
  const project = (rawProject ?? {}) as Record<string, unknown>;

  return {
    id: String(project['id'] ?? ''),
    organizationId: String(project['organizationId'] ?? project['organization_id'] ?? ''),
    createdBy: String(project['createdBy'] ?? project['created_by'] ?? ''),
    key: String(project['key'] ?? ''),
    name: String(project['name'] ?? ''),
    visibility: normalizeVisibility(project['visibility']),
    isMember:
      typeof project['isMember'] === 'boolean'
        ? project['isMember']
        : typeof project['is_member'] === 'boolean'
          ? project['is_member']
          : undefined,
    createdAt: String(project['createdAt'] ?? project['created_at'] ?? new Date().toISOString()),
    updatedAt: String(project['updatedAt'] ?? project['updated_at'] ?? new Date().toISOString())
  };
}

function normalizeProjectMember(rawMember: unknown): ProjectMember {
  const member = (rawMember ?? {}) as Record<string, unknown>;

  return {
    userId: String(member['userId'] ?? member['user_id'] ?? ''),
    displayName:
      typeof member['displayName'] === 'string'
        ? member['displayName']
        : member['displayName'] === null
          ? null
          : typeof member['name'] === 'string'
            ? member['name']
            : null,
    photoUrl:
      typeof member['photoUrl'] === 'string'
        ? member['photoUrl']
        : member['photoUrl'] === null
          ? null
          : typeof member['avatarUrl'] === 'string'
            ? member['avatarUrl']
            : null,
    isCreator: Boolean(member['isCreator'] ?? member['is_creator'] ?? false),
    assignedAt: String(member['assignedAt'] ?? member['assigned_at'] ?? new Date().toISOString())
  };
}

function normalizeProjectsResponse(
  raw: unknown,
  fallbackPage: number,
  fallbackPageSize: number
): ProjectsResponse {
  const obj = raw as {
    data?: unknown;
    items?: unknown;
    meta?: ProjectsResponse['meta'];
    metadata?: { pagination?: ProjectsResponse['meta'] };
  };

  const rawData =
    (Array.isArray(raw) ? raw : undefined) ??
    (Array.isArray(obj?.data) ? obj.data : undefined) ??
    (Array.isArray(obj?.items) ? obj.items : undefined) ??
    [];

  const data = rawData.map((project) => normalizeProject(project));
  const pagination = obj?.meta ?? obj?.metadata?.pagination;
  const total = pagination?.total ?? data.length;
  const pageSize = pagination?.pageSize ?? fallbackPageSize;
  const totalPages =
    pagination?.totalPages ?? (total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize)));

  return {
    data,
    meta: {
      page: pagination?.page ?? fallbackPage,
      pageSize,
      total,
      totalPages,
      hasNext: pagination?.hasNext ?? fallbackPage < totalPages,
      hasPrevious: pagination?.hasPrevious ?? fallbackPage > 1
    }
  };
}

export const projectsRouter = createTRPCRouter({
  list: publicProcedure
    .input(paginationSchema)
    .query(async ({ input, ctx }): Promise<ProjectsResponse> => {
      const params = new URLSearchParams({
        page: String(input.page),
        pageSize: String(input.pageSize),
        sortBy: input.sortBy,
        sortOrder: input.sortOrder
      });
      if (input.search) params.set('search', input.search.trim());
      if (input.visibility) params.set('visibility', input.visibility);
      const raw = await apiRequest<unknown>(
        `/spaces?${params.toString()}`,
        { method: 'GET' },
        ctx
      );
      return normalizeProjectsResponse(raw, input.page, input.pageSize);
    }),

  get: publicProcedure.input(getProjectSchema).query(async ({ input, ctx }): Promise<Project> => {
    const project = await apiRequest<unknown>(
      `/spaces/${input.projectId}`,
      { method: 'GET' },
      ctx
    );
    return normalizeProject(project);
  }),

  create: publicProcedure
    .input(projectMutationSchema)
    .mutation(async ({ input, ctx }): Promise<Project> => {
      const payload: CreateProjectInput = {
        name: input.name.trim(),
        visibility: input.visibility
      };

      const project = await apiRequest<unknown>(
        '/spaces',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        },
        ctx
      );

      return normalizeProject(project);
    }),

  listMembers: publicProcedure
    .input(getProjectSchema)
    .query(async ({ input, ctx }): Promise<ProjectMember[]> => {
      const members = await apiRequest<unknown[]>(
        `/spaces/${input.projectId}/members`,
        { method: 'GET' },
        ctx
      );

      return members.map((member) => normalizeProjectMember(member));
    }),

  listMembersBulk: publicProcedure
    .input(bulkProjectMembersSchema)
    .query(async ({ input, ctx }): Promise<Record<string, ProjectMember[]>> => {
      const normalizedProjectIds = Array.from(new Set(input.projectIds));

      if (normalizedProjectIds.length === 0) {
        return {};
      }

      const membersByProject = await apiRequest<Record<string, unknown[]>>(
        `/spaces/members/bulk?projectIds=${encodeURIComponent(normalizedProjectIds.join(','))}`,
        { method: 'GET' },
        ctx
      );

      return Object.fromEntries(
        normalizedProjectIds.map((projectId) => [
          projectId,
          (membersByProject[projectId] ?? []).map((member) => normalizeProjectMember(member))
        ])
      );
    }),

  addMember: publicProcedure
    .input(addProjectMemberSchema)
    .mutation(async ({ input, ctx }): Promise<ProjectMember> => {
      const payload: AddProjectMemberInput = {
        projectId: input.projectId,
        userId: input.userId
      };

      const member = await apiRequest<unknown>(
        `/spaces/${payload.projectId}/members`,
        {
          method: 'POST',
          body: JSON.stringify({
            userId: payload.userId
          })
        },
        ctx
      );

      return normalizeProjectMember(member);
    }),

  removeMember: publicProcedure
    .input(removeProjectMemberSchema)
    .mutation(async ({ input, ctx }): Promise<void> => {
      await apiRequest<void>(
        `/spaces/${input.projectId}/members/${input.memberId}`,
        {
          method: 'DELETE'
        },
        ctx
      );
    }),

  update: publicProcedure
    .input(updateProjectSchema)
    .mutation(async ({ input, ctx }): Promise<Project> => {
      const project = await apiRequest<unknown>(
        `/spaces/${input.projectId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: input.name.trim(),
            visibility: input.visibility
          })
        },
        ctx
      );

      return normalizeProject(project);
    }),

  delete: publicProcedure
    .input(deleteProjectSchema)
    .mutation(async ({ input, ctx }): Promise<void> => {
      await apiRequest<void>(
        `/spaces/${input.projectId}`,
        {
          method: 'DELETE'
        },
        ctx
      );
    })
});
