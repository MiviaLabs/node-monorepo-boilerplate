import { SetMetadata } from '@nestjs/common';

/**
 * Public route metadata key
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Public decorator
 *
 * Marks a route as public (no authentication required).
 * Use this to bypass JWT authentication guards.
 *
 * @returns Decorator that sets IS_PUBLIC_KEY metadata to true
 *
 * @example
 * ```typescript
 * @Public()
 * @Post('login')
 * async login() {
 *   // Public endpoint
 * }
 * ```
 */
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
