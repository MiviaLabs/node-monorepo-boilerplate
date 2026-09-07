import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject
} from '@nestjs/common';
import { CacheService } from '@package/redis';

interface Request {
  user?: {
    tenantId?: string;
    userId?: string;
  };
}

/**
 * SecurityGuard checks if user/account is locked out due to suspicious activity
 *
 * Uses Redis for distributed lockout state with 15-minute TTL.
 *
 * Usage:
 * ```typescript
 * @UseGuards(JwtAuthGuard, SecurityGuard)
 * @Post('sensitive-action')
 * sensitiveAction() { ... }
 * ```
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(@Inject(CacheService) private readonly cache: CacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { tenantId?: string; userId?: string } | undefined;
    const { tenantId, userId } = user ?? {};

    if (!tenantId || !userId) {
      return false;
    }

    // Check if user is locked out via Redis
    const isLockedOut = await this.checkLockout(tenantId, userId);

    if (isLockedOut) {
      throw new ForbiddenException('Account temporarily locked due to suspicious activity');
    }

    return true;
  }

  /**
   * Check Redis for lockout status
   *
   * Lockout key format: `tenant:{tenantId}:security:lockout:{userId}`
   * Lockout TTL: 900 seconds (15 minutes)
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @returns true if locked out, false otherwise
   */
  private async checkLockout(tenantId: string, userId: string): Promise<boolean> {
    const lockoutKey = `tenant:${tenantId}:security:lockout:${userId}`;
    const locked = await this.cache.get<string>(lockoutKey);
    return locked === '1';
  }
}
