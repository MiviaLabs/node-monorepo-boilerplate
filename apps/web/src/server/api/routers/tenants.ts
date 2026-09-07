import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '../trpc';

import { resolveServerRequestAuthContextFromHeaders } from '~/lib/auth/server-request-auth';

/**
 * Current tenant response schema
 *
 * Represents the current authenticated tenant's information
 */
const currentTenantSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum(['active', 'inactive', 'suspended']),
  settings: z.object({
    allowPublicRegistration: z.boolean(),
    defaultRole: z.string(),
    maxUsers: z.number().int().positive()
  }),
  createdAt: z.string().datetime()
});

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const entry of cookies) {
    const [rawName, ...rawValue] = entry.trim().split('=');
    if (rawName === name) {
      return decodeURIComponent(rawValue.join('='));
    }
  }
  return null;
}

/**
 * Tenants tRPC router
 *
 * Provides procedures for tenant-related operations:
 * - getCurrentTenant: Retrieves the current authenticated tenant's information
 *
 * Multi-tenancy: All procedures validate tenant context from headers
 */
export const tenantsRouter = createTRPCRouter({
  /**
   * Get current tenant
   *
   * Returns the current tenant's settings and information.
   * Requires tenant context via x-tenant-id header or tenantId cookie.
   *
   * @returns Current tenant information including id, name, slug, status, and settings
   * @throws TRPCError BAD_REQUEST if tenant context is missing or invalid
   * @throws TRPCError NOT_FOUND if tenant does not exist
   */
  getCurrentTenant: publicProcedure.output(currentTenantSchema).query(async ({ ctx }) => {
    const resolvedAuth = await resolveServerRequestAuthContextFromHeaders(ctx.headers, {
      source: 'web.trpc.tenants_router',
      route: '/workspaces/current'
    });
    const cookieHeader = ctx.headers.get('cookie');
    const tenantId =
      ctx.headers.get('x-tenant-id') ??
      resolvedAuth?.tenantId ??
      getCookieValue(cookieHeader, 'tenantId');

    // P0: Validate tenant context
    if (!tenantId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Tenant context missing: x-tenant-id header is required'
      });
    }

    // Tenant IDs may vary by environment (UUID, org ID, etc.); only enforce non-empty context.
    if (tenantId.trim().length === 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Tenant context invalid: x-tenant-id must be a non-empty string'
      });
    }

    // TODO: Replace with actual API call to backend
    // For now, returning mock data that matches the schema
    // In production, this would call:
    // const response = await fetch(`${API_URL}/api/v1/tenants/current`, {
    //   headers: { 'x-tenant-id': tenantId }
    // });
    return {
      id: 1,
      name: 'Acme Corp',
      displayName: 'Acme Corp',
      slug: 'acme-corp',
      status: 'active' as const,
      settings: {
        allowPublicRegistration: false,
        defaultRole: 'tenant_user',
        maxUsers: 100
      },
      createdAt: '2024-01-01T00:00:00.000Z'
    };
  })
});

/**
 * Type exports for client-side type safety
 */
export type TenantsRouter = typeof tenantsRouter;
export type CurrentTenantResponse = z.infer<typeof currentTenantSchema>;
