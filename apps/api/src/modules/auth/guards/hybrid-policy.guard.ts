import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  Inject,
  Optional,
  type Type
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { CachedPermissionService, REQUIRED_PERMISSIONS_KEY } from '@package/auth';
import { and, eq, isNull, projectMembers, projects, type NodePgDatabase } from '@package/db-core';
import { OpaService } from '@package/opa';

import { EnhancedPermissionsGuard } from './auth.guards';

import type { IAuthzRequest } from '@package/opa';
import type { Request } from 'express';

import { MAIN_DB } from '@/common/database/database.constants';

const enum EnforcementMode {
  OFF = 'off',
  SHADOW = 'shadow',
  HYBRID = 'hybrid',
  STRICT = 'strict'
}

const ENFORCEMENT_MODE_MAP: Readonly<Record<string, EnforcementMode>> = Object.freeze({
  off: EnforcementMode.OFF,
  shadow: EnforcementMode.SHADOW,
  hybrid: EnforcementMode.HYBRID,
  strict: EnforcementMode.STRICT
});

const RESOURCE_KEY = 'opa_resource';
const ACTION_KEY = 'opa_action';
const OPA_SERVICE_TOKEN = 'OPA_SERVICE';

type ProjectAuthorizationResource = {
  id: string;
  ownerId: string;
  organizationId: string;
  visibility: string;
  isMember: boolean;
};

@Injectable()
export class HybridPolicyGuard implements CanActivate {
  private readonly logger = new Logger(HybridPolicyGuard.name);
  private legacyPermissionsGuard?: EnhancedPermissionsGuard;

  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly moduleRef: ModuleRef | undefined,
    @Optional() private readonly cachedPermissionService: CachedPermissionService | undefined,
    @Optional() @Inject(OPA_SERVICE_TOKEN) private readonly opaService: OpaService | undefined,
    @Optional() enhancedPermissionsGuard: EnhancedPermissionsGuard | undefined,
    @Optional() @Inject(MAIN_DB) private readonly db: NodePgDatabase | undefined
  ) {
    this.legacyPermissionsGuard = enhancedPermissionsGuard;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.getEnforcementMode();

    const resourceMetadata = this.reflector.getAllAndOverride<{ type: string; scope?: string }>(
      RESOURCE_KEY,
      [context.getHandler(), context.getClass()]
    );
    const actionMetadata = this.reflector.getAllAndOverride<string>(ACTION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const hasOpaMetadata = Boolean(resourceMetadata && actionMetadata);
    this.logger.debug(
      `mode=${mode} rawMode="${process.env['OPA_ENFORCEMENT_MODE'] ?? 'undefined'}" opaService=${this.opaService ? 'present' : 'missing'} metadata=${hasOpaMetadata ? 'present' : 'missing'} route=${this.getRouteLabel(context)}`
    );

    if (mode === EnforcementMode.OFF) {
      return this.evaluateLegacyGuard(context);
    }
    if (!this.opaService) {
      if (mode === EnforcementMode.STRICT) {
        throw new ForbiddenException('OPA service unavailable in strict enforcement mode');
      }
      this.logger.warn(
        `OpaService unavailable for ${this.getRouteLabel(context)}; falling back to legacy guard`
      );
      return this.evaluateLegacyGuard(context);
    }

    if (!hasOpaMetadata) {
      if (mode === EnforcementMode.STRICT) {
        throw new ForbiddenException('OPA metadata missing for protected endpoint');
      }
      this.logger.warn(
        `Missing OPA metadata for ${this.getRouteLabel(context)}; falling back to legacy guard`
      );
      return this.evaluateLegacyGuard(context);
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: Record<string, unknown> }>();
    const authzRequest = await this.buildAuthzRequest(request, resourceMetadata, actionMetadata);

    if (mode === EnforcementMode.SHADOW) {
      return this.evaluateShadow(context, authzRequest);
    }

    const opaAllowed = await this.opaService.isAuthorized(authzRequest);
    if (opaAllowed) {
      return true;
    }

    if (mode === EnforcementMode.STRICT) {
      throw new ForbiddenException('Access denied by policy');
    }

    const opaHealthy = await this.opaService.healthCheck();
    if (opaHealthy) {
      throw new ForbiddenException('Access denied by policy');
    }

    this.logger.warn(`OPA unavailable for ${this.getRouteLabel(context)}; applying RBAC fallback`);
    return this.evaluateLegacyGuard(context);
  }

  private async evaluateShadow(
    context: ExecutionContext,
    authzRequest: IAuthzRequest
  ): Promise<boolean> {
    const opaAllowed = this.opaService ? await this.opaService.isAuthorized(authzRequest) : false;
    const legacyResult = await this.evaluateLegacyGuardResult(context);

    this.logger.debug(
      `shadow route=${this.getRouteLabel(context)} opaAllowed=${String(opaAllowed)} legacyAllowed=${String(legacyResult.allowed)} user=${authzRequest.user.id} tenant=${authzRequest.user.organization_id ?? 'none'} perms=${(authzRequest.user.permissions ?? []).join('|')}`
    );
    if (!legacyResult.allowed) {
      this.logger.warn(
        `shadow legacy deny route=${this.getRouteLabel(context)} reason=${legacyResult.error?.message ?? 'unknown'}`
      );
    }

    if (opaAllowed !== legacyResult.allowed) {
      this.logShadowMismatch(context, authzRequest, opaAllowed, legacyResult.allowed);
    }

    if (!legacyResult.allowed) {
      throw legacyResult.error ?? new ForbiddenException('Access denied by legacy RBAC');
    }

    return true;
  }

  private async evaluateLegacyGuard(context: ExecutionContext): Promise<boolean> {
    const legacyResult = await this.evaluateLegacyGuardResult(context);
    if (!legacyResult.allowed) {
      throw legacyResult.error ?? new ForbiddenException('Access denied by legacy RBAC');
    }
    return true;
  }

  private async evaluateLegacyGuardResult(
    context: ExecutionContext
  ): Promise<{ allowed: boolean; error?: ForbiddenException }> {
    const legacyGuard = this.resolveLegacyPermissionsGuard();
    if (legacyGuard) {
      try {
        const allowed = await legacyGuard.canActivate(context);
        return { allowed };
      } catch (error) {
        if (error instanceof ForbiddenException) {
          return { allowed: false, error };
        }
        throw error;
      }
    }

    try {
      const allowed = await this.evaluateLegacyPermissionsInline(context);
      return { allowed };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return { allowed: false, error };
      }
      throw error;
    }
  }

  private async evaluateLegacyPermissionsInline(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: {
        userId?: number | string;
        permissions?: string[];
      };
      tenantContext?: {
        tenantId?: number | string;
      };
    }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }
    if (!user.userId) {
      throw new ForbiddenException('Invalid user context');
    }

    const tenantId = request.tenantContext?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context not set. Please provide x-tenant-id header.');
    }

    if (Array.isArray(user.permissions) && user.permissions.length > 0) {
      const permissions = user.permissions; // Type narrowing: guaranteed array here
      const hasWildcard = permissions.includes('*');
      const granted = requiredPermissions.every((permission) =>
        hasWildcard ? true : permissions.includes(permission)
      );
      if (!granted) {
        const missing = requiredPermissions.filter((p) => !permissions.includes(p));
        throw new ForbiddenException(`Missing required permissions: ${missing.join(', ')}`);
      }
      return true;
    }

    if (!this.cachedPermissionService) {
      throw new ForbiddenException('Legacy permission service unavailable');
    }

    const userIdNum =
      typeof user.userId === 'string' ? Number.parseInt(user.userId, 10) : user.userId;
    const tenantIdNum = typeof tenantId === 'string' ? Number.parseInt(tenantId, 10) : tenantId;
    const resolvedPermissions = await this.cachedPermissionService.getUserPermissions(
      userIdNum,
      tenantIdNum
    );
    const hasWildcard = resolvedPermissions.includes('*');
    const granted = requiredPermissions.every((permission) =>
      hasWildcard ? true : resolvedPermissions.includes(permission)
    );

    if (!granted) {
      throw new ForbiddenException(
        `Missing required permissions. Need all of: ${requiredPermissions.join(', ')}`
      );
    }

    return true;
  }

  private resolveLegacyPermissionsGuard(): EnhancedPermissionsGuard | undefined {
    if (this.legacyPermissionsGuard) {
      return this.legacyPermissionsGuard;
    }
    if (!this.moduleRef) {
      return undefined;
    }

    try {
      const resolved = this.moduleRef.get<EnhancedPermissionsGuard>(
        EnhancedPermissionsGuard as Type<EnhancedPermissionsGuard>,
        { strict: false }
      );
      this.legacyPermissionsGuard = resolved;
      return resolved;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve EnhancedPermissionsGuard lazily: ${error instanceof Error ? error.message : String(error)}`
      );
      return undefined;
    }
  }

  private async buildAuthzRequest(
    request: Request & {
      user?: Record<string, unknown>;
      tenantContext?: Record<string, unknown>;
    },
    resourceMetadata: { type: string; scope?: string },
    actionMetadata: string
  ): Promise<IAuthzRequest> {
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userId = this.toPrimitiveString(user['userId'] ?? user['id']);
    if (!userId) {
      throw new ForbiddenException('Invalid user context');
    }

    const tenantId = this.getTenantId(request, user);
    const paramId = this.extractParamId(request.params as Record<string, string> | undefined);
    const projectResource = await this.resolveProjectAuthorizationResource(
      resourceMetadata.type,
      paramId,
      tenantId,
      userId
    );

    return {
      user: {
        id: userId,
        system_roles: this.extractSystemRoles(user),
        tenant_roles: this.extractTenantRoles(user),
        organization_id: tenantId,
        permissions: this.toStringArray(user['permissions']),
        attributes:
          user['attributes'] && typeof user['attributes'] === 'object'
            ? (user['attributes'] as Record<string, unknown>)
            : undefined
      },
      resource: {
        type: resourceMetadata.type,
        scope: resourceMetadata.scope ?? 'tenant',
        id: projectResource?.id ?? paramId,
        owner_id:
          projectResource?.ownerId ??
          this.extractOwnerId(request.params as Record<string, string> | undefined),
        organization_id: projectResource?.organizationId ?? tenantId ?? undefined,
        attributes:
          projectResource !== undefined
            ? {
                visibility: projectResource.visibility,
                is_member: projectResource.isMember
              }
            : undefined
      },
      action: actionMetadata
    };
  }

  private async resolveProjectAuthorizationResource(
    resourceType: string,
    projectId: string | undefined,
    tenantId: string | null,
    userId: string
  ): Promise<ProjectAuthorizationResource | undefined> {
    if (!this.db || resourceType !== 'projects' || !projectId || !tenantId) {
      return undefined;
    }

    const parsedProjectId = Number.parseInt(projectId, 10);
    const parsedTenantId = Number.parseInt(tenantId, 10);
    const parsedUserId = Number.parseInt(userId, 10);
    if (
      !Number.isInteger(parsedProjectId) ||
      parsedProjectId <= 0 ||
      !Number.isInteger(parsedTenantId) ||
      parsedTenantId <= 0 ||
      !Number.isInteger(parsedUserId) ||
      parsedUserId <= 0
    ) {
      return undefined;
    }

    const [project] = await this.db
      .select({
        id: projects.id,
        ownerId: projects.createdBy,
        organizationId: projects.organizationId,
        visibility: projects.visibility,
        memberUserId: projectMembers.userId
      })
      .from(projects)
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, parsedUserId))
      )
      .where(
        and(
          eq(projects.id, parsedProjectId),
          eq(projects.organizationId, parsedTenantId),
          isNull(projects.deletedAt)
        )
      )
      .limit(1);

    if (!project) {
      return undefined;
    }

    return {
      id: String(project.id),
      ownerId: String(project.ownerId),
      organizationId: String(project.organizationId),
      visibility: project.visibility,
      isMember: project.memberUserId !== null
    };
  }

  private getTenantId(
    request: Request & { tenantContext?: Record<string, unknown> },
    user: Record<string, unknown>
  ): string | null {
    const tenantHeader = request.headers['x-tenant-id'];
    const headerTenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
    const tenantId =
      user['tenantId'] ??
      user['organization_id'] ??
      request.tenantContext?.['tenantId'] ??
      headerTenantId;
    if (tenantId == null) {
      return null;
    }
    return this.toPrimitiveString(tenantId);
  }

  private extractParamId(params?: Record<string, string>): string | undefined {
    if (!params) {
      return undefined;
    }

    if (params['id']) {
      return params['id'];
    }

    for (const [key, value] of Object.entries(params)) {
      if (key.toLowerCase().endsWith('id') && value) {
        return value;
      }
    }

    return undefined;
  }

  private extractOwnerId(params?: Record<string, string>): string | undefined {
    if (!params) {
      return undefined;
    }

    return params['userId'] ?? params['ownerId'];
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private extractSystemRoles(user: Record<string, unknown>): string[] {
    const explicitRoles = this.toStringArray(user['systemRoles'] ?? user['system_roles']);
    if (explicitRoles.length > 0) {
      return explicitRoles;
    }

    return this.toStringArray(user['roles']).filter((role) => role.startsWith('system_'));
  }

  private extractTenantRoles(user: Record<string, unknown>): string[] {
    const explicitRoles = this.toStringArray(user['tenantRoles'] ?? user['tenant_roles']);
    if (explicitRoles.length > 0) {
      return explicitRoles;
    }

    return this.toStringArray(user['roles']).filter((role) => role.startsWith('tenant_'));
  }

  private toPrimitiveString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : '';
    }
    return '';
  }

  private getEnforcementMode(): EnforcementMode {
    const rawMode = process.env['OPA_ENFORCEMENT_MODE'] ?? 'off';
    const mode = (rawMode.split('#')[0]?.trim().split(/\s+/)[0]?.toLowerCase() ?? 'off') as string;
    const resolved = ENFORCEMENT_MODE_MAP[mode];
    if (resolved) {
      return resolved;
    }

    this.logger.warn(`Invalid OPA_ENFORCEMENT_MODE "${rawMode}", defaulting to "off"`);
    return EnforcementMode.OFF;
  }

  private getRouteLabel(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<Request>();
    return `${request.method ?? 'UNKNOWN'} ${request.url ?? 'unknown-route'}`;
  }

  private logShadowMismatch(
    context: ExecutionContext,
    authzRequest: IAuthzRequest,
    opaAllowed: boolean,
    legacyAllowed: boolean
  ): void {
    const payload = {
      event: 'opa_shadow_mismatch',
      route: this.getRouteLabel(context),
      resource: authzRequest.resource.type,
      action: authzRequest.action,
      userId: authzRequest.user.id,
      tenantId: authzRequest.user.organization_id,
      opaAllowed,
      legacyAllowed
    };
    this.logger.warn(JSON.stringify(payload));
  }
}
