import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OpaService } from '../opa.service';
import { RESOURCE_KEY, ACTION_KEY } from '../decorators';

/**
 * OPA Authorization Guard
 *
 * This guard implements policy-based authorization using Open Policy Agent (OPA).
 * It reads @Resource() and @Action() decorator metadata and queries OPA for
 * authorization decisions.
 *
 * ## Authorization Flow
 *
 * 1. Extract @Resource() and @Action() metadata from Reflector
 * 2. Get authenticated user from request.user (set by JwtAuthGuard)
 * 3. Build IAuthzRequest with user, resource, and action
 * 4. Query OPA for authorization decision
 * 5. Allow access if OPA returns true, deny otherwise
 *
 * ## Usage
 *
 * ```typescript
 * @Controller('users')
 * @UseGuards(JwtAuthGuard, OpaGuard)  // Auth first, then OPA
 * @Resource({ type: 'users', scope: 'tenant' })
 * export class UsersController {
 *   @Get()
 *   @Action('list')
 *   findAll() { ... }
 * }
 * ```
 *
 * ## Fail-Closed Security
 *
 * When OPA is unavailable or times out, this guard DENIES access by default.
 * This ensures security is not compromised during outages.
 *
 * @see {@link OpaCachedGuard} for cached version (high-traffic endpoints)
 * @see {@link Resource} decorator for resource metadata
 * @see {@link Action} decorator for action metadata
 */
@Injectable()
export class OpaGuard implements CanActivate {
  private readonly logger = new Logger(OpaGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly opaService: OpaService
  ) {}

  /**
   * Determines if the current request is authorized.
   *
   * @param context - Execution context containing request details
   * @returns Promise resolving to true if authorized
   * @throws {ForbiddenException} When authorization check fails or is denied
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Extract resource and action metadata from decorators
    const resourceMetadata = this.reflector.getAllAndOverride<{ type: string; scope?: string }>(
      RESOURCE_KEY,
      [context.getHandler(), context.getClass()]
    );

    const actionMetadata = this.reflector.getAllAndOverride<string>(ACTION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    // Require both @Resource() and @Action() decorators
    if (!resourceMetadata) {
      throw new ForbiddenException('Resource type not specified');
    }

    if (!actionMetadata) {
      throw new ForbiddenException('Action not specified');
    }

    // Get authenticated user from request (set by JwtAuthGuard)
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Build authorization request for OPA
    const authzRequest = {
      user: {
        id: user.userId || user.id,
        system_roles: user.systemRoles || user.system_roles || [],
        tenant_roles: user.tenantRoles || user.tenant_roles || [],
        organization_id: user.tenantId || user.organization_id || null,
        permissions: user.permissions || undefined,
        ...(user.attributes && { attributes: user.attributes })
      },
      resource: {
        type: resourceMetadata.type,
        scope: resourceMetadata.scope || 'tenant',
        id: request.params?.id,
        owner_id: request.params?.userId,
        organization_id: user.tenantId || user.organization_id
      },
      action: actionMetadata
    };

    // Query OPA for authorization decision
    try {
      const isAuthorized = await this.opaService.isAuthorized(authzRequest);
      if (!isAuthorized) {
        throw new ForbiddenException(
          `Access denied: insufficient privileges for ${actionMetadata} on ${resourceMetadata.type}`
        );
      }
      return true;
    } catch (error) {
      // Fail closed: deny access on error
      if (error instanceof ForbiddenException) {
        throw error; // Re-throw ForbiddenException
      }

      // Log the actual error server-side for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Authorization check failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );

      // Return generic message to client (no internal details per P0: Class-C data protection)
      throw new ForbiddenException('Authorization check failed');
    }
  }
}
