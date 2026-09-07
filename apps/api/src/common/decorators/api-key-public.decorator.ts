import { SetMetadata } from '@nestjs/common';

export const API_KEY_PUBLIC_KEY = 'apiKeyPublic';

/**
 * Mark endpoint as public (no API key required).
 *
 * @returns A decorator that marks the endpoint as publicly accessible
 *
 * @example
 * ```typescript
 * @ApiKeyPublic()
 * @Get('health')
 * health() {
 *   return { status: 'ok' };
 * }
 * ```
 */
export const ApiKeyPublic = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(API_KEY_PUBLIC_KEY, true);
