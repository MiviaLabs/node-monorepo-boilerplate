import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from './public.decorator';

import type { Request } from 'express';

import { ApiException } from '@/common/errors';

/**
 * Tenant Guard
 *
 * Global guard that validates tenant header presence and format.
 *
 * Key features:
 * - Respects @Public() decorator (public routes bypass tenant validation)
 * - Uses Reflector to access route metadata (works because guards execute after middleware)
 * - Throws API_008 if x-tenant-id header is missing
 * - Throws API_023 if x-tenant-id header is invalid (not a positive integer)
 *
 * Execution order:
 * 1. Middleware executes FIRST (cannot access decorator metadata)
 * 2. Guards execute SECOND (can access decorator metadata via Reflector)
 * 3. This guard checks @Public() decorator, allowing public routes to pass
 *
 * @throws {ApiException} When tenant header is missing (API_008)
 * @throws {ApiException} When tenant header is invalid (API_023)
 *
 * @example
 * ```typescript
 * // In app.module.ts - register as global guard
 * {
 *   provide: APP_GUARD,
 *   useClass: TenantGuard
 * }
 *
 * // Public routes bypass this guard
 * @Public()
 * @Post('login')
 * async login() { ... }
 *
 * // Protected routes require x-tenant-id header
 * @Get('users')
 * async getUsers() { ... }
 * ```
 */
@Injectable()
export class TenantGuard {
  private readonly logger = new Logger(TenantGuard.name);
  private readonly headerName = 'x-tenant-id';

  constructor(private reflector: Reflector) {}

  /**
   * Check if route is public and validate tenant header
   *
   * Returns true for:
   * - Routes marked with @Public() decorator
   * - Swagger documentation paths
   * - Routes with valid x-tenant-id header
   *
   * Throws ApiException for:
   * - Missing x-tenant-id header (API_008)
   * - Invalid x-tenant-id header format (API_023)
   */
  // Bypass tenant validation for Swagger docs paths.
  // Use exact match or trailing-segment match (no prefix-only matching, so
  // /docs-anything, /documentation, /api/docs-internal do NOT bypass tenant).
  private isPublicSwaggerPath(path: string): boolean {
    if (!path) {
      return false;
    }
    const SWAGGER_PUBLIC_PATHS = ['/docs', '/api/docs'];
    for (const p of SWAGGER_PUBLIC_PATHS) {
      if (path === p || path.startsWith(`${p}/`)) {
        return true;
      }
    }
    return false;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.url || request.path;

    // Bypass tenant validation for Swagger docs paths
    if (this.isPublicSwaggerPath(path)) {
      this.logger.debug(`[TenantGuard] Public path detected: ${path}, bypassing tenant validation`);
      return true;
    }

    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      this.logger.debug('[TenantGuard] Public route detected, bypassing tenant validation');
      return true;
    }

    // Validate tenant header for non-public routes
    this.validateTenantHeader(context);

    return true;
  }

  /**
   * Validate tenant header is present and valid format
   * @throws ApiException if tenant header is missing or invalid
   */
  private validateTenantHeader(context: ExecutionContext): void {
    const request = context.switchToHttp().getRequest<Request>();
    const headers = request.headers as Record<string, string | string[] | undefined>;
    const tenantHeader = headers[this.headerName];

    // Handle both string and string[] (Express supports both)
    const tenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;

    if (!tenantId) {
      this.logger.error(`[TenantGuard] Missing required header: ${this.headerName}`);
      throw ApiException.missingRequiredHeader(this.headerName);
    }

    // Validate format: must be a valid positive integer (entire string, not just prefix)
    // Use regex to ensure the entire string is a valid integer (no trailing chars)
    const isValidIntegerFormat = /^\d+$/.test(tenantId.trim());

    if (!isValidIntegerFormat) {
      // Security: Redact tenant ID in logs to prevent log injection
      this.logger.error(`[TenantGuard] Invalid tenant ID format (length: ${tenantId.length})`);
      throw ApiException.tenantIdInvalidFormat(tenantId, 'Must be a valid positive integer');
    }

    // Parse and validate the integer value
    const parsedId = Number.parseInt(tenantId, 10);
    if (Number.isNaN(parsedId) || parsedId <= 0) {
      // Security: Redact tenant ID in logs to prevent log injection
      this.logger.error(`[TenantGuard] Invalid tenant ID value (parsed as NaN or non-positive)`);
      throw ApiException.tenantIdInvalidFormat(tenantId, 'Must be a valid positive integer');
    }

    // Security: Redact tenant ID in logs to prevent log injection
    this.logger.debug(`[TenantGuard] Tenant header validated (id length: ${tenantId.length})`);
  }
}
