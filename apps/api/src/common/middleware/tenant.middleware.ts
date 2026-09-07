import { Injectable, Logger, NestMiddleware, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  isAuthRoute,
  isBootstrapRoute,
  isEmailWebhookRoute,
  isHealthRoute,
  isRootOrAsset,
  isSwaggerRoute
} from '../constants';
import { ApiException } from '../errors';
import { runWithTenantContext, type TenantContext } from './tenant-context.storage';
import { TenantResolutionService } from '../services/tenant-resolution.service';
import { VersionService } from '../services/version.service';

import type { Request, Response, NextFunction } from 'express';

/**
 * API headers
 */
const API_HEADERS = {
  X_TENANT_ID: 'x-tenant-id'
} as const;

const DEFAULT_PUBLIC_API_VERSIONS: Array<{ prefix: string }> = [{ prefix: 'v1' }];
/**
 * Request interface with user
 */
interface RequestWithUser extends Omit<Request, 'headers' | 'path' | 'url'> {
  headers: Record<string, string | string[] | undefined>;
  path?: string;
  url?: string;
  user?: {
    id?: string;
    roles?: string[];
  };
  tenantContext?: TenantContext;
}

/**
 * Middleware to extract tenant context from request headers
 * and store it in AsyncLocalStorage for request-scoped access
 *
 * **CRITICAL:** This middleware is now ASYNCHRONOUS for tenant validation
 *
 * Tenant resolution strategy:
 * - Header-based: Extract from x-tenant-id header (direct tenant lookup)
 *
 * Public routes are dynamically determined based on:
 * 1. Swagger documentation paths (/api/docs/*)
 * 2. Health endpoints for all configured API versions
 * 3. Root path for Swagger UI relative asset loading
 * 4. Browser assets (favicon, robots.txt)
 *
 * @example
 * ```typescript
 * // Request with header: x-tenant-id: 123
 * // Middleware validates tenant 123 exists and is active
 * // Tenant context stored in AsyncLocalStorage
 * ```
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);
  private readonly headerName: string;

  constructor(
    @Optional() private readonly configService: ConfigService,
    @Optional() private readonly versionService: VersionService,
    @Optional() private readonly tenantResolution: TenantResolutionService
  ) {
    // Allow configurable header name (default: x-tenant-id)
    // Use optional chaining in case ConfigService is not available (e.g., in tests)
    this.headerName =
      this.configService?.get<string>('TENANT_HEADER_NAME') ?? API_HEADERS.X_TENANT_ID;
  }

  /**
   * **CRITICAL:** Changed from synchronous to asynchronous
   *
   * Original signature: use(req: RequestWithUser, _res: Response, next: NextFunction): void
   * Updated signature: async use(req: RequestWithUser, _res: Response, next: NextFunction): Promise<void>
   *
   * This change enables database validation of tenant existence and status.
   */
  // eslint-disable-next-line complexity
  async use(req: RequestWithUser, _res: Response, next: NextFunction): Promise<void> {
    // CRITICAL: Clear any existing tenantContext from the request object
    // This prevents context leaking between requests in test environments where
    // request objects might be reused by supertest
    const previousContext = req.tenantContext;
    delete req.tenantContext;

    if (previousContext) {
      this.logger.warn(
        `[TenantMiddleware] WARNING: Found existing tenantContext on request: ${JSON.stringify(previousContext)}`
      );
    }

    // CRITICAL: Check if route is public BEFORE extracting tenant ID
    // Public routes (auth, health, docs) don't require tenant header
    if (this.isPublicRoute(req)) {
      this.logger.debug('[TenantMiddleware] Public route detected, allowing without tenant');
      next();
      return;
    }

    // Extract tenant ID from x-tenant-id header (only for non-public routes)
    const tenantId = this.extractTenantId(req);

    this.logger.debug(`[TenantMiddleware] Extracted: tenantId=${tenantId}`);

    // Validate that we have tenant ID for non-public routes
    if (!tenantId) {
      this.logger.error('[TenantMiddleware] No tenant header found, throwing API_008');
      throw ApiException.missingRequiredHeader(this.headerName);
    }

    // Validate tenant ID is a string
    if (typeof tenantId !== 'string') {
      this.logger.error('[TenantMiddleware] Invalid tenant type, throwing API_002');
      throw ApiException.tenantContextInvalid();
    }

    let tenant: Awaited<ReturnType<typeof this.tenantResolution.validateTenant>> | undefined;

    // Header-based resolution (direct tenant lookup)
    if (this.tenantResolution) {
      try {
        tenant = await this.tenantResolution.validateTenant(tenantId);
      } catch (error) {
        // Re-throw ApiException for proper error handling
        if (error instanceof ApiException) {
          throw error;
        }
        // Log unexpected errors but don't expose details
        this.logger.error(`Tenant resolution failed for ID ${tenantId}`, error);
        throw ApiException.tenantNotFound(tenantId);
      }
    }

    // Fallback: If tenant resolution is not available (e.g., tests, dev mode)
    // Allow request to proceed with header value (skip validation)
    if (!tenant && !this.tenantResolution) {
      this.logger.warn(
        `TenantResolutionService not available, skipping validation for tenant ${tenantId}`
      );
      const context: TenantContext = {
        tenantId,
        tenantSlug: '', // Not resolved without service
        ...(req.user?.id !== undefined && { userId: req.user.id }),
        ...(req.user?.roles !== undefined && { userRoles: req.user.roles })
      };

      runWithTenantContext(context, () => {
        req.tenantContext = context;
        next();
      });
      return;
    }

    // If we still don't have a tenant, resolution failed
    if (!tenant) {
      throw ApiException.tenantNotFound(tenantId);
    }

    // Create tenant context
    // CRITICAL: Use organization.id (NOT tenant.id) for tenantId
    // The entire codebase uses organization.id for tenant scoping:
    // - users.organizationId references organizations.id
    // - x-tenant-id header contains organization.id
    // - All repository queries filter by organizationId
    const context: TenantContext = {
      tenantId: tenant.organization?.id?.toString() ?? tenant.id.toString(),
      tenantSlug: tenant.organization?.slug ?? '',
      tenantType: tenant.type,
      ...(req.user?.id !== undefined && { userId: req.user.id }),
      ...(req.user?.roles !== undefined && { userRoles: req.user.roles })
    };

    // Run request with tenant context
    runWithTenantContext(context, () => {
      // Attach context to request for direct access
      req.tenantContext = context;
      next();
    });
  }

  /**
   * Extract tenant ID from request headers
   *
   * Returns the raw header value for validation.
   * Invalid values (zero, negative, non-numeric) are returned as-is
   * so the validation layer can throw the appropriate error (API_023).
   * Handles both string and string[] header values.
   */
  private extractTenantId(req: RequestWithUser): string | undefined {
    const headers = req.headers as Record<string, string | string[]>;
    const headerValue = headers[this.headerName];

    // Handle both string and string[] (Express supports both)
    const tenantId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    // Return the value if present (even if invalid)
    // Validation happens in tenantResolution.validateTenant() which throws API_023
    if (tenantId && typeof tenantId === 'string') {
      return tenantId;
    }

    return undefined;
  }

  /**
   * Check if route is public (doesn't require tenant header)
   *
   * This method dynamically determines public routes based on:
   * - Swagger documentation paths (all versions)
   * - Health endpoints for all configured API versions
   * - Auth endpoints (login, register, logout, etc.)
   * - Root path for Swagger UI relative asset loading
   * - Browser assets (favicon, robots.txt)
   *
   * TEMPORARY: Also includes tRPC auth paths for backward compatibility
   * TODO: Remove tRPC path check once web app deployment is updated
   */
  private isPublicRoute(req: RequestWithUser): boolean {
    const path = (req.path ?? req.url ?? '').split('?')[0] ?? '';
    const versions = this.versionService?.getAllVersions();
    const publicRouteVersions =
      versions && versions.length > 0 ? versions : DEFAULT_PUBLIC_API_VERSIONS;

    return (
      isSwaggerRoute(path) ||
      this.isVersionedHealthRoute(path, publicRouteVersions) ||
      this.isVersionedAuthRoute(path, publicRouteVersions) ||
      this.isVersionedBootstrapRoute(path, publicRouteVersions) ||
      this.isVersionedWebhookRoute(path, publicRouteVersions) ||
      isRootOrAsset(path) ||
      this.isTrpcAuthRoute(path) // TEMPORARY: for direct tRPC calls
    );
  }

  /**
   * TEMPORARY: Check if path is a tRPC auth endpoint
   * TODO: Remove once web app uses Next.js API routes instead of direct backend calls
   */
  private isTrpcAuthRoute(path: string): boolean {
    return (
      path.startsWith('/api/trpc/auth.') || // tRPC mutations: auth.register, auth.login, etc.
      path.startsWith('/trpc/auth.') || // Without /api prefix
      path === '/api/trpc' || // tRPC batch endpoint
      path === '/trpc'
    );
  }

  /**
   * Check if path is a versioned health endpoint
   * Uses exact matching for security - prevents unintended routes like /api/v1/healthcheck from matching
   */
  private isVersionedHealthRoute(path: string, versions: Array<{ prefix: string }>): boolean {
    if (isHealthRoute(path)) {
      return true;
    }

    // Use exact matching only - no startsWith to prevent false positives
    return versions.some(
      (v) => path === `/api/${v.prefix}/ops/health` || path === `/${v.prefix}/ops/health`
    );
  }

  /**
   * Check if path is a versioned auth endpoint
   */
  private isVersionedAuthRoute(path: string, versions: Array<{ prefix: string }>): boolean {
    return versions.some((v) => isAuthRoute(path, v.prefix));
  }

  private isVersionedBootstrapRoute(path: string, versions: Array<{ prefix: string }>): boolean {
    return versions.some((v) => isBootstrapRoute(path, v.prefix));
  }

  private isVersionedWebhookRoute(path: string, versions: Array<{ prefix: string }>): boolean {
    const apiPrefix = (this.configService?.get<string>('API_PREFIX') ?? 'api').trim();
    return versions.some((v) => isEmailWebhookRoute(path, v.prefix, apiPrefix));
  }
}
