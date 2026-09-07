import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Environment Guard
 *
 * Protects controllers and routes by restricting access to specific environments.
 *
 * **Usage:**
 * ```typescript
 * @Controller('auth')
 * @UseGuards(EnvironmentGuard)
 * @SetMetadata('environments', ['development', 'test'])
 * export class IdentityProbeController {
 *   // Only accessible in development and test environments
 * }
 * ```
 *
 * **Security:**
 * - Prevents test endpoints from being exposed in production
 * - Logs access attempts for audit trail
 * - Returns 403 Forbidden with clear message in production
 *
 * **Environment Detection:**
 * - Reads from `NODE_ENV` environment variable
 * - Falls back to 'development' if not set (safe default)
 * - Case-insensitive comparison
 *
 * **Allowed Environments:**
 * - `development` - Local development
 * - `test` - Testing environment
 * - `staging` - Pre-production staging
 * - `production` - Production environment
 */
@Injectable()
export class EnvironmentGuard implements CanActivate {
  private readonly logger = new Logger(EnvironmentGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get allowed environments from metadata (default to development/test for safety)
    const allowedEnvironments = this.reflector.get<string[]>(
      'environments',
      context.getClass()
    ) ?? ['development', 'test'];

    // Get current environment from NODE_ENV (default to development for safety)
    const currentEnvironment = (process.env['NODE_ENV'] ?? 'development').toLowerCase();

    // Check if current environment is in allowed list
    const isAllowed = allowedEnvironments
      .map((env) => env.toLowerCase())
      .includes(currentEnvironment);

    if (!isAllowed) {
      this.logger.warn(
        `EnvironmentGuard blocked access: environment '${currentEnvironment}' not in allowed list [${allowedEnvironments.join(', ')}]`
      );
    }

    return isAllowed;
  }
}
